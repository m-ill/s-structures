import { stableHash } from '../../../src/core/stableHash.js';

export const PHASE14_REFERENCE_LEVELS = Object.freeze({
  R1: 'closed-form-conservation-law',
  R2: 'published-benchmark',
  R3: 'independent-implementation',
  R4: 'cross-solver-comparison',
  R5: 'custom-invariant-sensitivity',
});

export function createPhase14ReferenceRecord(input = {}) {
  const level = requiredEnum(input.level, Object.keys(PHASE14_REFERENCE_LEVELS), 'reference level');
  const core = {
    version: 'p14-m0-reference-record-v1',
    id: requiredText(input.id, 'reference id'),
    capabilityId: requiredText(input.capabilityId, 'capability id').toUpperCase(),
    level,
    kind: PHASE14_REFERENCE_LEVELS[level],
    title: requiredText(input.title, 'reference title'),
    locator: requiredText(input.locator, 'reference locator'),
    sourceHash: requiredHash(input.sourceHash, 'source hash'),
    revision: clean(input.revision),
    licenseNote: clean(input.licenseNote),
    independentFromProduction: input.independentFromProduction === true,
    approvedBy: clean(input.approvedBy),
    approvedAt: clean(input.approvedAt),
  };
  if (['R1', 'R2', 'R3'].includes(level) && !core.independentFromProduction) {
    throw new Error(`${level} reference must be independent from production code.`);
  }
  return immutableWithHash(core, 'referenceHash');
}

export function createPhase14ToleranceManifest(input = {}) {
  const metrics = Array.from(input.metrics || []).map((metric, index) => {
    const absolute = optionalNonnegative(metric.absolute, `metrics[${index}].absolute`);
    const relative = optionalNonnegative(metric.relative, `metrics[${index}].relative`);
    if (absolute == null && relative == null) throw new Error(`metrics[${index}] requires absolute or relative tolerance.`);
    return {
      id: requiredText(metric.id, `metrics[${index}].id`),
      response: requiredText(metric.response, `metrics[${index}].response`),
      unit: requiredText(metric.unit, `metrics[${index}].unit`),
      absolute,
      relative,
      comparison: clean(metric.comparison) || 'absolute-or-relative',
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  if (!metrics.length) throw new Error('Tolerance manifest requires at least one metric.');
  const core = {
    version: 'p14-m0-tolerance-manifest-v1',
    id: requiredText(input.id, 'tolerance manifest id'),
    capabilityId: requiredText(input.capabilityId, 'capability id').toUpperCase(),
    referenceIds: Array.from(new Set(input.referenceIds || [])).map(String).sort(),
    metrics,
    frozenBeforeRun: input.frozenBeforeRun === true,
    approvedBy: clean(input.approvedBy),
    approvedAt: clean(input.approvedAt),
  };
  return immutableWithHash(core, 'toleranceHash');
}

export function createPhase14DiscrepancyRecord(input = {}) {
  const core = {
    version: 'p14-m0-discrepancy-record-v1',
    id: requiredText(input.id, 'discrepancy id'),
    capabilityId: requiredText(input.capabilityId, 'capability id').toUpperCase(),
    runHash: requiredHash(input.runHash, 'run hash'),
    referenceHash: requiredHash(input.referenceHash, 'reference hash'),
    toleranceHash: requiredHash(input.toleranceHash, 'tolerance hash'),
    status: requiredEnum(input.status, ['OPEN', 'EXPLAINED', 'RESOLVED', 'ACCEPTED-LIMITATION'], 'discrepancy status'),
    classification: clean(input.classification) || 'unclassified',
    summary: requiredText(input.summary, 'discrepancy summary'),
    resolution: clean(input.resolution),
    reviewer: clean(input.reviewer),
  };
  return immutableWithHash(core, 'discrepancyHash');
}

function immutableWithHash(core, field) {
  return deepFreeze({ ...core, [field]: stableHash(core) });
}

function requiredText(value, label) {
  const result = clean(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function requiredHash(value, label) {
  const result = requiredText(value, label).toLowerCase();
  if (!/^[0-9a-f]{16,64}$/.test(result)) throw new Error(`${label} must be a hexadecimal digest.`);
  return result;
}

function requiredEnum(value, allowed, label) {
  const result = requiredText(value, label).toUpperCase();
  if (!allowed.includes(result)) throw new Error(`${label} must be one of ${allowed.join(', ')}.`);
  return result;
}

function optionalNonnegative(value, label) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be finite and nonnegative.`);
  return number;
}

function clean(value) { return value == null ? null : String(value).trim() || null; }

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
