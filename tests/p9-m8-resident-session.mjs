import assert from 'node:assert/strict';
import { stableHash } from '../src/core/stableHash.js';
import {
  createNonlinearElementBatch,
  createNonlinearResidentSession,
} from '../src/compute/nonlinear/index.js';
import {
  beginStateStep,
  commitStateStep,
  createNonlinearStateStore,
  createStateCheckpoint,
  restoreStateCheckpoint,
  updateTrialState,
} from '../src/nonlinear/core/stateStore.js';

const domainHash = stableHash({ fixture: 'p9-m8-resident-session' });
const batch = createNonlinearElementBatch([{
  id: 'e1',
  dofs: [0],
  requiredMatrixClass: 'general',
  kernel: {
    type: 'elastic-frame-matrix-shadow',
    stateVersion: 'fixture-v1',
    evaluate() { throw new Error('not used'); },
  },
}]);
const assembler = {
  elementBatch: batch,
  requiredMatrixClass: 'general',
  domain: { identity: { domainHash } },
};
const initialStore = createNonlinearStateStore({
  domainHash,
  committed: {
    q: [0],
    elementStates: { e1: { plasticRotation: 0, state: 'elastic' } },
    energies: { dynamic: { input: 0, balanceResidual: 0 } },
  },
});
const initialCheckpoint = createStateCheckpoint(initialStore, { role: 'gravity' });
const session = createNonlinearResidentSession({
  runId: 'p9-m8-resident-fixture',
  kind: 'pushover',
  assembler,
  stateStore: initialStore,
  checkpoint: initialCheckpoint,
  production: true,
  computeTarget: 'auto',
  maxTransferBytes: 4096,
  totalTransferBudgetBytes: 8192,
});

const initial = session.snapshot();
assert.equal(initial.committedHash, initialStore.committedHash, 'P9-GPU-NL-11 gravity committed state');
assert.equal(initial.checkpointHash, initialCheckpoint.integrityHash, 'P9-GPU-NL-12 gravity checkpoint parity');
assert.equal(initial.executedTarget, 'cpu');
assert.equal(initial.matrixClass, 'general');

session.beginTrial({ attempt: 1 });
session.stageTrialStates({ e1: { plasticRotation: 99, state: 'failure' } });
session.rejectBoundary('CUTBACK', { attempt: 1 });
assert.equal(session.snapshot().committedHash, initialStore.committedHash, 'P9-GPU-NL-22 rejected trial discarded');

let nextStore = beginStateStep(initialStore, { step: 1 });
nextStore = updateTrialState(nextStore, {
  q: [0.01],
  lambda: 0.25,
  elementStates: { e1: { plasticRotation: 0.002, state: 'yielded' } },
  energies: { dynamic: { input: 1.5, balanceResidual: 1e-12 } },
});
nextStore = commitStateStep(nextStore, { events: [{ type: 'yield', memberId: 'e1' }] });
session.acceptBoundary(nextStore, {
  source: 'fixture-step',
  mode: 'pushover',
  hingeEvents: [{ type: 'yield', memberId: 'e1' }],
  evaluation: {
    residualReduced: [1e-13],
    energies: { strain: 0.75 },
    audit: { ok: true },
    responseHash: 'fixture-response',
  },
});
const committedCheckpoint = createStateCheckpoint(nextStore, { role: 'accepted' });
session.recordCheckpoint(committedCheckpoint, { source: 'fixture' });
assert.equal(restoreStateCheckpoint(committedCheckpoint, { domainHash }).committedHash, nextStore.committedHash);

const chunkCore = {
  version: 'fixture-history-v1',
  sequence: 1,
  rowCount: 1,
  bytes: 128,
  rows: [{ time: 0.1, q: [0.01] }],
};
const chunk = { ...chunkCore, chunkHash: stableHash(chunkCore).slice(0, 24) };
session.recordTransfer('nlth-history-chunk', chunk);
assert.throws(
  () => session.recordTransfer('nlth-history-chunk', { ...chunk, rows: [{ time: 0.1, q: [999] }] }),
  (error) => error.code === 'NONLINEAR_TRANSFER_INTEGRITY_FAILED',
  'P9-FAIL-09 corrupted history chunk',
);
const corruptedCheckpoint = structuredClone(committedCheckpoint);
corruptedCheckpoint.committed.q[0] = 99;
assert.throws(
  () => session.recordCheckpoint(corruptedCheckpoint),
  (error) => error.code === 'STATE_CHECKPOINT_INTEGRITY_FAILED',
  'P9-FAIL-10 corrupted checkpoint hash',
);

const recovery = session.handleFailure('GPU_DEVICE_LOST', { deviceLost: true });
assert.equal(recovery.trialDiscarded, true, 'P9-FAIL-05 device loss discards trial');
assert.equal(recovery.checkpoint.committedHash, nextStore.committedHash, 'P9-FAIL-06 canonical recovery checkpoint');
const final = session.finalize('failed', { reason: 'GPU_DEVICE_LOST' });
assert.equal(final.disposed, true, 'P9-FAIL-06 resident resources disposed');
assert.equal(final.route.solveOperation, 'cpu-f64-general', 'general solve remains CPU f64');
assert.equal(final.qualification.gpuProductionQualified, false);
assert.equal(final.state.checkpointCommittedHash, nextStore.committedHash, 'P9-GPU-NL-21 restart boundary parity');
assert.equal(final.memory.transferBytes, 128);
assert.throws(() => session.snapshot(), (error) => error.code === 'NONLINEAR_RESIDENT_SESSION_DISPOSED');

assert.throws(
  () => createNonlinearResidentSession({
    runId: 'p9-m8-production-gpu-block',
    kind: 'nlth',
    assembler,
    stateStore: initialStore,
    checkpoint: initialCheckpoint,
    production: true,
    computeTarget: 'gpu',
  }),
  (error) => error.code === 'NONLINEAR_GPU_BATCH_UNSUPPORTED',
  'production GPU request fails closed',
);

const budgetSession = createNonlinearResidentSession({
  runId: 'p9-m8-transfer-budget',
  kind: 'nlth',
  assembler,
  stateStore: initialStore,
  checkpoint: initialCheckpoint,
  production: true,
  maxTransferBytes: 64,
});
assert.throws(
  () => budgetSession.recordTransfer('oversized', { bytes: 65 }),
  (error) => error.code === 'NONLINEAR_TRANSFER_CHUNK_LIMIT_EXCEEDED',
  'bounded host transfer',
);
budgetSession.handleFailure('ANALYSIS_CANCELLED', { cancelled: true });
const cancelled = budgetSession.finalize('cancelled');
assert.equal(cancelled.failures[0].cancelled, true, 'P9-FAIL-07 committed-boundary cancel');
assert.equal(cancelled.state.checkpointCommittedHash, initialStore.committedHash, 'P9-FAIL-08 resume checkpoint');

console.log(JSON.stringify({
  ok: true,
  verificationIds: [
    'P9-GPU-NL-11', 'P9-GPU-NL-12', 'P9-GPU-NL-21', 'P9-GPU-NL-22',
    'P9-FAIL-05', 'P9-FAIL-06', 'P9-FAIL-07', 'P9-FAIL-08', 'P9-FAIL-09', 'P9-FAIL-10',
  ],
  initialCheckpointHash: initialCheckpoint.integrityHash,
  recoveryCheckpointHash: recovery.checkpoint.integrityHash,
  sessionHash: final.sessionHash,
  residentBytes: final.memory.residentBytes,
  transferBytes: final.memory.transferBytes,
}, null, 2));
