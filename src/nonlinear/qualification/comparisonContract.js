import { stableHash } from '../../core/stableHash.js';

export const PHASE8_NUMERICAL_COMPARISON_VERSION = 'p8-m11-numerical-comparison-v1';

export function normalizePhase8NumericalComparisons(input = {}, expectedChannels = []) {
  const channels = [...new Set((expectedChannels || []).map(clean).filter(Boolean))].sort();
  const sourceRows = Array.isArray(input.comparisons)
    ? input.comparisons
    : Array.isArray(input.results) ? input.results : [];
  const sourceChannels = sourceRows.map((row) => clean(row?.channel)).filter(Boolean);
  const rows = channels.map((channel) => normalizeRow(
    sourceRows.find((row) => clean(row?.channel) === channel),
    channel,
    input.tolerance,
  ));
  const unexpectedChannels = sourceRows
    .map((row) => clean(row?.channel))
    .filter((channel) => channel && !channels.includes(channel));
  const duplicateChannels = [...new Set(sourceChannels.filter(
    (channel, index) => sourceChannels.indexOf(channel) !== index,
  ))].sort();
  const core = {
    version: PHASE8_NUMERICAL_COMPARISON_VERSION,
    ok: channels.length > 0
      && rows.length === channels.length
      && rows.every((row) => row.status === 'PASS')
      && unexpectedChannels.length === 0
      && duplicateChannels.length === 0,
    expectedChannels: channels,
    unexpectedChannels: [...new Set(unexpectedChannels)].sort(),
    duplicateChannels,
    rows,
  };
  return deepFreeze({ ...core, comparisonAuditHash: stableHash(core).slice(0, 24) });
}

function normalizeRow(input, channel, fallbackTolerance = {}) {
  const actual = finiteVector(input?.actual);
  const reference = finiteVector(input?.reference);
  const sameLength = actual && reference && actual.length === reference.length && actual.length > 0;
  const absoluteTolerance = nonnegativeOrNull(
    input?.tolerance?.absolute ?? input?.absoluteTolerance ?? fallbackTolerance?.absolute,
  );
  const relativeTolerance = nonnegativeOrNull(
    input?.tolerance?.relative ?? input?.relativeTolerance ?? fallbackTolerance?.relative,
  );
  let absoluteMaximum = null;
  let relativeL2 = null;
  if (sameLength) {
    let differenceSquared = 0;
    let referenceSquared = 0;
    absoluteMaximum = 0;
    for (let index = 0; index < actual.length; index += 1) {
      const difference = actual[index] - reference[index];
      absoluteMaximum = Math.max(absoluteMaximum, Math.abs(difference));
      differenceSquared += difference ** 2;
      referenceSquared += reference[index] ** 2;
    }
    relativeL2 = Math.sqrt(differenceSquared) / Math.max(Math.sqrt(referenceSquared), Number.EPSILON);
  }
  const withinTolerance = sameLength
    && (absoluteTolerance != null || relativeTolerance != null)
    && ((absoluteTolerance != null && absoluteMaximum <= absoluteTolerance)
      || (relativeTolerance != null && relativeL2 <= relativeTolerance));
  return deepFreeze({
    channel,
    status: withinTolerance ? 'PASS' : 'FAIL',
    sampleCount: sameLength ? actual.length : 0,
    actual,
    reference,
    absoluteMaximum,
    relativeL2,
    tolerance: { absolute: absoluteTolerance, relative: relativeTolerance },
    sourceLocation: clean(input?.sourceLocation) || null,
  });
}

function finiteVector(value) {
  if (Number.isFinite(Number(value)) && value !== '' && value != null) return [Number(value)];
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) return null;
  const result = [];
  for (const item of Array.from(value)) {
    if (Array.isArray(item) || ArrayBuffer.isView(item)) {
      const nested = finiteVector(item);
      if (!nested) return null;
      result.push(...nested);
    } else {
      const number = Number(item);
      if (!Number.isFinite(number)) return null;
      result.push(number);
    }
  }
  return result;
}

function nonnegativeOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
