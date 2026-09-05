import { assertStrictJson, sha256Canonical } from './canonical.mjs';
import { validateManifestDocument } from './manifestValidation.mjs';

export const P17_REFERENCE_REPOSITORY_VERSION = 'p17-m1-reference-repository-v1';
export const P17_REFERENCE_LANES = Object.freeze([
  'PRIMARY_INDEPENDENT',
  'STRIX_PUBLISHED',
  'STRIX_R4',
  'MIDAS_R4',
]);

/**
 * Joins already validated reference documents without reading production data.
 * Unlocked M1 placeholders produce a machine-readable blocker and no values.
 */
export function prepareReferenceBundle(input = {}) {
  const sourceManifest = strictClone(input.sourceManifest, 'sourceManifest');
  const referenceManifest = strictClone(input.referenceManifest, 'referenceManifest');
  const expectedValues = strictClone(input.expectedValues, 'expectedValues');
  const toleranceManifest = strictClone(input.toleranceManifest, 'toleranceManifest');
  const probeManifest = strictClone(input.probeManifest, 'probeManifest');
  const documents = { sourceManifest, referenceManifest, expectedValues, toleranceManifest, probeManifest };
  validateManifestDocument('sourceManifest', sourceManifest);
  validateManifestDocument('referenceManifest', referenceManifest);
  validateManifestDocument('expectedValues', expectedValues);
  validateManifestDocument('toleranceManifest', toleranceManifest);
  validateManifestDocument('probeManifest', probeManifest);
  const caseIds = new Set(Object.values(documents).map((row) => row?.caseId));
  if (caseIds.size !== 1 || !clean([...caseIds][0])) throw referenceError('P17_REFERENCE_CASE_BINDING_MISMATCH', 'All reference documents must bind the same case ID.');

  const reasonCodes = [];
  if (sourceManifest.status !== 'LOCKED') reasonCodes.push('P17_SOURCE_MANIFEST_NOT_LOCKED');
  if (referenceManifest.artifactStatus !== 'LOCKED') reasonCodes.push('P17_REFERENCE_MANIFEST_NOT_LOCKED');
  if (expectedValues.status !== 'LOCKED') reasonCodes.push('P17_EXPECTED_VALUES_NOT_LOCKED');
  if (toleranceManifest.status !== 'LOCKED') reasonCodes.push('P17_TOLERANCE_NOT_LOCKED');
  if (probeManifest.status !== 'LOCKED') reasonCodes.push('P17_PROBES_NOT_LOCKED');
  if (reasonCodes.length) {
    const core = {
      version: P17_REFERENCE_REPOSITORY_VERSION,
      caseId: [...caseIds][0],
      status: 'BLOCKED_REFERENCE',
      payloadAbsent: true,
      expectedValueCount: 0,
      criterionCount: 0,
      probeCount: 0,
      reasonCodes: reasonCodes.sort(),
      documentHashes: hashDocuments(documents),
    };
    return deepFreeze({ ...core, bundleHash: sha256Canonical(core) });
  }

  validateLockedBundle(documents);
  const core = {
    version: P17_REFERENCE_REPOSITORY_VERSION,
    caseId: [...caseIds][0],
    status: 'READY',
    payloadAbsent: false,
    expectedValueCount: expectedValues.values.length,
    criterionCount: toleranceManifest.criteria.length,
    probeCount: probeManifest.probes.length,
    reasonCodes: [],
    documentHashes: hashDocuments(documents),
    referenceManifest,
    expectedValues,
    toleranceManifest,
    probeManifest,
  };
  return deepFreeze({ ...core, bundleHash: sha256Canonical(core) });
}

