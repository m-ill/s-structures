import assert from 'node:assert/strict';
import { analyzeAll as analyzeCanonicalFirstOrder } from '../src/solver/linear3dFirstOrder.js';
import { runSecondOrderPDelta } from '../src/solver/pdelta/secondOrder.js';
import { analyzePhase15Architecture } from '../verification/harnesses/check-phase15-architecture.mjs';

const model = cantileverModel();
const factors = { W: 1 };
const canonicalLinear = analyzeCanonicalFirstOrder(model, factors);
assert.equal(canonicalLinear.ok, true, canonicalLinear.reason);

let injectionCalls = 0;
const injected = runSecondOrderPDelta(model, factors, {
  loadSteps: 2,
  linearAnalyzer(inputModel, inputFactors) {
    injectionCalls += 1;
    assert.equal(inputModel, model);
    assert.equal(inputFactors, factors);
    return canonicalLinear;
  },
});
assert.equal(injectionCalls, 1, 'explicit first-order analyzer injection must be honored exactly once');
assert.equal(injected.ok, true, injected.reason);

const supplied = runSecondOrderPDelta(model, factors, {
  loadSteps: 2,
  linear: canonicalLinear,
});
assert.equal(supplied.ok, true, supplied.reason);
close(supplied.result.disp.N2[0], injected.result.disp.N2[0], 1e-12, 'supplied/injected seed parity');

const publicApi = await import('../src/index.js');
const publicRun = publicApi.runSecondOrderPDelta(model, factors, { loadSteps: 2 });
assert.equal(publicRun.ok, true, publicRun.reason);
close(publicRun.result.disp.N2[0], supplied.result.disp.N2[0], 1e-12, 'public/direct seed parity');

const architecture = await analyzePhase15Architecture();
assert.deepEqual(architecture.cycles, [], 'first-order ownership must not introduce a source import cycle');

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['P15-ARCH-01', 'P15-M8-PDELTA-SEED'],
  injectionCalls,
  directDisplacement: supplied.result.disp.N2[0],
  publicDisplacement: publicRun.result.disp.N2[0],
  importCycles: architecture.cycles.length,
}, null, 2));

function cantileverModel() {
  return {
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: 0, y: 0, z: 3 },
    ],
    members: [{ id: 'M1', n1: 'N1', n2: 'N2', matId: 'MAT', secId: 'SEC' }],
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
