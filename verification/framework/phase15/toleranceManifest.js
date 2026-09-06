import {
  immutable,
  optionalNonnegativeFinite,
  optionalText,
  requiredHash,
  requiredText,
  strictCanonicalHash,
} from './strictCanonical.js';

export const PHASE15_TOLERANCE_MANIFEST_VERSION = 'p15-tolerance-manifest-v1';
export const PHASE15_COMPARISON_POLICIES = Object.freeze(['absolute-or-relative', 'absolute-only', 'relative-only']);
export const PHASE15_TOLERANCE_METRIC_TYPES = Object.freeze(['signed', 'magnitude']);

export function createPhase15ToleranceManifest(input = {}) {
  const metrics = Array.from(input.metrics || [], normalizeMetric).sort((left, right) => left.id.localeCompare(right.id));
  if (!metrics.length) throw new Error('Tolerance manifest requires at least one metric.');
  if (new Set(metrics.map((row) => row.id)).size !== metrics.length) throw new Error('Tolerance manifest contains duplicate metric ids.');
  const core = {
    version: PHASE15_TOLERANCE_MANIFEST_VERSION,
    caseId: requiredText(input.caseId, 'caseId').toUpperCase(),
    specVersion: requiredText(input.specVersion, 'specVersion'),
    referenceHash: requiredHash(input.referenceHash, 'referenceHash'),
    metrics,
    frozenBeforeRun: input.frozenBeforeRun === true,
    rationale: requiredText(input.rationale, 'rationale'),
    approvedBy: optionalText(input.approvedBy),
    approvalHash: input.approvalHash == null ? null : requiredHash(input.approvalHash, 'approvalHash'),
  };
  return immutable({ ...core, toleranceHash: strictCanonicalHash(core, 'tolerance manifest') });
}

export function isApprovedPhase15ToleranceManifest(manifest = {}) {
  try {
    const rebuilt = createPhase15ToleranceManifest(manifest);
    return manifest.version === PHASE15_TOLERANCE_MANIFEST_VERSION
      && manifest.frozenBeforeRun === true
      && Boolean(manifest.approvedBy)
      && /^[0-9a-f]{64}$/i.test(manifest.approvalHash || '')
      && strictCanonicalHash(manifest, 'tolerance manifest') === strictCanonicalHash(rebuilt, 'rebuilt tolerance manifest');
  } catch {
    return false;
  }
}

function normalizeMetric(metric, index) {
  if (!metric || typeof metric !== 'object' || Array.isArray(metric)) throw new TypeError(`metrics[${index}] must be an object.`);
  for (const forbidden of ['tolerancePct', 'relativeTolerancePct', 'percent']) {
    if (Object.hasOwn(metric, forbidden)) throw new Error(`metrics[${index}].${forbidden} is forbidden; store tolerance as a fraction.`);
  }
  const relativeTolerance = optionalNonnegativeFinite(metric.relativeTolerance, `metrics[${index}].relativeTolerance`);
  const absoluteTolerance = optionalNonnegativeFinite(metric.absoluteTolerance, `metrics[${index}].absoluteTolerance`);
  const characteristicFloor = optionalNonnegativeFinite(metric.characteristicFloor, `metrics[${index}].characteristicFloor`);
  if (relativeTolerance == null && absoluteTolerance == null) {
    throw new Error(`metrics[${index}] requires relativeTolerance or absoluteTolerance.`);
  }
  if (relativeTolerance != null && relativeTolerance > 1) {
    throw new RangeError(`metrics[${index}].relativeTolerance must be a fraction between 0 and 1.`);
  }
  const comparisonPolicy = optionalText(metric.comparisonPolicy) || 'absolute-or-relative';
  if (!PHASE15_COMPARISON_POLICIES.includes(comparisonPolicy)) {
    throw new Error(`metrics[${index}].comparisonPolicy must be one of ${PHASE15_COMPARISON_POLICIES.join(', ')}.`);
  }
  if (comparisonPolicy === 'absolute-only' && absoluteTolerance == null) throw new Error(`metrics[${index}] absolute-only policy requires absoluteTolerance.`);
  if (comparisonPolicy === 'relative-only' && relativeTolerance == null) throw new Error(`metrics[${index}] relative-only policy requires relativeTolerance.`);
  const metricType = optionalText(metric.metricType) || 'signed';
  if (!PHASE15_TOLERANCE_METRIC_TYPES.includes(metricType)) throw new Error(`metrics[${index}].metricType must be signed or magnitude.`);
  const magnitudeMeaning = metricType === 'magnitude'
    ? requiredText(metric.magnitudeMeaning, `metrics[${index}].magnitudeMeaning`)
    : null;
  return {
    id: requiredText(metric.id, `metrics[${index}].id`),
    unit: requiredText(metric.unit, `metrics[${index}].unit`),
    relativeTolerance,
    absoluteTolerance,
    characteristicFloor,
    comparisonPolicy,
    metricType,
    magnitudeMeaning,
    rationale: requiredText(metric.rationale, `metrics[${index}].rationale`),
  };
}
