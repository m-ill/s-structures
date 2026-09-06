import assert from 'node:assert/strict';
import {
  assembleSparseBlocks,
  computeSpdTrueResidual,
  createCscFromTriplets,
  createDeterministicSparseAssembler,
  createElasticFactorSession,
  createSpdSolvePolicy,
  cscToDense,
  extractDeterministicCscSubmatrix,
} from '../src/compute/index.js';
import {
  resolveUnloadedRigidRotationGauges,
  translationFreeRigidRotationComponents,
} from '../src/index.js';

const dofOrder = ['ux', 'uy', 'ux', 'uy'];
const blocks = [
  {
    elementId: 'E-A',
    contributionId: 'material',
    basis: 'GLOBAL',
    dofs: [0, 1],
    dofOrder: ['ux', 'uy'],
    matrix: [[4, -1], [-1, 2]],
  },
  {
    elementId: 'E-B',
    contributionId: 'material',
    basis: 'GLOBAL',
    dofs: [1, 2],
    dofOrder: ['uy', 'ux'],
    matrix: [[3, -2], [-2, 5]],
  },
  {
    elementId: 'E-C',
    contributionId: 'material',
    basis: 'GLOBAL',
    dofs: [2, 3],
    dofOrder: ['ux', 'uy'],
    matrix: [[1, 0.5], [0.5, 4]],
  },
];

const forward = buildAssembly(blocks);
const reverse = buildAssembly(blocks.toReversed());
assert.equal(forward.patternHash, reverse.patternHash, 'element order must not change the CSC pattern');
assert.equal(forward.valueHash, reverse.valueHash, 'element order must not change accumulated values');
assert.deepEqual(cscToDense(forward), [
  [5, -1, 0, 0],
  [-1, 5, -2, 0],
  [0, -2, 6, 0.5],
  [0, 0, 0.5, 4],
]);
assert.ok(forward.assembly.symmetryError <= 1e-12);
assert.equal(forward.assembly.summation, 'neumaier-compensated');

const convenience = assembleSparseBlocks({
  rowCount: 4,
  basis: 'GLOBAL',
  symmetric: true,
  dofOrder,
}, blocks);
assert.deepEqual(cscToDense(convenience), [
  [4, -1, 0, 0],
  [-1, 5, -2, 0],
  [0, -2, 6, 0.5],
  [0, 0, 0.5, 4],
]);

const submatrix = extractDeterministicCscSubmatrix(forward, [1, 2]);
assert.deepEqual(cscToDense(submatrix), [[5, -2], [-2, 6]]);
assert.deepEqual(submatrix.dofOrder, ['uy', 'ux']);
assert.ok(submatrix.assembly.symmetryError <= 1e-12);

const basisGuard = createDeterministicSparseAssembler({
  rowCount: 2,
  basis: 'GLOBAL',
  symmetric: true,
  dofOrder: ['ux', 'uy'],
});
assert.throws(() => basisGuard.addBlock({
  elementId: 'LOCAL-ELEMENT',
  basis: 'LOCAL',
  dofs: [0, 1],
  dofOrder: ['ux', 'uy'],
  matrix: [[1, 0], [0, 1]],
}), (error) => error.code === 'SPARSE_ASSEMBLY_BASIS_MISMATCH');

const orderGuard = createDeterministicSparseAssembler({
  rowCount: 2,
  basis: 'GLOBAL',
  symmetric: true,
  dofOrder: ['ux', 'uy'],
});
assert.throws(() => orderGuard.addBlock({
  elementId: 'ORDERED-ELEMENT',
  basis: 'GLOBAL',
  dofs: [0, 1],
  dofOrder: ['uy', 'ux'],
  matrix: [[1, 0], [0, 1]],
}), (error) => error.code === 'SPARSE_ASSEMBLY_DOF_ORDER_MISMATCH');

const symmetryGuard = createDeterministicSparseAssembler({
  rowCount: 2,
  basis: 'GLOBAL',
  symmetric: true,
  dofOrder: ['ux', 'uy'],
});
symmetryGuard.addValue(0, 1, 1, {
  sourceId: 'ASYMMETRIC',
  termId: 'upper-only',
  basis: 'GLOBAL',
  rowDof: 'ux',
  colDof: 'uy',
});
assert.throws(
  () => symmetryGuard.finalize(),
  (error) => error.code === 'SPARSE_ASSEMBLY_SYMMETRY_AUDIT_FAILED',
);

