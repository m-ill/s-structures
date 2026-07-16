import assert from 'node:assert/strict';
import {
  analyzeModel,
  finalizeElasticAnalysis,
  prepareElasticAnalysis,
} from '../src/solver/linear3d.js';
import {
  classifyElasticFactorGroups,
  createHybridElasticSession,
  createProductionElasticComputeBackend,
  createElasticAnalysisService,
  createReferenceSpdGpuSession,
  elasticFactorKeyForCombo,
  elasticPhysicalParityHash,
  executeProductionElastic,
  PRODUCTION_ELASTIC_OPERATION,
  PRODUCTION_ELASTIC_HYBRID_BACKEND_ID,
  solveElasticCombinationHybrid,
} from '../src/compute/index.js';
import { p9M1CantileverModel } from './helpers/p9M1Fixture.mjs';

const model = p9M1CantileverModel();
model.loadCombinations = [
  { id: 'C1', name: 'Wind +', type: 'service', factors: { W: 1 } },
  { id: 'C2', name: 'Wind -', type: 'strength', factors: { W: -1.4 } },
];
const cpu = analyzeModel(model);
const prepared = prepareElasticAnalysis(model);
const factorPlan = classifyElasticFactorGroups(prepared.model, prepared.combos, { pDeltaMethod: prepared.pDeltaMethod });
const componentCache = new Map();
const session = createHybridElasticSession({
  gpuSessionFactory: (matrix, defaults) => createReferenceSpdGpuSession(matrix, defaults),
  f64Tolerance: 1e-9,
  loadResidualTolerance: 1e-8,
  maxCorrections: 3,
});
const byCombo = {};
for (const combo of prepared.combos) {
  byCombo[combo.id] = await solveElasticCombinationHybrid(prepared, combo, {
    componentCache,
    hybridSession: session,
    factorGroupKey: elasticFactorKeyForCombo(factorPlan, combo.id),
  });
}
const hybrid = finalizeElasticAnalysis(prepared, byCombo);
const beforeDispose = session.snapshot();
await session.dispose();

assert.equal(hybrid.ok, cpu.ok, 'P9-GPU-ELA-07 overall parity');
compareElasticChannels(hybrid.byCombo, cpu.byCombo, 1e-8);
compareNumericTree(hybrid.envelope, cpu.envelope, 1e-8, 'envelope');
assert.match(elasticPhysicalParityHash(hybrid), /^[a-f0-9]{64}$/, 'P9-GPU-ELA-08 stable physical result hash');
assert.deepEqual(hybrid.combinationCompleteness, cpu.combinationCompleteness, 'P9-GPU-ELA-09 combination completeness parity');
assert.equal(hybrid.designEligibility.status, cpu.designEligibility.status, 'P9-GPU-ELA-10 design eligibility parity');
assert.equal(hybrid.audit.ok, cpu.audit.ok, 'P9-PERF-09 equilibrium audit parity');
assert.equal(beforeDispose.factorizationCount, 1, 'one resident matrix session');
assert.equal(beforeDispose.solveCount, 2, 'two RHS solves');
assert.equal(beforeDispose.reusedSolveCount, 1, 'factor-group session reuse');
assert.ok(Object.values(hybrid.byCombo).every((combo) => (
  combo.solver.executionMethods.includes('p9-m5-hybrid-mixed-f32-f64-replay')
  && combo.solver.mixedPrecisionComponentCount === combo.solver.componentCount
)));

const production = await executeProductionElastic({ model, computeTarget: 'gpu' }, {
  ...noOpContext(),
  gpuSessionFactory: (matrix, defaults) => createReferenceSpdGpuSession(matrix, defaults),
});
assert.equal(production.execution.target, 'gpu', 'P9-GPU-ELA-13 production adapter GPU route');
assert.equal(production.execution.fallbackUsed, false, 'P9-FAIL-01 no silent fallback');
assert.equal(production.execution.resourceBalanced, true, 'P9-PERF-09 GPU session resources balanced');
compareElasticChannels(production.result.byCombo, cpu.byCombo, 1e-8);

const autoCpu = await executeProductionElastic({ model, computeTarget: 'auto' }, noOpContext());
assert.equal(autoCpu.execution.target, 'cpu', 'P9-GPU-ELA-14 auto remains CPU without qualified profile');
assert.equal(autoCpu.execution.routeReason, 'auto-profile-not-qualified');

