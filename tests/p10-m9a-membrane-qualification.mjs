import assert from 'node:assert/strict';
import { buildWallMembraneQm6 } from '../src/index.js';

const STRAIN = Object.freeze({ ex: 1e-3, ey: 4e-4, gxy: 2e-4 });
const CENTER_NODE = 4;
const ELEMENTS = Object.freeze([
  Object.freeze([0, 1, 4, 3]),
  Object.freeze([1, 2, 5, 4]),
  Object.freeze([3, 4, 7, 6]),
  Object.freeze([4, 5, 8, 7]),
]);
const CASES = Object.freeze([
  Object.freeze({ id: 'regular', center: Object.freeze([2, 1]) }),
  Object.freeze({ id: 'distorted-2p2-0p9', center: Object.freeze([2.2, 0.9]) }),
  Object.freeze({ id: 'distorted-2p4-0p7', center: Object.freeze([2.4, 0.7]) }),
  Object.freeze({ id: 'distorted-1p3-1p4', center: Object.freeze([1.3, 1.4]) }),
]);

const CENTER_DISPLACEMENT_RELATIVE_TOLERANCE = 1e-8;
const AFFINE_FREE_RESIDUAL_RELATIVE_TOLERANCE = 1e-10;

const cases = CASES.map(runPatchCase);
const regular = cases.find((entry) => entry.id === 'regular');
const distorted = cases.filter((entry) => entry.id !== 'regular');

assert.equal(regular.pass, true, `regular patch failed: ${JSON.stringify(regular)}`);
assert.ok(
  distorted.every((entry) => entry.pass),
  `distorted patches failed qualification: ${JSON.stringify(distorted)}`,
);

const failedCaseIds = cases.filter((entry) => !entry.pass).map((entry) => entry.id);
const qualification = Object.freeze({
  status: failedCaseIds.length === 0 ? 'PASS' : 'BLOCKED',
  reason: failedCaseIds.length === 0 ? null : 'SHELL_MEMBRANE_DISTORTED_PATCH_QUALIFICATION_FAILED',
  failedCaseIds: Object.freeze(failedCaseIds),
  centerDisplacementRelativeTolerance: CENTER_DISPLACEMENT_RELATIVE_TOLERANCE,
  affineFreeResidualRelativeTolerance: AFFINE_FREE_RESIDUAL_RELATIVE_TOLERANCE,
});

assert.equal(qualification.status, 'PASS');
assert.deepEqual(qualification.failedCaseIds, []);

const cornerInverted = buildWallMembraneQm6({
  nodes: [
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
    { x: 0.5, y: 0.5, z: 0 },
    { x: 0, y: 2, z: 0 },
  ],
  material: { E: 30e9, nu: 0.2 },
  thickness: 0.2,
});
assert.equal(cornerInverted.ok, false);
assert.equal(cornerInverted.reason, 'SHELL_CORNER_JACOBIAN_NONPOSITIVE');

export const M9A_MEMBRANE_QUALIFICATION_SNAPSHOT = Object.freeze({
  version: 'p10-m9a-membrane-qualification-v2-qm6-eas',
  benchmark: 'qm6-affine-constant-strain-3x3-four-quad-patch',
  sourceElementMatrixSize: 24,
  assembledActiveMatrixSize: 18,
  strain: STRAIN,
  cases: Object.freeze(cases),
  qualification,
});

console.log(JSON.stringify({ ok: true, ...M9A_MEMBRANE_QUALIFICATION_SNAPSHOT }, null, 2));