const rhs = Float64Array.of(1, 2, 3, 4);
const denseReference = solveDense(cscToDense(forward), rhs);
const iterativePolicy = createSpdSolvePolicy({
  iccgThreshold: 1,
  tolerance: 1e-12,
  trueResidualTolerance: 1e-11,
});
const preparedIterative = iterativePolicy.prepare(forward);
assert.equal(preparedIterative.ok, true);
assert.equal(preparedIterative.diagnostics.selectedMethod, 'iccg');
const iterative = iterativePolicy.solvePrepared(preparedIterative.prepared, rhs);
assert.equal(iterative.ok, true, iterative.reason);
closeVector(iterative.x, denseReference, 1e-11, 'ICCG/dense displacement parity');
assert.ok(iterative.diagnostics.trueResidual.trueRelativeResidual <= 1e-11);
assert.equal(iterative.diagnostics.denseMatrixAllocated, false);
iterativePolicy.release(preparedIterative.prepared);
assert.equal(iterativePolicy.dispose().backend.allocationBalanced, true);

const fallbackPolicy = createSpdSolvePolicy({
  iccgThreshold: 1,
  iccgBreakdownTolerance: 2,
  tolerance: 1e-12,
  trueResidualTolerance: 1e-11,
});
const preparedFallback = fallbackPolicy.prepare(forward);
assert.equal(preparedFallback.ok, true);
assert.equal(preparedFallback.diagnostics.selectedMethod, 'direct-fallback');
const fallback = fallbackPolicy.solvePrepared(preparedFallback.prepared, rhs);
assert.equal(fallback.ok, true, fallback.reason);
assert.equal(fallback.diagnostics.fallback, true);
assert.equal(fallback.diagnostics.fallbackReason, 'ICCG_NON_POSITIVE_PIVOT');
assert.equal(fallback.diagnostics.fallbackSucceeded, true);
assert.equal(fallback.diagnostics.selectedMethod, 'direct-fallback');
closeVector(fallback.x, denseReference, 1e-11, 'fallback/dense displacement parity');
fallbackPolicy.release(preparedFallback.prepared);
assert.equal(fallbackPolicy.dispose().backend.allocationBalanced, true);

const illScaled = createCscFromTriplets(2, 2, [[0, 0, 1e-18], [1, 1, 1e18]]);
const scalingPolicy = createSpdSolvePolicy({ iccgThreshold: 99, trueResidualTolerance: 1e-12 });
const preparedScaled = scalingPolicy.prepare(illScaled);
assert.equal(preparedScaled.ok, true);
assert.equal(preparedScaled.diagnostics.scaling.mode, 'symmetric-diagonal');
assert.ok(preparedScaled.diagnostics.scaling.scaleRatio >= 1e17);
const scaled = scalingPolicy.solvePrepared(preparedScaled.prepared, [1, 1]);
assert.equal(scaled.ok, true, scaled.reason);
closeRelative(scaled.x[0], 1e18, 1e-12, 'ill-scaled x0');
closeRelative(scaled.x[1], 1e-18, 1e-12, 'ill-scaled x1');
assert.ok(computeSpdTrueResidual(illScaled, scaled.x, [1, 1]).trueRelativeResidual <= 1e-12);
scalingPolicy.release(preparedScaled.prepared);
scalingPolicy.dispose();

const asymmetric = createCscFromTriplets(2, 2, [[0, 0, 2], [0, 1, 1], [1, 1, 2]]);
const rejectedPolicy = createSpdSolvePolicy();
const rejected = rejectedPolicy.prepare(asymmetric);
assert.equal(rejected.ok, false);
assert.equal(rejected.reason, 'SPD_MATRIX_NOT_SYMMETRIC');
assert.equal(rejected.diagnostics.denseFallbackAllocated, false);
rejectedPolicy.dispose();

const session = createElasticFactorSession({
  iccgThreshold: 1,
  iccgBreakdownTolerance: 2,
  trueResidualTolerance: 1e-11,
});
const sessionFirst = session.solve(forward, rhs, {
  groupKey: 'P15-M2',
  componentKey: 'fixture',
  matrixClass: 'spd',
});
const sessionSecond = session.solve(forward, Float64Array.from(rhs, (value) => 2 * value), {
  groupKey: 'P15-M2',
  componentKey: 'fixture',
  matrixClass: 'spd',
});
assert.equal(sessionFirst.ok, true, sessionFirst.reason);
assert.equal(sessionSecond.ok, true, sessionSecond.reason);
assert.equal(sessionFirst.diagnostics.fallbackSucceeded, true);
assert.equal(sessionSecond.diagnostics.factorReused, true);
assert.equal(session.snapshot().factorizationCount, 1);
assert.equal(session.snapshot().backend.spdPolicy.prepareCount, 1);
assert.equal(session.dispose().backend.allocationBalanced, true);

