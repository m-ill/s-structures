import assert from 'node:assert/strict';
import {
  analyzeModel,
  createModel,
  fixedEndPartialUdl,
  fixedEndPointLoad,
  fixedEndUdl,
  localK12,
  modelHash,
  resolveCriterion,
} from '../src/index.js';

const E = 30e6;
const G = 12.5e6;
const L = 2.4;
const P = 120;
const W = 60;
const Iy = 0.00135;
const Iz = 0.0054;
const Ay = 0.15;
const Az = 0.12;
const phiY = (12 * E * Iy) / (G * Az * L ** 2);
const phiZ = (12 * E * Iz) / (G * Ay * L ** 2);
const ax = { L, x: [1, 0, 0], y: [0, 0, 1], z: [0, -1, 0] };
const timoshenko = { enabled: true, phiY, phiZ, shearAreaY: Ay, shearAreaZ: Az };
const criteriaModel = createModel();
const phiZeroTolerance = resolveCriterion(criteriaModel, 'element.shearPhiZeroTol');
const deepBeamTolerance = resolveCriterion(criteriaModel, 'element.shearDeepBeamTol');
const releaseTolerance = resolveCriterion(criteriaModel, 'element.shearReleaseTol');
const slenderCutoff = resolveCriterion(criteriaModel, 'element.shearSlenderCutoff');
const shallowTolerance = resolveCriterion(criteriaModel, 'element.shearShallowTol');

// Rectangular-section diagnostic anchor: L/h=60 keeps the shear contribution
// below the configured 1e-3 shallow-beam sanity threshold in both planes.
const shallowLength = slenderCutoff * 0.6;
const shallowPhiY = (12 * E * Iy) / (G * Az * shallowLength ** 2);
const shallowPhiZ = (12 * E * Iz) / (G * Ay * shallowLength ** 2);
assert.ok(Math.max(shallowPhiY, shallowPhiZ) < shallowTolerance);

// EL-T01: the additive Phi arguments retain the exact Euler-Bernoulli matrix at zero.
const eb = localK12(E, G, 0.18, Iy, Iz, 0.0037, L);
assert.deepEqual(localK12(E, G, 0.18, Iy, Iz, 0.0037, L, 0, 0), eb);

// Consistent non-symmetric point load and the full-span UDL invariant.
const pointY = fixedEndPointLoad({
  id: 'POINT-Y', type: 'point', member: 'M1', P, t: 0.3, direction: [0, -1, 0], coordinate: 'local',
}, ax, { timoshenko });
const pointZ = fixedEndPointLoad({
  id: 'POINT-Z', type: 'point', member: 'M1', P, t: 0.3, direction: [0, 0, -1], coordinate: 'local',
}, ax, { timoshenko });
assert.equal(pointY.ok, true);
assert.equal(pointZ.ok, true);
const yShapes = independentTimoshenkoShapes(0.3, L, phiZ);
const zShapes = independentTimoshenkoShapes(0.3, L, phiY);
close(pointY.fe[1], -P * yShapes[0], phiZeroTolerance, 'point fe local-y i shear');
close(pointY.fe[5], -P * yShapes[1], phiZeroTolerance, 'point fe local-y i moment');
close(pointZ.fe[2], -P * zShapes[0], phiZeroTolerance, 'point fe local-z i shear');
close(pointZ.fe[4], P * zShapes[1], phiZeroTolerance, 'point fe local-z i moment');

// Independent closed-form integration for partial UDL q0 (no production shape reuse).
const partialRange = { from: 0.2, to: 0.7 };
const partialY = fixedEndPartialUdl({
  id: 'PARTIAL-Y', type: 'udl-partial', member: 'M1', w: W,
  ...partialRange, direction: [0, -1, 0], coordinate: 'local',
}, ax, { timoshenko });
const partialZ = fixedEndPartialUdl({
  id: 'PARTIAL-Z', type: 'udl-partial', member: 'M1', w: W,
  ...partialRange, direction: [0, 0, -1], coordinate: 'local',
}, ax, { timoshenko });
assert.equal(partialY.ok, true);
assert.equal(partialZ.ok, true);
const partialYFe = independentPartialUdlFe(-W, partialRange.from, partialRange.to, L, phiZ, 'y');
const partialZFe = independentPartialUdlFe(-W, partialRange.from, partialRange.to, L, phiY, 'z');
const partialReference = [...partialYFe, ...partialZFe].map((value) => -value);
const partialComputed = [
  ...[1, 5, 7, 11].map((dof) => partialY.q0[dof]),
  ...[2, 4, 8, 10].map((dof) => partialZ.q0[dof]),
];
partialComputed.forEach((value, index) => close(
  value,
  partialReference[index],
  phiZeroTolerance,
  `partial UDL q0 component ${index}`,
));

