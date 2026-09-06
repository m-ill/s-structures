import { stableHash, stableStringify } from '../../core/stableHash.js';

export const NONLINEAR_STATE_STORE_VERSION = 'p8-m1-nonlinear-state-store-v1';
export const NONLINEAR_CHECKPOINT_VERSION = 'p8-m1-nonlinear-checkpoint-v1';
export const NONLINEAR_TRIAL_BRANCH_VERSION = 'p8-m1-nonlinear-trial-branch-v1';

export function createNonlinearStateStore(options = {}) {
  const committed = normalizeState(options.committed || options.initialState || {});
  return finalizeStore({
    version: NONLINEAR_STATE_STORE_VERSION,
    domainHash: clean(options.domainHash) || null,
    revision: nonnegativeInteger(options.revision, 0),
    eventSequence: nonnegativeInteger(options.eventSequence, 0),
    committed,
    trial: null,
    eventLog: normalizeEventLog(options.eventLog || []),
  });
}

export function beginStateStep(store, metadata = {}) {
  requireStore(store);
  if (store.trial) throw stateError('STATE_TRIAL_ALREADY_ACTIVE', 'A trial step is already active.');
  const trial = normalizeState({
    ...clone(store.committed),
    ...canonical(metadata),
    step: metadata.step ?? (store.committed.step + 1),
    iteration: nonnegativeInteger(metadata.iteration, 0),
    eventCursor: store.eventLog.length,
    pendingEvents: [],
  });
  return finalizeStore({ ...cloneStore(store), trial });
}

export function updateTrialState(store, patch = {}) {
  requireActiveTrial(store);
  const nextTrial = normalizeState(deepMerge(store.trial, canonical(patch)));
  return finalizeStore({ ...cloneStore(store), trial: nextTrial });
}

export function forkTrialState(store, branchId, patch = {}) {
  requireActiveTrial(store);
  const id = clean(branchId);
  if (!id) throw stateError('STATE_BRANCH_ID_REQUIRED', 'Trial branch requires an ID.');
  const branch = {
    version: NONLINEAR_TRIAL_BRANCH_VERSION,
    id,
    domainHash: store.domainHash,
    baseRevision: store.revision,
    baseCommittedHash: store.committedHash,
    baseTrialHash: stableHash(store.trial),
    trial: normalizeState(deepMerge(store.trial, canonical(patch))),
  };
  branch.branchHash = stableHash(branch).slice(0, 24);
  return deepFreeze(branch);
}

export function acceptTrialBranch(store, branch) {
  requireActiveTrial(store);
  requireBranch(store, branch);
  return finalizeStore({ ...cloneStore(store), trial: normalizeState(branch.trial) });
}

export function rejectTrialBranch(store, branch) {
  requireActiveTrial(store);
  requireBranch(store, branch);
  return store;
}

export function appendTrialEvent(store, event = {}) {
  requireActiveTrial(store);
  const pendingEvents = [...(store.trial.pendingEvents || []), canonical(event)];
  return updateTrialState(store, { pendingEvents });
}

export function commitStateStep(store, options = {}) {
  requireActiveTrial(store);
  const pending = [...(store.trial.pendingEvents || []), ...(options.events || [])].map(canonical);
  let sequence = store.eventSequence;
  const acceptedEvents = pending.map((event) => {
    sequence += 1;
    return {
      ...event,
      sequence,
      id: event.id || `event-${String(sequence).padStart(8, '0')}`,
      step: event.step ?? store.trial.step,
    };
  });
  const committed = normalizeState({
    ...clone(store.trial),
    converged: options.converged ?? true,
    eventCursor: store.eventLog.length + acceptedEvents.length,
    pendingEvents: [],
  });
  return finalizeStore({
    ...cloneStore(store),
    revision: store.revision + 1,
    eventSequence: sequence,
    committed,
    trial: null,
    eventLog: [...clone(store.eventLog), ...acceptedEvents],
  });
}

export function rollbackStateStep(store) {
  requireStore(store);
  if (!store.trial) return store;
  return finalizeStore({ ...cloneStore(store), trial: null });
}

export function restartTrialAfterCutback(store, metadata = {}) {
  const rolledBack = rollbackStateStep(store);
  return beginStateStep(rolledBack, { ...metadata, cutback: true });
}

export function createStateCheckpoint(store, metadata = {}) {
  requireStore(store);
  const checkpoint = {
    version: NONLINEAR_CHECKPOINT_VERSION,
    stateStoreVersion: NONLINEAR_STATE_STORE_VERSION,
    domainHash: store.domainHash,
    revision: store.revision,
    eventSequence: store.eventSequence,
    committedHash: store.committedHash,
    committed: clone(store.committed),
    eventLog: clone(store.eventLog),
    metadata: canonical(metadata),
  };
  checkpoint.integrityHash = checkpointIntegrityHash(checkpoint);
  return deepFreeze(checkpoint);
}

export function restoreStateCheckpoint(checkpoint, options = {}) {
  if (checkpoint?.version !== NONLINEAR_CHECKPOINT_VERSION) throw stateError('STATE_CHECKPOINT_VERSION_INVALID', 'Unsupported checkpoint version.');
  if (checkpoint.integrityHash !== checkpointIntegrityHash(checkpoint)) throw stateError('STATE_CHECKPOINT_INTEGRITY_FAILED', 'Checkpoint integrity hash does not match.');
  if (options.domainHash && checkpoint.domainHash !== options.domainHash) throw stateError('STATE_CHECKPOINT_DOMAIN_MISMATCH', 'Checkpoint belongs to a different analysis domain.');
  const store = createNonlinearStateStore({
    domainHash: checkpoint.domainHash,
    revision: checkpoint.revision,
    eventSequence: checkpoint.eventSequence,
    committed: checkpoint.committed,
    eventLog: checkpoint.eventLog,
  });
  if (store.committedHash !== checkpoint.committedHash) throw stateError('STATE_CHECKPOINT_COMMITTED_HASH_MISMATCH', 'Checkpoint committed state is corrupted.');
  return store;
}

