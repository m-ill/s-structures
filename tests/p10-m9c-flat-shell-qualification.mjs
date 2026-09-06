import assert from 'node:assert/strict';
import {
  buildFlatShellQm6Mitc4,
  buildSlabPlateMitc4,
  buildSlabPressureLoad,
  buildWallMembraneQm6,
} from '../src/index.js';

const EXPECTED_QUALIFICATION_STATUS = 'PASS';
const EXPECTED_FAILED_CHECK_IDS = Object.freeze([]);

const RIGID_RESIDUAL_TOLERANCE = 1e-12;
const COMPATIBLE_DRILLING_TOLERANCE = 1e-12;
const INDEPENDENT_DRILLING_MINIMUM = 1e-8;
const PRESSURE_TOLERANCE = 1e-12;

const material = Object.freeze({ E: 30e9, nu: 0.2 });
const planarNodes = Object.freeze([
  Object.freeze({ x: 0, y: 0, z: 0 }),
  Object.freeze({ x: 2, y: 0, z: 0 }),
  Object.freeze({ x: 2, y: 2, z: 0 }),
  Object.freeze({ x: 0, y: 2, z: 0 }),
]);
const warpedNodes = Object.freeze(planarNodes.map((node, index) => Object.freeze({
  ...node,
  z: index === 2 ? 0.03 : 0,
})));

const planar = buildRawShell(planarNodes);
const planarRigid = rigidResidualSnapshot(planar.matrix, planarNodes);
const dr01 = {
  id: 'DR-01-planar-raw-rigid-modes',
  description: 'Unprojected planar shell must annihilate all six 3D rigid modes.',
  tolerance: RIGID_RESIDUAL_TOLERANCE,
  ...planarRigid,
  pass: planarRigid.maxNormalizedResidual <= RIGID_RESIDUAL_TOLERANCE,
};

const warpedFlatShell = buildFlatShellQm6Mitc4({
  id: 'P10-M9C-QUAL-WARPED',
  nodes: warpedNodes,
  material,
  t: 0.2,
}, { warpTol: 1e-2 });
assert.equal(warpedFlatShell.ok, true);
assert.equal(warpedFlatShell.warp.status, 'warning');
const warped = buildRawShell(warpedNodes);
const warpedRigid = rigidResidualSnapshot(warped.matrix, warpedNodes);
const dr02 = {
  id: 'DR-02-warped-raw-rigid-modes',
  description: 'Warning-level warped shell must preserve actual-coordinate rigid modes before projection.',
  warpRatio: warpedFlatShell.warp.ratio,
  tolerance: RIGID_RESIDUAL_TOLERANCE,
  ...warpedRigid,
  pass: warpedRigid.maxNormalizedResidual <= RIGID_RESIDUAL_TOLERANCE,
};

const drillingMatrix = planar.membrane.drillingMatrix;
const compatibleAffine = affineMembraneMode(planarNodes, {
  ex: 1e-3,
  ey: -4e-4,
  gxy: 2e-4,
  continuumRotation: 0.25,
});
const compatibleDrillingRatio = normalizedQuadraticEnergy(drillingMatrix, compatibleAffine);
const dr03 = {
  id: 'DR-03-affine-compatible-drilling',
  description: 'theta-n equal to one-half in-plane curl must have zero drilling penalty.',
  normalizedDrillingEnergy: compatibleDrillingRatio,
  tolerance: COMPATIBLE_DRILLING_TOLERANCE,
  pass: compatibleDrillingRatio <= COMPATIBLE_DRILLING_TOLERANCE,
};

const independentTheta = planarNodes.flatMap((_, index) => [0, 0, 0, 0, 0, index % 2 === 0 ? 1 : -1]);
const independentDrillingRatio = normalizedQuadraticEnergy(drillingMatrix, independentTheta);
const dr04 = {
  id: 'DR-04-independent-theta-positive',
  description: 'An independent checkerboard drilling field must retain positive energy.',
  normalizedDrillingEnergy: independentDrillingRatio,
  minimum: INDEPENDENT_DRILLING_MINIMUM,
  pass: independentDrillingRatio >= INDEPENDENT_DRILLING_MINIMUM,
};

