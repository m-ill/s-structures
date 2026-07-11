import { stableHash, stableStringify } from '../../core/stableHash.js';

export { stableHash, stableStringify } from '../../core/stableHash.js';

export const VERIFICATION_MATRIX_RECORD_VERSION = 'p6-m3-verification-record-v1';

export function buildVerificationRecord({
  caseId,
  tier,
  name,
  reference,
  computed,
  tolerance,
  toleranceKey = null,
  model = null,
  hashInput = null,
  solverVersion = null,
  referenceSource = null,
  metric = null,
  units = null,
  errorScale = null,
  details = null,
} = {}) {
  const relError = verificationError(computed, reference, errorScale);
  const limit = Number(tolerance);
  const status = Number.isFinite(relError) && Number.isFinite(limit) && relError <= limit ? 'OK' : 'NG';
  return {
    version: VERIFICATION_MATRIX_RECORD_VERSION,
    caseId,
    tier,
    name,
    metric,
    units,
    reference,
    computed,
    relError,
    tolerance: limit,
    toleranceKey,
    modelHash: modelHash(model ?? hashInput ?? { caseId, tier, referenceSource }),
    solverVersion: solverVersion || 'unknown',
    referenceSource,
    status,
    details,
  };
}

export function verificationError(computed, reference, scale = null) {
  const c = numericLeaves(computed);
  const r = numericLeaves(reference);
  if (c.length && c.length === r.length) return vectorRelativeError(c, r, scale);
  return scalarRelativeError(Number(computed), Number(reference), scale);
}

export function scalarRelativeError(computed, reference, scale = null) {
  if (!Number.isFinite(computed) || !Number.isFinite(reference)) return Number.POSITIVE_INFINITY;
  const denominator = errorDenominator([reference], scale);
  return Math.abs(computed - reference) / denominator;
}

export function vectorRelativeError(computed = [], reference = [], scale = null) {
  if (!computed.length || computed.length !== reference.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < computed.length; i += 1) {
    const c = Number(computed[i]);
    const r = Number(reference[i]);
    if (!Number.isFinite(c) || !Number.isFinite(r)) return Number.POSITIVE_INFINITY;
    sum += (c - r) ** 2;
  }
  return Math.sqrt(sum) / errorDenominator(reference, scale);
}

export function modelHash(value) {
  return stableHash(value).slice(0, 16);
}

function errorDenominator(reference = [], scale = null) {
  const explicit = Number(scale);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const norm = Math.sqrt(reference.reduce((sum, value) => sum + (Number(value) || 0) ** 2, 0));
  return Math.max(1e-12, norm);
}

function numericLeaves(value) {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numericLeaves);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().flatMap((key) => numericLeaves(value[key]));
  }
  return [];
}
