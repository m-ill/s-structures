import assert from 'node:assert/strict';
import {
  analyzeModel,
  createAxialBar,
  createCantileverGlobalYUdl,
  createCantileverTipLoad,
  createCantileverTriangularUdl,
  createCantileverUdl,
  createCustomFixedCantileverTipLoad,
  createFixedFixedUdl,
  createMechanismPinnedCantilever,
  createProppedCantileverUdl,
  createReleasedSimpleBeamUdl,
  createSimpleBeamCenterPoint,
  createSimpleBeamUdl,
  createVerticalAxialColumn,
  localK12,
  memberAxes,
  solveLinear,
} from '../src/index.js';

const EPS = {
  tight: 1e-10,
  engineering: 1e-8,
  force: 1e-6,
  moment: 1e-6,
  deflection: 1e-6,
};

const linear = solveLinear(
  [
    [4, 1],
    [2, 3],
  ],
  [1, 2],
);
close(linear[0], 0.1, EPS.tight, 'solveLinear x0');
close(linear[1], 0.6, EPS.tight, 'solveLinear x1');

const k = localK12(200e6, 80e6, 0.02, 8e-5, 1e-4, 2e-5, 4);
for (let i = 0; i < 12; i += 1) {
  for (let j = 0; j < 12; j += 1) close(k[i][j], k[j][i], EPS.tight, `localK12 symmetry ${i},${j}`);
}

const verticalAxes = memberAxes({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 3 }, { roll: 0 });
close(norm(verticalAxes.x), 1, EPS.tight, 'vertical local x is unit');
close(norm(verticalAxes.y), 1, EPS.tight, 'vertical local y is unit');
close(norm(verticalAxes.z), 1, EPS.tight, 'vertical local z is unit');
close(dot(verticalAxes.x, verticalAxes.y), 0, EPS.tight, 'vertical x/y orthogonal');
close(dot(verticalAxes.x, verticalAxes.z), 0, EPS.tight, 'vertical x/z orthogonal');
close(dot(verticalAxes.y, verticalAxes.z), 0, EPS.tight, 'vertical y/z orthogonal');

runCase('cantilever tip load', createCantileverTipLoad(), (result, expected) => {
  close(result.disp.N2[2], expected.tipUz, EPS.deflection, 'cantilever tip Uz');
  close(result.reactions.N1.rz, expected.baseReactionZ, EPS.force, 'cantilever base Rz');
  close(result.summary.totalLoad[2], expected.totalLoadZ, EPS.force, 'cantilever total load Z');
});

runCase('cantilever UDL', createCantileverUdl(), (result, expected) => {
  close(result.disp.N2[2], expected.tipUz, EPS.deflection, 'cantilever UDL tip Uz');
  close(result.reactions.N1.rz, expected.baseReactionZ, EPS.force, 'cantilever UDL base Rz');
  close(result.summary.totalLoad[2], expected.totalLoadZ, EPS.force, 'cantilever UDL total load Z');
});

runCase('fixed-fixed UDL', createFixedFixedUdl(), (result, expected) => {
  close(result.reactions.N1.rz, expected.endReactionZ, EPS.force, 'fixed-fixed left Rz');
  close(result.reactions.N2.rz, expected.endReactionZ, EPS.force, 'fixed-fixed right Rz');
  close(Math.abs(result.summary.maxDisplacement), expected.midspanDeflection, EPS.deflection, 'fixed-fixed midspan deflection');
});

runCase('axial bar', createAxialBar(), (result, expected) => {
  close(result.disp.N2[0], expected.tipUx, EPS.deflection, 'axial bar tip Ux');
  close(result.reactions.N1.rx, expected.baseReactionX, EPS.force, 'axial bar base Rx');
  close(result.summary.totalLoad[0], expected.totalLoadX, EPS.force, 'axial bar total load X');
});

runCase('vertical axial column', createVerticalAxialColumn(), (result, expected) => {
  close(result.disp.N2[2], expected.topUz, EPS.deflection, 'vertical column top Uz');
  close(result.reactions.N1.rz, expected.baseReactionZ, EPS.force, 'vertical column base Rz');
  close(result.summary.totalLoad[2], expected.totalLoadZ, EPS.force, 'vertical column total load Z');
});