function runPatchCase(definition) {
  const nodes = patchNodes(definition.center);
  const activeDofCount = nodes.length * 2;
  const stiffness = zeros(activeDofCount, activeDofCount);

  for (const [elementIndex, connectivity] of ELEMENTS.entries()) {
    const element = buildWallMembraneQm6({
      id: `${definition.id}-Q${elementIndex + 1}`,
      nodes: connectivity.map((nodeIndex) => nodes[nodeIndex]),
      material: { E: 30e9, nu: 0.2 },
      thickness: 0.2,
    });
    assert.equal(element.ok, true, `${definition.id} element ${elementIndex + 1}: ${element.reason}`);
    assert.equal(element.matrix.length, 24);

    // Each source matrix is the element-global 24x24 shell matrix. For this XY
    // patch, its local-plane translations are the global ux/uy entries 6n+0/1.
    for (let localNodeA = 0; localNodeA < 4; localNodeA += 1) {
      for (let localAxisA = 0; localAxisA < 2; localAxisA += 1) {
        const globalA = connectivity[localNodeA] * 2 + localAxisA;
        const elementA = localNodeA * 6 + localAxisA;
        for (let localNodeB = 0; localNodeB < 4; localNodeB += 1) {
          for (let localAxisB = 0; localAxisB < 2; localAxisB += 1) {
            const globalB = connectivity[localNodeB] * 2 + localAxisB;
            const elementB = localNodeB * 6 + localAxisB;
            stiffness[globalA][globalB] += element.matrix[elementA][elementB];
          }
        }
      }
    }
  }

  const displacement = nodes.flatMap(affineDisplacement);
  const freeDofs = [CENTER_NODE * 2, CENTER_NODE * 2 + 1];
  const prescribedDofs = Array.from({ length: activeDofCount }, (_, index) => index)
    .filter((index) => !freeDofs.includes(index));
  const stiffnessScale = Math.max(...stiffness.map((row) => row.reduce(
    (sum, value) => sum + Math.abs(value),
    0,
  )));
  const displacementScale = Math.max(...displacement.map(Math.abs));
  const affineFreeResidual = freeDofs.map((row) => stiffness[row].reduce(
    (sum, value, column) => sum + value * displacement[column],
    0,
  ));
  const affineFreeResidualRelativeError = Math.max(...affineFreeResidual.map(Math.abs))
    / Math.max(1e-30, stiffnessScale * displacementScale);
  const rhs = freeDofs.map((row) => -prescribedDofs.reduce(
    (sum, column) => sum + stiffness[row][column] * displacement[column],
    0,
  ));
  const solvedCenter = solve2x2(
    freeDofs.map((row) => freeDofs.map((column) => stiffness[row][column])),
    rhs,
  );
  displacement[freeDofs[0]] = solvedCenter[0];
  displacement[freeDofs[1]] = solvedCenter[1];

  const exactCenter = affineDisplacement(nodes[CENTER_NODE]);
  const centerDisplacementRelativeError = Math.hypot(
    solvedCenter[0] - exactCenter[0],
    solvedCenter[1] - exactCenter[1],
  ) / Math.max(1e-30, Math.hypot(...exactCenter));
  const freeResidual = freeDofs.map((row) => stiffness[row].reduce(
    (sum, value, column) => sum + value * displacement[column],
    0,
  ));
  const freeResidualRelativeError = Math.max(...freeResidual.map(Math.abs))
    / Math.max(1e-30, stiffnessScale * Math.max(...displacement.map(Math.abs)));
  const pass = centerDisplacementRelativeError <= CENTER_DISPLACEMENT_RELATIVE_TOLERANCE
    && affineFreeResidualRelativeError <= AFFINE_FREE_RESIDUAL_RELATIVE_TOLERANCE;

  return Object.freeze({
    id: definition.id,
    center: Object.freeze([...definition.center]),
    solvedCenter: Object.freeze(solvedCenter),
    exactCenter: Object.freeze(exactCenter),
    centerDisplacementRelativeError,
    affineFreeResidualRelativeError,
    freeResidualRelativeError,
    pass,
  });
}

function patchNodes(center) {
  return [
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: center[0], y: center[1], z: 0 },
    { x: 4, y: 1, z: 0 },
    { x: 0, y: 2, z: 0 },
    { x: 2, y: 2, z: 0 },
    { x: 4, y: 2, z: 0 },
  ];
}

function affineDisplacement(node) {
  return [
    STRAIN.ex * node.x + STRAIN.gxy * node.y / 2,
    STRAIN.ey * node.y + STRAIN.gxy * node.x / 2,
  ];
}

function solve2x2(matrix, rhs) {
  const determinant = matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
  assert.ok(Math.abs(determinant) > 1e-20, 'patch center stiffness is singular');
  return [
    (rhs[0] * matrix[1][1] - matrix[0][1] * rhs[1]) / determinant,
    (matrix[0][0] * rhs[1] - rhs[0] * matrix[1][0]) / determinant,
  ];
}

function zeros(rows, columns) {
  return Array.from({ length: rows }, () => new Array(columns).fill(0));
}