const uniformY = fixedEndUdl({
  id: 'UDL-Y', type: 'udl', member: 'M1', w: W, direction: [0, -1, 0], coordinate: 'local',
}, ax, { timoshenko });
const uniformZ = fixedEndUdl({
  id: 'UDL-Z', type: 'udl', member: 'M1', w: W, direction: [0, 0, -1], coordinate: 'local',
}, ax, { timoshenko });
assert.equal(uniformY.ok, true);
assert.equal(uniformZ.ok, true);
close(Math.abs(uniformY.fe[5]), W * L ** 2 / 12, 1e-11, 'uniform local-y fixed-end moment');
close(Math.abs(uniformZ.fe[4]), W * L ** 2 / 12, 1e-11, 'uniform local-z fixed-end moment');

// EL-T02: two-element simply supported deep beam, both bending planes.
const simpleModel = modelWith({
  nodes: simpleNodes(true),
  members: [{ ...member('M1', 'N1', 'N3'), releases: { i: 'pin', j: 'pin' } }],
  loads: [
    { id: 'PY', type: 'point', member: 'M1', P, t: 0.5, direction: [0, -1, 0], coordinate: 'local', case: 'D' },
    { id: 'PZ', type: 'point', member: 'M1', P, t: 0.5, direction: [0, 0, -1], coordinate: 'local', case: 'D' },
  ],
});
const simple = solve(simpleModel);
const simpleLocal = project(simple.memberResults.M1.shape[10], simple.memberResults.M1.ax);
closeRelative(Math.abs(simpleLocal[1]), P * L ** 3 / (48 * E * Iz) + P * L / (4 * G * Ay), deepBeamTolerance, 'deep simple local-y deflection');
closeRelative(Math.abs(simpleLocal[2]), P * L ** 3 / (48 * E * Iy) + P * L / (4 * G * Az), deepBeamTolerance, 'deep simple local-z deflection');
close(simple.memberResults.M1.Mzmax, P * L / 4, 1e-7, 'deep simple Mz');
close(simple.memberResults.M1.Mymax, P * L / 4, 1e-7, 'deep simple My');

// EL-T03: fixed-fixed symmetric UDL, including force-integrated shear recovery.
const fixedModel = modelWith({
  nodes: [fixedNode('N1', 0), fixedNode('N2', L)],
  members: [member('M1', 'N1', 'N2')],
  loads: [
    { id: 'WY', type: 'udl', member: 'M1', w: W, direction: [0, -1, 0], coordinate: 'local', case: 'D' },
    { id: 'WZ', type: 'udl', member: 'M1', w: W, direction: [0, 0, -1], coordinate: 'local', case: 'D' },
  ],
});
const fixed = solve(fixedModel);
const fixedMember = fixed.memberResults.M1;
const fixedMid = project(fixedMember.shape[10], fixedMember.ax);
closeRelative(Math.abs(fixedMid[1]), W * L ** 4 / (384 * E * Iz) + W * L ** 2 / (8 * G * Ay), deepBeamTolerance, 'fixed UDL local-y deflection');
closeRelative(Math.abs(fixedMid[2]), W * L ** 4 / (384 * E * Iy) + W * L ** 2 / (8 * G * Az), deepBeamTolerance, 'fixed UDL local-z deflection');
close(Math.abs(fixedMember.end[5]), W * L ** 2 / 12, deepBeamTolerance, 'fixed UDL Mz end');
close(Math.abs(fixedMember.end[4]), W * L ** 2 / 12, deepBeamTolerance, 'fixed UDL My end');
assert.equal(fixedMember.deformationRecovery.formulation, 'timoshenko');
assert.equal(fixedMember.timoshenko.geometricStiffness.consistent, false);

