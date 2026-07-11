import assert from 'node:assert/strict';
import { analyzeComponent3D } from '../src/solver/linear3dAssembly.js';
import { buildEquilibriumSummary } from '../src/solver/linear3dPost.js';

const EPS = 1e-9;
const material = { E: 1000, G: 400, fa: 1e9, fb: 1e9, fs: 1e9 };
const section = { A: 2, Iy: 1, Iz: 1, J: 1, Zy: 1, Zz: 1, ry: 1, rz: 1 };
const members = [
  { id: 'AB', n1: 'A', n2: 'B', behavior: 'truss', matId: 'mat', secId: 'sec' },
  { id: 'BC', n1: 'B', n2: 'C', behavior: 'truss', matId: 'mat', secId: 'sec' },
];

for (const support of ['fixed', 'custom']) {
  const restrained = support === 'fixed'
    ? { support }
    : { support, fix: [true, false, false, false, false, false] };
  const nodes = [
    { id: 'A', x: 0, y: 0, z: 0, ...restrained },
    { id: 'B', x: 1, y: 0, z: 0 },
    { id: 'C', x: 2, y: 0, z: 0, ...restrained, settlement: { ux: 0.01 } },
  ];
  const result = solve(nodes, members);
  assert.equal(result.ok, true, `${support} settlement solve failed: ${result.reason || ''}`);

  close(result.disp.C[0], 0.01, EPS, `${support} prescribed displacement`);
  close(result.disp.B[0], 0.005, EPS, `${support} partitioned middle displacement`);
  close(result.reactions.A.rx, -10, EPS, `${support} left reaction`);
  close(result.reactions.C.rx, 10, EPS, `${support} right reaction`);
  assert.equal(result.solver.prescribedDofCount, 1);
  assert.deepEqual(result.solver.prescribedDofs[0], { nodeId: 'C', dof: 'ux', value: 0.01 });

  const summary = summarize(nodes, members, [], result);
  close(summary.forceResidualNorm, 0, EPS, `${support} force equilibrium`);
  close(summary.momentResidualNorm, 0, EPS, `${support} moment equilibrium`);
  assert.equal(summary.equilibriumStatus, 'PASS');
}

const unrestrained = solve([
  { id: 'A', x: 0, y: 0, z: 0, support: 'custom', fix: [true, false, false, false, false, false] },
  { id: 'B', x: 1, y: 0, z: 0 },
  {
    id: 'C',
    x: 2,
    y: 0,
    z: 0,
    support: 'custom',
    fix: [false, true, false, false, false, false],
    settlement: { ux: 0.01 },
  },
], members);
assert.equal(unrestrained.ok, false);
assert.equal(unrestrained.reason, 'PRESCRIBED_DOF_NOT_RESTRAINED');
assert.equal(unrestrained.nodeId, 'C');
assert.equal(unrestrained.dof, 'ux');

console.log(JSON.stringify({
  ok: true,
  version: 'p7-m7-settlement-partition',
  references: ['two-element axial partition', 'fixed restraint', 'partial custom restraint'],
}, null, 2));

function solve(nodes, modelMembers) {
  return analyzeComponent3D(nodes, modelMembers, [], {
    mat: () => material,
    sec: () => section,
  });
}

function summarize(nodes, modelMembers, loads, result) {
  return buildEquilibriumSummary(nodes, modelMembers, loads, {
    ...result,
    anyOk: true,
    unstableMembers: new Set(),
    dmax: 0,
    maxRatio: 0,
  });
}

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`,
  );
}
