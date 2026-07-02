import assert from 'node:assert/strict';
import {
  WALL_SLAB_EQUIVALENT_VERSION,
  WALL_SLAB_TRACE_VERSION,
  SHELL_QUAD4_VERSION,
  addWallMidPierToModel,
  analyzeModel,
  buildAgentManifest,
  buildQuad4ShellElement,
  buildShellV1Trace,
  buildWallSlabEquivalentTrace,
  createModel,
  estimateSimplySupportedPlateDeflection,
  recoverWallPierForces,
  runShellPatchTest,
  summarizeSemiRigidDiaphragm,
  validateModel,
  wallToMidPierMember,
} from '../src/index.js';

const wall = wallToMidPierMember({
  id: 'W1',
  thickness: 0.2,
  length: 4,
  nodes: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 3 }, { x: 0, y: 0, z: 3 }],
});
assert.equal(wall.version, WALL_SLAB_EQUIVALENT_VERSION);
assert.equal(wall.nodes.length, 2);
assert.ok(wall.section.A > 0 && wall.section.Iz > wall.section.Iy);

const wallModel = addWallMidPierToModel(createModel({
  loads: [{ id: 'P1', type: 'nodal', node: 'W1-t', P: 100, dir: '+x', case: 'D' }],
}), { id: 'W1', thickness: 0.2, length: 4, baseSupport: 'fixed', nodes: wall.nodes });
const wallAnalysis = analyzeModel(wallModel);
assert.equal(wallAnalysis.ok, true, JSON.stringify(wallAnalysis.validation.errors, null, 2));
const pierForces = recoverWallPierForces(wallModel, wallAnalysis);
assert.equal(pierForces.length, 1);
assert.ok(pierForces[0].Mz > 0 || pierForces[0].My > 0);
const trace = buildWallSlabEquivalentTrace(wallModel, wallAnalysis);
assert.equal(trace.version, WALL_SLAB_TRACE_VERSION);
assert.equal(trace.wallMidPier.count, 1);
assert.equal(trace.wallMidPier.rows[0].recoveryAvailable, true);
assert.equal(trace.shell.status, 'available-preliminary');
assert.equal(trace.shell.version, SHELL_QUAD4_VERSION);
assert.equal(trace.shell.benchmarks.patch.ok, true);
assert.equal(trace.shell.benchmarks.plate.ok, true);
assert.ok(buildAgentManifest().dataContracts.includes('phase3WallSlabTrace'));
assert.ok(buildAgentManifest().dataContracts.includes('phase3ShellQuad4Trace'));

const shell = buildQuad4ShellElement({
  id: 'SQ1',
  thickness: 0.18,
  material: { E: 25000000, nu: 0.2 },
  nodes: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 3, z: 0 }, { x: 0, y: 3, z: 0 }],
});
assert.equal(shell.matrixSize, 24);
assert.equal(shell.dofPerNode, 6);
assert.ok(shell.stiffness.membrane > shell.stiffness.bending);
const patch = runShellPatchTest({ element: shell });
assert.equal(patch.ok, true);
assert.ok(patch.stress.sx > patch.stress.sy);
const plate = estimateSimplySupportedPlateDeflection({ a: 4, b: 4, q: 6, element: shell });
assert.equal(plate.ok, true);
assert.ok(plate.wMax > 0);
const shellTrace = buildShellV1Trace({ shells: [shell] });
assert.equal(shellTrace.shellCount, 1);

const summary = summarizeSemiRigidDiaphragm({ diaphragms: [{ id: 'D1', type: 'semiRigid', nodeIds: ['N1', 'N2'], inPlaneStiffness: 1000 }] });
assert.equal(summary.semiRigidCount, 1);
assert.equal(summary.rows[0].solverTreatment, 'not-condensed-trace-only');

const diaModel = createModel({
  nodes: [{ id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' }, { id: 'N2', x: 4, y: 0, z: 0 }],
  diaphragms: [{ id: 'D1', type: 'semiRigid', nodeIds: ['N1', 'N2'], inPlaneStiffness: 1000 }],
});
assert.equal(validateModel(diaModel).ok, true);

const badDia = createModel({
  nodes: diaModel.nodes,
  diaphragms: [{ id: 'D2', type: 'semiRigid', nodeIds: ['N1'], inPlaneStiffness: 0 }],
});
assert.equal(validateModel(badDia).ok, false);

console.log(JSON.stringify({ ok: true, version: 'p3-m12-wall-slab' }, null, 2));
