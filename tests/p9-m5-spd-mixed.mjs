import assert from 'node:assert/strict';
import {
  createMixedPrecisionSpdSession,
  createReferenceSpdGpuSession,
  prepareHybridSpdSystem,
} from '../src/compute/index.js';

const matrix = [
  [6, -2, 0, 0],
  [-2, 5, -1, 0],
  [0, -1, 4, -1],
  [0, 0, -1, 3],
];
const prepared = prepareHybridSpdSystem(matrix);
assert.equal(prepared.eligible, true, 'P9-GPU-ELA-01 supported SPD eligibility');
assert.ok(prepared.symmetryError <= 1e-12);
assert.ok(prepared.conditionProxy < prepared.limits.maxConditionProxy);
assert.equal(prepared.spdProbe.ok, true);

const nonsymmetric = prepareHybridSpdSystem([[2, 1], [0, 2]]);
assert.equal(nonsymmetric.eligible, false, 'P9-GPU-ELA-02 nonsymmetric blocked');
assert.equal(nonsymmetric.reason, 'HYBRID_SPD_MATRIX_NOT_SYMMETRIC');
const indefinite = prepareHybridSpdSystem([[1, 2], [2, 1]]);
assert.equal(indefinite.eligible, false, 'P9-GPU-ELA-02 indefinite probe blocked');
assert.ok(indefinite.reasons.includes('HYBRID_SPD_POSITIVE_DEFINITE_PROBE_FAILED'));
const unsafeScale = prepareHybridSpdSystem([[1e-20, 0], [0, 1e20]], { maxScaleRatio: 1e8 });
assert.equal(unsafeScale.reason, 'HYBRID_SPD_SCALING_RATIO_UNSAFE');

const session = await createMixedPrecisionSpdSession(matrix, {
  gpuSessionFactory: async (scaled, defaults) => createReferenceSpdGpuSession(scaled, defaults),
  f64Tolerance: 1e-10,
  loadResidualTolerance: 1e-9,
  maxCorrections: 3,
});
const solved = await session.solve([1, 2, -1, 3]);
assert.equal(solved.ok, true, 'P9-GPU-ELA-03 f32 solve plus f64 residual');
assert.equal(solved.f64Residual.ok, true, 'P9-GPU-ELA-04 original equation audit');
assert.equal(solved.designTransferAllowed, true);
assert.ok(solved.diagnostics.correctionCount <= 3, 'P9-GPU-ELA-05 bounded correction');
assert.equal(solved.diagnostics.fallback, false);
assert.equal((await session.dispose()).gpu.resourceBalanced, true);

const failing = await createMixedPrecisionSpdSession(matrix, {
  gpuSessionFactory: async () => ({
    async solve() { return { ok: true, x: Float32Array.of(0, 0, 0, 0), diagnostics: { method: 'injected-bad-gpu', iterations: 1 } }; },
    async dispose() {},
    snapshot() { return { injected: true }; },
  }),
  maxCorrections: 1,
  f64Tolerance: 1e-12,
  loadResidualTolerance: 1e-12,
});
const rejected = await failing.solve([1, 2, -1, 3]);
assert.equal(rejected.ok, false, 'P9-GPU-ELA-06 correction nonconvergence fails closed');
assert.equal(rejected.reason, 'HYBRID_SPD_F64_CORRECTION_NOT_CONVERGED');
assert.equal(rejected.x, null);
assert.equal(rejected.designTransferAllowed, false);
await failing.dispose();

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['P9-GPU-ELA-01~06', 'P9-FAIL-03~04'],
  eligibilityHash: prepared.eligibilityHash,
  correctionCount: solved.diagnostics.correctionCount,
  backwardError: solved.f64Residual.backwardError,
  rejectedReason: rejected.reason,
}, null, 2));
