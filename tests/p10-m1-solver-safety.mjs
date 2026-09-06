import assert from 'node:assert/strict';
import { analyzeComponent3D, analyzeModel } from '../src/solver/linear3d.js';

const material = { E: 200e6, G: 80e6 };
const section = { A: 0.02, Iy: 8e-5, Iz: 1e-4, J: 2e-5 };
const fixed = (id, x, y, z) => ({ id, x, y, z, support: 'fixed' });
const free = (id, x, y, z) => ({ id, x, y, z, support: null });
const member = (id, n1, n2, type = 'frame') => ({
  id,
  n1,
  n2,
  type,
  matId: 'MAT',
  secId: 'SEC',
  releases: { i: 'rigid', j: 'rigid' },
});
const context = (extra = {}) => ({
  mat: () => material,
  sec: () => section,
  sparse: false,
  ...extra,
});

// A load placed on a diaphragm slave may have no stiffness in the full system,
// but it is valid after T'F transfers it to the stiff master coordinate.
const diaphragmNodes = [
  fixed('BT', 0, 0, 0),
  free('T', 0, 0, 3),
  fixed('BS', 4, 0, 0),
  free('S', 4, 0, 3),
];
const diaphragmResult = analyzeComponent3D(
  diaphragmNodes,
  [member('C', 'BT', 'T'), member('TS', 'BS', 'S', 'truss')],
  [{ id: 'P', type: 'nodal', node: 'S', P: 10, dir: '+x', case: 'D' }],
  context({ diaphragms: [{ id: 'D', type: 'rigid', nodeIds: ['T', 'S'], center: { x: 2, y: 0, z: 3 } }] }),
);
assert.equal(diaphragmResult.ok, true, JSON.stringify(diaphragmResult, null, 2));
assert.equal(diaphragmResult.solver.diaphragmCount, 1);
assert.ok(Number.isFinite(diaphragmResult.disp.S[0]));

// A diaphragm node exactly at the group center has a zero rotational
// coefficient.  The zero term must not hide its direct master restraint or a
// prescribed displacement from the reduced constraint system.
for (const sparse of [false, true]) {
  const centerNodes = [
    fixed('B0', 2, 0, 0),
    free('S0', 2, 0, 3),
    { ...fixed('C0', 0, 0, 3), settlement: { ux: 5e-4 } },
  ];
  const centered = analyzeComponent3D(
    centerNodes,
    [member('T0', 'B0', 'S0', 'truss')],
    [{ id: 'PC', type: 'nodal', node: 'S0', P: 10, dir: '+x', case: 'D' }],
    context({
      sparse,
      diaphragms: [{ id: 'DC', type: 'rigid', nodeIds: ['C0', 'S0'], center: { x: 0, y: 0, z: 3 } }],
    }),
  );
  assert.equal(centered.ok, true, `${sparse ? 'sparse' : 'dense'}: ${JSON.stringify(centered, null, 2)}`);
  assert.equal(centered.solver.prescribedDofCount, 1);
  assert.ok(Math.abs(centered.disp.C0[0] - 5e-4) < 1e-14);
  assert.ok(Math.abs(centered.disp.S0[0] - 5e-4) < 1e-14);
  assert.ok(Math.abs(centered.reactions.C0.rx + 10) < 1e-10);
  assert.ok(Math.abs(Object.values(centered.reactions).reduce((sum, row) => sum + row.rx, 10)) < 1e-10);
  assert.equal(centered.solver.reactionRecovery.applied, true);
  assert.equal(centered.solver.reactionRecovery.ambiguousCoordinateCount, 0);
}

