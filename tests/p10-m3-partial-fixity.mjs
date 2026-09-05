import assert from 'node:assert/strict';
import {
  analyzeModel,
  condensePartialFixity,
  createModel,
  fixedEndUdl,
  localK12,
  resolveMemberPartialFixity,
} from '../src/index.js';
import { modelHash } from '../verification/index.js';
import { condenseReleasedDofs } from '../src/solver/linear3dElement.js';

const E = 30e6;
const G = 12.5e6;
const L = 2.4;
const A = 0.18;
const Ay = 0.15;
const Az = 0.12;
const Iy = 0.00135;
const Iz = 0.0054;
const J = 0.0037;
const WY = 60;
const WZ = 45;
const RIGID_LIMIT_TOLERANCE = 1e-9;
const RELEASE_LIMIT_TOLERANCE = 1e-9;
const CLOSED_FORM_TOLERANCE = 1e-7;
const rhoY = 3;
const rhoZ = 6;
const ky = (rhoY * E * Iy) / L;
const kz = (rhoZ * E * Iz) / L;

// q0 uses the same generalized Schur correction as K.  At explicit zero the
// M3 path must be numerically identical to the existing binary release path.
const ax = { L, x: [1, 0, 0], y: [0, 0, 1], z: [0, -1, 0] };
const q0y = fixedEndUdl({
  id: 'QY', type: 'udl', member: 'M1', w: WY,
  direction: [0, -1, 0], coordinate: 'local',
}, ax).q0;
const q0z = fixedEndUdl({
  id: 'QZ', type: 'udl', member: 'M1', w: WZ,
  direction: [0, 0, -1], coordinate: 'local',
}, ax).q0;
const q0 = q0y.map((value, index) => value + q0z[index]);
const local = localK12(E, G, A, Iy, Iz, J, L);
const zeroMember = memberWith({ ryI: 0, rzI: 0, ryJ: 0, rzJ: 0 });
const zeroPartial = resolveMemberPartialFixity(
  createModel(), zeroMember, { A, Ay, Az, Iy, Iz, J }, { E, G }, L,
);
const springZero = condensePartialFixity(local, q0, zeroPartial);
const binaryZero = condenseReleasedDofs(local, q0, [4, 5, 10, 11]);
assert.equal(springZero.ok, true);
assert.ok(binaryZero);
closeMatrix(springZero.klC, binaryZero.klC, 1e-12, 'explicit-zero stiffness condensation');
closeVector(springZero.f0C, binaryZero.f0C, 1e-12, 'explicit-zero q0 condensation');

// CN-F01: a finite but extremely stiff connection must converge to the rigid
// model without catastrophic subtraction in the condensation algebra.
const highRatio = 1e12;
const highSprings = {
  ryI: (highRatio * E * Iy) / L,
  rzI: (highRatio * E * Iz) / L,
};
const rigid = solve(cantileverModel({ springs: null, shear: false }));
const nearRigid = solve(cantileverModel({ springs: highSprings, shear: false }));
const rigidTip = tipLocal(rigid.member);
const nearRigidTip = tipLocal(nearRigid.member);
closeVectorRelative(nearRigidTip, rigidTip, RIGID_LIMIT_TOLERANCE, 'CN-F01 rigid-limit tip displacement');
closeVectorRelative(
  endMagnitudes(nearRigid.member),
  endMagnitudes(rigid.member),
  RIGID_LIMIT_TOLERANCE,
  'CN-F01 rigid-limit end forces',
);
const rigidWarnings = nearRigid.result.solver.warnings.filter((item) => item.code.startsWith('PARTIAL_FIXITY_'));
assert.equal(rigidWarnings.length, 2);
assert.ok(
  rigidWarnings.every((item) => item.code === 'PARTIAL_FIXITY_RIGID_RECOMMENDED'),
  'the rigid-limit model must surface the canonical modeling recommendation',
);

// CN-F02: explicit zero is a per-axis release.  Compare the actual product
// solve and member recovery against the legacy binary-pin implementation.
const zeroSprings = { ryI: 0, rzI: 0, ryJ: 0, rzJ: 0 };
const springRelease = solve(fixedSpanModel({ springs: zeroSprings, releases: { i: 'rigid', j: 'rigid' } }));
const binaryRelease = solve(fixedSpanModel({ springs: null, releases: { i: 'pin', j: 'pin' } }));
const springMid = midspanLocal(springRelease.member);
const binaryMid = midspanLocal(binaryRelease.member);
closeVectorRelative(springMid, binaryMid, RELEASE_LIMIT_TOLERANCE, 'CN-F02 zero spring vs binary pin displacement');
closeVectorRelative(
  reactionForceMagnitudes(springRelease.result),
  reactionForceMagnitudes(binaryRelease.result),
  RELEASE_LIMIT_TOLERANCE,
  'CN-F02 zero spring vs binary pin reactions',
);
const releaseMomentResidual = Math.max(...[4, 5, 10, 11].map((dof) => Math.abs(springRelease.member.end[dof])));
assert.ok(releaseMomentResidual <= RELEASE_LIMIT_TOLERANCE, `CN-F02 released moment residual ${releaseMomentResidual}`);
closeRelative(Math.abs(springMid[0]), (5 * WY * L ** 4) / (384 * E * Iz), RELEASE_LIMIT_TOLERANCE, 'CN-F02 local-y closed form');
closeRelative(Math.abs(springMid[1]), (5 * WZ * L ** 4) / (384 * E * Iy), RELEASE_LIMIT_TOLERANCE, 'CN-F02 local-z closed form');
assert.equal(springRelease.member.partialFixity.rows.length, 4);
assert.ok(springRelease.member.partialFixity.rows.every((row) => Math.abs(row.closureResidual) <= RELEASE_LIMIT_TOLERANCE));
const releaseWarnings = springRelease.result.solver.warnings.filter((item) => item.code.startsWith('PARTIAL_FIXITY_'));
assert.equal(releaseWarnings.length, 4);
assert.ok(
  releaseWarnings.every((item) => item.code === 'PARTIAL_FIXITY_RELEASE_RECOMMENDED'),
  'explicit-zero springs must surface the release recommendation',
);

