import assert from 'node:assert/strict';
import {
  acceptTrialBranch,
  appendTrialEvent,
  beginStateStep,
  commitStateStep,
  createElementStateRegistry,
  createNonlinearElementContract,
  createNonlinearStateStore,
  createStateCheckpoint,
  deserializeElementStates,
  forkTrialState,
  rejectTrialBranch,
  restartTrialAfterCutback,
  restoreStateCheckpoint,
  rollbackStateStep,
  serializeElementStates,
  stateStoreByteSnapshot,
  updateTrialState,
  validateNonlinearElementResponse,
} from '../src/index.js';

const initial = createNonlinearStateStore({
  domainHash: 'domain:m1',
  initialState: {
    step: 0,
    q: new Float64Array([0, 0]),
    u: [0, 0], v: [0, 0], a: [0, 0],
    elementStates: { E1: { plasticRotation: 0, nested: { damage: 0 } } },
    energies: { strain: 0, kinetic: 0 },
  },
});
assert.equal(Object.isFrozen(initial), true);
assert.equal(Object.isFrozen(initial.committed.elementStates.E1.nested), true);

const trial = updateTrialState(beginStateStep(initial), {
  iteration: 1,
  q: [0.1, 0.2],
  u: [0.1, 0.2],
  elementStates: { E1: { plasticRotation: 0.01, nested: { damage: 0.2 } } },
  energies: { strain: 1.5 },
});
assert.equal(initial.committed.elementStates.E1.nested.damage, 0, 'trial must not mutate committed nested state');
assert.equal(trial.trial.elementStates.E1.nested.damage, 0.2);

const rejected = forkTrialState(trial, 'ls-0.5', {
  u: [0.05, 0.1], elementStates: { E1: { nested: { damage: 0.1 } } },
});
assert.equal(rejectTrialBranch(trial, rejected), trial);
assert.equal(trial.trial.elementStates.E1.nested.damage, 0.2);
const selected = forkTrialState(trial, 'ls-1.0', {
  iteration: 2,
  u: [0.12, 0.24],
  v: [0.3, 0.4],
  a: [0.5, 0.6],
  elementStates: { E1: { plasticRotation: 0.012, nested: { damage: 0.25 } } },
  energies: { strain: 1.8, kinetic: 0.4 },
});
let accepted = acceptTrialBranch(trial, selected);
accepted = appendTrialEvent(accepted, { type: 'yield', elementId: 'E1' });
const committed = commitStateStep(accepted);
assert.equal(committed.revision, 1);
assert.equal(committed.trial, null);
assert.deepEqual(committed.committed.u, [0.12, 0.24]);
assert.deepEqual(committed.committed.v, [0.3, 0.4]);
assert.deepEqual(committed.committed.a, [0.5, 0.6]);
assert.equal(committed.committed.elementStates.E1.nested.damage, 0.25);
assert.equal(committed.eventLog[0].sequence, 1);

const beforeFailure = stateStoreByteSnapshot(committed);
const failedTrial = updateTrialState(beginStateStep(committed), {
  u: [99, 99], elementStates: { E1: { nested: { damage: 0.99 } } },
});
const rolledBack = rollbackStateStep(failedTrial);
assert.equal(stateStoreByteSnapshot(rolledBack), beforeFailure, 'rollback must be byte-equivalent to pre-step committed state');

const cutback = restartTrialAfterCutback(failedTrial, { step: 2, stepSize: 0.5 });
assert.deepEqual(cutback.trial.u, committed.committed.u);
assert.equal(cutback.trial.elementStates.E1.nested.damage, 0.25);
assert.equal(cutback.trial.cutback, true);