// An off-center support supplies coupled master-translation/rotation rows.
// Resolve those rows before solving and recover physical support resultants
// from A' * reaction = reduced residual.
for (const sparse of [false, true]) {
  const offCenter = analyzeComponent3D(
    [fixed('OB', 4, 0, 0), free('OS', 4, 0, 3), fixed('OC', 0, 0, 3)],
    [member('OM', 'OB', 'OS')],
    [{ id: 'OP', type: 'nodal', node: 'OS', P: 10, dir: '+y', case: 'D' }],
    context({
      sparse,
      diaphragms: [{ id: 'OD', type: 'rigid', nodeIds: ['OC', 'OS'], center: { x: 2, y: 0, z: 3 } }],
    }),
  );
  assert.equal(offCenter.ok, true, `${sparse ? 'sparse' : 'dense'}: ${JSON.stringify(offCenter, null, 2)}`);
  assert.ok(Math.abs(offCenter.disp.OC[1]) < 1e-14);
  assert.ok(Math.abs(offCenter.disp.OS[1]) < 1e-14);
  assert.ok(Math.abs(offCenter.reactions.OC.ry + 10) < 1e-10);
  assert.ok(Math.abs(offCenter.reactions.OC.rmz + 40) < 1e-10);
  assert.ok(Math.abs(Object.values(offCenter.reactions).reduce((sum, row) => sum + row.ry, 10)) < 1e-10);
  assert.equal(offCenter.solver.reactionRecovery.method, 'reduced-residual-minimum-norm-restraint-allocation');
  assert.ok(offCenter.solver.reactionRecovery.maximumClosureResidual < 1e-10);

  const unsupportedPin = analyzeComponent3D(
    [fixed('UB', 4, 0, 0), free('US', 4, 0, 3), { ...free('UC', 0, 0, 3), support: 'pin' }],
    [member('UM', 'UB', 'US')],
    [{ id: 'UP', type: 'nodal', node: 'US', P: 10, dir: '+y', case: 'D' }],
    context({
      sparse,
      diaphragms: [{ id: 'UD', type: 'rigid', nodeIds: ['UC', 'US'], center: { x: 2, y: 0, z: 3 } }],
    }),
  );
  assert.equal(unsupportedPin.ok, false);
  assert.equal(unsupportedPin.reason, 'UNSUPPORTED_COUPLED_DIAPHRAGM_CONSTRAINT');
  assert.equal(unsupportedPin.nodeId, 'UC');
}

// The canonical domain accepts an explicit displacement at a formerly free
// DOF.  The production solve must constrain and apply that value as well.
for (const sparse of [false, true]) {
  const prescribed = analyzeComponent3D(
    [fixed('PA', 0, 0, 0), { ...free('PB', 1, 0, 0), prescribedDisplacement: { ux: 1e-3 } }],
    [member('PT', 'PA', 'PB', 'truss')],
    [],
    context({ sparse }),
  );
  assert.equal(prescribed.ok, true, `${sparse ? 'sparse' : 'dense'}: ${JSON.stringify(prescribed, null, 2)}`);
  assert.equal(prescribed.solver.prescribedDofCount, 1);
  assert.deepEqual(prescribed.solver.prescribedDofs[0], { nodeId: 'PB', dof: 'ux', value: 1e-3 });
  assert.ok(Math.abs(prescribed.disp.PB[0] - 1e-3) < 1e-14);
  assert.ok(Math.abs(prescribed.reactions.PA.rx + material.E * section.A * 1e-3) < 1e-8);
}

for (const sparse of [false, true]) {
  const springPrescribed = analyzeComponent3D(
    [
      fixed('SA', 0, 0, 0),
      { ...free('SB', 1, 0, 0), support: 'spring', spring: { kx: 100 }, prescribedDisplacement: { ux: 1e-3 } },
    ],
    [member('SM', 'SA', 'SB', 'truss')],
    [],
    context({ sparse }),
  );
  assert.equal(springPrescribed.ok, true, `${sparse ? 'sparse' : 'dense'}: ${JSON.stringify(springPrescribed, null, 2)}`);
  assert.ok(Math.abs(springPrescribed.disp.SB[0] - 1e-3) < 1e-14);
  assert.ok(Math.abs(springPrescribed.reactions.SA.rx + material.E * section.A * 1e-3) < 1e-8);
  assert.ok(Math.abs(springPrescribed.reactions.SA.rx + springPrescribed.reactions.SB.rx) < 1e-8);
}

const prescribedModel = {
  nodes: [
    { id: 'PMA', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'PMB', x: 1, y: 0, z: 0, prescribedDisplacement: { ux: 1e-3 } },
  ],
  members: [{ ...member('PMT', 'PMA', 'PMB', 'truss') }],
  materials: [{ id: 'MAT', E: 200000, G: 76923, Fy: 250, density: 0, allow: { fb: 150, ft: 150, fc: 150, fv: 90 } }],
  sections: [{ id: 'SEC', type: 'direct', A: 0.02, Iy: 8e-5, Iz: 8e-5, J: 1e-5, Zy: 5e-4, Zz: 5e-4 }],
  loads: [],
  loadCases: [{ id: 'D', name: 'Dead', type: 'dead' }],
  loadCombinations: [{ id: 'D_ONLY', name: 'D', factors: { D: 1 } }],
  analysisSettings: { responseSpectrum: { enabled: false }, validateBeforeSolve: false },
};
const prescribedAnalysis = analyzeModel(prescribedModel);
assert.equal(prescribedAnalysis.ok, true, JSON.stringify(prescribedAnalysis, null, 2));
assert.equal(prescribedAnalysis.byCombo.D_ONLY.summary.equilibriumOk, true);
assert.ok(Math.abs(prescribedAnalysis.byCombo.D_ONLY.disp.PMB[0] - 1e-3) < 1e-14);
assert.ok(Math.abs(prescribedAnalysis.byCombo.D_ONLY.reactions.PMA.rx) > 1e-9);
assert.ok(Math.abs(
  prescribedAnalysis.byCombo.D_ONLY.reactions.PMA.rx
    + prescribedAnalysis.byCombo.D_ONLY.reactions.PMB.rx,
) < 1e-9);