export function stateStoreByteSnapshot(store) {
  requireStore(store);
  return stableStringify({
    version: store.version,
    domainHash: store.domainHash,
    revision: store.revision,
    eventSequence: store.eventSequence,
    committed: store.committed,
    trial: store.trial,
    eventLog: store.eventLog,
  });
}

export function checkpointIntegrityHash(checkpoint = {}) {
  return stableHash({
    version: checkpoint.version,
    stateStoreVersion: checkpoint.stateStoreVersion,
    domainHash: checkpoint.domainHash,
    revision: checkpoint.revision,
    eventSequence: checkpoint.eventSequence,
    committedHash: checkpoint.committedHash,
    committed: checkpoint.committed,
    eventLog: checkpoint.eventLog,
    metadata: checkpoint.metadata,
  });
}

function finalizeStore(input) {
  const base = {
    version: NONLINEAR_STATE_STORE_VERSION,
    domainHash: input.domainHash || null,
    revision: nonnegativeInteger(input.revision, 0),
    eventSequence: nonnegativeInteger(input.eventSequence, 0),
    committed: normalizeState(input.committed),
    trial: input.trial ? normalizeState(input.trial) : null,
    eventLog: normalizeEventLog(input.eventLog || []),
  };
  base.committedHash = stableHash(base.committed);
  base.storeHash = stableHash(base);
  return deepFreeze(base);
}

function normalizeState(input = {}) {
  const source = canonical(input);
  const elementStates = canonical(source.elementStates || {});
  const energies = canonical(source.energies || {});
  const norms = canonical(source.norms || {});
  assertFiniteNumbers(elementStates, 'elementStates');
  assertFiniteNumbers(energies, 'energies');
  assertFiniteNumbers(norms, 'norms');
  return {
    ...source,
    step: nonnegativeInteger(source.step, 0),
    time: stateNumber(source.time, 0, 'time'),
    lambda: stateNumber(source.lambda, 0, 'lambda'),
    iteration: nonnegativeInteger(source.iteration, 0),
    q: vector(source.q, 'q'),
    u: vector(source.u, 'u'),
    v: vector(source.v, 'v'),
    a: vector(source.a, 'a'),
    elementStates,
    energies,
    norms,
    residual: vector(source.residual, 'residual'),
    eventCursor: nonnegativeInteger(source.eventCursor, 0),
    pendingEvents: Array.isArray(source.pendingEvents) ? source.pendingEvents.map(canonical) : [],
    converged: source.converged === true,
  };
}

function normalizeEventLog(events) {
  return events.map(canonical).sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
}

function requireStore(store) {
  if (store?.version !== NONLINEAR_STATE_STORE_VERSION || store.storeHash !== stableHash({
    version: store.version,
    domainHash: store.domainHash,
    revision: store.revision,
    eventSequence: store.eventSequence,
    committed: store.committed,
    trial: store.trial,
    eventLog: store.eventLog,
    committedHash: store.committedHash,
  })) throw stateError('STATE_STORE_INVALID', 'State store is invalid or mutated.');
}

function requireActiveTrial(store) {
  requireStore(store);
  if (!store.trial) throw stateError('STATE_TRIAL_REQUIRED', 'An active trial step is required.');
}

function requireBranch(store, branch) {
  if (branch?.version !== NONLINEAR_TRIAL_BRANCH_VERSION
    || branch.baseRevision !== store.revision
    || branch.baseCommittedHash !== store.committedHash
    || branch.baseTrialHash !== stableHash(store.trial)
    || branch.branchHash !== stableHash({ ...branch, branchHash: undefined }).slice(0, 24)) {
    throw stateError('STATE_BRANCH_STALE', 'Trial branch does not belong to the current state.');
  }
}

function cloneStore(store) {
  return {
    version: store.version,
    domainHash: store.domainHash,
    revision: store.revision,
    eventSequence: store.eventSequence,
    committed: clone(store.committed),
    trial: clone(store.trial),
    eventLog: clone(store.eventLog),
  };
}

function deepMerge(base, patch) {
  if (!record(base) || !record(patch)) return clone(patch);
  const out = clone(base);
  for (const [key, value] of Object.entries(patch)) {
    out[key] = record(value) && record(out[key]) ? deepMerge(out[key], value) : clone(value);
  }
  return out;
}

function canonical(value) {
  if (value == null || typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value)) return Array.from(value, canonical);
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Map) return Object.fromEntries([...value.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([key, item]) => [key, canonical(item)]));
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function vector(value, path) {
  if (value == null) return [];
  return Array.from(value, (item, index) => stateNumber(item, 0, `${path}[${index}]`));
}

function stateNumber(value, fallback, path) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw stateError('STATE_VALUE_NONFINITE', `${path} must be finite.`);
  return number;
}

function assertFiniteNumbers(value, path) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw stateError('STATE_VALUE_NONFINITE', `${path} must be finite.`);
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) value.forEach((item, index) => assertFiniteNumbers(item, `${path}[${index}]`));
  else Object.entries(value).forEach(([key, item]) => assertFiniteNumbers(item, `${path}.${key}`));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function stateError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonnegativeInteger(value, fallback) {
  return Math.max(0, Math.trunc(finite(value, fallback)));
}
