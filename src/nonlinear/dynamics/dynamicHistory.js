import { MDOF_DYNAMIC_HISTORY_VERSION } from '../../metadata/numericVersions.js';
export { MDOF_DYNAMIC_HISTORY_VERSION };
import { stableHash } from '../../core/stableHash.js';



export function createDynamicHistoryCollector(options = {}) {
  const chunkSize = positiveInteger(options.chunkSize, 128);
  const memoryBudgetBytes = positiveInteger(options.memoryBudgetBytes, 64 * 1024 * 1024);
  const retainChunks = options.retainChunks !== false;
  const channels = normalizeChannels(options.channels);
  const chunks = [];
  const chunkManifest = [];
  const checkpoints = [];
  const internalSteps = [];
  const envelopes = new Map();
  let pending = [];
  let retainedBytes = 0;
  let outputStepCount = 0;
  let internalStepCount = 0;
  let chunkSequence = 0;

  return Object.freeze({
    version: MDOF_DYNAMIC_HISTORY_VERSION,
    appendOutput(row = {}) {
      const normalized = normalizeOutputRow(row, channels, outputStepCount);
      updateEnvelopes(envelopes, normalized);
      pending.push(normalized);
      outputStepCount += 1;
      if (pending.length >= chunkSize) flush('chunk-size');
      return normalized;
    },
    recordInternalStep(row = {}) {
      internalStepCount += 1;
      if (options.retainInternalSteps !== true) return null;
      const normalized = Object.freeze({
        kind: 'internal-step',
        internalStep: internalStepCount,
        time: finite(row.time, 'internal.time'),
        dt: positive(row.dt, 'internal.dt'),
        iterationCount: nonnegativeInteger(row.iterationCount, 0),
        substepLevel: nonnegativeInteger(row.substepLevel, 0),
        outputStep: row.outputStep == null ? null : nonnegativeInteger(row.outputStep, 0),
        convergence: clone(row.convergence || null),
      });
      const bytes = estimateBytes(normalized);
      if (retainedBytes + bytes > memoryBudgetBytes) {
        throw historyError('DYNAMIC_HISTORY_MEMORY_BUDGET_EXCEEDED', 'Retained internal-step history exceeds the configured memory budget.', {
          memoryBudgetBytes,
          retainedBytes,
          nextInternalStepBytes: bytes,
        });
      }
      internalSteps.push(normalized);
      retainedBytes += bytes;
      return normalized;
    },
    addCheckpoint(checkpoint, metadata = {}) {
      const row = Object.freeze({
        sequence: checkpoints.length + 1,
        time: finite(metadata.time ?? checkpoint?.committed?.time ?? 0, 'checkpoint.time'),
        outputStep: nonnegativeInteger(metadata.outputStep, outputStepCount),
        internalStep: nonnegativeInteger(metadata.internalStep, internalStepCount),
        checkpointHash: checkpoint?.integrityHash || null,
        committedHash: checkpoint?.committedHash || null,
        chunkCount: chunkManifest.length + (pending.length ? 1 : 0),
        metadata: clone(metadata),
      });
      checkpoints.push(row);
      return row;
    },
    flush(reason = 'manual') {
      return flush(reason);
    },
    finalize(metadata = {}) {
      flush('finalize');
      const manifest = {
        version: MDOF_DYNAMIC_HISTORY_VERSION,
        outputStepCount,
        internalStepCount,
        chunkCount: chunkManifest.length,
        retainedChunkCount: chunks.length,
        retainedInternalStepCount: internalSteps.length,
        retainedBytes,
        memoryBudgetBytes,
        channels,
        chunks: chunkManifest.slice(),
        checkpoints: checkpoints.slice(),
        envelopes: envelopeObject(envelopes),
        outputInternalStepPolicy: 'output-samples-are-distinct-from-accepted-internal-substeps',
        metadata: clone(metadata),
        internalSteps: Object.freeze(internalSteps.slice()),
      };
      return Object.freeze({
        ...manifest,
        manifestHash: stableHash(manifest).slice(0, 24),
        retainedChunks: retainChunks ? Object.freeze(chunks.slice()) : Object.freeze([]),
      });
    },
    get statistics() {
      return Object.freeze({ outputStepCount, internalStepCount, chunkCount: chunkManifest.length, retainedBytes });
    },
  });

  function flush(reason) {
    if (!pending.length) return null;
    chunkSequence += 1;
    const rows = Object.freeze(pending.slice());
    pending = [];
    const bytes = estimateBytes(rows);
    const core = {
      version: MDOF_DYNAMIC_HISTORY_VERSION,
      sequence: chunkSequence,
      reason,
      firstOutputStep: rows[0].outputStep,
      lastOutputStep: rows.at(-1).outputStep,
      startTime: rows[0].time,
      endTime: rows.at(-1).time,
      rowCount: rows.length,
      bytes,
    };
    const chunkHash = stableHash({ ...core, rows }).slice(0, 24);
    const descriptor = Object.freeze({ ...core, chunkHash });
    if (retainChunks) {
      if (retainedBytes + bytes > memoryBudgetBytes) {
        throw historyError('DYNAMIC_HISTORY_MEMORY_BUDGET_EXCEEDED', 'Retained response history exceeds the configured memory budget.', {
          memoryBudgetBytes,
          retainedBytes,
          nextChunkBytes: bytes,
        });
      }
      chunks.push(Object.freeze({ ...descriptor, rows }));
      retainedBytes += bytes;
    }
    chunkManifest.push(descriptor);
    if (typeof options.onChunk === 'function') options.onChunk(Object.freeze({ ...descriptor, rows }));
    return descriptor;
  }
}