// CN-F03: independent cantilever UDL closed forms.  The member load exercises
// q0, and the recovered internal end rotations/closure exercise the hidden
// connection DOFs rather than only the condensed global response.
const finiteSprings = { ryI: ky, rzI: kz };
const eb = solve(cantileverModel({ springs: finiteSprings, shear: false }));
const timo = solve(cantileverModel({ springs: finiteSprings, shear: true }));
const ebReference = [
  (WY * L ** 4) / (8 * E * Iz) + (WY * L ** 3) / (2 * kz),
  (WZ * L ** 4) / (8 * E * Iy) + (WZ * L ** 3) / (2 * ky),
];
const timoReference = [
  ebReference[0] + (WY * L ** 2) / (2 * G * Ay),
  ebReference[1] + (WZ * L ** 2) / (2 * G * Az),
];
const endRotationReference = [
  (WZ * L ** 2) / (2 * ky),
  (WY * L ** 2) / (2 * kz),
];
closeVectorRelative(tipLocal(eb.member), ebReference, CLOSED_FORM_TOLERANCE, 'CN-F03 EB tip displacement');
closeVectorRelative(tipLocal(timo.member), timoReference, CLOSED_FORM_TOLERANCE, 'CN-F03 Timoshenko tip displacement');
closeVectorRelative(
  [Math.abs(eb.member.dl[4]), Math.abs(eb.member.dl[5])],
  endRotationReference,
  CLOSED_FORM_TOLERANCE,
  'CN-F03 recovered spring-end rotations',
);
closeVectorRelative(
  [Math.abs(eb.member.end[4]), Math.abs(eb.member.end[5])],
  [(WZ * L ** 2) / 2, (WY * L ** 2) / 2],
  CLOSED_FORM_TOLERANCE,
  'CN-F03 root moments',
);
closeVectorRelative(
  [Math.abs(eb.member.end[2]), Math.abs(eb.member.end[1])],
  [WZ * L, WY * L],
  CLOSED_FORM_TOLERANCE,
  'CN-F03 root shears',
);
for (const solved of [eb, timo]) {
  assert.equal(solved.member.partialFixity.rows.length, 2);
  assert.ok(
    solved.member.partialFixity.rows.every((row) => (
      Math.abs(row.closureResidual) / Math.max(1, Math.abs(row.memberEndMoment)) <= 1e-10
      && Math.abs(row.compatibilityResidual) <= 1e-12
    )),
    `CN-F03 spring moment/rotation closure: ${JSON.stringify(solved.member.partialFixity.rows)}`,
  );
}
assert.equal(eb.member.deformationRecovery.formulation, 'euler-bernoulli');
assert.equal(timo.member.deformationRecovery.formulation, 'timoshenko');

// A binary pin and a spring are legal at opposite ends.  This exercises the
// composed release-then-spring condensation and the reverse recovery order.
const oppositeEnds = solve(fixedSpanModel({
  springs: { rzJ: kz },
  releases: { i: 'pin', j: 'rigid' },
}));
assert.ok(Math.abs(oppositeEnds.member.end[4]) <= RELEASE_LIMIT_TOLERANCE);
assert.ok(Math.abs(oppositeEnds.member.end[5]) <= RELEASE_LIMIT_TOLERANCE);
assert.equal(oppositeEnds.member.partialFixity.rows.length, 1);
assert.ok(Math.abs(oppositeEnds.member.partialFixity.rows[0].closureResidual) <= RELEASE_LIMIT_TOLERANCE);

