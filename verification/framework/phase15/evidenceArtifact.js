import {
  cloneStrictJson,
  immutable,
  optionalText,
  requiredHash,
  requiredText,
  strictCanonicalHash,
} from './strictCanonical.js';
import {
  aggregatePhase15EvidenceStatus,
  auditPhase15MandatoryGateSet,
  auditPhase15MetricSet,
} from './qualificationGates.js';

export const PHASE15_EVIDENCE_VERSION = 'p15-evidence-artifact-v1';
export const PHASE15_BINDING_FIELDS = Object.freeze([
  'sourceHash',
  'buildHash',
  'modelHash',
  'inputHash',
  'solverSettingsHash',
  'referenceHash',
  'toleranceHash',
  'probeHash',
]);

export function createPhase15CalculationRecord(input = {}) {
  const core = {
    caseId: requiredText(input.caseId, 'caseId').toUpperCase(),
    specVersion: requiredText(input.specVersion, 'specVersion'),
    claimScope: requiredText(input.claimScope, 'claimScope'),
    binding: normalizeBinding(input.binding),
  };
  return immutable({ ...core, calculationHash: strictCanonicalHash(core, 'calculation record') });
}

export function createPhase15ResultRecord(input = {}) {
  const payload = requiredPayload(input.payload, 'payload');
  const solverDiagnostics = requiredNonemptyObject(input.solverDiagnostics, 'solverDiagnostics');
  const audits = requiredNonemptyObject(input.audits, 'audits');
  const convergenceHistory = Array.from(input.convergenceHistory || []);
  if (!convergenceHistory.length) throw new Error('convergenceHistory requires at least one record.');
  const core = {
    calculationHash: requiredHash(input.calculationHash, 'calculationHash'),
    payload: cloneStrictJson(payload, 'payload'),
    solverDiagnostics: cloneStrictJson(solverDiagnostics, 'solverDiagnostics'),
    audits: cloneStrictJson(audits, 'audits'),
    convergenceHistory: cloneStrictJson(convergenceHistory, 'convergenceHistory'),
  };
  return immutable({ ...core, resultHash: strictCanonicalHash(core, 'result record') });
}

export function createPhase15RunRecord(input = {}) {
  const startedAt = requiredTimestamp(input.startedAt, 'startedAt');
  const completedAt = requiredTimestamp(input.completedAt, 'completedAt');
  if (Date.parse(completedAt) < Date.parse(startedAt)) throw new Error('completedAt must not be earlier than startedAt.');
  const core = {
    calculationHash: requiredHash(input.calculationHash, 'calculationHash'),
    resultHash: input.resultHash == null ? null : requiredHash(input.resultHash, 'resultHash'),
    startedAt,
    completedAt,
    environment: cloneStrictJson(requiredNonemptyObject(input.environment, 'environment'), 'environment'),
    runId: optionalText(input.runId),
  };
  return immutable({ ...core, runRecordHash: strictCanonicalHash(core, 'run record') });
}

