import assert from 'node:assert/strict';
import { buildAnalysisAudit } from '../src/solver/analysisAudit.js';
import { buildEquilibriumSummary } from '../src/solver/linear3dPost.js';

const EPS = 1e-10;
const nodes = [
  { id: 'A', x: 0, y: 0, z: 0 },
  { id: 'B', x: 4, y: 0, z: 0 },
];
const members = [{ id: 'M1', n1: 'A', n2: 'B' }];
const loads = [
  { id: 'P', type: 'nodal', node: 'B', P: 10, dir: '-z' },
  { id: 'NM', type: 'nmoment', node: 'A', M: 5, axis: 'y' },
  { id: 'TR', type: 'trapezoid', member: 'M1', w1: 2, w2: 4, from: 0, to: 1, dir: '-z' },
  { id: 'MM', type: 'mmoment', member: 'M1', M: 3, axis: 'z', at: 0.5 },
];

const expectedLoadMomentY = 10 * 4 + 5 + (4 ** 2 * (2 + 2 * 4)) / 6 - 3;
const closed = summary({
  rx: 0,
  ry: 0,
  rz: 22,
  rmx: 0,
  rmy: -expectedLoadMomentY,
  rmz: 0,
});
closeVector(closed.totalLoad, [0, 0, -22], EPS, 'total applied force');
closeVector(closed.totalLoadMoment, [0, expectedLoadMomentY, 0], EPS, 'total applied moment');
closeVector(closed.totalReaction, [0, 0, 22], EPS, 'total reaction force');
closeVector(closed.totalReactionMoment, [0, -expectedLoadMomentY, 0], EPS, 'total reaction moment');
closeVector(closed.residualResultant, [0, 0, 0, 0, 0, 0], EPS, 'six-resultant residual');
assert.equal(closed.forceResidualNorm, 0);
assert.equal(closed.momentResidualNorm, 0);
assert.equal(closed.equilibriumStatus, 'PASS');

const badMoment = summary({
  rx: 0,
  ry: 0,
  rz: 22,
  rmx: 0,
  rmy: -expectedLoadMomentY + 1,
  rmz: 0,
});
assert.equal(badMoment.forceResidualNorm, 0);
assert.ok(badMoment.momentResidualNorm > 0.01);
assert.equal(badMoment.equilibriumStatus, 'FAIL');

const audit = buildAnalysisAudit({
  ok: true,
  byCombo: {
    BAD_MOMENT: { ok: true, anyOk: true, summary: badMoment },
  },
});
assert.equal(audit.ok, false);
assert.equal(audit.status, 'FAIL');
assert.equal(audit.failedEquilibriumComboCount, 1);
assert.equal(audit.rows[0].equilibriumStatus, 'FAIL');
assert.equal(audit.rows[0].forceResidualNorm, 0);
assert.equal(audit.rows[0].momentResidualNorm, badMoment.momentResidualNorm);
assert.ok(audit.warnings.some((warning) => warning.code === 'MOMENT_EQUILIBRIUM_RESIDUAL'));

const badForce = summary({
  rx: 0,
  ry: 0,
  rz: 23,
  rmx: 0,
  rmy: -expectedLoadMomentY,
  rmz: 0,
});
assert.ok(badForce.forceResidualNorm > 0.04);
assert.equal(badForce.momentResidualNorm, 0);

console.log(JSON.stringify({
  ok: true,
  version: closed.equilibriumVersion,
  forceResidualNorm: badForce.forceResidualNorm,
  momentResidualNorm: badMoment.momentResidualNorm,
  auditStatus: audit.status,
}, null, 2));

function summary(reaction) {
  return buildEquilibriumSummary(nodes, members, loads, {
    anyOk: true,
    unstableMembers: new Set(),
    reactions: { A: reaction },
    solver: { residualNorm: 0, residualMax: 0 },
    dmax: 0,
    maxRatio: 0,
  });
}

function closeVector(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label}: length mismatch`);
  for (let i = 0; i < actual.length; i += 1) {
    assert.ok(Math.abs(actual[i] - expected[i]) <= tolerance, `${label}[${i}]: expected ${expected[i]}, got ${actual[i]}`);
  }
}