function normalizeOutputRow(row, channels, outputStep) {
  const normalized = {
    version: MDOF_DYNAMIC_HISTORY_VERSION,
    kind: 'output-step',
    outputStep,
    time: finite(row.time, 'time'),
    sourceInternalStep: nonnegativeInteger(row.sourceInternalStep, 0),
    sourceSubstepLevel: nonnegativeInteger(row.sourceSubstepLevel, 0),
  };
  for (const channel of channels) {
    if (!Object.prototype.hasOwnProperty.call(row, channel)) continue;
    normalized[channel] = normalizeChannelValue(row[channel], channel);
  }
  return Object.freeze(normalized);
}

function updateEnvelopes(envelopes, row) {
  for (const [channel, value] of Object.entries(row)) {
    if (['version', 'kind', 'outputStep', 'time', 'sourceInternalStep', 'sourceSubstepLevel'].includes(channel)) continue;
    visitEnvelopeValue(envelopes, channel, value, [], row);
  }
}

function visitEnvelopeValue(envelopes, channel, value, segments, row) {
  if (typeof value === 'number') {
    const path = formatEnvelopePath(channel, segments);
    const index = segments.length === 1 && Number.isInteger(segments[0]) ? segments[0] : null;
    updateEnvelope(envelopes, path, channel, index, value, row);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitEnvelopeValue(envelopes, channel, item, [...segments, index], row));
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.keys(value).sort().forEach((key) => {
    visitEnvelopeValue(envelopes, channel, value[key], [...segments, key], row);
  });
}

function formatEnvelopePath(channel, segments) {
  return segments.reduce((path, segment) => {
    if (Number.isInteger(segment)) return `${path}[${segment}]`;
    return /^[A-Za-z_$][\w$]*$/.test(segment)
      ? `${path}.${segment}`
      : `${path}[${JSON.stringify(segment)}]`;
  }, channel);
}

function updateEnvelope(envelopes, key, channel, index, value, row) {
  const current = envelopes.get(key);
  if (!current) {
    envelopes.set(key, {
      path: key,
      channel,
      index,
      minimum: value,
      minimumTime: row.time,
      minimumOutputStep: row.outputStep,
      maximum: value,
      maximumTime: row.time,
      maximumOutputStep: row.outputStep,
      absoluteMaximum: Math.abs(value),
      absoluteMaximumTime: row.time,
      absoluteMaximumOutputStep: row.outputStep,
    });
    return;
  }
  if (value < current.minimum) {
    current.minimum = value;
    current.minimumTime = row.time;
    current.minimumOutputStep = row.outputStep;
  }
  if (value > current.maximum) {
    current.maximum = value;
    current.maximumTime = row.time;
    current.maximumOutputStep = row.outputStep;
  }
  if (Math.abs(value) > current.absoluteMaximum) {
    current.absoluteMaximum = Math.abs(value);
    current.absoluteMaximumTime = row.time;
    current.absoluteMaximumOutputStep = row.outputStep;
  }
}

function envelopeObject(envelopes) {
  return Object.freeze(Object.fromEntries(
    [...envelopes.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, row]) => [key, Object.freeze({ ...row })]),
  ));
}

function normalizeChannels(input) {
  const defaults = ['q', 'v', 'a', 'groundAcceleration', 'baseReactionForce', 'baseReactionMoment', 'elements', 'energies', 'convergence'];
  const source = Array.isArray(input) && input.length ? input : defaults;
  return Object.freeze([...new Set(source.map(String).map((value) => value.trim()).filter(Boolean))]);
}

function normalizeChannelValue(value, path) {
  if (typeof value === 'number') return finite(value, path);
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return Object.freeze(Array.from(value, (item, index) => finite(item, `${path}[${index}]`)));
  }
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  const copy = clone(value);
  assertFinite(copy, path);
  return deepFreezeValue(copy);
}

function deepFreezeValue(value) {
  if (!value || typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value)) {
    return Object.freeze(Array.from(value, (item) => deepFreezeValue(item)));
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => { value[index] = deepFreezeValue(item); });
    return Object.freeze(value);
  }
  Object.keys(value).forEach((key) => { value[key] = deepFreezeValue(value[key]); });
  return Object.freeze(value);
}

function estimateBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function assertFinite(value, path) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw historyError('DYNAMIC_HISTORY_VALUE_NONFINITE', `${path} must be finite.`);
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) value.forEach((item, index) => assertFinite(item, `${path}[${index}]`));
  else Object.entries(value).forEach(([key, item]) => assertFinite(item, `${path}.${key}`));
}

function finite(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw historyError('DYNAMIC_HISTORY_VALUE_NONFINITE', `${path} must be finite.`);
  return number;
}

function positive(value, path) {
  const number = finite(value, path);
  if (!(number > 0)) throw historyError('DYNAMIC_HISTORY_VALUE_INVALID', `${path} must be positive.`);
  return number;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function nonnegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function historyError(code, message, details = null) {
  const error = new Error(message);
  error.name = 'MdofDynamicHistoryError';
  error.code = code;
  error.details = details;
  return error;
}
