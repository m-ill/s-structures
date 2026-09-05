import assert from 'node:assert/strict';
import { fixedEndMemberMoment } from '../src/loads/fixedEnd/memberMoment.js';
import { analyzeComponent3D } from '../src/solver/linear3dAssembly.js';
import { buildEquilibriumSummary } from '../src/solver/linear3dPost.js';

const EPS = 1e-7;
const L = 4;
const ratio = 0.35;
const M = 12;
const ax = { L, x: [1, 0, 0], y: [0, 0, 1], z: [0, -1, 0] };
const material = { E: 200000, G: 80000, fa: 1e9, fb: 1e9, fs: 1e9 };
const section = { A: 1, Iy: 0.01, Iz: 0.02, J: 0.005, Zy: 1, Zz: 1, ry: 1, rz: 1 };

const contract = fixedEndMemberMoment({ id: 'MM', type: 'mmoment', member: 'M1', M, axis: 'z', at: ratio }, ax);
assert.equal(contract.ok, true);
assert.equal(contract.method, 'consistent-member-point-couple');

const derivatives = [
  (-6 * ratio + 6 * ratio ** 2) / L,
  1 - 4 * ratio + 3 * ratio ** 2,
  (6 * ratio - 6 * ratio ** 2) / L,
  3 * ratio ** 2 - 2 * ratio,
];
for (const [dof, expected] of [[1, M * derivatives[0]], [5, M * derivatives[1]], [7, M * derivatives[2]], [11, M * derivatives[3]]]) {
  close(contract.fe[dof], expected, EPS, `consistent vector dof ${dof}`);
  close(contract.q0[dof], -expected, EPS, `fixed-end vector dof ${dof}`);
}
close(contract.fe[1] + contract.fe[7], 0, EPS, 'equivalent nodal force resultant');
close(contract.fe[5] + contract.fe[11] + L * contract.fe[7], M, EPS, 'equivalent nodal moment resultant');

const yContract = fixedEndMemberMoment({ id: 'MMY', type: 'mmoment', member: 'M1', M, axis: 'y', at: ratio }, ax);
close(yContract.fe[2] + yContract.fe[8], 0, EPS, 'local-y equivalent nodal force resultant');
close(yContract.fe[4] + yContract.fe[10] - L * yContract.fe[8], M, EPS, 'local-y equivalent nodal moment resultant');

const nodes = [
  { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
  { id: 'B', x: L, y: 0, z: 0, support: 'fixed' },
];
const members = [{ id: 'M1', n1: 'A', n2: 'B', matId: 'mat', secId: 'sec' }];
const loads = [{ id: 'MM', type: 'mmoment', member: 'M1', M, axis: 'z', at: ratio }];
const fixedFixed = solve(nodes, members, loads);
assert.equal(fixedFixed.ok, true, fixedFixed.reason);
closeVector(fixedFixed.memberResults.M1.end, contract.q0, EPS, 'fixed-fixed end forces');
assert.ok(fixedFixed.memberResults.M1.dmaxM > 0, 'point couple fixed-fixed deformation must be recovered');
const midspanFlexibilityDerivative = numericalDerivative(
  (loadPosition) => fixedFixedPointForceFlexibility(loadPosition, L / 2, L),
  ratio * L,
);
close(
  fixedFixed.memberResults.M1.shape[10][2],
  M * midspanFlexibilityDerivative / (material.E * section.Iz),
  1e-8,
  'fixed-fixed point-couple deformation',
);

const stations = fixedFixed.memberResults.M1;
const a = ratio * L;
const left = greatestIndexBelow(stations.xs, a);
const right = smallestIndexAbove(stations.xs, a);
close(stations.Mz[right] - stations.Mz[left], -M, 1e-5, 'point-couple station moment jump');

const fixedSummary = summarize(nodes, members, loads, fixedFixed);
closeVector(fixedSummary.totalLoadMoment, [0, -M, 0], EPS, 'member couple global resultant');
assert.ok(fixedSummary.forceResidualNorm < EPS);
assert.ok(fixedSummary.momentResidualNorm < EPS);
assert.equal(fixedSummary.equilibriumStatus, 'PASS');

const simpleNodes = [
  { id: 'A', x: 0, y: 0, z: 0, support: 'pin' },
  { id: 'B', x: L, y: 0, z: 0, support: 'custom', fix: [false, true, true, false, false, false] },
];
const simple = solve(simpleNodes, members, loads);
assert.equal(simple.ok, true, simple.reason);
close(simple.reactions.A.rz, M / L, 1e-5, 'simple beam left reaction');
close(simple.reactions.B.rz, -M / L, 1e-5, 'simple beam right reaction');

console.log(JSON.stringify({
  ok: true,
  version: 'p7-m7-consistent-point-couple',
  stationJump: stations.Mz[right] - stations.Mz[left],
}, null, 2));

function solve(modelNodes, modelMembers, modelLoads) {
  return analyzeComponent3D(modelNodes, modelMembers, modelLoads, {
    mat: () => material,
    sec: () => section,
  });
}

function summarize(modelNodes, modelMembers, modelLoads, result) {
  return buildEquilibriumSummary(modelNodes, modelMembers, modelLoads, {
    ...result,
    anyOk: true,
    unstableMembers: new Set(),
    dmax: result.memberResults.M1.dmaxM,
    maxRatio: 0,
  });
}

function greatestIndexBelow(values, target) {
  let result = -1;
  values.forEach((value, index) => {
    if (value < target && (result < 0 || value > values[result])) result = index;
  });
  return result;
}

function smallestIndexAbove(values, target) {
  let result = -1;
  values.forEach((value, index) => {
    if (value > target && (result < 0 || value < values[result])) result = index;
  });
  return result;
}

function closeVector(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label}: length mismatch`);
  for (let i = 0; i < actual.length; i += 1) close(actual[i], expected[i], tolerance, `${label}[${i}]`);
}

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

function numericalDerivative(fn, x) {
  const h = 1e-6;
  return (fn(x + h) - fn(x - h)) / (2 * h);
}

function fixedFixedPointForceFlexibility(a, x, length) {
  const b = length - a;
  if (x <= a) {
    return (b ** 2 * x ** 2 * (3 * a * length - (3 * a + b) * x)) / (6 * length ** 3);
  }
  const x2 = length - x;
  return (a ** 2 * x2 ** 2 * (3 * b * length - (3 * b + a) * x2)) / (6 * length ** 3);
}