export function createPhase15EvidenceArtifact(input = {}) {
  const calculation = input.calculation?.calculationHash
    ? cloneStrictJson(input.calculation, 'calculation')
    : createPhase15CalculationRecord(input.calculation || {});
  assertCalculationRecord(calculation);
  const executionStatus = requiredText(input.executionStatus, 'executionStatus').toUpperCase();
  const expectsResult = !['NOT_RUN', 'BLOCKED', 'NOT_APPLICABLE'].includes(executionStatus);
  if (expectsResult && input.result == null) throw new Error(`${executionStatus} evidence requires a non-null result payload.`);
  const result = input.result == null
    ? null
    : input.result.resultHash
      ? cloneStrictJson(input.result, 'result')
      : createPhase15ResultRecord({ ...input.result, calculationHash: calculation.calculationHash });
  if (result) assertResultRecord(result, calculation.calculationHash);

  const metrics = cloneStrictJson(Array.from(input.metrics || []), 'metrics').sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')));
  const metricAudit = auditPhase15MetricSet(metrics);
  if (!metricAudit.ok) throw new Error(`Invalid metric set: ${metricAudit.errors.join(', ')}`);
  for (const metric of metrics) {
    if (metric.referenceHash !== calculation.binding.referenceHash
      || metric.toleranceHash !== calculation.binding.toleranceHash
      || metric.probeHash !== calculation.binding.probeHash) {
      throw new Error(`Metric ${metric.id} manifest binding does not match the calculation record.`);
    }
  }
  const mandatoryGates = normalizeGates(input.mandatoryGates);
  const reviews = normalizeReviews(input.reviews);
  const staleReasons = Array.from(new Set(input.staleReasons || []), String).filter(Boolean).sort();
  const verdict = aggregatePhase15EvidenceStatus({
    executionStatus,
    metrics,
    mandatoryGates,
    reviews,
    staleReasons,
  });
  const run = input.run?.runRecordHash
    ? cloneStrictJson(input.run, 'run')
    : createPhase15RunRecord({
      ...input.run,
      calculationHash: calculation.calculationHash,
      resultHash: result?.resultHash || null,
    });
  assertRunRecord(run, calculation.calculationHash, result?.resultHash || null);

  const core = {
    version: PHASE15_EVIDENCE_VERSION,
    caseId: calculation.caseId,
    specVersion: calculation.specVersion,
    claimScope: calculation.claimScope,
    executionStatus,
    status: verdict.status,
    reasonCodes: verdict.reasonCodes,
    staleReasons,
    calculation,
    result,
    metrics,
    mandatoryGates,
    reviews,
    run,
    releaseAllowed: false,
    designTransferAllowed: false,
  };
  return immutable({ ...core, evidenceHash: strictCanonicalHash(core, 'evidence artifact') });
}

export function auditPhase15EvidenceFreshness(artifact = {}, currentBinding = {}) {
  const normalized = normalizeBinding(currentBinding);
  const reasons = [];
  for (const field of PHASE15_BINDING_FIELDS) {
    if (artifact.calculation?.binding?.[field] !== normalized[field]) reasons.push(`STALE_${camelToReason(field)}`);
  }
  return immutable({
    current: reasons.length === 0,
    status: reasons.length ? 'INVALIDATED' : artifact.status,
    reasons,
  });
}

export function invalidatePhase15Evidence(artifact = {}, currentBinding = {}) {
  const validation = validatePhase15EvidenceArtifact(artifact);
  if (!validation.ok) throw new Error(`Cannot invalidate malformed evidence: ${validation.errors.join(', ')}`);
  const freshness = auditPhase15EvidenceFreshness(artifact, currentBinding);
  if (freshness.current) return artifact;
  const core = cloneStrictJson(artifact, 'artifact');
  delete core.evidenceHash;
  core.status = 'INVALIDATED';
  core.reasonCodes = [...freshness.reasons];
  core.staleReasons = [...freshness.reasons];
  core.releaseAllowed = false;
  core.designTransferAllowed = false;
  return immutable({ ...core, evidenceHash: strictCanonicalHash(core, 'invalidated evidence artifact') });
}

