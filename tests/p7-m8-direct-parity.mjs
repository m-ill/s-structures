import assert from 'node:assert/strict';
import { analyzeAll } from '../src/solver/linear3d.js';
import { runSecondOrderPDelta } from '../src/solver/pdelta/secondOrder.js';

const model = cantileverModel();
const factors = { W: 1 };
const linear = analyzeAll(model, factors);
const direct = runSecondOrderPDelta(model, factors, { loadSteps: 2 });

assert.equal(linear.ok, true, linear.reason);
assert.equal(direct.ok, true, direct.reason);
assert.equal(direct.method, 'geometric-stiffness-second-order-direct');
assert.equal(direct.provenance.routedMethod, 'direct');
assert.equal(direct.convergence.converged, true);
assert.equal(direct.result.recovery.qualified, true);

const expectedUx = (10 * 3 ** 3) / (3 * 200_000_000 * 8e-5);
close(linear.disp.N2[0], expectedUx, 1e-8, 'independent cantilever displacement');
close(direct.result.disp.N2[0], expectedUx, 1e-8, 'P=0 direct displacement');
close(direct.amplification, 1, 1e-9, 'P=0 amplification');
close(direct.result.reactions.N1.rx, linear.reactions.N1.rx, 1e-9, 'reaction parity');

for (const key of ['N', 'Vy', 'Vz', 'Tq', 'My', 'Mz']) {
  const firstOrder = linear.memberResults.M1[key];
  const secondOrder = direct.result.memberResults.M1[key];
  assert.equal(secondOrder.length, firstOrder.length, `${key} station count`);
  secondOrder.forEach((value, index) => close(value, firstOrder[index], 1e-9, `${key}[${index}] parity`));
}

console.log(JSON.stringify({
  ok: true,
  expectedUx,
  directUx: direct.result.disp.N2[0],
  reactionRx: direct.result.reactions.N1.rx,
  stationCount: direct.result.memberResults.M1.xs.length,
}, null, 2));

function cantileverModel() {
  return {
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: 0, y: 0, z: 3 },
    ],
    members: [{
      id: 'M1',
      n1: 'N1',
      n2: 'N2',
      matId: 'MAT',
      secId: 'SEC',
      releases: { i: 'rigid', j: 'rigid' },
    }],
    materials: [{
      id: 'MAT',
      E: 200_000,
      G: 76_923,
      Fy: 250,
      density: 0,
      allow: { fb: 150, ft: 150, fc: 150, fv: 90 },
    }],
    sections: [{ id: 'SEC', type: 'direct', A: 0.02, Iy: 8e-5, Iz: 8e-5, J: 1e-5, Zy: 5e-4, Zz: 5e-4 }],
    loads: [{ id: 'H', type: 'nodal', node: 'N2', P: 10, dir: '+x', case: 'W' }],
    loadCases: [{ id: 'W', name: 'Wind', type: 'wind' }],
    loadCombinations: [{ id: 'C1', name: 'Wind', factors: { W: 1 } }],
    analysisSettings: { responseSpectrum: { enabled: false }, validateBeforeSolve: false },
  };
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}