const rectanglePressure = pressureSnapshot(planarNodes, 7.5);
const rectangleExpectedNodal = new Array(4).fill(7.5);
const rectangleNodalError = vectorRelativeError(rectanglePressure.nodalNormalForces, rectangleExpectedNodal);
const rectangleTotalError = relativeError(rectanglePressure.totalNormalForce, 30);
const pl01 = {
  id: 'PL-01-rectangular-consistent-pressure',
  description: 'Uniform pressure on an affine rectangle retains equal pA/4 nodal forces.',
  nodalNormalForces: rectanglePressure.nodalNormalForces,
  expectedNodalNormalForces: rectangleExpectedNodal,
  nodalRelativeError: rectangleNodalError,
  totalRelativeError: rectangleTotalError,
  tolerance: PRESSURE_TOLERANCE,
  pass: Math.max(rectangleNodalError, rectangleTotalError) <= PRESSURE_TOLERANCE,
};

const trapezoidNodes = Object.freeze([
  Object.freeze({ x: 0, y: 0, z: 0 }),
  Object.freeze({ x: 3, y: 0, z: 0 }),
  Object.freeze({ x: 2, y: 2, z: 0 }),
  Object.freeze({ x: 0, y: 2, z: 0 }),
]);
const trapezoidPressure = pressureSnapshot(trapezoidNodes, 1);
const trapezoidExpectedNodal = [4 / 3, 4 / 3, 7 / 6, 7 / 6];
const trapezoidExpectedMoment = [14 / 3, -19 / 3, 0];
const trapezoidNodalError = vectorRelativeError(
  trapezoidPressure.nodalNormalForces,
  trapezoidExpectedNodal,
);
const trapezoidTotalError = relativeError(trapezoidPressure.totalNormalForce, 5);
const trapezoidMomentError = vectorRelativeError(
  trapezoidPressure.momentAboutOrigin,
  trapezoidExpectedMoment,
);
const pl02 = {
  id: 'PL-02-distorted-consistent-pressure',
  description: 'Distorted Q4 pressure loads must reproduce shape-function nodal weights, total force, and centroid moment.',
  nodalNormalForces: trapezoidPressure.nodalNormalForces,
  expectedNodalNormalForces: trapezoidExpectedNodal,
  totalNormalForce: trapezoidPressure.totalNormalForce,
  expectedTotalNormalForce: 5,
  momentAboutOrigin: trapezoidPressure.momentAboutOrigin,
  expectedMomentAboutOrigin: trapezoidExpectedMoment,
  nodalRelativeError: trapezoidNodalError,
  totalRelativeError: trapezoidTotalError,
  centroidMomentRelativeError: trapezoidMomentError,
  tolerance: PRESSURE_TOLERANCE,
  pass: Math.max(trapezoidNodalError, trapezoidTotalError, trapezoidMomentError) <= PRESSURE_TOLERANCE,
};

const negativePressure = pressureSnapshot(trapezoidNodes, -1);
assert.ok(vectorRelativeError(
  negativePressure.nodalNormalForces,
  trapezoidExpectedNodal.map((value) => -value),
) <= PRESSURE_TOLERANCE);
assert.ok(vectorRelativeError(
  negativePressure.momentAboutOrigin,
  trapezoidExpectedMoment.map((value) => -value),
) <= PRESSURE_TOLERANCE);

const cyclicPressure = pressureSnapshot([
  trapezoidNodes[1],
  trapezoidNodes[2],
  trapezoidNodes[3],
  trapezoidNodes[0],
], 1);
assert.ok(relativeError(cyclicPressure.totalNormalForce, 5) <= PRESSURE_TOLERANCE);
assert.ok(vectorRelativeError(
  cyclicPressure.momentAboutOrigin,
  trapezoidExpectedMoment,
) <= PRESSURE_TOLERANCE);

const checks = [dr01, dr02, dr03, dr04, pl01, pl02];
const failedCheckIds = checks.filter((check) => !check.pass).map((check) => check.id);
const qualification = {
  version: 'p10-m9c-flat-shell-qualification-v2-qualified',
  status: failedCheckIds.length === 0 ? 'PASS' : 'BLOCKED',
  checks,
  failedCheckIds,
  blocker: failedCheckIds.length ? 'SHELL_DRILLING_AND_PRESSURE_QUALIFICATION_FAILED' : null,
};

assert.equal(qualification.status, EXPECTED_QUALIFICATION_STATUS);
assert.deepEqual(failedCheckIds, EXPECTED_FAILED_CHECK_IDS);

export const M9C_FLAT_SHELL_QUALIFICATION_SNAPSHOT = Object.freeze(qualification);
console.log(JSON.stringify({ ok: true, ...qualification }, null, 2));

function buildRawShell(nodes) {
  const input = { id: 'P10-M9C-QUAL-RAW', nodes, material, t: 0.2 };
  const membrane = buildWallMembraneQm6(input);
  const plate = buildSlabPlateMitc4(input);
  assert.equal(membrane.ok, true);
  assert.equal(plate.ok, true);
  return {
    membrane,
    plate,
    matrix: addMatrices(membrane.matrix, plate.matrix),
  };
}

