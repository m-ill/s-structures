import assert from 'node:assert/strict';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { createNonlinearElementContract } from '../src/nonlinear/core/elementContract.js';
import { createNonlinearStateStore, stateStoreByteSnapshot } from '../src/nonlinear/core/stateStore.js';
import { createEquilibriumAssembler } from '../src/nonlinear/equilibrium/assembler.js';
import { runMdofLoadControl } from '../src/nonlinear/equilibrium/loadControl.js';
import { createDenseReferenceBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';
import { solveMdofNewtonStep } from '../src/nonlinear/equilibrium/newton.js';

const domain = buildCanonicalAnalysisDomain({
  schemaVersion: 5,
  nodes: [
    { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N1', x: 1, y: 0, z: 0, support: 'custom', fix: [false, true, true, true, true, true] },
  ],
  members: [], materials: [], sections: [], loads: [], loadCases: [], loadCombinations: [],
  analysisSettings: { includeSelfWeight: false },
});
const full = new Float64Array(domain.constraint.fullDofCount);
full[6] = 1;
const kernel = createNonlinearElementContract({
  type: 'verification-linear-spring', dofCount: 1,
  evaluate({ trialKinematics }) {
    const u = trialKinematics.uGlobal[0];
    return {
      resistingForceGlobal: [u], tangentGlobal: [[1]],
      trialState: { acceptedCandidateU: u }, energies: { strain: 0.5 * u * u },
    };
  },
});
const assembler = createEquilibriumAssembler({
  domain,
  elements: [{ id: 'E1', dofs: [6], kernel, descriptor: { id: 'E1' } }],
  loadPattern: { ok: true, constantFull: new Float64Array(full.length), referenceFull: full },
});
const initial = createNonlinearStateStore({ domainHash: domain.identity.domainHash, initialState: { q: [0] } });
const dense = createDenseReferenceBackend();
const thresholdBackend = {
  ...dense,
  id: 'verification-cutback-backend',
  async solve(matrix, rhs, options) {
    if (Math.max(...Array.from(rhs, Math.abs)) > 0.6) return { ok: false, reason: 'VERIFICATION_INCREMENT_TOO_LARGE', x: null };
    return dense.solve(matrix, rhs, options);
  },
};
const progress = [];
const controlled = await runMdofLoadControl({
  assembler,
  stateStore: initial,
  backend: thresholdBackend,
  onProgress: (row) => progress.push(row.type),
  options: {
    targetLambda: 1,
    initialStep: 1,
    minStep: 0.1,
    maxStep: 1,
    newton: { maxIterations: 5, convergence: strictConvergence() },
  },
});
assert.equal(controlled.ok, true, controlled.reason);
assert.equal(controlled.rejectedStepCount, 1);
assert.equal(controlled.acceptedStepCount, 2);
assert.deepEqual(controlled.acceptedSteps.map((row) => row.lambda), [0.5, 1]);
assert.equal(controlled.rejectedSteps[0].rollbackEquivalent, true);
assert.equal(controlled.finalLambda, 1);
assert.equal(controlled.stateStore.committed.q[0], 1);
assert.equal(controlled.stateStore.committed.elementStates.E1.acceptedCandidateU, 1);
assert.ok(progress.includes('load-step-rejected'));

const alwaysFail = { ...dense, id: 'verification-failing-backend', solve: async () => ({ ok: false, reason: 'SINGULAR_TANGENT', x: null }) };
const before = stateStoreByteSnapshot(initial);
const failed = await runMdofLoadControl({
  assembler,
  stateStore: initial,
  backend: alwaysFail,
  options: { targetLambda: 1, initialStep: 1, minStep: 0.2, newton: { maxIterations: 3 } },
});
assert.equal(failed.ok, false);
assert.equal(failed.reason, 'MINIMUM_LOAD_STEP_REACHED');
assert.equal(failed.acceptedStepCount, 0);
assert.equal(stateStoreByteSnapshot(failed.stateStore), before);
assert.ok(failed.rejectedSteps.every((row) => row.rollbackEquivalent));

const cancelled = await solveMdofNewtonStep({
  assembler,
  stateStore: initial,
  targetLambda: 1,
  backend: dense,
  isCancelled: () => true,
});
assert.equal(cancelled.ok, false);
assert.equal(cancelled.reason, 'ANALYSIS_CANCELLED');
assert.equal(cancelled.status, 'cancelled');
assert.equal(stateStoreByteSnapshot(cancelled.stateStore), before);

const missingState = await runMdofLoadControl({
  assembler,
  backend: dense,
  options: { targetLambda: 1 },
});
assert.equal(missingState.ok, false);
assert.equal(missingState.status, 'blocked');
assert.equal(missingState.reason, 'STATE_STORE_REQUIRED');

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-EQ-10', 'NL-EQ-12', 'NL-CTRL-01', 'NL-CTRL-02', 'NL-CTRL-04'],
  acceptedSteps: controlled.acceptedStepCount,
  rejectedSteps: controlled.rejectedStepCount,
  failedCutbacks: failed.rejectedStepCount,
  cancellationRollback: cancelled.rollbackEquivalent,
}, null, 2));

function strictConvergence() {
  return {
    forceAbsolute: 1e-11,
    forceRelative: 1e-10,
    displacementAbsolute: 1e-12,
    displacementRelative: 1e-10,
    energyAbsolute: 1e-14,
    energyRelative: 1e-11,
  };
}