export const M3_VERIFICATION_SNAPSHOT = Object.freeze({
  ok: true,
  version: 'p10-m3-partial-fixity',
  rigidLimit: { reference: rigidTip, computed: nearRigidTip },
  releaseLimit: { reference: binaryMid, computed: springMid, momentResidual: releaseMomentResidual },
  closedForm: {
    ebReference,
    ebComputed: tipLocal(eb.member),
    timoshenkoReference: timoReference,
    timoshenkoComputed: tipLocal(timo.member),
    rotationReference: endRotationReference,
    rotationComputed: [Math.abs(eb.member.dl[4]), Math.abs(eb.member.dl[5])],
  },
  q0: { reference: binaryZero.f0C, computed: springZero.f0C },
  modelHashes: {
    rigid: modelHash(rigid.model),
    nearRigid: modelHash(nearRigid.model),
    binaryRelease: modelHash(binaryRelease.model),
    springRelease: modelHash(springRelease.model),
    eb: modelHash(eb.model),
    timoshenko: modelHash(timo.model),
  },
  tolerances: {
    rigidLimit: RIGID_LIMIT_TOLERANCE,
    releaseLimit: RELEASE_LIMIT_TOLERANCE,
    closedForm: CLOSED_FORM_TOLERANCE,
  },
});

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/p10-m3-partial-fixity.mjs')) {
  console.log(JSON.stringify(M3_VERIFICATION_SNAPSHOT, null, 2));
}

function cantileverModel({ springs, shear }) {
  return beamModel({
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: L, y: 0, z: 0, support: null },
    ],
    springs,
    releases: { i: 'rigid', j: 'rigid' },
    shear,
  });
}

function fixedSpanModel({ springs, releases }) {
  return beamModel({
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: L, y: 0, z: 0, support: 'fixed' },
    ],
    springs,
    releases,
    shear: false,
  });
}

function beamModel({ nodes, springs, releases, shear }) {
  const member = memberWith(springs, releases);
  return createModel({
    materials: [{
      id: 'MAT', version: 1, name: 'M3 material', E: E / 1000, G: G / 1000,
      Fy: 300, Fu: 400, density: 0, allow: { fb: 200, ft: 200, fc: 200, fv: 120 },
    }],
    sections: [{
      id: 'SEC', version: 1, name: 'M3 section', type: 'GENERAL',
      A, Ay, Az, Iy, Iz, J, Zy: 0.009, Zz: 0.018,
    }],
    nodes,
    members: [member],
    loads: [
      { id: 'WY', type: 'udl', member: 'M1', w: WY, direction: [0, -1, 0], coordinate: 'local', case: 'D' },
      { id: 'WZ', type: 'udl', member: 'M1', w: WZ, direction: [0, 0, -1], coordinate: 'local', case: 'D' },
    ],
    loadCases: [{ id: 'D', name: 'M3 load', type: 'dead' }],
    loadCombinations: [{ id: 'C1', name: '1.0D', type: 'strength', factors: { D: 1 } }],
    analysisSettings: { shearDeformation: shear, validateBeforeSolve: true, memberStations: 21 },
  });
}

function memberWith(springs, releases = { i: 'rigid', j: 'rigid' }) {
  const normalized = { ...releases };
  if (springs !== null) normalized.spring = { ...springs };
  return {
    id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'MAT', secId: 'SEC',
    localAxis: { roll: 0, strongAxis: 'z' }, releases: normalized,
  };
}

function solve(model) {
  const analysis = analyzeModel(model);
  assert.equal(analysis.ok, true, JSON.stringify(analysis.validation || analysis, null, 2));
  const result = analysis.byCombo.C1;
  assert.equal(result.ok, true, result.reason || JSON.stringify(result, null, 2));
  return { model, analysis, result, member: result.memberResults.M1 };
}

function tipLocal(member) {
  return [Math.abs(member.dl[7]), Math.abs(member.dl[8])];
}

function midspanLocal(member) {
  const local = project(member.shape[10], member.ax);
  return [Math.abs(local[1]), Math.abs(local[2])];
}

function endMagnitudes(member) {
  return [1, 2, 4, 5].map((dof) => Math.abs(member.end[dof]));
}

function reactionForceMagnitudes(result) {
  return ['N1', 'N2'].flatMap((nodeId) => {
    const row = result.reactions[nodeId];
    return [Math.abs(row.ry), Math.abs(row.rz)];
  });
}

function project(global, axes) {
  return [dot(global, axes.x), dot(global, axes.y), dot(global, axes.z)];
}

function dot(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function closeVector(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label} length`);
  actual.forEach((value, index) => close(value, expected[index], tolerance, `${label}[${index}]`));
}

function closeVectorRelative(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label} length`);
  actual.forEach((value, index) => closeRelative(value, expected[index], tolerance, `${label}[${index}]`));
}

function closeMatrix(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label} rows`);
  actual.forEach((row, index) => closeVector(row, expected[index], tolerance, `${label}[${index}]`));
}

function close(actual, expected, tolerance, label) {
  const error = Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
  assert.ok(error <= tolerance, `${label}: expected ${expected}, got ${actual}, normalized error ${error}`);
}

function closeRelative(actual, expected, tolerance, label) {
  const error = Math.abs(actual - expected) / Math.max(1e-15, Math.abs(expected));
  assert.ok(error <= tolerance, `${label}: expected ${expected}, got ${actual}, relative error ${error}`);
}