runCase('simple beam UDL pin-roller', createSimpleBeamUdl(), (result, expected) => {
  close(result.reactions.N1.rz, expected.endReactionZ, EPS.force, 'simple beam left Rz');
  close(result.reactions.N2.rz, expected.endReactionZ, EPS.force, 'simple beam right Rz');
  close(result.summary.totalLoad[2], expected.totalLoadZ, EPS.force, 'simple beam total load Z');
  close(result.summary.maxDisplacement, expected.maxDeflection, EPS.deflection, 'simple beam max deflection');
  close(result.memberResults.M1.Mzmax, expected.maxMoment, EPS.moment, 'simple beam max moment');
  close(Math.abs(result.memberResults.M1.end[5]), expected.endMoment, 1e-6, 'simple beam i-end moment');
  close(Math.abs(result.memberResults.M1.end[11]), expected.endMoment, 1e-6, 'simple beam j-end moment');
});

runCase('simple beam center point load', createSimpleBeamCenterPoint(), (result, expected) => {
  close(result.reactions.N1.rz, expected.endReactionZ, EPS.force, 'point beam left Rz');
  close(result.reactions.N2.rz, expected.endReactionZ, EPS.force, 'point beam right Rz');
  close(result.summary.totalLoad[2], expected.totalLoadZ, EPS.force, 'point beam total load Z');
  close(result.summary.maxDisplacement, expected.maxDeflection, EPS.deflection, 'point beam max deflection');
  close(result.memberResults.M1.Mzmax, expected.maxMoment, EPS.moment, 'point beam max moment');
});

runCase('propped cantilever UDL fixed-roller', createProppedCantileverUdl(), (result, expected) => {
  close(result.reactions.N1.rz, expected.fixedReactionZ, EPS.force, 'propped fixed Rz');
  close(result.reactions.N2.rz, expected.rollerReactionZ, EPS.force, 'propped roller Rz');
  close(result.summary.totalLoad[2], expected.totalLoadZ, EPS.force, 'propped total load Z');
  close(Math.abs(result.reactions.N1.rmy), expected.fixedEndMoment, EPS.moment, 'propped fixed end moment');
});

runCase('custom fixed cantilever tip load', createCustomFixedCantileverTipLoad(), (result, expected) => {
  close(result.disp.N2[2], expected.tipUz, EPS.deflection, 'custom fixed cantilever tip Uz');
  close(result.reactions.N1.rz, expected.baseReactionZ, EPS.force, 'custom fixed base Rz');
  close(result.summary.totalLoad[2], expected.totalLoadZ, EPS.force, 'custom fixed total load Z');
});

runCase('cantilever global Y UDL', createCantileverGlobalYUdl(), (result, expected) => {
  close(result.disp.N2[1], expected.tipUy, EPS.deflection, 'global Y tip Uy');
  close(result.reactions.N1.ry, expected.baseReactionY, EPS.force, 'global Y base Ry');
  close(result.summary.totalLoad[1], expected.totalLoadY, EPS.force, 'global Y total load Y');
  close(result.memberResults.M1.Mymax, expected.maxMomentY, EPS.moment, 'global Y max My');
  close(result.memberResults.M1.Mzmax, 0, EPS.moment, 'global Y should not bend about local z');
});

for (const shape of ['asc', 'desc']) {
  runCase(`cantilever triangular UDL ${shape}`, createCantileverTriangularUdl({ shape }), (result, expected) => {
    close(result.reactions.N1.rz, expected.baseReactionZ, EPS.force, `triangular ${shape} base Rz`);
    close(result.summary.totalLoad[2], expected.totalLoadZ, EPS.force, `triangular ${shape} total load Z`);
    close(Math.abs(result.reactions.N1.rmy), expected.baseMomentY, EPS.moment, `triangular ${shape} base moment`);
    close(result.memberResults.M1.Mzmax, expected.maxMoment, EPS.moment, `triangular ${shape} max moment`);
  });
}

runCase('released simple beam UDL', createReleasedSimpleBeamUdl(), (result, expected) => {
  close(result.reactions.N1.rz, expected.endReactionZ, EPS.force, 'released simple beam left Rz');
  close(result.reactions.N2.rz, expected.endReactionZ, EPS.force, 'released simple beam right Rz');
  close(result.memberResults.M1.Mzmax, expected.maxMoment, EPS.moment, 'released simple beam max moment');
  close(Math.abs(result.memberResults.M1.end[5]), 0, EPS.moment, 'released simple beam i-end moment');
  close(Math.abs(result.memberResults.M1.end[11]), 0, EPS.moment, 'released simple beam j-end moment');
});

