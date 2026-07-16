import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createCpuSparseBackend } from '../src/compute/backends/cpuSparseBackend.js';
import {
  createSymmetricSparseOperator,
  createSymmetricSparseOperatorFromDense,
  sparseOperatorMatvecParity,
} from '../src/compute/eigen/sparseOperator.js';
import { solveRequestedGeneralizedEigen } from '../src/compute/eigen/requestedModes.js';
import { modalAssuranceCriterion } from '../src/compute/eigen/smallSymmetric.js';
import { createCscFromTriplets } from '../src/compute/sparse/matrix.js';
import { analyzeDynamics } from '../src/dynamics/modal.js';
import { solveGeneralizedBucklingModes } from '../src/dynamics/globalBuckling.js';

const denseK = [
  [8, -2, 0],
  [-2, 6, -1],
  [0, -1, 4],
];
const denseM = [
  [2, 0, 0],
  [0, 1.5, 0],
  [0, 0, 1],
];
const denseKg = [
  [1, 0.2, 0],
  [0.2, 0.8, 0.1],
  [0, 0.1, 0.5],
];
const vectors = [[1, 0, 0], [0.5, -1, 2], [-2, 3, 0.25]];
const kOperator = createSymmetricSparseOperatorFromDense(denseK, { id: 'test-K', matrixClass: 'spd' });
const mOperator = createSymmetricSparseOperatorFromDense(denseM, { id: 'test-M' });
const kgOperator = createSymmetricSparseOperatorFromDense(denseKg, { id: 'test-Kg' });
for (const [operator, dense] of [[kOperator, denseK], [mOperator, denseM], [kgOperator, denseKg]]) {
  const parity = sparseOperatorMatvecParity(operator, dense, vectors, 1e-13);
  assert.equal(parity.ok, true);
  assert.ok(parity.maxAbsoluteError <= 1e-13);
}

const diagonalK = createSymmetricSparseOperatorFromDense([
  [2, 0, 0],
  [0, 6, 0],
  [0, 0, 12],
], { id: 'diagonal-K', matrixClass: 'spd' });
const diagonalM = createSymmetricSparseOperatorFromDense([
  [1, 0, 0],
  [0, 2, 0],
  [0, 0, 3],
], { id: 'diagonal-M' });
const backend = createCpuSparseBackend();
const exact = solveRequestedGeneralizedEigen({
  primary: diagonalK,
  secondary: diagonalM,
  modeCount: 3,
  backend,
});
assert.equal(exact.ok, true);
assert.deepEqual(exact.modes.map((mode) => rounded(mode.eigenvalue, 12)), [2, 3, 4]);
assert.ok(exact.modes.every((mode) => Math.max(...mode.vector.map(Math.abs)) === 1));
assert.ok(exact.modes.every((mode) => mode.vector[mode.vector.findIndex((value) => Math.abs(value) === 1)] > 0));
assert.ok(exact.modes.every((mode) => mode.residual <= 1e-12));
assert.equal(exact.diagnostics.fullDenseEigenMatrixAllocated, false);
assert.equal(exact.diagnostics.numericPrecision, 'f64');
assert.ok(modalAssuranceCriterion(exact.modes[0].vector, exact.modes[1].vector, (vector) => diagonalM.matvec(vector)) <= 1e-14);
const repeatedFirst = solveRequestedGeneralizedEigen({
  primary: createSymmetricSparseOperatorFromDense([[2, 0], [0, 2]], { id: 'repeat-K', matrixClass: 'spd' }),
  secondary: createSymmetricSparseOperatorFromDense([[1, 0], [0, 1]], { id: 'repeat-M' }),
  modeCount: 2,
});
const repeatedSecond = solveRequestedGeneralizedEigen({
  primary: createSymmetricSparseOperatorFromDense([[2, 0], [0, 2]], { id: 'repeat-K', matrixClass: 'spd' }),
  secondary: createSymmetricSparseOperatorFromDense([[1, 0], [0, 1]], { id: 'repeat-M' }),
  modeCount: 2,
});
assert.equal(repeatedFirst.ok, true);
assert.deepEqual(repeatedFirst.modes.map((mode) => mode.vector), repeatedSecond.modes.map((mode) => mode.vector));
const backendAfter = backend.snapshot();
assert.equal(backendAfter.activeHandleCount, 0);
assert.equal(backendAfter.numericCacheSize, 0);
backend.dispose();

const singular = solveRequestedGeneralizedEigen({
  primary: createSymmetricSparseOperatorFromDense([[1, 0], [0, 0]], { id: 'singular-K', matrixClass: 'spd' }),
  secondary: createSymmetricSparseOperatorFromDense([[1, 0], [0, 1]], { id: 'singular-M' }),
  modeCount: 1,
});
assert.equal(singular.ok, false);
assert.equal(singular.reason, 'PRIMARY_OPERATOR_NOT_POSITIVE_DEFINITE');

const modal = analyzeDynamics(columnModel());
assert.equal(modal.ok, true);
assert.equal(modal.eigen.status, 'available');
assert.equal(modal.eigen.diagnostics.fullDenseEigenMatrixAllocated, false);
assert.equal(modal.condensation.method, 'implicit-sparse-shift-invert-no-dense-schur');
assert.ok(Math.abs(modal.modes[0].normalization.generalizedMass - 1) <= 1e-12);
assert.equal(modal.rsa.designBlocked, false);
assert.equal(modal.rsa.memberForces.status, 'available');

