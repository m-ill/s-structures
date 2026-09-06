import assert from 'node:assert/strict';
import {
  analyzeComponent3D,
  analyzeModel,
  assembleStiffness3D,
  buildLumpedMass,
  createModel,
  expandShellsToFrameLinks,
  runAnalysisCase,
} from '../src/index.js';

const nodes = [
  { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
  { id: 'N2', x: 2, y: 0, z: 0, support: 'fixed' },
  { id: 'N3', x: 2, y: 0, z: 2 },
  { id: 'N4', x: 0, y: 0, z: 2 },
];
const material = { id: 'C30', E: 30e9, G: 12.5e9, nu: 0.2, density: 2400 };
const shell = { id: 'S1', nodeIds: nodes.map((node) => node.id), formulation: 'membrane', matId: material.id, thickness: 0.2 };
const assembly = expandShellsToFrameLinks({ nodes, materials: [material], shells: [shell] });
assert.equal(assembly.femElementCount, 1);
assert.equal(assembly.linkCount, 0);
assert.equal(assembly.equivalentShellScope.active, false);
assert.ok(assembly.members.every((member) => member.source === 'shellFemConnectivity'));
assert.deepEqual(assembly.warnings, []);

const loads = [
  { type: 'nodal', node: 'N3', P: 1e5, dir: '+x' },
  { type: 'nodal', node: 'N4', P: 1e5, dir: '+x' },
];
const solved = analyzeComponent3D(nodes, assembly.members, loads, {
  shells: assembly.femElements,
  mat: () => material,
  sec: () => ({ A: 1e-12, Iy: 1e-12, Iz: 1e-12, J: 1e-12 }),
  criteriaModel: {},
});
assert.equal(solved.ok, true);
assert.equal(solved.solver.shellFem.elementCount, 1);
assert.equal(solved.shellResults.S1.formulation, 'membrane');
const applied = 2e5;
const reactionShearError = Math.abs(
  Object.values(solved.reactions).reduce((sum, reaction) => sum + reaction.rx, 0) + applied,
) / applied;
assert.ok(reactionShearError < 1e-10, `shared 6DOF shell reaction equilibrium ${reactionShearError}`);
const shearError = Math.abs(solved.shellResults.S1.wallShear - applied) / applied;
// Resultants are recovered from the condensed membrane field at the element
// center; the curl-compatible drilling penalty perturbs this local recovery at
// O(drillingAlpha) while global reaction equilibrium remains exact.
assert.ok(shearError < 1e-5, `shared 6DOF shell recovered shear ${shearError}`);

const product = analyzeModel(createModel({
  nodes,
  members: [],
  shells: [{ ...shell, matId: 'concrete' }],
  loads: loads.map((load, index) => ({ ...load, id: `P${index + 1}`, case: 'D' })),
  loadCases: [{ id: 'D', type: 'dead' }],
  loadCombinations: [{ id: 'C', type: 'strength', factors: { D: 1 } }],
}));
assert.equal(product.ok, true);
assert.equal(product.byCombo.C.shellResults.S1.formulation, 'membrane');

const plateModel = createModel({
  nodes: [
    { id: 'P1', x: 0, y: 0, z: 0, support: 'custom', fix: [true, true, true, false, false, true] },
    { id: 'P2', x: 2, y: 0, z: 0, support: 'custom', fix: [true, true, true, false, false, true] },
    { id: 'P3', x: 2, y: 2, z: 0, support: 'custom', fix: [true, true, true, false, false, true] },
    { id: 'P4', x: 0, y: 2, z: 0, support: 'custom', fix: [true, true, true, false, false, true] },
  ],
  members: [],
  shells: [{ id: 'PLATE-1', nodeIds: ['P1', 'P2', 'P3', 'P4'], formulation: 'plate', matId: 'concrete', thickness: 0.1 }],
  loads: [{ id: 'QP', type: 'shellPressure', shell: 'PLATE-1', q: 1e3, case: 'D' }],
  loadCases: [{ id: 'D', type: 'dead' }],
  loadCombinations: [{ id: 'PC', type: 'strength', factors: { D: 1 } }],
});
const plateProduct = analyzeModel(plateModel);
assert.equal(plateProduct.ok, true);
assert.equal(plateProduct.combinationCompleteness.allComplete, true);
assert.equal(plateProduct.byCombo.PC.summary.equilibriumStatus, 'PASS');
assert.ok(plateProduct.byCombo.PC.summary.equilibriumResidual < 1e-12);
assert.equal(plateProduct.byCombo.PC.shellFem.qualificationStatus, 'blocked');
assert.equal(plateProduct.byCombo.PC.shellFem.designTransferAllowed, false);
assert.deepEqual(plateProduct.byCombo.PC.shellFem.blockers, ['SHELL_MODEL_MESH_CONVERGENCE_REQUIRED']);
assert.equal(plateProduct.shellFemQualification.status, 'blocked');
assert.equal(plateProduct.shellFemQualification.designTransferAllowed, false);
assert.equal(plateProduct.byCombo.PC.shellResults['PLATE-1'].designEligibility.allowed, false);
assert.equal(plateProduct.designEligibility.eligible, false);
assert.equal(plateProduct.designEligibility.reason, 'SHELL_MODEL_MESH_CONVERGENCE_REQUIRED');

const routedStatic = runAnalysisCase(plateModel, {
  id: 'P10-M9C-SHELL-STATIC',
  kind: 'static',
  settings: { comboId: 'PC' },
});
assert.equal(routedStatic.ok, true);
assert.equal(routedStatic.status, 'review-required');
assert.equal(routedStatic.qualification, 'blocked');
assert.equal(routedStatic.designBlocked, true);
assert.equal(routedStatic.designBlockReason, 'SHELL_MODEL_MESH_CONVERGENCE_REQUIRED');
assert.equal(routedStatic.summary.ok, false);
assert.equal(routedStatic.summary.shellFemQualification.designTransferAllowed, false);

const modalSystem = assembleStiffness3D(nodes, assembly.members, {
  model: { nodes, members: assembly.members },
  shells: assembly.femElements,
  mat: () => material,
  sec: () => ({ A: 1e-12, Iy: 1e-12, Iz: 1e-12, J: 1e-12 }),
});
assert.equal(modalSystem.ok, true);
const modalMass = buildLumpedMass({ nodes, members: assembly.members }, modalSystem);
const expectedDirectionalMass = material.density * shell.thickness * 4;
assert.ok(Math.abs(modalMass.filter((_, dof) => dof % 6 === 0).reduce((sum, value) => sum + value, 0) - expectedDirectionalMass) < 1e-9);

const equivalent = expandShellsToFrameLinks({ nodes, materials: [material], shells: [{ ...shell, formulation: 'equivalent' }] });
assert.equal(equivalent.femElementCount, 0);
assert.equal(equivalent.linkCount, 6);
assert.equal(equivalent.equivalentShellScope.active, true);
assert.ok(equivalent.warnings.length > 0);

export const M9_GLOBAL_SNAPSHOT = Object.freeze({ version: 'p10-m9c-global-assembly-v2-drilling-qualified', displacement: solved.disp.N3[0], reactionShearError, shearError, femElementCount: assembly.femElementCount, equivalentLinkCount: equivalent.linkCount, productRouteShellCount: Object.keys(product.byCombo.C.shellResults).length, modalDirectionalMass: expectedDirectionalMass });
console.log(JSON.stringify({ ok: true, ...M9_GLOBAL_SNAPSHOT }, null, 2));