// EL-T04: the unchanged Schur condensation consumes Timoshenko k and q0 together.
const releasedModel = modelWith({
  nodes: simpleNodes(true),
  members: [{ ...member('M1', 'N1', 'N3'), releases: { i: 'pin', j: 'pin' } }],
  loads: [
    { id: 'RY', type: 'point', member: 'M1', P, t: 0.3, direction: [0, -1, 0], coordinate: 'local', case: 'D' },
    { id: 'RZ', type: 'point', member: 'M1', P, t: 0.3, direction: [0, 0, -1], coordinate: 'local', case: 'D' },
  ],
});
const released = solve(releasedModel);
const releasedMember = released.memberResults.M1;
const releasedAtLoad = project(releasedMember.shape[6], releasedMember.ax);
const a = 0.3 * L;
closeRelative(Math.abs(releasedAtLoad[1]), P * a ** 2 * (L - a) ** 2 / (3 * E * Iz * L) + P * a * (L - a) / (L * G * Ay), releaseTolerance, 'released local-y deflection');
closeRelative(Math.abs(releasedAtLoad[2]), P * a ** 2 * (L - a) ** 2 / (3 * E * Iy * L) + P * a * (L - a) / (L * G * Az), releaseTolerance, 'released local-z deflection');
for (const dof of [4, 5, 10, 11]) close(releasedMember.end[dof], 0, releaseTolerance, `released end force dof ${dof}`);
close(Math.abs(releasedMember.end[1]), 84, releaseTolerance, 'released left local-y reaction');
close(Math.abs(releasedMember.end[7]), 36, releaseTolerance, 'released right local-y reaction');

export const M2_VERIFICATION_SNAPSHOT = Object.freeze({
  ok: true,
  version: 'p10-m2-timoshenko',
  phiY,
  phiZ,
  zeroPhiMaxError: maxMatrixDifference(eb, localK12(E, G, 0.18, Iy, Iz, 0.0037, L, 0, 0)),
  pointReference: [-P * yShapes[0], -P * yShapes[1], -P * zShapes[0], P * zShapes[1]],
  pointComputed: [pointY.fe[1], pointY.fe[5], pointZ.fe[2], pointZ.fe[4]],
  partialReference,
  partialComputed,
  deepSimpleReference: [
    P * L ** 3 / (48 * E * Iz) + P * L / (4 * G * Ay),
    P * L ** 3 / (48 * E * Iy) + P * L / (4 * G * Az),
  ],
  deepSimple: simpleLocal.slice(1).map(Math.abs),
  fixedReference: [
    W * L ** 4 / (384 * E * Iz) + W * L ** 2 / (8 * G * Ay),
    W * L ** 4 / (384 * E * Iy) + W * L ** 2 / (8 * G * Az),
    W * L ** 2 / 12,
    W * L ** 2 / 12,
  ],
  fixedComputed: [Math.abs(fixedMid[1]), Math.abs(fixedMid[2]), Math.abs(fixedMember.end[5]), Math.abs(fixedMember.end[4])],
  releasedReference: [
    P * a ** 2 * (L - a) ** 2 / (3 * E * Iz * L) + P * a * (L - a) / (L * G * Ay),
    P * a ** 2 * (L - a) ** 2 / (3 * E * Iy * L) + P * a * (L - a) / (L * G * Az),
    0, 0, 0, 0,
  ],
  releasedComputed: [Math.abs(releasedAtLoad[1]), Math.abs(releasedAtLoad[2]), ...[4, 5, 10, 11].map((dof) => releasedMember.end[dof])],
  modelHashes: {
    simple: modelHash(simpleModel),
    fixed: modelHash(fixedModel),
    released: modelHash(releasedModel),
  },
  tolerances: {
    phiZero: phiZeroTolerance,
    deepBeam: deepBeamTolerance,
    release: releaseTolerance,
  },
});

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/p10-m2-timoshenko.mjs')) {
  console.log(JSON.stringify(M2_VERIFICATION_SNAPSHOT, null, 2));
}