let capturedJob = null;
const routeService = createElasticAnalysisService({
  client: {
    activeRunId: null,
    start(plan, operationId, payload) {
      capturedJob = { plan, operationId, payload };
      return Promise.resolve({ ok: true });
    },
    cancel() { return Promise.resolve({ accepted: true }); },
    dispose() {},
  },
});
await routeService.run(model, { runId: 'p9-m5-gpu-product-route', computeTarget: 'gpu' });
assert.equal(capturedJob.plan.operations[0].backendId, PRODUCTION_ELASTIC_HYBRID_BACKEND_ID, 'P9-GPU-ELA-13 product service GPU route');
assert.equal(capturedJob.plan.operations[0].fallbackUsed, false);
assert.equal(capturedJob.payload.computeTarget, 'gpu');

await routeService.run(model, { runId: 'p9-m5-auto-cpu-route', computeTarget: 'auto' });
assert.equal(capturedJob.plan.userPolicy, 'auto');
assert.notEqual(capturedJob.plan.operations[0].backendId, PRODUCTION_ELASTIC_HYBRID_BACKEND_ID);
assert.equal(capturedJob.payload.computeTarget, 'auto');

await routeService.run(model, {
  runId: 'p9-m5-auto-gpu-route',
  computeTarget: 'auto',
  computeProfile: {
    elasticCandidateApproved: true,
    endToEndSpeedup: 1.2,
    minDofs: 1,
  },
});
assert.equal(capturedJob.plan.userPolicy, 'auto');
assert.equal(capturedJob.plan.operations[0].backendId, PRODUCTION_ELASTIC_HYBRID_BACKEND_ID);
assert.equal(capturedJob.payload.computeTarget, 'auto');
routeService.dispose();

const cpuBackend = createProductionElasticComputeBackend();
await assert.rejects(
  () => cpuBackend.execute(PRODUCTION_ELASTIC_OPERATION, {
    model,
    computeTarget: 'auto',
    computeProfile: { elasticCandidateApproved: true, endToEndSpeedup: 1.2, minDofs: 1 },
  }, noOpContext()),
  { code: 'ANALYSIS_BACKEND_ROUTE_MISMATCH' },
  'an auto-qualified GPU request cannot execute under CPU backend provenance',
);

await assert.rejects(
  () => executeProductionElastic({ model, computeTarget: 'gpu' }, {
    ...noOpContext(),
    gpuSessionFactory: async () => ({
      async solve() { return { ok: false, x: null, reason: 'INJECTED_GPU_FAILURE' }; },
      snapshot() { return { resourceBalanced: false }; },
      async dispose() { return { resourceBalanced: true }; },
    }),
  }),
  { code: 'INJECTED_GPU_FAILURE' },
  'P9-FAIL-02 explicit GPU failure is terminal',
);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['P9-GPU-ELA-07~10', 'P9-GPU-ELA-13~14', 'P9-PERF-09', 'P9-FAIL-01~02'],
  factorizationCount: beforeDispose.factorizationCount,
  solveCount: beforeDispose.solveCount,
  correctionSolveCount: beforeDispose.correctionSolveCount,
  resultHash: elasticPhysicalParityHash(hybrid),
}, null, 2));

function compareElasticChannels(actual, expected, tolerance) {
  assert.deepEqual(Object.keys(actual), Object.keys(expected));
  for (const comboId of Object.keys(expected)) {
    compareNumericTree(actual[comboId].disp, expected[comboId].disp, tolerance, `${comboId}.disp`);
    compareNumericTree(actual[comboId].reactions, expected[comboId].reactions, tolerance, `${comboId}.reactions`);
    compareNumericTree(actual[comboId].memberResults, expected[comboId].memberResults, tolerance, `${comboId}.memberResults`);
    assert.ok(Math.abs(actual[comboId].dmax - expected[comboId].dmax) <= tolerance, `${comboId}.dmax`);
    assert.ok(Math.abs(actual[comboId].maxRatio - expected[comboId].maxRatio) <= tolerance, `${comboId}.maxRatio`);
  }
}

function noOpContext() {
  return {
    signal: { aborted: false },
    throwIfCancelled() {},
    reportProgress() {},
    commitBoundary() {},
    yieldControl() { return Promise.resolve(); },
  };
}

function compareNumericTree(actual, expected, tolerance, path) {
  if (typeof expected === 'number') {
    assert.ok(Number.isFinite(actual), `${path}: finite`);
    assert.ok(Math.abs(actual - expected) <= tolerance, `${path}: ${actual} vs ${expected}`);
    return;
  }
  if (expected == null || typeof expected !== 'object') return;
  if (Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, `${path}.length`);
    expected.forEach((value, index) => compareNumericTree(actual[index], value, tolerance, `${path}[${index}]`));
    return;
  }
  for (const [key, value] of Object.entries(expected)) compareNumericTree(actual[key], value, tolerance, `${path}.${key}`);
}