export function validatePhase15EvidenceArtifact(artifact = {}) {
  const errors = [];
  try {
    const topLevelKeys = [
      'version', 'caseId', 'specVersion', 'claimScope', 'executionStatus', 'status', 'reasonCodes', 'staleReasons',
      'calculation', 'result', 'metrics', 'mandatoryGates', 'reviews', 'run', 'releaseAllowed', 'designTransferAllowed', 'evidenceHash',
    ];
    if (!hasExactKeys(artifact, topLevelKeys)) errors.push('evidence:unknown-or-missing-field');
    if (artifact.version !== PHASE15_EVIDENCE_VERSION) errors.push('evidence:version');
    assertCalculationRecord(artifact.calculation);
    if (artifact.caseId !== artifact.calculation?.caseId
      || artifact.specVersion !== artifact.calculation?.specVersion
      || artifact.claimScope !== artifact.calculation?.claimScope) errors.push('evidence:scope');
    if (artifact.result) assertResultRecord(artifact.result, artifact.calculation?.calculationHash);
    if (artifact.status === 'PASS' && !artifact.result) errors.push('evidence:pass-result');
    assertRunRecord(artifact.run, artifact.calculation?.calculationHash, artifact.result?.resultHash || null);
    const metricAudit = auditPhase15MetricSet(artifact.metrics || []);
    if (!metricAudit.ok) errors.push(...metricAudit.errors.map((error) => `evidence:${error}`));
    const sortedMetrics = [...(artifact.metrics || [])].sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')));
    if (strictCanonicalHash(artifact.metrics || [], 'metrics') !== strictCanonicalHash(sortedMetrics, 'sorted metrics')) errors.push('evidence:metric-order');
    if ((artifact.metrics || []).some((metric) => metric.referenceHash !== artifact.calculation?.binding?.referenceHash
      || metric.toleranceHash !== artifact.calculation?.binding?.toleranceHash
      || metric.probeHash !== artifact.calculation?.binding?.probeHash)) errors.push('evidence:metric-binding');
    const gates = normalizeGates(artifact.mandatoryGates);
    const reviews = normalizeReviews(artifact.reviews);
    if (strictCanonicalHash(artifact.mandatoryGates || [], 'mandatory gates') !== strictCanonicalHash(gates, 'normalized mandatory gates')) errors.push('evidence:gate-order');
    if (strictCanonicalHash(artifact.reviews || [], 'reviews') !== strictCanonicalHash(reviews, 'normalized reviews')) errors.push('evidence:review-contract');
    const normalizedStaleReasons = Array.from(new Set(artifact.staleReasons || []), String).filter(Boolean).sort();
    if (strictCanonicalHash(artifact.staleReasons || [], 'stale reasons') !== strictCanonicalHash(normalizedStaleReasons, 'normalized stale reasons')) errors.push('evidence:stale-reasons');
    const verdict = aggregatePhase15EvidenceStatus({
      executionStatus: artifact.executionStatus,
      metrics: artifact.metrics || [],
      mandatoryGates: gates,
      reviews,
      staleReasons: artifact.staleReasons || [],
    });
    if (artifact.status !== verdict.status) errors.push('evidence:status');
    if (strictCanonicalHash(artifact.reasonCodes || [], 'reasonCodes') !== strictCanonicalHash(verdict.reasonCodes, 'expected reasonCodes')) errors.push('evidence:reason-codes');
    if (artifact.releaseAllowed !== false) errors.push('evidence:release-status');
    if (artifact.designTransferAllowed !== false) errors.push('evidence:design-transfer');
    const core = cloneStrictJson(artifact, 'artifact');
    delete core.evidenceHash;
    if (artifact.evidenceHash !== strictCanonicalHash(core, 'evidence artifact')) errors.push('evidence:hash');
  } catch (error) {
    errors.push(`evidence:schema:${error.message}`);
  }
  return immutable({ ok: errors.length === 0, errors });
}

export function normalizePhase15Binding(input = {}) {
  return normalizeBinding(input);
}

function normalizeBinding(input) {
  const result = {};
  for (const field of PHASE15_BINDING_FIELDS) result[field] = requiredHash(input?.[field], `binding.${field}`);
  return immutable(result);
}

function assertCalculationRecord(record) {
  if (!record || typeof record !== 'object') throw new TypeError('calculation record is required.');
  const core = {
    caseId: requiredText(record.caseId, 'calculation.caseId').toUpperCase(),
    specVersion: requiredText(record.specVersion, 'calculation.specVersion'),
    claimScope: requiredText(record.claimScope, 'calculation.claimScope'),
    binding: normalizeBinding(record.binding),
  };
  const expected = { ...core, calculationHash: strictCanonicalHash(core, 'calculation record') };
  assertExactRecord(record, expected, 'calculation record');
}

