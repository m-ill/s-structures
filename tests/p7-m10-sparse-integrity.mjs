import assert from 'node:assert/strict';
import { denseToCsc } from '../src/solver/sparse/cscMatrix.js';
import {
  solveSparseLinear,
  solveSparseMultiple,
} from '../src/solver/sparse/solveSparse.js';
import {
  analyzeComponent3D,
  recoverReactions,
} from '../src/solver/linear3dAssembly.js';

const spd = [
  [4, 1, 0],
  [1, 3, 1],
  [0, 1, 2],
];
const multiple = solveSparseMultiple(spd, [
  [1, 2, 3],
  [2, 0, 1],
]);
assert.equal(multiple.length, 2);
assert.equal(multiple.rhsCount, 2);
assert.equal(multiple.solveCount, 2);
assert.equal(multiple.factorizationCount, 1);
assert.equal(multiple.factorizationAttemptCount, 1);
assert.equal(multiple.diagnostics.factorReused, true);
assert.equal(multiple.diagnostics.successfulSolveCount, 2);
assert.deepEqual(multiple.map((result) => result.diagnostics.rhsIndex), [0, 1]);
assert.ok(multiple.every((result) => result.diagnostics.factorReused));
closeVector(multiple[0].x, [2 / 9, 1 / 9, 13 / 9], 1e-12, 'multi RHS 1');
closeVector(multiple[1].x, [11 / 18, -4 / 9, 13 / 18], 1e-12, 'multi RHS 2');
assert.equal(multiple[0].diagnostics.matrixStorage, 'csc');
assert.equal(multiple[0].diagnostics.factorStorage, 'sparse-row-column-maps');
assert.equal(multiple[0].diagnostics.denseConversionCount, 0);
assert.equal(multiple[0].diagnostics.symbolic.denseConversionCount, 0);
assert.equal(multiple[0].diagnostics.diagnostics.denseConversionCount, 0);

// A zero first diagonal forces no-pivot LDLT to fail, but pivoted LU can solve it.
const pivotingCsc = denseToCsc([
  [0, 1],
  [1, 0],
]);
const fallback = solveSparseMultiple(pivotingCsc, [
  [2, 3],
  [5, 7],
]);
assert.equal(fallback.diagnostics.method, 'dense-partial-pivot-fallback');
assert.equal(fallback.diagnostics.factorizationCount, 1);
assert.equal(fallback.diagnostics.factorizationAttemptCount, 2);
assert.equal(fallback.diagnostics.rhsCount, 2);
assert.equal(fallback.diagnostics.fallback, true);
assert.equal(fallback.diagnostics.fallbackSucceeded, true);
assert.equal(fallback.diagnostics.denseConversionCount, 1);
closeVector(fallback[0].x, [3, 2], 1e-12, 'CSC fallback RHS 1');
closeVector(fallback[1].x, [7, 5], 1e-12, 'CSC fallback RHS 2');

const singular = solveSparseLinear(denseToCsc([
  [1, 0],
  [0, 0],
]), [1, 1], {
  labels: ['N1.ux', 'N2.ux'],
});
assert.equal(singular.ok, false);
assert.equal(singular.reason, 'SINGULAR_PIVOT');
assert.equal(singular.diagnostics.fallback, true);
assert.equal(singular.diagnostics.fallbackSucceeded, false);
assert.equal(singular.diagnostics.factorizationCount, 0);
assert.equal(singular.diagnostics.factorizationAttemptCount, 2);
assert.equal(singular.diagnostics.failure.stage, 'fallback-factorization');
assert.equal(singular.diagnostics.failure.sparse.pivotOriginalIndex, 1);
assert.equal(singular.diagnostics.failure.fallback.pivotOriginalIndex, 1);
assert.ok(singular.diagnostics.diagnostics.suspectedMechanismDofs.includes('N2.ux'));

const asymmetric = solveSparseLinear(denseToCsc([
  [2, 1],
  [0, 2],
]), [1, 1], { method: 'cg' });
assert.equal(asymmetric.ok, false);
assert.equal(asymmetric.reason, 'CG_MATRIX_NOT_SYMMETRIC');
assert.equal(asymmetric.diagnostics.failure.stage, 'cg-qualification');
assert.equal(asymmetric.diagnostics.denseConversionCount, 0);

const indefinite = solveSparseLinear(denseToCsc([
  [1, 2],
  [2, 1],
]), [1, -1], { method: 'cg' });
assert.equal(indefinite.ok, false);
assert.equal(indefinite.reason, 'CG_MATRIX_NOT_POSITIVE_DEFINITE');
assert.equal(indefinite.diagnostics.qualification.method, 'sparse-ldlt-positive-pivot-certification');
assert.equal(indefinite.diagnostics.iterations, 0);

