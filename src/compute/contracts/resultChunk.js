import { stableHash } from '../../core/stableHash.js';

export const RESULT_CHUNK_VERSION = 'p9-result-chunk-v1';

export function createResultChunk(input = {}) {
  const channel = requiredText(input.channel, 'channel');
  const startIndex = nonnegativeInteger(input.startIndex, 0);
  const values = normalizeValues(input.values);
  const componentCount = positiveInteger(input.componentCount, 1);
  if (values.length % componentCount !== 0) throw chunkError('RESULT_CHUNK_SHAPE_INVALID', 'Value count must be divisible by componentCount.');
  const itemCount = values.length / componentCount;
  const endIndex = input.endIndex == null ? startIndex + itemCount : nonnegativeInteger(input.endIndex, startIndex + itemCount);
  if (endIndex - startIndex !== itemCount) throw chunkError('RESULT_CHUNK_RANGE_INVALID', 'Result range does not match value count.');
  const extrema = calculateExtrema(values, componentCount);
  const provenance = normalizeProvenance(input.provenance);
  const core = {
    version: RESULT_CHUNK_VERSION,
    channel,
    unit: String(input.unit || ''),
    startIndex,
    endIndex,
    itemCount,
    componentCount,
    values,
    extrema,
    provenance,
  };
  const byteLength = values.byteLength;
  return Object.freeze({ ...core, byteLength, chunkHash: hashChunk(core, byteLength) });
}

export function validateResultChunk(chunk) {
  const errors = [];
  if (!chunk || typeof chunk !== 'object') return { ok: false, errors: ['chunk:not-object'] };
  if (chunk.version !== RESULT_CHUNK_VERSION) errors.push('chunk:version');
  if (!ArrayBuffer.isView(chunk.values)) errors.push('chunk:values');
  if (chunk.values?.length !== chunk.itemCount * chunk.componentCount) errors.push('chunk:shape');
  if (chunk.endIndex - chunk.startIndex !== chunk.itemCount) errors.push('chunk:range');
  if (chunk.byteLength !== chunk.values?.byteLength) errors.push('chunk:byteLength');
  if (chunk.chunkHash !== hashChunk(chunk, chunk.values?.byteLength || 0)) errors.push('chunk:hash');
  return { ok: errors.length === 0, errors };
}

function hashChunk(chunk, byteLength) {
  return stableHash({
    version: chunk.version,
    channel: chunk.channel,
    unit: chunk.unit,
    startIndex: chunk.startIndex,
    endIndex: chunk.endIndex,
    itemCount: chunk.itemCount,
    componentCount: chunk.componentCount,
    values: Array.from(chunk.values || []),
    extrema: chunk.extrema,
    provenance: chunk.provenance,
    byteLength,
  });
}

function calculateExtrema(values, componentCount) {
  const min = new Array(componentCount).fill(Infinity);
  const max = new Array(componentCount).fill(-Infinity);
  const minIndex = new Array(componentCount).fill(-1);
  const maxIndex = new Array(componentCount).fill(-1);
  for (let index = 0; index < values.length; index += 1) {
    const component = index % componentCount;
    const item = Math.trunc(index / componentCount);
    const value = values[index];
    if (value < min[component]) {
      min[component] = value;
      minIndex[component] = item;
    }
    if (value > max[component]) {
      max[component] = value;
      maxIndex[component] = item;
    }
  }
  return Object.freeze({ min, max, minIndex, maxIndex });
}

function normalizeValues(value) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) throw chunkError('RESULT_CHUNK_VALUES_REQUIRED', 'Result values are required.');
  const output = Float64Array.from(value, Number);
  if (!output.every(Number.isFinite)) throw chunkError('RESULT_CHUNK_NONFINITE', 'Result values must be finite.');
  return output;
}

function normalizeProvenance(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.freeze({
    runId: requiredText(source.runId, 'provenance.runId'),
    planHash: requiredText(source.planHash, 'provenance.planHash'),
    backendId: requiredText(source.backendId, 'provenance.backendId'),
    operationId: requiredText(source.operationId, 'provenance.operationId'),
  });
}

function requiredText(value, field) {
  const normalized = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!normalized) throw chunkError('RESULT_CHUNK_FIELD_REQUIRED', field + ' is required.');
  return normalized;
}

function nonnegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function chunkError(code, message) {
  return Object.assign(new Error(message), { code });
}
