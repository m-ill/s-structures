import { stableHash } from '../../core/stableHash.js';

export const STATE_ARENA_VERSION = 'p9-state-arena-v1';

export function createStateArena(options = {}) {
  const ownerRunId = requiredText(options.ownerRunId || options.runId, 'ownerRunId');
  const globalSize = nonnegativeInteger(options.globalSize, 0);
  const elementSize = nonnegativeInteger(options.elementSize, 0);
  const totalSize = globalSize + elementSize;
  let committed = initialVector(options.initialCommitted, totalSize);
  let trial = Float64Array.from(committed);
  let epoch = 0;
  let disposed = false;

  return Object.freeze({
    version: STATE_ARENA_VERSION,
    ownerRunId,
    layout: Object.freeze({
      global: Object.freeze({ offset: 0, length: globalSize }),
      element: Object.freeze({ offset: globalSize, length: elementSize }),
      total: totalSize,
    }),
    get epoch() {
      return epoch;
    },
    get disposed() {
      return disposed;
    },
    get committed() {
      assertAvailable();
      return Float64Array.from(committed);
    },
    get trial() {
      assertAvailable();
      return Float64Array.from(trial);
    },
    beginTrial(runId = ownerRunId) {
      assertOwner(runId);
      trial.set(committed);
      return trial;
    },
    commit(runId = ownerRunId) {
      assertOwner(runId);
      committed.set(trial);
      epoch += 1;
      return snapshot();
    },
    rollback(runId = ownerRunId) {
      assertOwner(runId);
      trial.set(committed);
      return snapshot();
    },
    snapshot,
    dispose(runId = ownerRunId) {
      assertOwner(runId);
      committed.fill(0);
      trial.fill(0);
      disposed = true;
      return { version: STATE_ARENA_VERSION, ownerRunId, disposed: true, epoch };
    },
  });

  function snapshot() {
    assertAvailable();
    return Object.freeze({
      version: STATE_ARENA_VERSION,
      ownerRunId,
      epoch,
      committedHash: stableHash(Array.from(committed)),
      trialHash: stableHash(Array.from(trial)),
      byteLength: committed.byteLength + trial.byteLength,
    });
  }

  function assertOwner(runId) {
    assertAvailable();
    if (String(runId) !== ownerRunId) throw arenaError('STATE_OWNER_MISMATCH', 'State arena belongs to another run.');
  }

  function assertAvailable() {
    if (disposed) throw arenaError('STATE_ARENA_DISPOSED', 'State arena has been disposed.');
  }
}

function initialVector(value, length) {
  if (value == null) return new Float64Array(length);
  if ((!Array.isArray(value) && !ArrayBuffer.isView(value)) || value.length !== length) {
    throw arenaError('STATE_INITIAL_SIZE_INVALID', 'Initial state length does not match the arena layout.');
  }
  const output = Float64Array.from(value, Number);
  if (!output.every(Number.isFinite)) throw arenaError('STATE_NONFINITE', 'Initial state must be finite.');
  return output;
}

function nonnegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function requiredText(value, field) {
  const normalized = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!normalized) throw arenaError('STATE_OWNER_REQUIRED', field + ' is required.');
  return normalized;
}

function arenaError(code, message) {
  return Object.assign(new Error(message), { code });
}
