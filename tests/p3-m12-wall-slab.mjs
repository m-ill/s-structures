import assert from 'node:assert/strict';
import {
  WALL_SLAB_EQUIVALENT_VERSION,
  WALL_SLAB_TRACE_VERSION,
  SEMI_RIGID_DIAPHRAGM_VERSION,
  SHELL_QUAD4_VERSION,
  SHELL_FRAME_ASSEMBLY_VERSION,
  addWallMidPierToModel,
  analyzeModel,
  buildAgentManifest,
  buildSemiRigidRedistributionReport,
  buildQuad4ShellElement,
  buildShellV1Trace,
  buildWallSlabEquivalentTrace,
  createModel,
  estimateSimplySupportedPlateDeflection,
  expandShellsToFrameLinks,
  expandSemiRigidDiaphragms,
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
assert.ok(trace.contract.scope.includes('mid-pier-wall-equivalent'));
assert.ok(trace.contract.scope.includes('pier-force-recovery'));
assert.equal(trace.contract.solverTreatment.wall, 'mid-pier-equivalent-frame-member');
assert.equal(trace.contract.solverTreatment.shell, 'preliminary-edge-and-diagonal-frame-links');
assert.ok(trace.contract.limitations.includes('wall-opening-auto-decomposition-not-included'));
assert.equal(trace.summary.wallEquivalentCount, 1);
assert.equal(trace.summary.recoveredWallForceCount, 1);
assert.equal(trace.wallMidPier.count, 1);
assert.equal(trace.wallMidPier.rows[0].recoveryAvailable, true);
assert.equal(trace.wallMidPier.rows[0].sourceGeometry.thickness, 0.2);
assert.equal(trace.wallMidPier.rows[0].sourceGeometry.height, 3);
assert.ok(trace.wallMidPier.rows[0].section.A > 0);
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

const shellFrameModel = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, support: 'fixed' },
    { id: 'C', x: 0, y: 3, z: 0, support: 'fixed' },
    { id: 'D', x: 4, y: 3, z: 0 },
  ],
  members: [{ id: 'M1', n1: 'A', n2: 'D', matId: 'steel', secId: 'h300' }],
  shells: [{ id: 'S1', nodeIds: ['A', 'B', 'D', 'C'], thickness: 0.18, material: { E: 25000000, nu: 0.2 } }],
  loads: [{ id: 'PX', type: 'nodal', node: 'D', P: 20, dir: '+x', case: 'D' }],
});
const shellAssembly = expandShellsToFrameLinks(shellFrameModel);
assert.equal(shellAssembly.version, SHELL_FRAME_ASSEMBLY_VERSION);
assert.equal(shellAssembly.linkCount, 6);
const shellFrameResult = analyzeModel(shellFrameModel);
assert.equal(shellFrameResult.ok, true);
assert.equal(shellFrameResult.byCombo.CO1.shellFrameAssembly.linkCount, 6);
assert.equal(shellFrameResult.byCombo.CO1.memberResults[shellAssembly.members[0].id], undefined);
const shellFrameTrace = buildWallSlabEquivalentTrace(shellFrameModel, shellFrameResult);
assert.equal(shellFrameTrace.shell.assembly.version, SHELL_FRAME_ASSEMBLY_VERSION);
assert.equal(shellFrameTrace.summary.shellCount, 1);
assert.equal(shellFrameTrace.summary.shellLinkCount, 6);
assert.equal(shellFrameTrace.shell.assembly.rows[0].status, 'assembled-preliminary');
assert.equal(shellFrameTrace.shell.assembly.rows[0].materialId, 'steel');
assert.ok(shellFrameTrace.shell.assembly.rows[0].links.every((row) => row.targetAxialStiffness > 0));

const concreteShellFrameModel = createModel({
  ...shellFrameModel,
  shells: [{ ...shellFrameModel.shells[0], matId: 'concrete' }],
});
const concreteShellAssembly = expandShellsToFrameLinks(concreteShellFrameModel);
assert.equal(concreteShellAssembly.members[0].matId, 'concrete');
assert.ok(concreteShellAssembly.sections[0].A > shellAssembly.sections[0].A);
assert.equal(concreteShellAssembly.rows[0].materialId, 'concrete');