const buckling = solveGeneralizedBucklingModes(
  [[4, 0, 0], [0, 9, 0], [0, 0, 16]],
  [[2, 0, 0], [0, 3, 0], [0, 0, 4]],
  { modeCount: 3, residualTolerance: 1e-10 },
);
assert.equal(buckling.ok, true);
assert.deepEqual(buckling.modes.map((mode) => rounded(mode.loadFactor, 12)), [2, 3, 4]);
assert.equal(buckling.eigen.diagnostics.fullDenseEigenMatrixAllocated, false);
assert.ok(buckling.modes.every((mode) => mode.residual <= 1e-12));

const scaleDimension = 240;
const scaleK = diagonalSparseOperator(scaleDimension, (index) => index + 1, 'scale-K', 'spd');
const scaleM = diagonalSparseOperator(scaleDimension, () => 1, 'scale-M', 'positive-semidefinite');
const scaleStarted = performance.now();
const operatorScale = solveRequestedGeneralizedEigen({
  primary: scaleK,
  secondary: scaleM,
  modeCount: 6,
  maximumProjectionDimension: 16,
  maxIterations: 40,
});
const operatorScaleDurationMs = performance.now() - scaleStarted;
assert.equal(operatorScale.ok, true);
assert.deepEqual(operatorScale.modes.map((mode) => rounded(mode.eigenvalue, 10)), [1, 2, 3, 4, 5, 6]);
assert.equal(operatorScale.diagnostics.projectionDimension, 12);
assert.equal(operatorScale.diagnostics.fullDenseEigenMatrixAllocated, false);

const structuralScaleStarted = performance.now();
const structuralScale = analyzeDynamics(tallColumnModel(40));
const scaleDurationMs = performance.now() - structuralScaleStarted;
assert.equal(structuralScale.ok, true);
assert.equal(structuralScale.modes.length, 6);
assert.equal(structuralScale.eigen.diagnostics.dimension, scaleDimension);
assert.equal(structuralScale.eigen.diagnostics.projectionDimension, 12);
assert.equal(structuralScale.eigen.diagnostics.fullDenseEigenMatrixAllocated, false);
assert.ok(structuralScale.eigen.diagnostics.finalMaximumResidual <= 1e-8);
assert.ok(scaleDurationMs < 5000, `M-tier structural requested-mode analysis exceeded 5 s: ${scaleDurationMs} ms`);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['P9-GPU-EIG-01', 'P9-GPU-EIG-02', 'P9-GPU-EIG-03', 'P9-GPU-EIG-04', 'P9-GPU-EIG-05', 'P9-GPU-EIG-06', 'P9-GPU-EIG-07', 'P9-GPU-EIG-08', 'P9-GPU-EIG-09', 'P9-GPU-EIG-10', 'P9-GPU-EIG-11', 'P9-GPU-EIG-12', 'P9-GPU-EIG-13', 'P9-GPU-EIG-14', 'P9-PERF-11'],
  exactEigenvalues: exact.modes.map((mode) => mode.eigenvalue),
  modalPeriod: modal.modes[0].period,
  bucklingFactors: buckling.modes.map((mode) => mode.loadFactor),
  scale: {
    dimension: scaleDimension,
    requestedModes: structuralScale.modes.length,
    projectionDimension: structuralScale.eigen.diagnostics.projectionDimension,
    durationMs: scaleDurationMs,
    operatorDurationMs: operatorScaleDurationMs,
    stiffnessNnz: structuralScale.eigen.diagnostics.primaryOperator.nnz,
    massNnz: structuralScale.eigen.diagnostics.secondaryOperator.nnz,
  },
}, null, 2));

function diagonalSparseOperator(dimension, valueAt, id, matrixClass) {
  const triplets = Array.from({ length: dimension }, (_item, index) => ({
    row: index,
    column: index,
    value: valueAt(index),
  }));
  return createSymmetricSparseOperator(
    createCscFromTriplets(dimension, dimension, triplets),
    { id, matrixClass },
  );
}

function columnModel() {
  return {
    units: { length: 'm', force: 'kN', moment: 'kN.m' },
    materials: [{ id: 'MAT', E: 200000000, G: 77000000, density: 0 }],
    sections: [{ id: 'SEC', A: 0.01, Iy: 5e-6, Iz: 8e-6, J: 1e-6 }],
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 0, y: 0, z: 4, mass: [10, 0, 0] },
    ],
    members: [{ id: 'C1', type: 'frame', n1: 'N0', n2: 'N1', matId: 'MAT', secId: 'SEC' }],
    analysisSettings: {
      modalModeCount: 1,
      responseSpectrum: {
        enabled: true,
        method: 'SRSS',
        directions: ['x'],
        scale: 1,
        points: [{ period: 0, sa: 1 }, { period: 10, sa: 1 }],
      },
    },
  };
}

function tallColumnModel(storyCount) {
  const nodes = [{ id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' }];
  const members = [];
  for (let story = 1; story <= storyCount; story += 1) {
    nodes.push({ id: `N${story}`, x: 0, y: 0, z: story * 3, mass: [10, 10, 0] });
    members.push({
      id: `C${story}`,
      type: 'frame',
      n1: `N${story - 1}`,
      n2: `N${story}`,
      matId: 'MAT',
      secId: 'SEC',
    });
  }
  return {
    units: { length: 'm', force: 'kN', moment: 'kN.m' },
    materials: [{ id: 'MAT', E: 200000000, G: 77000000, density: 0 }],
    sections: [{ id: 'SEC', A: 0.02, Iy: 8e-5, Iz: 8e-5, J: 2e-5 }],
    nodes,
    members,
    analysisSettings: {
      modalModeCount: 6,
      modalProjectionDimension: 16,
      modalMaxIterations: 80,
      responseSpectrum: { enabled: false },
    },
  };
}

function rounded(value, digits) {
  return Number(Number(value).toFixed(digits));
}
