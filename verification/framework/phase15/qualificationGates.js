import {
  immutable,
  optionalNonnegativeFinite,
  optionalText,
  requiredFinite,
  requiredText,
  strictCanonicalHash,
} from './strictCanonical.js';
import { isApprovedPhase15ProbeManifest } from './probeManifest.js';
import { isApprovedPhase15ReferenceManifest } from './referenceManifest.js';
import { isApprovedPhase15ToleranceManifest } from './toleranceManifest.js';

export const PHASE15_EVIDENCE_STATUSES = Object.freeze([
  'PASS',
  'FAIL',
  'BLOCKED',
  'NOT_RUN',
  'NOT_APPLICABLE',
  'INVALIDATED',
  'SELF_TEST',
]);

export const PHASE15_EXECUTION_STATUSES = Object.freeze([
  ...PHASE15_EVIDENCE_STATUSES,
  'PARTIAL',
  'TIMEOUT',
  'ERROR',
]);

export const PHASE15_METRIC_TYPES = Object.freeze(['signed', 'magnitude']);

export function evaluatePhase15Metric(input = {}) {
  if (Object.hasOwn(input, 'compareMagnitude')) {
    throw new Error('compareMagnitude is forbidden; use metricType="magnitude" with an explicit engineering meaning and approval.');
  }
  const metricType = optionalText(input.metricType) || 'signed';
  if (!PHASE15_METRIC_TYPES.includes(metricType)) throw new Error(`metricType must be one of ${PHASE15_METRIC_TYPES.join(', ')}.`);
  const actual = requiredFinite(input.actual, 'actual');
  const reference = requiredFinite(input.reference, 'reference');
  const relativeTolerance = optionalNonnegativeFinite(input.relativeTolerance, 'relativeTolerance');
  const absoluteTolerance = optionalNonnegativeFinite(input.absoluteTolerance, 'absoluteTolerance');
  const characteristicFloor = optionalNonnegativeFinite(input.characteristicFloor, 'characteristicFloor') ?? 0;
  if (relativeTolerance == null && absoluteTolerance == null) throw new Error('Metric requires relativeTolerance or absoluteTolerance.');
  if (relativeTolerance != null && relativeTolerance > 1) throw new RangeError('relativeTolerance must be a fraction between 0 and 1.');
  const comparisonPolicy = optionalText(input.comparisonPolicy) || 'absolute-or-relative';
  if (!['absolute-or-relative', 'absolute-only', 'relative-only'].includes(comparisonPolicy)) {
    throw new Error('comparisonPolicy must be absolute-or-relative, absolute-only, or relative-only.');
  }
  if (comparisonPolicy === 'absolute-only' && absoluteTolerance == null) throw new Error('absolute-only metric requires absoluteTolerance.');
  if (comparisonPolicy === 'relative-only' && relativeTolerance == null) throw new Error('relative-only metric requires relativeTolerance.');
  if (metricType === 'magnitude') {
    requiredText(input.magnitudeMeaning, 'magnitudeMeaning');
    requiredText(input.approvedBy, 'approvedBy');
    requiredHash64(input.magnitudeApprovalHash, 'magnitudeApprovalHash');
  }

  const comparedActual = metricType === 'magnitude' ? Math.abs(actual) : actual;
  const comparedReference = metricType === 'magnitude' ? Math.abs(reference) : reference;
  const signedDifference = comparedActual - comparedReference;
  const absoluteError = Math.abs(signedDifference);
  const relativeScale = Math.max(Math.abs(comparedReference), characteristicFloor);
  const relativeError = relativeScale > 0 ? absoluteError / relativeScale : null;
  const absolutePassed = absoluteTolerance != null && absoluteError <= absoluteTolerance;
  const relativePassed = relativeTolerance != null && relativeError != null && relativeError <= relativeTolerance;
  const passed = comparisonPolicy === 'absolute-only'
    ? absolutePassed
    : comparisonPolicy === 'relative-only'
      ? relativePassed
      : absolutePassed || relativePassed;

  const core = {
    id: requiredText(input.id, 'id'),
    probeId: requiredText(input.probeId, 'probeId'),
    quantity: requiredText(input.quantity, 'quantity'),
    unit: requiredText(input.unit, 'unit'),
    axis: requiredText(input.axis, 'axis'),
    signConvention: requiredText(input.signConvention, 'signConvention'),
    referenceHash: requiredHash64(input.referenceHash, 'referenceHash'),
    toleranceHash: requiredHash64(input.toleranceHash, 'toleranceHash'),
    probeHash: requiredHash64(input.probeHash, 'probeHash'),
    metricType,
    magnitudeMeaning: metricType === 'magnitude' ? requiredText(input.magnitudeMeaning, 'magnitudeMeaning') : null,
    approvedBy: metricType === 'magnitude' ? requiredText(input.approvedBy, 'approvedBy') : null,
    magnitudeApprovalHash: metricType === 'magnitude' ? requiredHash64(input.magnitudeApprovalHash, 'magnitudeApprovalHash') : null,
    actual,
    reference,
    comparedActual,
    comparedReference,
    signedDifference,
    absoluteError,
    relativeError,
    relativeScale,
    relativeTolerance,
    absoluteTolerance,
    characteristicFloor,
    comparisonPolicy,
    status: passed ? 'PASS' : 'FAIL',
    passed,
  };
  return immutable({ ...core, metricHash: strictCanonicalHash(core, `metric ${core.id}`) });
}