const hiddenIndefiniteSize = 257;
const hiddenIndefinite = Array.from({ length: hiddenIndefiniteSize }, (_row, row) => (
  Array.from({ length: hiddenIndefiniteSize }, (_column, column) => (row === column ? 1 : 0))
));
hiddenIndefinite[hiddenIndefiniteSize - 2][hiddenIndefiniteSize - 1] = 2;
hiddenIndefinite[hiddenIndefiniteSize - 1][hiddenIndefiniteSize - 2] = 2;
for (const rhs of [
  Array.from({ length: hiddenIndefiniteSize }, (_value, index) => (index === 0 ? 1 : 0)),
  new Array(hiddenIndefiniteSize).fill(1),
]) {
  const blocked = solveSparseLinear(denseToCsc(hiddenIndefinite), rhs, { method: 'cg' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'CG_MATRIX_NOT_POSITIVE_DEFINITE');
  assert.equal(blocked.diagnostics.iterations, 0);
  assert.equal(blocked.diagnostics.qualification.certification, 'rejected-before-iteration');
  assert.equal(blocked.diagnostics.qualification.method, 'sparse-ldlt-positive-pivot-certification');
}

const resourceLimited = solveSparseLinear(denseToCsc([
  [2, -1, 0],
  [-1, 2, -1],
  [0, -1, 2],
]), [1, 0, 0], {
  method: 'cg',
  cgSpdCertificationMaxComponentDofs: 2,
});
assert.equal(resourceLimited.ok, false);
assert.equal(resourceLimited.reason, 'CG_SPD_CERTIFICATION_RESOURCE_LIMIT');
assert.equal(resourceLimited.diagnostics.iterations, 0);
assert.equal(resourceLimited.diagnostics.qualification.componentDofs, 3);

const production = productionFrame(835);
const productionResult = analyzeComponent3D(
  production.nodes,
  production.members,
  production.loads,
  {
    solver: 'sparse',
    sparseThreshold: 1,
    stations: 21,
    mat: () => ({ E: 200000000, G: 76923077 }),
    sec: () => ({ A: 0.02, Iy: 8e-5, Iz: 1.2e-4, J: 2e-5 }),
  },
);
assert.equal(productionResult.ok, true, productionResult.reason || JSON.stringify(productionResult.solver));
assert.ok(productionResult.solver.freeDofCount >= 5000);
assert.equal(productionResult.solver.sparse.method, 'scaled-ic0-pcg');
assert.equal(productionResult.solver.sparse.denseConversionCount, 0);
assert.equal(
  productionResult.solver.sparse.factorStorage,
  'incomplete-cholesky-zero-fill',
);
assert.equal(productionResult.solver.sparse.inputStorage, 'csc');
assert.equal(productionResult.solver.sparse.fallback, false);
const storage = productionResult.solver.sparse.assembly;
assert.equal(storage.path, 'sparse-csc');
assert.equal(storage.denseSquareAllocationCount, 0);
assert.equal(storage.denseGlobalMatrixAllocated, false);
assert.equal(storage.denseFreeMatrixAllocated, false);
assert.equal(storage.cscToDenseConversionCount, 0);
assert.equal(storage.globalMatrix.format, 'csc');
assert.equal(storage.freeMatrix.format, 'csc');
assert.equal(storage.freeMatrix.rowCount, productionResult.solver.freeDofCount);
assert.ok(storage.storageToDenseRatio < 0.01, `unexpected CSC storage ratio ${storage.storageToDenseRatio}`);
assert.ok(storage.peakMatrixStorageEntries < storage.denseEquivalentEntries / 100);
assert.ok(productionResult.solver.residualNorm <= 1e-8, `production residual ${productionResult.solver.residualNorm}`);

const badReactionK = Array.from({ length: 6 }, () => new Array(6).fill(0));
badReactionK[0][0] = Number.POSITIVE_INFINITY;
assert.throws(
  () => recoverReactions(
    [{ id: 'N_BAD', support: 'fixed' }],
    badReactionK,
    new Array(6).fill(0),
    [1, 0, 0, 0, 0, 0],
    new Set([0, 1, 2, 3, 4, 5]),
  ),
  (error) => error.reason === 'NONFINITE_REACTION_COMPONENT'
    && error.nodeId === 'N_BAD'
    && error.component === 'rx',
);

console.log(JSON.stringify({
  ok: true,
  independentRhsCount: multiple.diagnostics.rhsCount,
  reusedFactorizationCount: multiple.diagnostics.factorizationCount,
  fallbackAttemptCount: fallback.diagnostics.factorizationAttemptCount,
  singularPivotDof: singular.diagnostics.failure.fallback.pivotOriginalIndex,
  hiddenIndefiniteDofs: hiddenIndefiniteSize,
  productionFreeDofCount: productionResult.solver.freeDofCount,
  productionStorageRatio: storage.storageToDenseRatio,
  productionResidual: productionResult.solver.residualNorm,
}, null, 2));

function productionFrame(memberCount) {
  const nodes = [];
  const members = [];
  for (let index = 0; index < memberCount; index += 1) {
    const baseId = `B${index}`;
    const tipId = `T${index}`;
    nodes.push({ id: baseId, x: index * 2, y: 0, z: 0, support: 'fixed' });
    nodes.push({ id: tipId, x: index * 2, y: 0, z: 3 });
    members.push({ id: `M${index}`, n1: baseId, n2: tipId, matId: 'test', secId: 'test' });
  }
  return {
    nodes,
    members,
    loads: [{ id: 'P', type: 'nodal', node: 'T0', P: 1, dir: '+x' }],
  };
}

function closeVector(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label} length`);
  actual.forEach((value, index) => {
    assert.ok(
      Math.abs(value - expected[index]) <= tolerance,
      `${label}[${index}]: expected ${expected[index]}, got ${value}`,
    );
  });
}