const summary = summarizeSemiRigidDiaphragm({
  nodes: [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 4, y: 0, z: 0 }],
  diaphragms: [{ id: 'D1', type: 'semiRigid', nodeIds: ['N1', 'N2'], inPlaneStiffness: 1000 }],
});
assert.equal(summary.semiRigidCount, 1);
assert.equal(summary.rows[0].solverTreatment, 'equivalent-truss-brace-grid');
assert.equal(summary.rows[0].generatedBraceCount, 1);

const diaModel = createModel({
  nodes: [{ id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' }, { id: 'N2', x: 4, y: 0, z: 0 }],
  diaphragms: [{ id: 'D1', type: 'semiRigid', nodeIds: ['N1', 'N2'], inPlaneStiffness: 1000 }],
});
assert.equal(validateModel(diaModel).ok, true);

const transferBase = {
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, support: 'fixed' },
    { id: 'C', x: 0, y: 0, z: 3 },
    { id: 'D', x: 4, y: 0, z: 3 },
  ],
  members: [
    { id: 'C1', n1: 'A', n2: 'C', matId: 'steel', secId: 'h300' },
    { id: 'C2', n1: 'B', n2: 'D', matId: 'steel', secId: 'h300' },
  ],
  loads: [{ id: 'PX', type: 'nodal', node: 'C', P: 30, dir: '+x', case: 'D' }],
};
const softDiaModel = createModel({ ...transferBase, diaphragms: [{ id: 'D-SOFT', type: 'semiRigid', nodeIds: ['C', 'D'], inPlaneStiffness: 100 }] });
const stiffDiaModel = createModel({ ...transferBase, diaphragms: [{ id: 'D-STIFF', type: 'semiRigid', nodeIds: ['C', 'D'], inPlaneStiffness: 100000 }] });
const softExpansion = expandSemiRigidDiaphragms(softDiaModel);
assert.equal(softExpansion.version, SEMI_RIGID_DIAPHRAGM_VERSION);
assert.equal(softExpansion.braceCount, 1);
assert.equal(softExpansion.rows[0].matId, 'steel');
const concreteDiaExpansion = expandSemiRigidDiaphragms(createModel({
  ...transferBase,
  diaphragms: [{ id: 'D-CONC', type: 'semiRigid', nodeIds: ['C', 'D'], inPlaneStiffness: 100, matId: 'concrete' }],
}));
assert.equal(concreteDiaExpansion.members[0].matId, 'concrete');
assert.ok(concreteDiaExpansion.sections[0].A > softExpansion.sections[0].A);
const softResult = analyzeModel(softDiaModel);
const stiffResult = analyzeModel(stiffDiaModel);
assert.equal(softResult.ok, true);
assert.equal(stiffResult.ok, true);
assert.equal(softResult.byCombo.CO1.memberResults[softExpansion.members[0].id], undefined);
assert.ok(stiffResult.byCombo.CO1.disp.D[0] > softResult.byCombo.CO1.disp.D[0]);
const softReport = buildSemiRigidRedistributionReport(softDiaModel, softResult);
const stiffReport = buildSemiRigidRedistributionReport(stiffDiaModel, stiffResult);
assert.equal(stiffReport.status, 'available');
assert.ok(stiffReport.combos[0].rows[0].uxSpread < softReport.combos[0].rows[0].uxSpread);
const slabTrace = buildWallSlabEquivalentTrace(stiffDiaModel, stiffResult);
assert.equal(slabTrace.slab.status, 'available');
assert.equal(slabTrace.summary.semiRigidDiaphragmCount, 1);
assert.equal(slabTrace.summary.slabRedistributionStatus, 'available');
assert.equal(slabTrace.contract.solverTreatment.diaphragm, 'equivalent-truss-brace-grid');
assert.equal(slabTrace.slab.redistribution.version, SEMI_RIGID_DIAPHRAGM_VERSION);

const badDia = createModel({
  nodes: diaModel.nodes,
  diaphragms: [{ id: 'D2', type: 'semiRigid', nodeIds: ['N1'], inPlaneStiffness: 0 }],
});
assert.equal(validateModel(badDia).ok, false);

console.log(JSON.stringify({ ok: true, version: 'p3-m12-wall-slab' }, null, 2));
