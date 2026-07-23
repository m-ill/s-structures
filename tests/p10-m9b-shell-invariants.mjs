import assert from 'node:assert/strict';
import { buildSlabPlateMitc4 } from '../src/solver/shell/slabPlateMitc4.js';

const EXPECTED_QUALIFICATION_STATUS = 'PASS';
const RIGID_RESIDUAL_TOLERANCE = 1e-12;
const CONSTANT_CURVATURE_ENERGY_TOLERANCE = 1e-8;

const element = buildSlabPlateMitc4({
  id: 'P10-M9B-INVARIANTS',
  nodes: [
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
    { x: 2, y: 2, z: 0 },
    { x: 0, y: 2, z: 0 },
  ],
  material: { E: 30e9, nu: 0.3 },
  t: 0.2,
});

assert.equal(element.ok, true);
assert.equal(element.localMatrix.length, 12);

const coordinates = element.frame.projected;
const rigidModes = [
  {
    id: 'rigid-normal-translation',
    vector: coordinates.flatMap(() => [1, 0, 0]),
  },
  {
    id: 'rigid-rotation-rx',
    // theta = rx e1 gives w = theta x r . normal = y.
    vector: coordinates.flatMap(({ y }) => [y, 1, 0]),
  },
  {
    id: 'rigid-rotation-ry',
    // theta = ry e2 gives w = theta x r . normal = -x.
    vector: coordinates.flatMap(({ x }) => [-x, 0, 1]),
  },
];

const stiffnessScale = Math.max(1, matrixMaxAbs(element.localMatrix));
const rigidChecks = rigidModes.map(({ id, vector }) => {
  const residual = matrixVector(element.localMatrix, vector);
  const normalizedResidual = vectorMaxAbs(residual)
    / (stiffnessScale * Math.max(1, vectorMaxAbs(vector)));
  return {
    id,
    normalizedResidual,
    tolerance: RIGID_RESIDUAL_TOLERANCE,
    pass: normalizedResidual <= RIGID_RESIDUAL_TOLERANCE,
  };
});

// A physical unit kappa-x state uses ry = x and w = -x^2/2. Its exact
// transverse shear is zero and its energy is area * D11 / 2. A compatible
// four-node assumed-shear element reproduces this constant-curvature patch.
const unitKappaX = coordinates.flatMap(({ x }) => [-0.5 * x * x, 0, x]);
const computedCurvatureEnergy = quadraticEnergy(element.localMatrix, unitKappaX);
const referenceCurvatureEnergy = 0.5 * element.area * element.bendingMatrix[0][0];
const curvatureEnergyRelativeError = Math.abs(computedCurvatureEnergy - referenceCurvatureEnergy)
  / referenceCurvatureEnergy;
const curvatureCheck = {
  id: 'constant-curvature-kappa-x',
  computedEnergy: computedCurvatureEnergy,
  referenceEnergy: referenceCurvatureEnergy,
  relativeError: curvatureEnergyRelativeError,
  tolerance: CONSTANT_CURVATURE_ENERGY_TOLERANCE,
  pass: curvatureEnergyRelativeError <= CONSTANT_CURVATURE_ENERGY_TOLERANCE,
};

const checks = [...rigidChecks, curvatureCheck];
const failedCheckIds = checks.filter((check) => !check.pass).map((check) => check.id);
const qualification = {
  status: failedCheckIds.length === 0 ? 'PASS' : 'BLOCKED',
  failedCheckIds,
  checks,
};

assert.equal(qualification.status, EXPECTED_QUALIFICATION_STATUS);
assert.equal(element.qualification.status.toUpperCase(), EXPECTED_QUALIFICATION_STATUS);
assert.deepEqual(failedCheckIds, []);

export const M9B_SHELL_INVARIANT_SNAPSHOT = Object.freeze({
  version: 'p10-m9b-shell-invariants-v2-mitc4',
  expectedQualificationStatus: EXPECTED_QUALIFICATION_STATUS,
  qualification,
});

console.log(JSON.stringify({ ok: true, ...M9B_SHELL_INVARIANT_SNAPSHOT }, null, 2));

function matrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function quadraticEnergy(matrix, vector) {
  return 0.5 * vector.reduce((sum, value, index) => {
    const rowProduct = matrix[index].reduce((rowSum, entry, column) => rowSum + entry * vector[column], 0);
    return sum + value * rowProduct;
  }, 0);
}

function matrixMaxAbs(matrix) {
  return Math.max(0, ...matrix.flat().map((value) => Math.abs(value)));
}

function vectorMaxAbs(vector) {
  return Math.max(0, ...vector.map((value) => Math.abs(value)));
}