const rigidNodes = [
  { id: 'N1', x: 0, y: 0, z: 0, support: 'pin' },
  { id: 'N2', x: 6, y: 0, z: 0, support: 'custom', fix: [false, true, true, false, false, false] },
];
assert.deepEqual(
  translationFreeRigidRotationComponents(rigidNodes, [3, 4, 5]),
  [3],
  'only uniform torsion about the collinear member axis is gauge-eligible',
);
const unloadedGauge = resolveUnloadedRigidRotationGauges({
  nodes: rigidNodes,
  fixedDofs: new Set([0, 1, 2, 7, 8]),
  force: new Array(12).fill(0),
  components: [3],
});
assert.equal(unloadedGauge.ok, true);
assert.deepEqual(unloadedGauge.gaugeLabels, ['N1.rx']);
assert.equal(unloadedGauge.artificialStiffnessAdded, false);
const torsionForce = new Array(12).fill(0);
torsionForce[9] = 1;
const loadedGauge = resolveUnloadedRigidRotationGauges({
  nodes: rigidNodes,
  fixedDofs: new Set([0, 1, 2, 7, 8]),
  force: torsionForce,
  components: [3],
});
assert.equal(loadedGauge.ok, false);
assert.equal(loadedGauge.reason, 'LOADED_RIGID_ROTATION_MODE');
assert.deepEqual(loadedGauge.gaugeDofs, []);

console.log(JSON.stringify({
  ok: true,
  verificationIds: [
    'P15-M2-ASSEMBLY-DETERMINISM',
    'P15-M2-BASIS-GUARD',
    'P15-M2-DOF-ORDER-GUARD',
    'P15-M2-SYMMETRY-AUDIT',
    'P15-M2-DENSE-SPARSE-PARITY',
    'P15-M2-DIAGONAL-EQUILIBRATION',
    'P15-M2-TRUE-RESIDUAL',
    'P15-M2-SPARSE-DIRECT-FALLBACK',
    'P15-M2-FACTOR-REUSE-LIFECYCLE',
    'P15-M2-UNLOADED-TORSION-GAUGE',
    'P15-M2-LOADED-RIGID-MODE-GUARD',
  ],
  patternHash: forward.patternHash,
  valueHash: forward.valueHash,
  iterativeResidual: iterative.diagnostics.trueResidual.trueRelativeResidual,
  fallbackReason: fallback.diagnostics.fallbackReason,
  scalingRatio: preparedScaled.diagnostics.scaling.scaleRatio,
}, null, 2));

function buildAssembly(orderedBlocks) {
  const assembler = createDeterministicSparseAssembler({
    rowCount: 4,
    basis: 'GLOBAL',
    symmetric: true,
    dofOrder,
  });
  for (const block of orderedBlocks) assembler.addBlock(block);
  const values = [
    ['C-negative', -1e16],
    ['A-positive', 1e16],
    ['B-unit', 1],
  ];
  for (const [sourceId, value] of orderedBlocks[0].elementId === 'E-A' ? values : values.toReversed()) {
    assembler.addValue(0, 0, value, {
      sourceId,
      termId: 'duplicate-diagonal',
      basis: 'GLOBAL',
      rowDof: 'ux',
      colDof: 'ux',
    });
  }
  return assembler.finalize();
}

function solveDense(matrix, rhsInput) {
  const n = matrix.length;
  const augmented = matrix.map((row, index) => [...row, Number(rhsInput[index])]);
  for (let pivot = 0; pivot < n; pivot += 1) {
    let selected = pivot;
    for (let row = pivot + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[selected][pivot])) selected = row;
    }
    [augmented[pivot], augmented[selected]] = [augmented[selected], augmented[pivot]];
    for (let row = pivot + 1; row < n; row += 1) {
      const factor = augmented[row][pivot] / augmented[pivot][pivot];
      for (let column = pivot; column <= n; column += 1) augmented[row][column] -= factor * augmented[pivot][column];
    }
  }
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let value = augmented[row][n];
    for (let column = row + 1; column < n; column += 1) value -= augmented[row][column] * x[column];
    x[row] = value / augmented[row][row];
  }
  return x;
}

function closeVector(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label} length`);
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) <= tolerance, `${label}[${index}]: ${value} vs ${expected[index]}`);
  });
}

function closeRelative(actual, expected, tolerance, label) {
  const relative = Math.abs(actual - expected) / Math.max(Number.MIN_VALUE, Math.abs(expected));
  assert.ok(relative <= tolerance, `${label}: ${actual} vs ${expected} (${relative})`);
}