function assertResultRecord(record, calculationHash) {
  if (!record || typeof record !== 'object') throw new TypeError('result record is required.');
  const core = {
    calculationHash: requiredHash(record.calculationHash, 'result.calculationHash'),
    payload: cloneStrictJson(requiredPayload(record.payload, 'result.payload'), 'result.payload'),
    solverDiagnostics: cloneStrictJson(requiredNonemptyObject(record.solverDiagnostics, 'result.solverDiagnostics'), 'result.solverDiagnostics'),
    audits: cloneStrictJson(requiredNonemptyObject(record.audits, 'result.audits'), 'result.audits'),
    convergenceHistory: cloneStrictJson(record.convergenceHistory, 'result.convergenceHistory'),
  };
  if (!Array.isArray(core.convergenceHistory) || !core.convergenceHistory.length) throw new Error('result.convergenceHistory requires at least one record.');
  if (core.calculationHash !== calculationHash) throw new Error('Result calculationHash does not match calculation record.');
  const expected = { ...core, resultHash: strictCanonicalHash(core, 'result record') };
  assertExactRecord(record, expected, 'result record');
}

function assertRunRecord(record, calculationHash, resultHash) {
  if (!record || typeof record !== 'object') throw new TypeError('run record is required.');
  const core = {
    calculationHash: requiredHash(record.calculationHash, 'run.calculationHash'),
    resultHash: record.resultHash == null ? null : requiredHash(record.resultHash, 'run.resultHash'),
    startedAt: requiredTimestamp(record.startedAt, 'run.startedAt'),
    completedAt: requiredTimestamp(record.completedAt, 'run.completedAt'),
    environment: cloneStrictJson(requiredNonemptyObject(record.environment, 'run.environment'), 'run.environment'),
    runId: optionalText(record.runId),
  };
  if (core.calculationHash !== calculationHash || core.resultHash !== resultHash) throw new Error('Run record binding mismatch.');
  if (Date.parse(core.completedAt) < Date.parse(core.startedAt)) throw new Error('Run completedAt must not be earlier than startedAt.');
  const expected = { ...core, runRecordHash: strictCanonicalHash(core, 'run record') };
  assertExactRecord(record, expected, 'run record');
}

function normalizeGates(values) {
  const rows = cloneStrictJson(Array.from(values || []), 'mandatoryGates').sort((left, right) => String(left?.id || '').localeCompare(String(right?.id || '')));
  const audit = auditPhase15MandatoryGateSet(rows);
  if (!audit.ok) throw new Error(`Invalid mandatory gate set: ${audit.errors.join(', ')}`);
  return rows;
}

function normalizeReviews(values) {
  const rows = Array.from(values || [], (review, index) => {
    if (!review || typeof review !== 'object' || Array.isArray(review)) throw new TypeError(`reviews[${index}] must be an object.`);
    const status = requiredText(review.status, `reviews[${index}].status`).toUpperCase();
    if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) throw new Error(`reviews[${index}].status is invalid.`);
    const approvalHash = review.approvalHash == null ? null : requiredHash(review.approvalHash, `reviews[${index}].approvalHash`);
    if (status === 'APPROVED' && !approvalHash) throw new Error(`reviews[${index}] approved review requires approvalHash.`);
    return {
      id: requiredText(review.id, `reviews[${index}].id`),
      role: requiredText(review.role, `reviews[${index}].role`),
      reviewer: requiredText(review.reviewer, `reviews[${index}].reviewer`),
      status,
      required: review.required !== false,
      approvalHash,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  assertUniqueIds(rows, 'review');
  return cloneStrictJson(rows, 'reviews');
}

function requiredNonemptyObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) {
    throw new TypeError(`${label} must be a non-empty object.`);
  }
  return value;
}

function requiredPayload(value, label) {
  if (value == null || typeof value !== 'object') throw new TypeError(`${label} must be a non-null object or array.`);
  if (!Object.keys(value).length) throw new TypeError(`${label} must not be empty.`);
  return value;
}

function requiredTimestamp(value, label) {
  const timestamp = requiredText(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) throw new TypeError(`${label} must be an ISO-compatible timestamp.`);
  return timestamp;
}

function assertUniqueIds(rows, label) {
  const ids = rows.map((row, index) => requiredText(row?.id, `${label}[${index}].id`));
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate ids.`);
}

function camelToReason(value) {
  return value.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}

function assertExactRecord(actual, expected, label) {
  if (strictCanonicalHash(actual, label) !== strictCanonicalHash(expected, `expected ${label}`)) {
    throw new Error(`${label} contains unknown, missing, or mismatched fields.`);
  }
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
