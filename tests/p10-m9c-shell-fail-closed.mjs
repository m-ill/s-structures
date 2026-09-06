import assert from 'node:assert/strict';
import {
  analyzeComponent3D,
  analyzeModel,
  createModel,
  expandShellsToFrameLinks,
  validateModel,
} from '../src/index.js';

const material = { id: 'C30', E: 30e9, G: 12.5e9, nu: 0.2, density: 2400 };
const nodes = [
  { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
  { id: 'N2', x: 2, y: 0, z: 0, support: 'fixed' },
  { id: 'N3', x: 2, y: 0, z: 2 },
  { id: 'N4', x: 0, y: 0, z: 2 },
];
const shell = {
  id: 'S1',
  nodeIds: nodes.map((node) => node.id),
  formulation: 'membrane',
  matId: material.id,
  thickness: 0.2,
};

const merged = expandShellsToFrameLinks({
  nodes,
  materials: [material],
  shells: [shell],
  slabs: [{ ...shell, id: 'S2', type: 'shell', formulation: 'plate' }],
});
assert.equal(merged.ok, true);
assert.equal(merged.shellCount, 2);
assert.equal(merged.femElementCount, 2);

const missingId = expandShellsToFrameLinks({
  nodes,
  materials: [material],
  shells: [{ ...shell, id: undefined }],
});
assert.equal(missingId.ok, false);
assert.equal(missingId.reason, 'SHELL_ID_REQUIRED');

const duplicateId = expandShellsToFrameLinks({
  nodes,
  materials: [material],
  shells: [shell, { ...shell }],
});
assert.equal(duplicateId.ok, false);
assert.equal(duplicateId.reason, 'SHELL_ID_DUPLICATE');
assert.equal(duplicateId.femElementCount, 1);

const duplicateNodes = expandShellsToFrameLinks({
  nodes,
  materials: [material],
  shells: [{ ...shell, nodeIds: ['N1', 'N2', 'N3', 'N3'] }],
});
assert.equal(duplicateNodes.reason, 'SHELL_NODE_IDS_DUPLICATE');

const invalidEquivalentThickness = expandShellsToFrameLinks({
  nodes,
  materials: [material],
  shells: [{ ...shell, formulation: 'equivalent', thickness: 0 }],
});
assert.equal(invalidEquivalentThickness.ok, false);
assert.equal(invalidEquivalentThickness.reason, 'SHELL_THICKNESS_INVALID');
assert.equal(invalidEquivalentThickness.linkCount, 0);

const equivalentProduct = analyzeModel(createModel({
  nodes,
  members: [],
  shells: [{ ...shell, formulation: 'equivalent', matId: 'concrete' }],
  loads: [{ id: 'PEQ', type: 'nodal', node: 'N3', P: 1e3, dir: '+x', case: 'D' }],
  loadCases: [{ id: 'D', type: 'dead' }],
  loadCombinations: [{ id: 'C', type: 'strength', factors: { D: 1 } }],
  analysisSettings: { responseSpectrum: { enabled: false } },
}));
assert.equal(equivalentProduct.shellFemQualification.designTransferAllowed, false);
assert.ok(equivalentProduct.shellFemQualification.blockers.includes('EQUIVALENT_SHELL_PRELIMINARY_ONLY'));
assert.equal(equivalentProduct.designEligibility.eligible, false);
assert.equal(equivalentProduct.designEligibility.reason, 'EQUIVALENT_SHELL_PRELIMINARY_ONLY');

const collinearNodes = nodes.map((node, index) => ({ ...node, x: index, y: 0, z: 0 }));
const degenerateEquivalent = expandShellsToFrameLinks({
  nodes: collinearNodes,
  materials: [material],
  shells: [{ ...shell, nodeIds: collinearNodes.map((node) => node.id), formulation: 'equivalent' }],
});
assert.equal(degenerateEquivalent.ok, false);
assert.equal(degenerateEquivalent.reason, 'SHELL_DEGENERATE_GEOMETRY');
assert.equal(degenerateEquivalent.linkCount, 0);

const prototypeAssembly = expandShellsToFrameLinks({
  nodes,
  materials: [material],
  shells: [{ ...shell, id: '__proto__' }],
});
const prototypeSolved = analyzeComponent3D(nodes, prototypeAssembly.members, [
  { id: 'P1', type: 'nodal', node: 'N3', P: 1e3, dir: '+x' },
], {
  shells: prototypeAssembly.femElements,
  mat: () => material,
  sec: () => ({ A: 1e-12, Iy: 1e-12, Iz: 1e-12, J: 1e-12 }),
  criteriaModel: {},
});
assert.equal(prototypeSolved.ok, true);
assert.equal(Object.hasOwn(prototypeSolved.shellResults, '__proto__'), true);
assert.equal(prototypeSolved.solver.shellFem.elementCount, 1);

const duplicateProduct = analyzeModel(createModel({
  nodes,
  members: [],
  shells: [{ ...shell, matId: 'concrete' }, { ...shell, matId: 'concrete' }],
  loads: [{ id: 'P1', type: 'nodal', node: 'N3', P: 1e3, dir: '+x', case: 'D' }],
  loadCases: [{ id: 'D', type: 'dead' }],
  loadCombinations: [{ id: 'C', type: 'strength', factors: { D: 1 } }],
  analysisSettings: { validateBeforeSolve: false, responseSpectrum: { enabled: false } },
}));
assert.equal(duplicateProduct.ok, false);
assert.equal(duplicateProduct.shellFemQualification.status, 'blocked');
assert.ok(duplicateProduct.shellFemQualification.blockers.includes('SHELL_ID_DUPLICATE'));
assert.ok(duplicateProduct.shellFemQualification.blockers.includes('SHELL_RESULTS_INCOMPLETE'));

const strictCriteriaProduct = analyzeModel(createModel({
  nodes,
  members: [],
  shells: [{ ...shell, matId: 'concrete' }],
  loads: [{ id: 'PCRIT', type: 'nodal', node: 'N3', P: 1e3, dir: '+x', case: 'D' }],
  loadCases: [{ id: 'D', type: 'dead' }],
  loadCombinations: [{ id: 'C', type: 'strength', factors: { D: 1 } }],
  analysisCriteria: { criteria: { shell: { drillingStiffnessRatioMax: 1e-10 } } },
  analysisSettings: { responseSpectrum: { enabled: false } },
}));
assert.ok(
  strictCriteriaProduct.shellFemQualification.blockers.includes('SHELL_DRILLING_STIFFNESS_RATIO_EXCEEDED'),
  JSON.stringify(strictCriteriaProduct.shellFemQualification.blockers),
);

const plateNodes = [
  { id: 'P1', x: 0, y: 0, z: 0, support: 'fixed' },
  { id: 'P2', x: 2, y: 0, z: 0, support: 'fixed' },
  { id: 'P3', x: 2, y: 2, z: 0, support: 'fixed' },
  { id: 'P4', x: 0, y: 2, z: 0, support: 'fixed' },
];
const plate = { id: 'PLATE', type: 'shell', nodeIds: plateNodes.map((node) => node.id), formulation: 'plate', matId: 'concrete', thickness: 0.1 };
const missingTargetModel = createModel({
  nodes: plateNodes,
  members: [],
  slabs: [plate],
  loads: [{ id: 'Q1', type: 'shellPressure', shell: 'TYPO', q: 1e3, case: 'D' }],
  loadCases: [{ id: 'D', type: 'dead' }],
  loadCombinations: [{ id: 'C', type: 'strength', factors: { D: 1 } }],
  analysisSettings: { responseSpectrum: { enabled: false } },
});
assert.ok(validateModel(missingTargetModel).errors.some((error) => error.code === 'BAD_LOAD_SHELL_REF'));
const missingTargetProduct = analyzeModel({
  ...missingTargetModel,
  analysisSettings: { ...missingTargetModel.analysisSettings, validateBeforeSolve: false },
});
assert.equal(missingTargetProduct.ok, false);
assert.ok(missingTargetProduct.shellFemQualification.blockers.includes('SHELL_PRESSURE_TARGET_INVALID'));

const conflictingTargetModel = createModel({
  nodes: plateNodes,
  members: [],
  shells: [plate],
  loads: [{ id: 'Q-CONFLICT-TARGET', type: 'shellPressure', shell: 'PLATE', panel: 'TYPO', q: 1e3, case: 'D' }],
  loadCases: [{ id: 'D', type: 'dead' }],
  loadCombinations: [{ id: 'C', type: 'strength', factors: { D: 1 } }],
});
assert.ok(validateModel(conflictingTargetModel).errors.some((error) => error.code === 'BAD_LOAD_SHELL_TARGET'));
const conflictingTargetProduct = analyzeModel({
  ...conflictingTargetModel,
  analysisSettings: { ...conflictingTargetModel.analysisSettings, validateBeforeSolve: false },
});
assert.equal(conflictingTargetProduct.ok, false);
assert.ok(conflictingTargetProduct.shellFemQualification.blockers.includes('SHELL_PRESSURE_TARGET_INVALID'));

const conflictingMagnitudeModel = createModel({
  nodes: plateNodes,
  members: [],
  shells: [plate],
  loads: [{ id: 'Q-CONFLICT-VALUE', type: 'shellPressure', shell: 'PLATE', q: 1e3, pressure: 2e3, case: 'D' }],
  loadCases: [{ id: 'D', type: 'dead' }],
  loadCombinations: [{ id: 'C', type: 'strength', factors: { D: 1 } }],
});
assert.ok(validateModel(conflictingMagnitudeModel).errors.some((error) => error.code === 'BAD_LOAD_MAGNITUDE'));
const conflictingMagnitudeProduct = analyzeModel({
  ...conflictingMagnitudeModel,
  analysisSettings: { ...conflictingMagnitudeModel.analysisSettings, validateBeforeSolve: false },
});
assert.equal(conflictingMagnitudeProduct.ok, false);
assert.ok(conflictingMagnitudeProduct.shellFemQualification.blockers.includes('SHELL_PRESSURE_INVALID'));

const membranePressureModel = createModel({
  nodes,
  members: [],
  shells: [{ ...shell, matId: 'concrete' }],
  loads: [{ id: 'Q2', type: 'shellPressure', shell: 'S1', q: 1e3, case: 'D' }],
  loadCases: [{ id: 'D', type: 'dead' }],
  loadCombinations: [{ id: 'C', type: 'strength', factors: { D: 1 } }],
});
assert.ok(validateModel(membranePressureModel).errors.some((error) => error.code === 'BAD_LOAD_SHELL_TARGET'));

const plateAssembly = expandShellsToFrameLinks({
  nodes: plateNodes,
  materials: [material],
  shells: [{ ...plate, matId: material.id }],
});
const invalidDirectPressure = analyzeComponent3D(plateNodes, plateAssembly.members, [
  { id: 'Q3', type: 'shellPressure', shell: 'PLATE', q: true },
], {
  shells: plateAssembly.femElements,
  mat: () => material,
  sec: () => ({ A: 1e-12, Iy: 1e-12, Iz: 1e-12, J: 1e-12 }),
  criteriaModel: {},
});
assert.equal(invalidDirectPressure.ok, false);
assert.equal(invalidDirectPressure.reason, 'SHELL_PRESSURE_INVALID');

console.log(JSON.stringify({
  ok: true,
  version: 'p10-m9c-shell-fail-closed-v1',
  mergedShellCount: merged.shellCount,
  duplicateBlocker: duplicateProduct.shellFemQualification.blockers,
  pressureBlocker: missingTargetProduct.shellFemQualification.blockers,
}, null, 2));
