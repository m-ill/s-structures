import assert from 'node:assert/strict';
import {
  analyzeModel,
  createSimpleBeamUdl,
  denseToCsc,
  solveLinear,
  solveLinearDetailed,
  solveSparseLinear,
  tripletsToCsc,
} from '../src/index.js';

const A = [
  [4, 1, 0],
  [1, 3, 1],
  [0, 1, 2],
];
const b = [1, 2, 3];
const dense = solveLinear(A, b, { sparse: false });
const sparse = solveLinearDetailed(A, b, { sparse: true, criteriaModel: criteriaModel() });
assert.equal(sparse.ok, true);
assert.equal(sparse.diagnostics.method, 'sparse-ldlt');
for (let i = 0; i < dense.length; i += 1) close(sparse.x[i], dense[i], 1e-10, `sparse solve x${i}`);

const csc = denseToCsc(A);
assert.equal(csc.nnz, 7);
const roundTrip = solveSparseLinear(csc, b, { directLimit: 10, criteriaModel: criteriaModel() });
assert.equal(roundTrip.ok, true);
for (let i = 0; i < dense.length; i += 1) close(roundTrip.x[i], dense[i], 1e-10, `csc solve x${i}`);

const singular = solveLinearDetailed(
  [
    [1, 0],
    [0, 0],
  ],
  [1, 1],
  { sparse: true, labels: ['N1.ux', 'N2.ux'], criteriaModel: criteriaModel() },
);
assert.equal(singular.ok, false);
assert.equal(singular.diagnostics.fallback, true);
assert.ok(singular.diagnostics.diagnostics.suspectedMechanismDofs.includes('N2.ux'));

const beam = createSimpleBeamUdl().model;
beam.analysisSettings.solver = 'sparse';
beam.analysisSettings.sparseThreshold = 1;
beam.analysisCriteria = {
  preset: 'custom',
  criteria: {
    solver: {
      condWarn: 1,
      condSingular: 1e30,
      resWarn: 1e-12,
    },
  },
};
const analysis = analyzeModel(beam);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
const result = analysis.byCombo.D_ONLY;
assert.ok(result.solver.sparse.sparseAttemptedCount > 0);
assert.ok(result.solver.conditionEstimate >= 1);
assert.ok(analysis.validation.warnings.some((warning) => warning.code === 'SOLVER_CONDITION_WARN'));

const n = 5000;
const banded = tridiagonalCsc(n);
const rhs = new Array(n).fill(1);
const large = solveSparseLinear(banded, rhs, {
  method: 'cg',
  tolerance: 1e-8,
  maxIterations: 500,
  labels: Array.from({ length: n }, (_item, index) => `dof:${index}`),
});
assert.equal(large.ok, true, large.reason || JSON.stringify(large.diagnostics.diagnostics));
assert.equal(large.diagnostics.method, 'sparse-cg');
assert.equal(large.diagnostics.colCount, n);
assert.ok(large.diagnostics.solveMs >= 0);
assert.ok(large.diagnostics.diagnostics.residualNorm <= 1e-8);

console.log(JSON.stringify({
  ok: true,
  denseSparseError: Math.max(...dense.map((value, index) => Math.abs(value - sparse.x[index]))),
  sparseAttemptedCount: result.solver.sparse.sparseAttemptedCount,
  largeDofCount: n,
  largeIterations: large.diagnostics.iterations,
  largeResidual: large.diagnostics.diagnostics.residualNorm,
}, null, 2));

function tridiagonalCsc(n) {
  const triplets = [];
  for (let i = 0; i < n; i += 1) {
    triplets.push({ row: i, col: i, value: 4 });
    if (i > 0) triplets.push({ row: i - 1, col: i, value: -1 });
    if (i < n - 1) triplets.push({ row: i + 1, col: i, value: -1 });
  }
  return tripletsToCsc(n, n, triplets);
}

function criteriaModel() {
  return {
    analysisCriteria: {
      preset: 'custom',
      criteria: {
        solver: {
          pivotSingular: 1e-14,
          resWarn: 1e-10,
          condWarn: 1e12,
          condSingular: 1e16,
        },
      },
    },
  };
}

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}, diff ${Math.abs(actual - expected)}, tol ${tolerance}`,
  );
}
