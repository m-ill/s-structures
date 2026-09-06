import assert from 'node:assert/strict';
import {
  addMutableSparseValue,
  createMutableSparseAccumulator,
  finalizeMutableSparseAccumulator,
} from '../src/compute/sparse/assembly.js';
import { cscToDense, denseToCsc } from '../src/compute/sparse/matrix.js';
import { analyzeComponent3D } from '../src/solver/linear3dAssembly.js';
import {
  buildUnsupportedRotationFloorPlan,
  stabilizeUnsupportedRotationSystem,
} from '../src/solver/shell/unsupportedRotationFloor.js';
import { buildWallMembraneQm6 } from '../src/solver/shell/wallMembraneQm6.js';

const accumulator = createMutableSparseAccumulator(2, 2);
addMutableSparseValue(accumulator, 0, 0, 4);
addMutableSparseValue(accumulator, 0, 1, -1);
addMutableSparseValue(accumulator, 1, 0, -1);
addMutableSparseValue(accumulator, 1, 1, 3);
addMutableSparseValue(accumulator, 1, 1, 2);
addMutableSparseValue(accumulator, 1, 1, -2);
const accumulated = finalizeMutableSparseAccumulator(accumulator);
assert.deepEqual(cscToDense(accumulated), [[4, -1], [-1, 3]]);
assert.equal(accumulated.accumulator.finalized, true);
assert.throws(
  () => addMutableSparseValue(accumulator, 0, 0, 1),
  (error) => error.code === 'SPARSE_MUTABLE_ACCUMULATOR_INVALID',
);

const nodes = [
  { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
  { id: 'N2', x: 1, y: 0, z: 0 },
];
const fixedDofs = new Set([0, 1, 2, 3, 4, 5]);
const floorFixture = Array.from({ length: 12 }, (_row, row) => (
  Array.from({ length: 12 }, (_column, column) => row === column ? 10 : 0)
));
floorFixture[10][10] = 0;
const densePlan = buildUnsupportedRotationFloorPlan({ matrix: floorFixture, nodes, fixedDofs, requestedRatio: 1e-9 });
const cscPlan = buildUnsupportedRotationFloorPlan({ matrix: denseToCsc(floorFixture), nodes, fixedDofs, requestedRatio: 1e-9 });
assert.equal(densePlan.canonicalPlanHash, cscPlan.canonicalPlanHash);
assert.deepEqual(densePlan.affectedDofs, [10]);
const denseApplied = stabilizeUnsupportedRotationSystem(floorFixture.map((row) => [...row]), nodes, fixedDofs, 1e-9);
const cscApplied = stabilizeUnsupportedRotationSystem(denseToCsc(floorFixture), nodes, fixedDofs, 1e-9);
assert.equal(denseApplied.audit.canonicalPlanHash, cscApplied.audit.canonicalPlanHash);
assert.deepEqual(cscToDense(cscApplied.matrix), denseApplied.matrix);

const shellNodes = [
  { id: 'S1', x: 0, y: 0, z: 0, support: 'fixed' },
  { id: 'S2', x: 2, y: 0, z: 0, support: 'fixed' },
  { id: 'S3', x: 2, y: 0, z: 2 },
  { id: 'S4', x: 0, y: 0, z: 2 },
];
const material = { id: 'C30', E: 30e9, G: 12.5e9, nu: 0.2, density: 2400 };
const built = buildWallMembraneQm6({
  id: 'W1',
  nodes: shellNodes,
  material,
  thickness: 0.2,
});
assert.equal(built.ok, true, built.reason);
const shell = {
  id: 'W1',
  formulation: 'membrane',
  built,
  dof: shellNodes.flatMap((_node, index) => Array.from({ length: 6 }, (_item, component) => index * 6 + component)),
};
const loads = [
  { type: 'nodal', node: 'S3', P: 1e5, dir: '+x' },
  { type: 'nodal', node: 'S4', P: 1e5, dir: '+x' },
];
const denseResult = analyzeComponent3D(shellNodes, [], loads, {
  shells: [{ id: shell.id, nodeIds: shellNodes.map((node) => node.id), formulation: 'membrane', material, thickness: 0.2 }],
  mat: () => material,
  sec: () => ({ A: 1e-12, Iy: 1e-12, Iz: 1e-12, J: 1e-12 }),
  solver: 'dense',
});
const sparseResult = analyzeComponent3D(shellNodes, [], loads, {
  shells: [{ id: shell.id, nodeIds: shellNodes.map((node) => node.id), formulation: 'membrane', material, thickness: 0.2 }],
  mat: () => material,
  sec: () => ({ A: 1e-12, Iy: 1e-12, Iz: 1e-12, J: 1e-12 }),
  solver: 'sparse',
  sparseThreshold: 1,
});
assert.equal(denseResult.ok, true, denseResult.reason || JSON.stringify(denseResult.solver));
assert.equal(sparseResult.ok, true, sparseResult.reason || JSON.stringify(sparseResult.solver));
assert.equal(
  denseResult.solver.rotationStabilization.canonicalPlanHash,
  sparseResult.solver.rotationStabilization.canonicalPlanHash,
);
for (const node of shellNodes) closeVector(denseResult.disp[node.id], sparseResult.disp[node.id], 1e-9, node.id);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P15-M8',
  verificationIds: ['P15-ARCH-03', 'P15-STAB-07', 'P15-NUM-06'],
  mutableAccumulatorPeakEntries: accumulated.accumulator.peakEntries,
  floorPlanHash: densePlan.canonicalPlanHash,
  productionPlanHash: denseResult.solver.rotationStabilization.canonicalPlanHash,
  sparseMethod: sparseResult.solver.sparse.method,
}, null, 2));

function closeVector(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label} length`);
  actual.forEach((value, index) => {
    const scale = Math.max(1, Math.abs(value), Math.abs(expected[index]));
    assert.ok(Math.abs(value - expected[index]) / scale <= tolerance, `${label}[${index}] ${value} vs ${expected[index]}`);
  });
}