export function evaluatePhase15ManifestMetric(input = {}) {
  const referenceManifest = input.referenceManifest;
  const toleranceManifest = input.toleranceManifest;
  const probeManifest = input.probeManifest;
  if (!isApprovedPhase15ReferenceManifest(referenceManifest)) throw new Error('Reference manifest must be frozen and approved.');
  if (!isApprovedPhase15ToleranceManifest(toleranceManifest)) throw new Error('Tolerance manifest must be frozen and approved.');
  if (!isApprovedPhase15ProbeManifest(probeManifest)) throw new Error('Probe manifest must be frozen and approved.');
  if (referenceManifest.caseId !== toleranceManifest.caseId
    || referenceManifest.caseId !== probeManifest.caseId
    || referenceManifest.specVersion !== toleranceManifest.specVersion
    || referenceManifest.specVersion !== probeManifest.specVersion
    || toleranceManifest.referenceHash !== referenceManifest.referenceHash
    || probeManifest.referenceHash !== referenceManifest.referenceHash) {
    throw new Error('Reference, tolerance, and probe manifests are not bound to the same case specification.');
  }
  const metricId = requiredText(input.metricId, 'metricId');
  const reference = referenceManifest.values.find((row) => row.id === metricId);
  const tolerance = toleranceManifest.metrics.find((row) => row.id === metricId);
  const probe = probeManifest.probes.find((row) => row.id === metricId);
  if (!reference || !tolerance || !probe) throw new Error(`Metric ${metricId} must exist in reference, tolerance, and probe manifests.`);
  if (reference.unit !== tolerance.unit || reference.unit !== probe.unit) throw new Error(`Metric ${metricId} unit mismatch across manifests.`);
  if (reference.resultKind !== probe.resultKind) throw new Error(`Metric ${metricId} result kind mismatch across manifests.`);
  return evaluatePhase15Metric({
    id: metricId,
    probeId: probe.id,
    quantity: optionalText(input.quantity) || reference.resultKind,
    unit: reference.unit,
    axis: probe.axis,
    signConvention: probe.signConvention,
    referenceHash: referenceManifest.referenceHash,
    toleranceHash: toleranceManifest.toleranceHash,
    probeHash: probeManifest.probeHash,
    metricType: tolerance.metricType,
    magnitudeMeaning: tolerance.magnitudeMeaning,
    approvedBy: tolerance.metricType === 'magnitude' ? toleranceManifest.approvedBy : null,
    magnitudeApprovalHash: tolerance.metricType === 'magnitude' ? toleranceManifest.approvalHash : null,
    actual: input.actual,
    reference: reference.value,
    relativeTolerance: tolerance.relativeTolerance,
    absoluteTolerance: tolerance.absoluteTolerance,
    characteristicFloor: tolerance.characteristicFloor,
    comparisonPolicy: tolerance.comparisonPolicy,
  });
}

export function createPhase15MandatoryGate(input = {}) {
  const status = requiredText(input.status, 'status').toUpperCase();
  if (!['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN', 'INVALIDATED'].includes(status)) {
    throw new Error('Mandatory gate status must be PASS, FAIL, BLOCKED, NOT_RUN, or INVALIDATED.');
  }
  const core = {
    id: requiredText(input.id, 'id'),
    status,
    mandatory: input.mandatory !== false,
    reasonCode: requiredText(input.reasonCode, 'reasonCode'),
    details: optionalText(input.details),
  };
  return immutable({ ...core, gateHash: strictCanonicalHash(core, `gate ${core.id}`) });
}

