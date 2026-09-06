import assert from 'node:assert/strict';
import {
  createModel,
  analyzeModel,
  runSecondOrderPDelta,
  runSecondOrderPDeltaAsync,
} from '../src/index.js';
import { finalizeElasticAnalysis, prepareElasticAnalysis } from '../src/solver/linear3d.js';
import {
  createHybridPDeltaTangentSolver,
  createReferenceSpdGpuSession,
  executeProductionElastic,
} from '../src/compute/index.js';

const model = pDeltaColumnModel();
const factors = { D: 1, L: 1 };
const cpu = runSecondOrderPDelta(model, factors, { loadSteps: 4 });
const tangent = createHybridPDeltaTangentSolver({
  gpuSessionFactory: (matrix, defaults) => createReferenceSpdGpuSession(matrix, defaults),
  f64Tolerance: 1e-9,
  loadResidualTolerance: 1e-8,
  maxCorrections: 3,
});
const hybrid = await runSecondOrderPDeltaAsync(model, factors, {
  loadSteps: 4,
  tangentSolver: tangent.solve,
});
const tangentSnapshot = tangent.snapshot();
tangent.dispose();

assert.equal(hybrid.ok, cpu.ok, 'P9-GPU-ELA-11 Direct P-Delta status parity');
assert.equal(hybrid.converged, cpu.converged);
assert.equal(hybrid.status, cpu.status);
assert.equal(hybrid.reason, cpu.reason);
assert.equal(hybrid.convergence.completedLoadSteps, cpu.convergence.completedLoadSteps);
assert.ok(Math.abs(hybrid.amplification - cpu.amplification) <= 1e-8);
compareNumericTree(hybrid.result.disp, cpu.result.disp, 1e-8, 'disp');
compareNumericTree(hybrid.result.reactions, cpu.result.reactions, 1e-7, 'reactions');
compareNumericTree(hybrid.result.memberResults, cpu.result.memberResults, 1e-7, 'memberResults');
assert.equal(hybrid.designEligibility.status, cpu.designEligibility.status, 'P9-GPU-ELA-12 Direct design eligibility parity');
assert.equal(tangentSnapshot.matrixSessionCount, tangentSnapshot.solveCount, 'every tangent rebuild invalidates the GPU matrix session');
assert.equal(tangentSnapshot.reusedMatrixSessionCount, 0);
assert.equal(tangentSnapshot.resourceBalanced, true);
assert.ok(tangentSnapshot.rows.every((row) => row.f64BackwardError <= 1e-9));

const cpuProduct = analyzeModel(model);
const hybridProduct = await executeProductionElastic({ model, computeTarget: 'gpu' }, {
  ...noOpContext(),
  gpuSessionFactory: (matrix, defaults) => createReferenceSpdGpuSession(matrix, defaults),
});
assert.equal(hybridProduct.result.pDelta.ok, cpuProduct.pDelta.ok, 'hybrid Direct P-Delta product aggregation parity');
assert.equal(hybridProduct.result.designEligibility.status, cpuProduct.designEligibility.status);
compareNumericTree(hybridProduct.result.pDelta.envelope, cpuProduct.pDelta.envelope, 1e-7, 'pDelta.envelope');
assert.ok(hybridProduct.execution.pDeltaSessionBeforeDispose.matrixSessionCount > 0);
assert.equal(hybridProduct.execution.pDeltaSessionBeforeDispose.reusedMatrixSessionCount, 0);
assert.equal(hybridProduct.execution.resourceBalanced, true);

const prepared = prepareElasticAnalysis(model);
assert.throws(
  () => finalizeElasticAnalysis(prepared, {}, { pDeltaOverride: { method: 'direct', byCombo: {} } }),
  { code: 'ELASTIC_PDELTA_OVERRIDE_INVALID' },
  'unversioned Direct P-Delta overrides cannot reach design finalization',
);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['P9-GPU-ELA-11~12', 'P9-PERF-09', 'P9-FAIL-04'],
  amplification: hybrid.amplification,
  iterationCount: hybrid.convergence.iterationCount,
  matrixSessionCount: tangentSnapshot.matrixSessionCount,
  correctionSolveCount: tangentSnapshot.correctionSolveCount,
}, null, 2));

function pDeltaColumnModel() {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null },
  ];
  model.members = [{
    id: 'M1',
    type: 'frame',
    n1: 'N1',
    n2: 'N2',
    matId: 'steel',
    secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' },
    releases: { i: 'rigid', j: 'rigid' },
  }];
  model.loadCases = [
    { id: 'D', name: 'Dead', type: 'dead' },
    { id: 'L', name: 'Lateral', type: 'wind' },
  ];
  model.loadCombinations = [{ id: 'CO1', name: 'D + L', type: 'strength', factors: { D: 1, L: 1 } }];
  model.loads = [
    { id: 'P1', type: 'nodal', node: 'N2', P: 80, dir: '-z', case: 'D' },
    { id: 'H1', type: 'nodal', node: 'N2', P: 20, dir: '+x', case: 'L' },
  ];
  model.analysisSettings.pDeltaMethod = 'direct';
  return model;
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

function noOpContext() {
  return {
    signal: { aborted: false },
    throwIfCancelled() {},
    reportProgress() {},
    commitBoundary() {},
    yieldControl() { return Promise.resolve(); },
  };
}