const checkpoint = createStateCheckpoint(committed, { caseId: 'CASE-M1' });
const restored = restoreStateCheckpoint(checkpoint, { domainHash: 'domain:m1' });
assert.equal(restored.storeHash, committed.storeHash);
const continued = advance(committed, 0.03, 'cap');
const restarted = advance(restored, 0.03, 'cap');
assert.equal(stateStoreByteSnapshot(restarted), stateStoreByteSnapshot(continued));
assert.deepEqual(restarted.eventLog.map((row) => row.id), continued.eventLog.map((row) => row.id));

const dynamicTrial = updateTrialState(beginStateStep(restarted), {
  time: 0.02, u: [0.2, 0.3], v: [1.1, 1.2], a: [2.1, 2.2],
  elementStates: { E1: { plasticRotation: 0.02 } }, energies: { strain: 2, kinetic: 3 },
});
assert.deepEqual(rollbackStateStep(dynamicTrial).committed.v, restarted.committed.v);
const dynamicCommitted = commitStateStep(dynamicTrial);
assert.deepEqual(dynamicCommitted.committed.v, [1.1, 1.2]);
assert.deepEqual(dynamicCommitted.committed.a, [2.1, 2.2]);
assert.deepEqual(dynamicCommitted.committed.energies, { kinetic: 3, strain: 2 });

const registry = createElementStateRegistry([{
  type: 'hinge', version: 'hinge-state-v1',
  serialize: (state) => ({ theta: Number(state.theta), history: [...(state.history || [])] }),
  deserialize: (state) => ({ theta: state.theta, history: [...state.history] }),
}]);
assert.equal(Object.isFrozen(registry.serializers), true);
const serialized = serializeElementStates(registry, {
  E2: { type: 'hinge', data: { theta: 0.02, history: [0, 0.01, 0.02] } },
  E1: { type: 'generic', data: { axial: 5 } },
});
assert.deepEqual(serialized.map((row) => row.elementId), ['E1', 'E2']);
const deserialized = deserializeElementStates(registry, serialized);
assert.deepEqual(deserialized.E2, {
  type: 'hinge', version: 'hinge-state-v1', data: { history: [0, 0.01, 0.02], theta: 0.02 },
});
assert.deepEqual(serializeElementStates(registry, deserialized), serialized);
const wrongVersion = structuredClone(serialized);
wrongVersion.find((row) => row.elementId === 'E2').version = 'hinge-state-v0';
assert.throws(
  () => deserializeElementStates(registry, wrongVersion),
  (error) => error.code === 'ELEMENT_STATE_VERSION_MISMATCH',
);

const kernel = createNonlinearElementContract({ type: 'test-frame', dofCount: 2, evaluate() {} });
assert.equal(validateNonlinearElementResponse({
  resistingForceGlobal: [1, 2], tangentGlobal: [[2, 0], [0, 2]], massGlobal: [[1, 0], [0, 1]],
  trialState: {}, energies: {},
}, kernel.dofCount).ok, true);

const corrupted = structuredClone(checkpoint);
corrupted.committed.u[0] = 999;
assert.throws(() => restoreStateCheckpoint(corrupted), (error) => error.code === 'STATE_CHECKPOINT_INTEGRITY_FAILED');
assert.throws(
  () => createNonlinearStateStore({ initialState: { u: [Number.NaN] } }),
  (error) => error.code === 'STATE_VALUE_NONFINITE',
);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-STATE-01', 'NL-STATE-02', 'NL-STATE-03', 'NL-STATE-04', 'NL-STATE-05', 'NL-STATE-06', 'NL-STATE-07'],
  revision: dynamicCommitted.revision,
  eventCount: dynamicCommitted.eventLog.length,
  checkpointHash: checkpoint.integrityHash.slice(0, 24),
}, null, 2));

function advance(store, increment, eventType) {
  let next = beginStateStep(store);
  next = updateTrialState(next, {
    u: store.committed.u.map((value) => value + increment),
    q: store.committed.q.map((value) => value + increment),
  });
  next = appendTrialEvent(next, { type: eventType, elementId: 'E1' });
  return commitStateStep(next);
}