// The first unloaded RHS auto-fixes transverse truss DOFs.  Reusing its
// stiffness for a later loaded RHS must reclassify the loaded DOF as a mechanism.
const trussNodes = [fixed('B', 0, 0, 0), free('N', 0, 0, 3)];
const trussMembers = [member('T', 'B', 'N', 'truss')];
const componentCache = new Map();
const cacheContext = context({
  componentCache,
  factorGroupKey: 'same-stiffness',
  componentKey: 'B,N::T',
});
const unloaded = analyzeComponent3D(trussNodes, trussMembers, [], cacheContext);
assert.equal(unloaded.ok, true, JSON.stringify(unloaded, null, 2));
assert.equal(componentCache.size, 1);

const loaded = analyzeComponent3D(
  trussNodes,
  trussMembers,
  [{ id: 'P', type: 'nodal', node: 'N', P: 10, dir: '+x', case: 'D' }],
  cacheContext,
);
assert.equal(loaded.ok, false);
assert.equal(loaded.reason, 'MECHANISM_DOF');
assert.equal(loaded.nodeId, 'N');
assert.equal(loaded.component, 'ux');

// Delimiter-bearing IDs can produce the same joined text for different
// components.  Component cache identity must remain unambiguous.
const collisionModel = {
  nodes: [
    { id: 'a,b', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'c,d', x: 1, y: 0, z: 0 },
    { id: 'e,f', x: 2, y: 0, z: 0 },
    { id: 'a', x: 0, y: 10, z: 0, support: 'fixed' },
    { id: 'b,c', x: 2, y: 10, z: 0 },
    { id: 'd,e,f', x: 5, y: 10, z: 0 },
  ],
  members: [
    { ...member('m,n', 'a,b', 'c,d', 'truss') },
    { ...member('o', 'c,d', 'e,f', 'truss') },
    { ...member('m', 'a', 'b,c', 'truss') },
    { ...member('n,o', 'b,c', 'd,e,f', 'truss') },
  ],
  materials: [{ id: 'MAT', E: 200000, G: 76923, Fy: 250, density: 0, allow: { fb: 150, ft: 150, fc: 150, fv: 90 } }],
  sections: [{ id: 'SEC', type: 'direct', A: 0.02, Iy: 8e-5, Iz: 8e-5, J: 1e-5, Zy: 5e-4, Zz: 5e-4 }],
  loads: [
    { id: 'PA', type: 'nodal', node: 'e,f', P: 10, dir: '+x', case: 'D' },
    { id: 'PB', type: 'nodal', node: 'd,e,f', P: 10, dir: '+x', case: 'D' },
  ],
  loadCases: [{ id: 'D', name: 'Dead', type: 'dead' }],
  loadCombinations: [{ id: 'D_ONLY', name: 'D', factors: { D: 1 } }],
  analysisSettings: { responseSpectrum: { enabled: false }, validateBeforeSolve: false },
};
const collisionCache = new Map();
const collision = analyzeModel(collisionModel, { componentCache: collisionCache, factorGroupKey: 'FG' });
assert.equal(collision.ok, true, JSON.stringify(collision, null, 2));
assert.equal(collisionCache.size, 2);
assert.ok(Math.abs(collision.byCombo.D_ONLY.disp['e,f'][0] - 5e-6) < 1e-14);
assert.ok(Math.abs(collision.byCombo.D_ONLY.disp['d,e,f'][0] - 12.5e-6) < 1e-14);
assert.ok(Math.abs(collision.byCombo.D_ONLY.reactions['a,b'].rx + 10) < 1e-9);
assert.ok(Math.abs(collision.byCombo.D_ONLY.reactions.a.rx + 10) < 1e-9);

console.log(JSON.stringify({
  ok: true,
  diaphragmSlaveLoad: diaphragmResult.ok,
  centeredDiaphragmRestraint: true,
  offCenterDiaphragmRestraintAndReaction: true,
  unresolvedCoupledDiaphragmBlocked: true,
  explicitPrescribedDisplacement: true,
  springExplicitPrescribedReaction: true,
  cachedLoadedMechanism: `${loaded.nodeId}.${loaded.component}`,
  collisionSafeComponentCacheEntries: collisionCache.size,
}, null, 2));