function rigidResidualSnapshot(matrix, nodes) {
  const scale = Math.max(1, matrixMaxAbs(matrix));
  const modes = rigidModes(nodes).map(({ id, vector }) => {
    const residual = matrixVector(matrix, vector);
    const normalizedResidual = vectorMaxAbs(residual)
      / (scale * Math.max(1, vectorMaxAbs(vector)));
    return { id, normalizedResidual };
  });
  return {
    modes,
    maxNormalizedResidual: Math.max(...modes.map((mode) => mode.normalizedResidual)),
  };
}

function rigidModes(nodes) {
  const origin = [0, 1, 2].map((axis) => nodes.reduce(
    (sum, node) => sum + coordinate(node, axis),
    0,
  ) / nodes.length);
  const modes = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const vector = new Array(24).fill(0);
    for (let node = 0; node < 4; node += 1) vector[node * 6 + axis] = 1;
    modes.push({ id: `translation-${'xyz'[axis]}`, vector });
  }
  for (let axis = 0; axis < 3; axis += 1) {
    const omega = [0, 0, 0];
    omega[axis] = 1;
    const vector = new Array(24).fill(0);
    for (let node = 0; node < 4; node += 1) {
      const position = [0, 1, 2].map((component) => coordinate(nodes[node], component) - origin[component]);
      const displacement = cross(omega, position);
      for (let component = 0; component < 3; component += 1) {
        vector[node * 6 + component] = displacement[component];
        vector[node * 6 + 3 + component] = omega[component];
      }
    }
    modes.push({ id: `rotation-${'xyz'[axis]}`, vector });
  }
  return modes;
}

function affineMembraneMode(nodes, { ex, ey, gxy, continuumRotation }) {
  const duDy = gxy / 2 - continuumRotation;
  const dvDx = gxy / 2 + continuumRotation;
  return nodes.flatMap(({ x, y }) => [
    ex * x + duDy * y,
    dvDx * x + ey * y,
    0,
    0,
    0,
    continuumRotation,
  ]);
}

function pressureSnapshot(nodes, pressure) {
  const plate = buildSlabPlateMitc4({
    id: 'P10-M9C-QUAL-PRESSURE',
    nodes,
    material,
    t: 0.2,
  });
  assert.equal(plate.ok, true);
  const load = buildSlabPressureLoad(plate, pressure);
  const normal = plate.frame.normal;
  const nodalForces = nodes.map((_, node) => load.slice(node * 6, node * 6 + 3));
  const nodalNormalForces = nodalForces.map((force) => dot(force, normal));
  const resultant = nodalForces.reduce(
    (sum, force) => sum.map((value, axis) => value + force[axis]),
    [0, 0, 0],
  );
  const momentAboutOrigin = nodalForces.reduce(
    (sum, force, node) => {
      const moment = cross(
        [coordinate(nodes[node], 0), coordinate(nodes[node], 1), coordinate(nodes[node], 2)],
        force,
      );
      return sum.map((value, axis) => value + moment[axis]);
    },
    [0, 0, 0],
  );
  return {
    nodalNormalForces,
    totalNormalForce: dot(resultant, normal),
    resultant,
    momentAboutOrigin,
  };
}

function normalizedQuadraticEnergy(matrix, vector) {
  const scale = matrixMaxAbs(matrix) * Math.max(1, dot(vector, vector));
  if (!(scale > 0)) return 0;
  return Math.abs(dot(vector, matrixVector(matrix, vector))) / scale;
}

function matrixVector(matrix, vector) {
  return matrix.map((row) => dot(row, vector));
}

function addMatrices(left, right) {
  return left.map((row, i) => row.map((value, j) => value + right[i][j]));
}

function matrixMaxAbs(matrix) {
  return Math.max(0, ...matrix.flat().map((value) => Math.abs(value)));
}

function vectorMaxAbs(vector) {
  return Math.max(0, ...vector.map((value) => Math.abs(value)));
}

function vectorRelativeError(actual, expected) {
  return vectorMaxAbs(actual.map((value, index) => value - expected[index]))
    / Math.max(1e-30, vectorMaxAbs(expected));
}

function relativeError(actual, expected) {
  return Math.abs(actual - expected) / Math.max(1e-30, Math.abs(expected));
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function coordinate(node, axis) {
  return Number(node[['x', 'y', 'z'][axis]] || 0);
}