const mechanism = analyzeModel(createMechanismPinnedCantilever().model);
assert.equal(mechanism.ok, false, 'pinned cantilever mechanism should fail analysis');
assert.ok(mechanism.validation.errors.some((error) => error.code === 'SINGULAR'), 'mechanism should report SINGULAR');
assert.equal(mechanism.byCombo.D_ONLY.ok, false, 'mechanism combo should be marked failed');
assert.equal(mechanism.byCombo.D_ONLY.reason, 'NO_SOLVED_COMPONENT');

const invalidReferences = createSimpleBeamUdl();
invalidReferences.model.analysisSettings = {
  ...(invalidReferences.model.analysisSettings || {}),
  validateBeforeSolve: false,
};
invalidReferences.model.loads.push(
  { id: 'BAD-NODAL', type: 'nodal', node: 'N404', P: 100, dir: '-z', case: 'D' },
  { id: 'BAD-MOMENT', type: 'nmoment', node: 'N404', M: 10, axis: 'bad', case: 'D' },
  { id: 'BAD-MEMBER-LOAD', type: 'udl', member: 'M404', w: 5, dir: '-z', case: 'D' },
);
invalidReferences.model.members.push({
  id: 'BAD-MEMBER',
  n1: 'N1',
  n2: 'N404',
  matId: 'steel',
  secId: 'h300',
});
const defensive = analyzeModel(invalidReferences.model);
assert.equal(defensive.ok, true, 'invalid references should be skipped when validation is disabled');
assert.equal(defensive.byCombo.D_ONLY.ok, true, 'valid component should still solve with invalid references skipped');
close(defensive.byCombo.D_ONLY.summary.totalLoad[2], invalidReferences.expected.totalLoadZ, EPS.force, 'invalid loads should not enter total load');

const onlyInvalidMember = analyzeModel({
  schemaVersion: 3,
  analysisSettings: { validateBeforeSolve: false },
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 4, y: 0, z: 0 },
  ],
  members: [
    { id: 'M1', n1: 'N1', n2: 'N404', matId: 'steel', secId: 'h300' },
  ],
  loads: [
    { id: 'L1', type: 'nodal', node: 'N2', P: 1, dir: '-z', case: 'D' },
  ],
  loadCases: [{ id: 'D', name: 'Dead', type: 'dead' }],
  loadCombinations: [{ id: 'D_ONLY', factors: { D: 1 } }],
});
assert.equal(onlyInvalidMember.ok, false, 'model with no valid members should fail without throwing');
assert.equal(onlyInvalidMember.byCombo.D_ONLY.reason, 'NO_SOLVED_COMPONENT');

console.log(JSON.stringify({
  ok: true,
  verificationCases: 17,
  solverChecks: [
    'solveLinear',
    'localK12 symmetry',
    'memberAxes orthonormal',
    'pin-roller supports',
    'custom support',
    'member point loads',
    'global Y/Z loads',
    'triangular loads',
    'member releases',
    'mechanism diagnostics',
    'invalid reference guards',
  ],
}, null, 2));

function runCase(name, fixture, assertCase) {
  const analysis = analyzeModel(fixture.model);
  assert.equal(analysis.ok, true, `${name} analysis failed: ${JSON.stringify(analysis.validation.errors, null, 2)}`);
  const result = analysis.byCombo.D_ONLY;
  assert.equal(result.ok, true, `${name} D_ONLY combo failed`);
  assert.ok(result.summary.equilibriumResidual < EPS.engineering, `${name} equilibrium residual ${result.summary.equilibriumResidual}`);
  assert.ok(result.summary.solverResidualNorm < EPS.engineering, `${name} solver residual ${result.summary.solverResidualNorm}`);
  assert.ok(result.solver.freeDofCount >= 0, `${name} should report free dof count`);
  assertCase(result, fixture.expected);
}

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}, diff ${Math.abs(actual - expected)}, tol ${tolerance}`,
  );
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function norm(a) {
  return Math.hypot(a[0], a[1], a[2]);
}
