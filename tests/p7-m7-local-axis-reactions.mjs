import assert from 'node:assert/strict';
import { resolveLoadDirection } from '../src/loads/fixedEnd/common.js';
import { analyzeComponent3D } from '../src/solver/linear3dAssembly.js';
import { memberAxes } from '../src/solver/linear3dElement.js';
import { buildEquilibriumSummary } from '../src/solver/linear3dPost.js';

const EPS = 2e-8;
const material = { E: 200000, G: 80000, fa: 1e9, fb: 1e9, fs: 1e9 };
const section = { A: 1, Iy: 0.01, Iz: 0.02, J: 0.005, Zy: 1, Zz: 1, ry: 1, rz: 1 };
const nodes = [
  { id: 'A', x: 1, y: -2, z: 0.5, support: 'fixed' },
  { id: 'B', x: 4, y: 2, z: 5.5, support: 'fixed' },
];
const member = {
  id: 'M1',
  n1: 'A',
  n2: 'B',
  matId: 'mat',
  secId: 'sec',
  localAxis: { refVector: [0.2, -0.7, 1], roll: 37 },
};
const ax = memberAxes(nodes[0], nodes[1], member.localAxis);

const globalDirection = resolveLoadDirection({ direction: [0, 0, -1], coordinate: 'global' }, ax);
const localDirection = resolveLoadDirection({ direction: [0, 0, -1], coordinate: 'member-local' }, ax);
assert.equal(globalDirection.ok, true);
assert.equal(localDirection.ok, true);
closeVector(globalDirection.global, [0, 0, -1], EPS, 'global direction retained');
closeVector(localDirection.local, [0, 0, -1], EPS, 'local direction retained');
closeVector(localDirection.global, ax.z.map((value) => -value), EPS, 'rolled local direction transformed');
assert.ok(distance(globalDirection.global, localDirection.global) > 0.2, 'global and member-local directions must remain distinct');

const cases = [
  [{ id: 'U', type: 'udl', member: 'M1', w: 3.5, dir: '-z', coordinate: 'local' }],
  [{ id: 'P', type: 'point', member: 'M1', P: 11, t: 0.31, dir: '+y', coordinate: 'member-local' }],
  [{ id: 'T', type: 'trapezoid', member: 'M1', w1: 2, w2: 7, from: 0.15, to: 0.82, dir: '-z', coordinateSystem: 'local' }],
  [{ id: 'C', type: 'mmoment', member: 'M1', M: 9, axis: 'y', at: 0.44 }],
  [
    { id: 'UG', type: 'udl', member: 'M1', w: 1.5, direction: [0, 0, -1], coordinate: 'global' },
    { id: 'PL', type: 'point', member: 'M1', P: 4, t: 0.6, dir: '+y', coordinate: 'local' },
    { id: 'TL', type: 'trapezoid', member: 'M1', w1: 1, w2: 3, from: 0.2, to: 0.9, dir: '-z', coordinate: 'local' },
    { id: 'CL', type: 'mmoment', member: 'M1', M: -5, axis: 'z', at: 0.25 },
  ],
];

for (const loads of cases) {
  const result = analyzeComponent3D(nodes, [member], loads, {
    mat: () => material,
    sec: () => section,
  });
  assert.equal(result.ok, true, `${loads.map((load) => load.id).join('+')}: ${result.reason || 'solve failed'}`);
  const summary = buildEquilibriumSummary(nodes, [member], loads, {
    ...result,
    anyOk: true,
    unstableMembers: new Set(),
    dmax: 0,
    maxRatio: 0,
  });
  assert.equal(summary.equilibriumStatus, 'PASS', `${loads.map((load) => load.id).join('+')}: ${summary.equilibriumFailureReason}`);
  assert.equal(summary.designBlocked, false);
  assert.deepEqual(summary.equilibriumIssues, []);
  closeVector(summary.residualResultant, [0, 0, 0, 0, 0, 0], EPS, `${loads.map((load) => load.id).join('+')} six-resultant closure`);
  closeVector(
    summary.totalReactionResultant,
    summary.totalLoadResultant.map((value) => -value),
    EPS,
    `${loads.map((load) => load.id).join('+')} reactions`,
  );
}

const invalidSummary = buildEquilibriumSummary(nodes, [member], [], {
  anyOk: true,
  unstableMembers: new Set(),
  reactions: { A: { rx: Number.NaN, ry: 0, rz: 0, rmx: 0, rmy: 0, rmz: 0 } },
  solver: {},
  dmax: 0,
  maxRatio: 0,
});
assert.equal(invalidSummary.equilibriumStatus, 'NOT_AVAILABLE');
assert.equal(invalidSummary.designBlocked, true);
assert.equal(invalidSummary.totalReaction, null);
assert.equal(invalidSummary.totalReactionResultant, null);
assert.equal(invalidSummary.equilibriumFailureReason, 'NONFINITE_REACTION_COMPONENT');
assert.ok(invalidSummary.equilibriumIssues.some((issue) => issue.code === 'NONFINITE_REACTION_COMPONENT'));

console.log(JSON.stringify({
  ok: true,
  version: 'p7-m7-local-axis-six-resultant-v1',
  cases: cases.map((loads) => loads.map((load) => load.id).join('+')),
}, null, 2));

function closeVector(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label}: length mismatch`);
  for (let i = 0; i < actual.length; i += 1) {
    assert.ok(Math.abs(actual[i] - expected[i]) <= tolerance, `${label}[${i}]: expected ${expected[i]}, got ${actual[i]}`);
  }
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
