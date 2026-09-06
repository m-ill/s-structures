import {
  cloneStrictJson,
  immutable,
  optionalText,
  requiredText,
  strictCanonicalHash,
} from './strictCanonical.js';
import { validatePhase15EvidenceArtifact } from './evidenceArtifact.js';

export const PHASE15_EVIDENCE_BATCH_VERSION = 'p15-evidence-batch-v1';

export function createPhase15EvidenceBatch(input = {}) {
  const artifacts = Array.from(input.artifacts || []);
  const idCounts = new Map();
  for (const artifact of artifacts) {
    const id = normalizedCaseId(artifact?.caseId);
    idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  const cases = artifacts.map((artifact, index) => {
    const caseId = normalizedCaseId(artifact?.caseId, index);
    const validation = validatePhase15EvidenceArtifact(artifact);
    const errors = [...validation.errors];
    if ((idCounts.get(caseId) || 0) > 1) errors.push(`batch:duplicate-case:${caseId}`);
    return {
      caseId,
      status: errors.length ? 'FAIL' : artifact.status,
      evidenceHash: validation.ok ? artifact.evidenceHash : null,
      calculationHash: validation.ok ? artifact.calculation.calculationHash : null,
      resultHash: validation.ok ? artifact.result?.resultHash || null : null,
      runRecordHash: validation.ok ? artifact.run.runRecordHash : null,
      errors: [...new Set(errors)].sort(),
    };
  }).sort((left, right) => left.caseId.localeCompare(right.caseId));
  const statusCounts = Object.fromEntries(
    ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN', 'NOT_APPLICABLE', 'INVALIDATED', 'SELF_TEST']
      .map((status) => [status, cases.filter((row) => row.status === status).length]),
  );
  const status = batchStatus(cases);
  const calculationCore = {
    batchId: requiredText(input.batchId, 'batchId'),
    cases: cases.map((row) => ({ caseId: row.caseId, calculationHash: row.calculationHash })),
  };
  const batchCalculationHash = strictCanonicalHash(calculationCore, 'batch calculation record');
  const resultCore = {
    batchCalculationHash,
    cases: cases.map((row) => ({ caseId: row.caseId, resultHash: row.resultHash, status: row.status })),
  };
  const batchResultHash = strictCanonicalHash(resultCore, 'batch result record');
  const runCore = {
    batchCalculationHash,
    batchResultHash,
    startedAt: requiredTimestamp(input.run?.startedAt, 'run.startedAt'),
    completedAt: requiredTimestamp(input.run?.completedAt, 'run.completedAt'),
    environment: cloneStrictJson(requiredNonemptyObject(input.run?.environment, 'run.environment'), 'run.environment'),
    runId: optionalText(input.run?.runId),
  };
  if (Date.parse(runCore.completedAt) < Date.parse(runCore.startedAt)) throw new Error('run.completedAt must not be earlier than run.startedAt.');
  const batchRunRecordHash = strictCanonicalHash(runCore, 'batch run record');
  const core = {
    version: PHASE15_EVIDENCE_BATCH_VERSION,
    batchId: calculationCore.batchId,
    status,
    statusCounts,
    attempted: cases.length,
    cases,
    batchCalculationHash,
    batchResultHash,
    run: { ...runCore, batchRunRecordHash },
    releaseAllowed: false,
    designTransferAllowed: false,
  };
  return immutable({ ...core, batchHash: strictCanonicalHash(core, 'evidence batch') });
}

export function validatePhase15EvidenceBatch(batch = {}) {
  const errors = [];
  try {
    if (!hasExactKeys(batch, [
      'version', 'batchId', 'status', 'statusCounts', 'attempted', 'cases', 'batchCalculationHash', 'batchResultHash',
      'run', 'releaseAllowed', 'designTransferAllowed', 'batchHash',
    ])) errors.push('batch:unknown-or-missing-field');
    if (batch.version !== PHASE15_EVIDENCE_BATCH_VERSION) errors.push('batch:version');
    if (batch.attempted !== batch.cases?.length) errors.push('batch:attempted');
    if (batch.status !== batchStatus(batch.cases || [])) errors.push('batch:status');
    if (batch.releaseAllowed !== false || batch.designTransferAllowed !== false) errors.push('batch:release');
    const ids = (batch.cases || []).map((row) => row.caseId);
    if (strictCanonicalHash(ids, 'case ids') !== strictCanonicalHash([...ids].sort(), 'sorted case ids')) errors.push('batch:case-order');
    for (const [index, row] of (batch.cases || []).entries()) {
      if (!hasExactKeys(row, ['caseId', 'status', 'evidenceHash', 'calculationHash', 'resultHash', 'runRecordHash', 'errors'])) errors.push(`batch:case-fields:${index}`);
      const normalizedErrors = [...new Set(row.errors || [])].sort();
      if (strictCanonicalHash(row.errors || [], 'case errors') !== strictCanonicalHash(normalizedErrors, 'normalized case errors')) errors.push(`batch:case-errors:${index}`);
    }
    const expectedCounts = Object.fromEntries(
      ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN', 'NOT_APPLICABLE', 'INVALIDATED', 'SELF_TEST']
        .map((status) => [status, (batch.cases || []).filter((row) => row.status === status).length]),
    );
    if (strictCanonicalHash(batch.statusCounts || {}, 'status counts') !== strictCanonicalHash(expectedCounts, 'expected status counts')) errors.push('batch:status-counts');
    const calculationCore = {
      batchId: requiredText(batch.batchId, 'batchId'),
      cases: (batch.cases || []).map((row) => ({ caseId: row.caseId, calculationHash: row.calculationHash })),
    };
    if (batch.batchCalculationHash !== strictCanonicalHash(calculationCore, 'batch calculation record')) errors.push('batch:calculation-hash');
    const resultCore = {
      batchCalculationHash: batch.batchCalculationHash,
      cases: (batch.cases || []).map((row) => ({ caseId: row.caseId, resultHash: row.resultHash, status: row.status })),
    };
    if (batch.batchResultHash !== strictCanonicalHash(resultCore, 'batch result record')) errors.push('batch:result-hash');
    const runCore = cloneStrictJson(batch.run, 'batch run');
    delete runCore.batchRunRecordHash;
    if (!hasExactKeys(batch.run, ['batchCalculationHash', 'batchResultHash', 'startedAt', 'completedAt', 'environment', 'runId', 'batchRunRecordHash'])) errors.push('batch:run-fields');
    if (Date.parse(batch.run?.completedAt) < Date.parse(batch.run?.startedAt)) errors.push('batch:run-time-order');
    if (batch.run?.batchCalculationHash !== batch.batchCalculationHash || batch.run?.batchResultHash !== batch.batchResultHash) errors.push('batch:run-binding');
    if (batch.run?.batchRunRecordHash !== strictCanonicalHash(runCore, 'batch run record')) errors.push('batch:run-hash');
    const core = cloneStrictJson(batch, 'evidence batch');
    delete core.batchHash;
    if (batch.batchHash !== strictCanonicalHash(core, 'evidence batch')) errors.push('batch:hash');
  } catch (error) {
    errors.push(`batch:schema:${error.message}`);
  }
  return immutable({ ok: errors.length === 0, errors });
}

function batchStatus(cases) {
  if (!cases.length) return 'BLOCKED';
  if (cases.some((row) => row.status === 'FAIL')) return 'FAIL';
  if (cases.some((row) => row.status === 'INVALIDATED')) return 'INVALIDATED';
  if (cases.every((row) => row.status === 'PASS')) return 'PASS';
  return 'BLOCKED';
}

function normalizedCaseId(value, index = null) {
  const id = value == null ? '' : String(value).trim().toUpperCase();
  return id || `MALFORMED-${index ?? 'UNKNOWN'}`;
}

function requiredTimestamp(value, label) {
  const timestamp = requiredText(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) throw new TypeError(`${label} must be an ISO-compatible timestamp.`);
  return timestamp;
}

function requiredNonemptyObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) throw new TypeError(`${label} must be a non-empty object.`);
  return value;
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