function modelWith({ nodes, members, loads }) {
  return createModel({
    materials: [{
      id: 'MAT', version: 1, name: 'Deep-beam material', E: E / 1000, G: G / 1000,
      Fy: 300, Fu: 400, density: 0, allow: { fb: 200, ft: 200, fc: 200, fv: 120 },
    }],
    sections: [{
      id: 'SEC', version: 1, name: 'Deep-beam section', type: 'GENERAL',
      A: 0.18, Ay, Az, Iy, Iz, J: 0.0037, Zy: 0.009, Zz: 0.018,
    }],
    nodes,
    members,
    loads,
    loadCases: [{ id: 'D', name: 'M2 load', type: 'dead' }],
    loadCombinations: [{ id: 'C1', name: '1.0D', type: 'strength', factors: { D: 1 } }],
    analysisSettings: { shearDeformation: true, validateBeforeSolve: false, memberStations: 21 },
  });
}

function member(id, n1, n2) {
  return {
    id, type: 'frame', n1, n2, matId: 'MAT', secId: 'SEC',
    localAxis: { roll: 0, strongAxis: 'z' }, releases: { i: 'rigid', j: 'rigid' },
  };
}

function simpleNodes(skipMiddle = false) {
  const nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'custom', fix: [true, true, true, false, false, false] },
  ];
  if (!skipMiddle) nodes.push({ id: 'N2', x: L / 2, y: 0, z: 0, support: null });
  nodes.push({ id: 'N3', x: L, y: 0, z: 0, support: 'custom', fix: [false, true, true, false, false, false] });
  return nodes;
}

function fixedNode(id, x) {
  return { id, x, y: 0, z: 0, support: 'fixed' };
}

function solve(model) {
  const analysis = analyzeModel(model);
  assert.equal(analysis.ok, true, JSON.stringify(analysis.validation || analysis, null, 2));
  const result = analysis.byCombo.C1;
  assert.equal(result.ok, true, result.reason || 'combination solve failed');
  return result;
}

function project(global, axes) {
  return [dot(global, axes.x), dot(global, axes.y), dot(global, axes.z)];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function close(actual, expected, tolerance, label) {
  const scale = Math.max(1, Math.abs(expected));
  const error = Math.abs(actual - expected) / scale;
  assert.ok(error <= tolerance, `${label}: expected ${expected}, got ${actual}, normalized error ${error}`);
}

function closeRelative(actual, expected, tolerance, label) {
  const error = Math.abs(actual - expected) / Math.max(1e-15, Math.abs(expected));
  assert.ok(error <= tolerance, `${label}: expected ${expected}, got ${actual}, relative error ${error}`);
}

function maxMatrixDifference(left, right) {
  let maximum = 0;
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < left[i].length; j += 1) maximum = Math.max(maximum, Math.abs(left[i][j] - right[i][j]));
  }
  return maximum;
}

function independentTimoshenkoShapes(r, length, phi) {
  const denominator = 1 + phi;
  const r2 = r ** 2;
  const r3 = r ** 3;
  return [
    (1 + phi - phi * r - 3 * r2 + 2 * r3) / denominator,
    length * ((1 + phi / 2) * r - (2 + phi / 2) * r2 + r3) / denominator,
    (phi * r + 3 * r2 - 2 * r3) / denominator,
    length * (-(phi / 2) * r + (-1 + phi / 2) * r2 + r3) / denominator,
  ];
}

function independentPartialUdlFe(q, from, to, length, phi, plane) {
  const denominator = 1 + phi;
  const primitive = (r) => [
    ((1 + phi) * r - (phi / 2) * r ** 2 - r ** 3 + r ** 4 / 2) / denominator,
    length * (((1 + phi / 2) * r ** 2 / 2) - ((2 + phi / 2) * r ** 3 / 3) + r ** 4 / 4) / denominator,
    ((phi / 2) * r ** 2 + r ** 3 - r ** 4 / 2) / denominator,
    length * (-(phi / 4) * r ** 2 + ((-1 + phi / 2) * r ** 3 / 3) + r ** 4 / 4) / denominator,
  ];
  const left = primitive(from);
  const right = primitive(to);
  const values = right.map((value, index) => q * length * (value - left[index]));
  return plane === 'z' ? [values[0], -values[1], values[2], -values[3]] : values;
}
