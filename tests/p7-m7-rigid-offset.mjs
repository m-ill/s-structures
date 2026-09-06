import assert from 'node:assert/strict';
import { analyzeComponent3D } from '../src/solver/linear3dAssembly.js';
import { buildEquilibriumSummary } from '../src/solver/linear3dPost.js';

const EPS = 1e-8;
const material = { E: 200000, G: 80000, fa: 1e9, fb: 1e9, fs: 1e9 };
const section = { A: 1, Iy: 0.01, Iz: 0.02, J: 0.005, Zy: 1, Zz: 1, ry: 1, rz: 1 };
const nodes = [
  { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
  { id: 'B', x: 4, y: 0, z: 0 },
];
const member = { id: 'M1', n1: 'A', n2: 'B', matId: 'mat', secId: 'sec', endOffset: { i: 1, j: 0 } };
const load = { id: 'P', type: 'nodal', node: 'B', P: 10, dir: '-z' };

const result = solve(member);
assert.equal(result.ok, true, result.reason);
close(result.disp.B[2], -(10 * 3 ** 3) / (3 * material.E * section.Iz), EPS, 'clear-span tip displacement');
close(result.reactions.A.rz, 10, EPS, 'base vertical reaction');
close(result.reactions.A.rmy, -40, EPS, 'gross-arm base moment');
close(Math.abs(result.memberResults.M1.end[5]), 30, EPS, 'clear-span member end moment');

const summary = buildEquilibriumSummary(nodes, [member], [load], {
  ...result,
  anyOk: true,
  unstableMembers: new Set(),
  dmax: Math.abs(result.disp.B[2]),
  maxRatio: 0,
});
closeVector(summary.totalLoadMoment, [0, 40, 0], EPS, 'gross-coordinate load moment');
closeVector(summary.totalReactionMoment, [0, -40, 0], EPS, 'rigid-arm reaction moment');
assert.ok(summary.momentResidualNorm < EPS);
assert.equal(summary.equilibriumStatus, 'PASS');

const jOffsetMember = { ...member, endOffset: { i: 0, j: 1 } };
const jOffset = solve(jOffsetMember);
assert.equal(jOffset.ok, true, jOffset.reason);
const expectedJTip = -(10 * (3 ** 3 / 3 + 3 ** 2 * 1 + 3 * 1 ** 2)) / (material.E * section.Iz);
close(jOffset.disp.B[2], expectedJTip, EPS, 'j-arm tip displacement');
close(jOffset.reactions.A.rmy, -40, EPS, 'j-arm gross base moment');
close(Math.abs(jOffset.memberResults.M1.end[5]), 40, EPS, 'j-arm transferred flexible-end moment');

const unsupported = solve({ ...member, endOffset: { i: 1, j: 0, rigidFactor: 0.5 } });
assert.equal(unsupported.ok, false);
assert.equal(unsupported.reason, 'UNSUPPORTED_MEMBER_OFFSET_RIGID_FACTOR');
assert.equal(unsupported.memberId, 'M1');

console.log(JSON.stringify({
  ok: true,
  version: 'p7-m7-rigid-arm-offset',
  baseMoment: result.reactions.A.rmy,
  clearSpanMoment: result.memberResults.M1.end[5],
}, null, 2));

function solve(modelMember) {
  return analyzeComponent3D(nodes, [modelMember], [load], {
    mat: () => material,
    sec: () => section,
  });
}

function closeVector(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label}: length mismatch`);
  for (let i = 0; i < actual.length; i += 1) close(actual[i], expected[i], tolerance, `${label}[${i}]`);
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}
