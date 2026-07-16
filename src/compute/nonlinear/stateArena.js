import { stableHash, stableStringify } from '../../core/stableHash.js';

export const NONLINEAR_BATCH_STATE_ARENA_VERSION = 'p9-m7-nonlinear-batch-state-arena-v1';
const DEFAULT_SLOT_BYTES = 256;
const DEFAULT_TOTAL_BYTES = 256 * 1024 * 1024;

export function createNonlinearBatchStateArena(options = {}) {
  const ownerRunId = requiredText(options.ownerRunId || options.runId, 'ownerRunId');
  const elementIds = normalizeIds(options.elementIds || options.batch?.elementIds || []);
  const initialStates = options.initialStates || {};
  const maxTotalBytes = positiveInteger(options.maxTotalBytes, DEFAULT_TOTAL_BYTES);
  const minimumSlotBytes = positiveInteger(options.minimumSlotBytes, DEFAULT_SLOT_BYTES);
  const numericWidths = normalizeNumericWidths(options.numericWidths, elementIds.length);
  const encoded = elementIds.map((id) => encodeState(stateValue(initialStates, id)));
  const byteCapacities = Int32Array.from(encoded, (bytes, index) => {
    const requested = Number(valueAt(options.byteCapacities, elementIds[index], index) || 0);
    return nextPowerOfTwo(Math.max(minimumSlotBytes, requested, bytes.length));
  });
  const byteOffsets = prefixOffsets(byteCapacities, maxTotalBytes, 'NONLINEAR_STATE_BYTES_LIMIT');
  const numericOffsets = prefixOffsets(numericWidths, 0x7fffffff, 'NONLINEAR_STATE_NUMERIC_LIMIT');
  let committedBytes = new Uint8Array(byteOffsets.at(-1));
  let trialBytes = new Uint8Array(committedBytes.length);
  let committedByteLengths = new Int32Array(elementIds.length);
  let trialByteLengths = new Int32Array(elementIds.length);
  let committedNumeric = new Float64Array(numericOffsets.at(-1));
  let trialNumeric = new Float64Array(committedNumeric.length);
  const idToIndex = new Map(elementIds.map((id, index) => [id, index]));
  encoded.forEach((bytes, index) => writeBytes(committedBytes, committedByteLengths, index, bytes));
  trialBytes.set(committedBytes);
  trialByteLengths.set(committedByteLengths);
  if (options.initialNumeric != null) {
    const initialNumeric = Float64Array.from(options.initialNumeric, Number);
    if (initialNumeric.length !== committedNumeric.length || initialNumeric.some((value) => !Number.isFinite(value))) {
      throw arenaError('NONLINEAR_STATE_INITIAL_NUMERIC_INVALID', 'Initial numeric state does not match the numeric layout.');
    }
    committedNumeric.set(initialNumeric);
    trialNumeric.set(initialNumeric);
  }
  let epoch = 0;
  let disposed = false;
  let trialActive = false;

  return Object.freeze({
    version: NONLINEAR_BATCH_STATE_ARENA_VERSION,
    ownerRunId,
    elementIds,
    get epoch() { return epoch; },
    get disposed() { return disposed; },
    get trialActive() { return trialActive; },
    layout: Object.freeze({
      byteLength: committedBytes.length,
      numericLength: committedNumeric.length,
      elementSlots: Object.freeze(elementIds.map((id, index) => Object.freeze({
        id,
        byteOffset: byteOffsets[index],
        byteCapacity: byteCapacities[index],
        numericOffset: numericOffsets[index],
        numericLength: numericWidths[index],
      }))),
    }),
    get committedBytes() { assertAvailable(); return Uint8Array.from(committedBytes); },
    get trialBytes() { assertAvailable(); return Uint8Array.from(trialBytes); },
    get committedNumeric() { assertAvailable(); return Float64Array.from(committedNumeric); },
    get trialNumeric() { assertAvailable(); return Float64Array.from(trialNumeric); },
    beginTrial(runId = ownerRunId) {
      assertOwner(runId);
      trialBytes.set(committedBytes);
      trialByteLengths.set(committedByteLengths);
      trialNumeric.set(committedNumeric);
      trialActive = true;
      return snapshot();
    },
    writeTrial(elementId, state, runId = ownerRunId) {
      assertOwner(runId);
      assertTrial();
      const index = requireIndex(elementId);
      writeBytes(trialBytes, trialByteLengths, index, encodeState(state));
      return readState(trialBytes, trialByteLengths, index);
    },
    writeTrialNumeric(elementId, values, runId = ownerRunId) {
      assertOwner(runId);
      assertTrial();
      const index = requireIndex(elementId);
      const start = numericOffsets[index];
      const width = numericWidths[index];
      const input = Float64Array.from(values || [], Number);
      if (input.length !== width || input.some((value) => !Number.isFinite(value))) {
        throw arenaError('NONLINEAR_STATE_NUMERIC_SHAPE_INVALID', `Numeric state ${elementIds[index]} requires ${width} finite values.`);
      }
      trialNumeric.set(input, start);
      return Float64Array.from(input);
    },
    readCommitted(elementId) { assertAvailable(); return readState(committedBytes, committedByteLengths, requireIndex(elementId)); },
    readTrial(elementId) { assertAvailable(); return readState(trialBytes, trialByteLengths, requireIndex(elementId)); },
    readCommittedNumeric(elementId) { assertAvailable(); return readNumeric(committedNumeric, requireIndex(elementId)); },
    readTrialNumeric(elementId) { assertAvailable(); return readNumeric(trialNumeric, requireIndex(elementId)); },
    exportCommittedStates() {
      assertAvailable();
      return Object.fromEntries(elementIds.map((id, index) => [id, readState(committedBytes, committedByteLengths, index)]));
    },
    commit(runId = ownerRunId) {
      assertOwner(runId);
      assertTrial();
      committedBytes.set(trialBytes);
      committedByteLengths.set(trialByteLengths);
      committedNumeric.set(trialNumeric);
      trialActive = false;
      epoch += 1;
      return snapshot();
    },
    rollback(runId = ownerRunId) {
      assertOwner(runId);
      trialBytes.set(committedBytes);
      trialByteLengths.set(committedByteLengths);
      trialNumeric.set(committedNumeric);
      trialActive = false;
      return snapshot();
    },
    snapshot,
    dispose(runId = ownerRunId) {
      assertOwner(runId);
      committedBytes.fill(0); trialBytes.fill(0);
      committedByteLengths.fill(0); trialByteLengths.fill(0);
      committedNumeric.fill(0); trialNumeric.fill(0);
      disposed = true;
      trialActive = false;
      return Object.freeze({ version: NONLINEAR_BATCH_STATE_ARENA_VERSION, ownerRunId, disposed: true, epoch });
    },
  });

  function snapshot() {
    assertAvailable();
    return Object.freeze({
      version: NONLINEAR_BATCH_STATE_ARENA_VERSION,
      ownerRunId,
      epoch,
      trialActive,
      committedHash: stateBytesHash(committedBytes, committedByteLengths, committedNumeric),
      trialHash: stateBytesHash(trialBytes, trialByteLengths, trialNumeric),
      byteLength: committedBytes.byteLength + trialBytes.byteLength + committedNumeric.byteLength + trialNumeric.byteLength,
    });
  }

  function requireIndex(elementId) {
    const index = idToIndex.get(String(elementId));
    if (index == null) throw arenaError('NONLINEAR_STATE_ELEMENT_UNKNOWN', `Unknown element state: ${elementId}.`);
    return index;
  }
  function writeBytes(destination, lengths, index, bytes) {
    const capacity = byteCapacities[index];
    if (bytes.length > capacity) {
      throw arenaError('NONLINEAR_STATE_SLOT_OVERFLOW', `Element ${elementIds[index]} state requires ${bytes.length} bytes; capacity is ${capacity}.`);
    }
    const start = byteOffsets[index];
    destination.fill(0, start, start + capacity);
    destination.set(bytes, start);
    lengths[index] = bytes.length;
  }
  function readState(source, lengths, index) {
    const bytes = source.subarray(byteOffsets[index], byteOffsets[index] + lengths[index]);
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function readNumeric(source, index) {
    return Float64Array.from(source.subarray(numericOffsets[index], numericOffsets[index + 1]));
  }
  function assertOwner(runId) {
    assertAvailable();
    if (String(runId) !== ownerRunId) throw arenaError('NONLINEAR_STATE_OWNER_MISMATCH', 'State arena belongs to another run.');
  }
  function assertAvailable() { if (disposed) throw arenaError('NONLINEAR_STATE_ARENA_DISPOSED', 'State arena has been disposed.'); }
  function assertTrial() { if (!trialActive) throw arenaError('NONLINEAR_STATE_TRIAL_REQUIRED', 'A trial state must be active.'); }
}

function stateBytesHash(bytes, lengths, numeric) {
  return stableHash({
    bytes: bytesToHex(bytes),
    lengths: bytesToHex(new Uint8Array(lengths.buffer, lengths.byteOffset, lengths.byteLength)),
    numeric: bytesToHex(new Uint8Array(numeric.buffer, numeric.byteOffset, numeric.byteLength)),
  });
}
function bytesToHex(bytes) {
  let output = '';
  const chunkSize = 8192;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    output += Array.from(bytes.subarray(offset, offset + chunkSize), (value) => value.toString(16).padStart(2, '0')).join('');
  }
  return output;
}
function encodeState(value) {
  const serialized = stableStringify(value == null ? {} : value);
  if (serialized === undefined) throw arenaError('NONLINEAR_STATE_NOT_SERIALIZABLE', 'Element state must be JSON serializable.');
  return new TextEncoder().encode(serialized);
}
function stateValue(states, id) { return states instanceof Map ? states.get(id) : states?.[id]; }
function valueAt(values, id, index) { return values instanceof Map ? values.get(id) : Array.isArray(values) || ArrayBuffer.isView(values) ? values[index] : values?.[id]; }
function normalizeIds(values) {
  const ids = Object.freeze(Array.from(values, (value) => requiredText(value, 'elementId')));
  if (new Set(ids).size !== ids.length) throw arenaError('NONLINEAR_STATE_ELEMENT_DUPLICATE', 'Element state IDs must be unique.');
  return ids;
}
function normalizeNumericWidths(values, count) {
  if (values == null) return new Int32Array(count);
  const widths = Int32Array.from(values, Number);
  if (widths.length !== count || [...widths].some((value) => !Number.isInteger(value) || value < 0)) {
    throw arenaError('NONLINEAR_STATE_NUMERIC_WIDTH_INVALID', 'Numeric widths must contain one nonnegative integer per element.');
  }
  return widths;
}
function prefixOffsets(lengths, limit, code) {
  const offsets = new Int32Array(lengths.length + 1);
  for (let index = 0; index < lengths.length; index += 1) {
    const next = offsets[index] + Number(lengths[index]);
    if (!Number.isInteger(next) || next < 0 || next > limit || next > 0x7fffffff) throw arenaError(code, 'State arena exceeds its configured capacity.');
    offsets[index + 1] = next;
  }
  return offsets;
}
function nextPowerOfTwo(value) {
  let output = 1;
  while (output < value) output *= 2;
  if (output > 0x7fffffff) throw arenaError('NONLINEAR_STATE_SLOT_TOO_LARGE', 'Element state slot exceeds Int32 capacity.');
  return output;
}
function positiveInteger(value, fallback) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }
function requiredText(value, field) { const text = value == null ? '' : String(value).trim(); if (!text) throw arenaError('NONLINEAR_STATE_FIELD_REQUIRED', `${field} is required.`); return text; }
function arenaError(code, message) { return Object.assign(new Error(message), { code }); }