function validateLockedBundle({ sourceManifest, referenceManifest, expectedValues, toleranceManifest, probeManifest }) {
  if (sourceManifest.status !== 'LOCKED'
    || sourceManifest.extraction?.status !== 'COMPLETE'
    || !sourceManifest.extraction?.artifacts?.length
    || sourceManifest.transcription?.status !== 'COMPLETE'
    || sourceManifest.transcription?.valueCount < 1
    || sourceManifest.reasonCodes?.length) {
    throw referenceError('P17_SOURCE_MANIFEST_NOT_EXECUTION_READY', 'Locked references require a complete, byte-bound, blocker-free source transcription.');
  }
  if (referenceManifest.payloadAbsent || expectedValues.payloadAbsent || toleranceManifest.payloadAbsent || probeManifest.payloadAbsent) {
    throw referenceError('P17_LOCKED_REFERENCE_PAYLOAD_ABSENT', 'A locked reference bundle cannot declare payloadAbsent.');
  }
  if (!referenceManifest.releaseAllowed || !expectedValues.releaseAllowed || !toleranceManifest.releaseAllowed || !probeManifest.releaseAllowed
    || referenceManifest.reasonCodes.length || expectedValues.reasonCodes.length || toleranceManifest.reasonCodes.length || probeManifest.reasonCodes.length) {
    throw referenceError('P17_REFERENCE_RELEASE_NOT_ALLOWED', 'Every locked reference document must be releasable and blocker-free.');
  }
  if (referenceManifest.approval?.status !== 'APPROVED' || !sha(referenceManifest.approval?.approvalHash)) {
    throw referenceError('P17_REFERENCE_APPROVAL_REQUIRED', 'Reference approval is required before execution.');
  }
  if (toleranceManifest.approval?.status !== 'APPROVED' || !sha(toleranceManifest.approval?.approvalHash)) {
    throw referenceError('P17_TOLERANCE_APPROVAL_REQUIRED', 'Tolerance approval is required before execution.');
  }
  if (probeManifest.approval?.status !== 'APPROVED' || !sha(probeManifest.approval?.approvalHash)) {
    throw referenceError('P17_PROBE_APPROVAL_REQUIRED', 'Probe approval is required before execution.');
  }
  const lanes = referenceManifest.lanes || [];
  if (lanes.length !== 4 || new Set(lanes.map((row) => row.id)).size !== 4 || P17_REFERENCE_LANES.some((id) => !lanes.some((row) => row.id === id))) {
    throw referenceError('P17_REFERENCE_LANE_SET_INVALID', 'The four reference lanes must be explicit and unique.');
  }
  if (!Array.isArray(expectedValues.values) || expectedValues.values.length === 0) throw referenceError('P17_EXPECTED_VALUES_REQUIRED', 'Locked expected values cannot be empty.');
  if (!Array.isArray(toleranceManifest.criteria) || toleranceManifest.criteria.length === 0) throw referenceError('P17_TOLERANCE_CRITERIA_REQUIRED', 'Locked tolerances cannot be empty.');
  if (!Array.isArray(probeManifest.probes) || probeManifest.probes.length === 0) throw referenceError('P17_PROBES_REQUIRED', 'Locked probes cannot be empty.');
  if (referenceManifest.expectedValuesHash !== sha256Canonical(expectedValues)) throw referenceError('P17_EXPECTED_VALUES_BINDING_MISMATCH', 'Reference manifest does not bind the supplied expected-values document.');
  if (referenceManifest.sourceManifestBinding?.sha256 !== sha256Canonical(sourceManifest)) throw referenceError('P17_SOURCE_MANIFEST_BINDING_MISMATCH', 'Reference manifest does not bind the supplied source manifest.');
  const primaryLane = lanes.find((row) => row.id === 'PRIMARY_INDEPENDENT');
  if (primaryLane?.status !== 'LOCKED'
    || !primaryLane.artifacts.length
    || !['R1_R2_EXTERNAL', 'R3_INDEPENDENT_RECONSTRUCTION_REQUIRED'].includes(primaryLane.referenceClass)
    || !['R1', 'R2', 'R3'].includes(primaryLane.claimEvidenceLevel)) {
    throw referenceError('P17_PRIMARY_REFERENCE_LANE_REQUIRED', 'A locked R1/R2/R3 independent primary reference artifact is required before execution.');
  }
  assertUnique(expectedValues.values.map((row) => `${row.metricId}:${row.lane}`), 'P17_EXPECTED_VALUE_ID_DUPLICATE');
  assertUnique(toleranceManifest.criteria.map((row) => row.metricId), 'P17_TOLERANCE_METRIC_DUPLICATE');
  assertUnique(probeManifest.probes.map((row) => row.probeId), 'P17_PROBE_ID_DUPLICATE');
  assertUnique(probeManifest.probes.map((row) => row.metricId), 'P17_PROBE_METRIC_DUPLICATE');
  const criterionById = new Map(toleranceManifest.criteria.map((row) => [row.metricId, row]));
  const primaryById = new Map(expectedValues.values.filter((row) => row.lane === 'PRIMARY_INDEPENDENT').map((row) => [row.metricId, row]));
  const probeByMetric = new Map(probeManifest.probes.map((row) => [row.metricId, row]));
  if (primaryById.size !== criterionById.size || probeByMetric.size !== criterionById.size) throw referenceError('P17_REFERENCE_METRIC_SET_MISMATCH', 'Primary values, tolerances and probes must cover the same metric set.');
  for (const [metricId, criterion] of criterionById) {
    const primary = primaryById.get(metricId);
    const probe = probeByMetric.get(metricId);
    if (!primary || !probe) throw referenceError('P17_REFERENCE_METRIC_SET_MISMATCH', `Metric ${metricId} is missing a primary value or probe.`);
    if (primary.unit !== criterion.unit || probe.unit !== criterion.unit || probe.mandatory !== criterion.mandatory) throw referenceError('P17_REFERENCE_METRIC_CONTRACT_MISMATCH', `Metric ${metricId} has inconsistent unit or mandatory flags.`);
  }
  if (expectedValues.values.some((row) => !criterionById.has(row.metricId) || row.approvalHash !== referenceManifest.approval.approvalHash)) throw referenceError('P17_EXPECTED_VALUE_APPROVAL_MISMATCH', 'Expected values must be in the approved metric set and bind the reference approval.');
  if (toleranceManifest.criteria.some((row) => row.approvalHash !== toleranceManifest.approval.approvalHash)) throw referenceError('P17_TOLERANCE_ROW_APPROVAL_MISMATCH', 'Every tolerance criterion must bind the tolerance approval.');
  if (probeManifest.probes.some((row) => row.approvalHash !== probeManifest.approval.approvalHash)) throw referenceError('P17_PROBE_ROW_APPROVAL_MISMATCH', 'Every probe must bind the probe approval.');
  for (const criterion of toleranceManifest.criteria) {
    if (criterion.relativeTolerancePct == null && criterion.absoluteTolerance == null) {
      throw referenceError('P17_TOLERANCE_LIMIT_REQUIRED', `Metric ${criterion.metricId} has no relative or absolute limit.`);
    }
  }
}

function hashDocuments(documents) {
  return Object.fromEntries(Object.entries(documents).map(([key, value]) => [key, sha256Canonical(value)]));
}

function strictClone(value, label) {
  assertStrictJson(value, label);
  return JSON.parse(JSON.stringify(value));
}

function assertUnique(values, code) {
  if (new Set(values).size !== values.length) throw referenceError(code, 'Duplicate identifier in reference bundle.');
}

function sha(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function referenceError(code, message) {
  return Object.assign(new Error(message), { code });
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
