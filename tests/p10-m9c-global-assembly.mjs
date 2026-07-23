import assert from 'node:assert/strict';
import {
  analyzeComponent3D,
  analyzeModel,
  assembleStiffness3D,
  buildLumpedMass,
  createModel,
  expandShellsToFrameLinks,
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
const shearError = Math.abs(solved.shellResults.S1.wallShear - applied) / applied;
assert.ok(shearError < 1e-10, `shared 6DOF shell equilibrium ${shearError}`);

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

const plateProduct = analyzeModel(createModel({
  nodes: [
    { id: 'P1', x: 0, y: 0, z: 0, support: 'custom', fix: [true, true, true, false, false, true] },
    { id: 'P2', x: 2, y: 0, z: 0, support: 'custom', fix: [true, true, true, false, false, true] },
    { id: 'P3', x: 2, y: 2, z: 0, support: 'custom', fix: [true, true, true, false, false, true] },
    { id: 'P4', x: 0, y: 2, z: 0, support: 'custom', fix: [true, true, true, false, false, true] },
  ],
  members: [],
  shells: [{ id: 'PLATE-1', nodeIds: ['P1', 'P2', 'P3', 'P4'], formulation: 'plate', matId: 'concrete', thickness: 0.2 }],
  loads: [{ id: 'QP', type: 'shellPressure', shell: 'PLATE-1', q: 1e3, case: 'D' }],
  loadCases: [{ id: 'D', type: 'dead' }],
  loadCombinations: [{ id: 'PC', type: 'strength', factors: { D: 1 } }],
}));
assert.equal(plateProduct.byCombo.PC.shellFem.qualificationStatus, 'qualified');
assert.equal(plateProduct.byCombo.PC.shellFem.designTransferAllowed, true);
assert.deepEqual(plateProduct.byCombo.PC.shellFem.blockers, []);
assert.equal(plateProduct.shellFemQualification.status, 'qualified');
assert.equal(plateProduct.shellFemQualification.designTransferAllowed, true);
assert.equal(plateProduct.byCombo.PC.shellResults['PLATE-1'].designEligibility.allowed, true);
assert.equal(plateProduct.designEligibility.eligible, false);
assert.equal(plateProduct.designEligibility.reason, 'STATIC_COMBINATIONS_INCOMPLETE');

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
assert.ok(equivalent.warnings.length > 0);

export const M9_GLOBAL_SNAPSHOT = Object.freeze({ version: 'p10-m9c-global-assembly-v1', displacement: solved.disp.N3[0], shearError, femElementCount: assembly.femElementCount, equivalentLinkCount: equivalent.linkCount, productRouteShellCount: Object.keys(product.byCombo.C.shellResults).length, modalDirectionalMass: expectedDirectionalMass });
console.log(JSON.stringify({ ok: true, ...M9_GLOBAL_SNAPSHOT }, null, 2));