export function aggregatePhase15EvidenceStatus(input = {}) {
  const executionStatus = requiredText(input.executionStatus, 'executionStatus').toUpperCase();
  if (!PHASE15_EXECUTION_STATUSES.includes(executionStatus)) {
    throw new Error(`executionStatus must be one of ${PHASE15_EXECUTION_STATUSES.join(', ')}.`);
  }
  const metrics = Array.from(input.metrics || []);
  const gates = Array.from(input.mandatoryGates || []);
  const reviews = Array.from(input.reviews || []);
  assertUnique(metrics, 'metric');
  assertUnique(gates, 'gate');
  assertUnique(reviews, 'review');

  const staleReasons = Array.from(new Set(input.staleReasons || []), String).filter(Boolean).sort();
  if (input.stale === true || staleReasons.length || executionStatus === 'INVALIDATED') {
    return verdict('INVALIDATED', staleReasons.length ? staleReasons : ['STALE_BINDING']);
  }
  if (executionStatus === 'NOT_APPLICABLE') {
    const requiredReviews = reviews.filter((row) => row?.required !== false);
    const justification = gates.find((row) => row?.mandatory !== false && row?.status === 'PASS' && row?.details);
    if (!justification || !requiredReviews.length || requiredReviews.some((row) => row?.status !== 'APPROVED')) {
      return verdict('BLOCKED', ['NOT_APPLICABLE_APPROVAL_MISSING']);
    }
    return verdict('NOT_APPLICABLE', ['APPROVED_NOT_APPLICABLE']);
  }
  if (executionStatus === 'NOT_RUN') return verdict('NOT_RUN', ['EXECUTION_NOT_RUN']);
  if (executionStatus === 'BLOCKED') return verdict('BLOCKED', ['EXECUTION_BLOCKED']);
  if (['FAIL', 'PARTIAL', 'TIMEOUT', 'ERROR'].includes(executionStatus)) return verdict('FAIL', [`EXECUTION_${executionStatus}`]);

  const failedMetrics = metrics.filter((row) => row?.status !== 'PASS' || row?.passed !== true);
  const mandatory = gates.filter((row) => row?.mandatory !== false);
  const failedGates = mandatory.filter((row) => row?.status !== 'PASS');
  if (failedMetrics.length || failedGates.length) {
    return verdict('FAIL', [
      ...failedMetrics.map((row) => `METRIC:${row?.id || 'MISSING'}`),
      ...failedGates.map((row) => `GATE:${row?.id || 'MISSING'}`),
    ]);
  }
  if (!metrics.length || !mandatory.length) return verdict('BLOCKED', ['MANDATORY_EVIDENCE_MISSING']);

  const requiredReviews = reviews.filter((row) => row?.required !== false);
  if (!requiredReviews.length || requiredReviews.some((row) => row?.status !== 'APPROVED')) {
    return verdict('BLOCKED', ['REQUIRED_REVIEW_MISSING']);
  }
  if (executionStatus === 'SELF_TEST') return verdict('SELF_TEST', ['INTERNAL_SELF_TEST_ONLY']);
  return verdict('PASS', []);
}

export function auditPhase15MetricSet(metrics = []) {
  const errors = [];
  const rows = Array.from(metrics || []);
  const ids = new Set();
  for (const row of rows) {
    if (!row?.id) errors.push('metric:id');
    else if (ids.has(row.id)) errors.push(`metric:duplicate:${row.id}`);
    else ids.add(row.id);
    try {
      const expected = evaluatePhase15Metric(row);
      if (strictCanonicalHash(row, `metric ${row?.id || 'missing'}`) !== strictCanonicalHash(expected, `expected metric ${row?.id || 'missing'}`)) {
        errors.push(`metric:derived-fields:${row?.id || 'missing'}`);
      }
    } catch (error) {
      errors.push(`metric:json:${row?.id || 'missing'}:${error.message}`);
    }
  }
  return immutable({ ok: errors.length === 0, errors });
}

export function auditPhase15MandatoryGateSet(gates = []) {
  const errors = [];
  const rows = Array.from(gates || []);
  const ids = new Set();
  for (const row of rows) {
    if (!row?.id) errors.push('gate:id');
    else if (ids.has(row.id)) errors.push(`gate:duplicate:${row.id}`);
    else ids.add(row.id);
    try {
      const expected = createPhase15MandatoryGate(row);
      if (strictCanonicalHash(row, `gate ${row?.id || 'missing'}`) !== strictCanonicalHash(expected, `expected gate ${row?.id || 'missing'}`)) {
        errors.push(`gate:derived-fields:${row?.id || 'missing'}`);
      }
    } catch (error) {
      errors.push(`gate:json:${row?.id || 'missing'}:${error.message}`);
    }
  }
  return immutable({ ok: errors.length === 0, errors });
}

function verdict(status, reasonCodes) {
  return immutable({ status, reasonCodes: Array.from(new Set(reasonCodes)).sort() });
}

function assertUnique(rows, label) {
  const ids = rows.map((row, index) => requiredText(row?.id, `${label}s[${index}].id`));
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label} id.`);
}

function requiredHash64(value, label) {
  const normalized = requiredText(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new TypeError(`${label} must be a 64-character hexadecimal digest.`);
  return normalized;
}
