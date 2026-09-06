import assert from 'node:assert/strict';
import { analyzeModel } from '../src/solver/linear3d.js';
import { runSecondOrderPDelta } from '../src/solver/pdelta/secondOrder.js';
import { evaluateConstrainedTangentStability } from '../src/solver/pdelta/stability.js';

const ELASTIC_E = 1e9;
const I = 1e-3;
const L = 3;
const H = 1;
const EULER_PCR = (Math.PI ** 2 * ELASTIC_E * I) / (4 * L ** 2);

const compression = 0.4 * EULER_PCR;
const model = beamColumnModel(compression);
const direct = runSecondOrderPDelta(model, { D: 1, W: 1 }, { loadSteps: 2 });
const q = Math.sqrt(compression / (ELASTIC_E * I)) * L;
const exactAmplification = (3 * (Math.tan(q) - q)) / q ** 3;

assert.equal(direct.ok, true, direct.reason);
closeRelative(direct.amplification, exactAmplification, 0.01, 'closed-form beam-column amplification');
assert.equal(direct.amplificationTrace.governing.component, 'ux');
assert.equal(direct.convergence.iterationMethod, 'picard-fixed-point-updated-axial-stiffness');
assert.equal(direct.convergence.solverClass, 'total-displacement-fixed-point');
assert.equal(direct.convergence.newtonRaphson, false);
assert.deepEqual(direct.convergence.finalNorms.dimensions, {
  translationIncrement: 'length/length',
  rotationIncrement: 'rotation/rotation',
  forceResidual: 'force/force',
  momentResidual: 'moment/moment',
});

const tipUx = direct.result.disp.T[0];
closeRelative(Math.abs(direct.result.reactions.B.rmy), H * L + compression * tipUx, 0.01, 'second-order base moment');
assert.equal(direct.result.recovery.elementNodeClosure.status, 'PASS');
assert.ok(direct.result.recovery.elementNodeClosure.forceResidualNorm < 1e-10);
assert.ok(direct.result.recovery.elementNodeClosure.momentResidualNorm < 1e-10);
assert.equal(direct.result.summary.equilibriumStatus, 'PASS');
assert.ok(direct.result.memberResults.C.geometricStationEndClosure.ok);

const below = evaluateConstrainedTangentStability(eulerGateMatrix(0.8), [0, 1], { tolerance: 1e-8 });
const near = evaluateConstrainedTangentStability(eulerGateMatrix(1 - 1e-10), [0, 1], { tolerance: 1e-8 });
const above = evaluateConstrainedTangentStability(eulerGateMatrix(1.2), [0, 1], { tolerance: 1e-8 });
assert.equal(below.stable, true);
assert.equal(near.stable, false);
assert.equal(above.stable, false);

const combinations = beamColumnModel(0);
combinations.analysisSettings.pDeltaMethod = 'direct';
combinations.loads[0].P = EULER_PCR;
combinations.loadCombinations = [
  { id: 'BELOW', name: 'Below Euler', factors: { D: 0.4, W: 1 } },
  { id: 'ABOVE', name: 'Above Euler', factors: { D: 1.02, W: 1 } },
];
const gated = analyzeModel(combinations);
assert.equal(gated.ok, false);
assert.equal(gated.pDelta.byCombo.BELOW.ok, true);
assert.equal(gated.pDelta.byCombo.ABOVE.ok, false);
assert.equal(gated.pDelta.byCombo.ABOVE.status, 'unstable');
assert.equal(gated.pDelta.byCombo.ABOVE.designEligibility.eligible, false);
assert.equal(gated.pDelta.envelope.complete, false);
assert.equal(gated.pDelta.envelope.designBlocked, true);
assert.deepEqual(gated.pDelta.envelope.sources.map((item) => item.id), ['BELOW']);
assert.equal(gated.pDelta.designEligibility.eligible, false);
assert.equal(gated.designEligibility.eligible, false);
assert.equal(gated.design.ok, false);

console.log(JSON.stringify({
  ok: true,
  exactAmplification,
  computedAmplification: direct.amplification,
  eulerPcr: EULER_PCR,
  estimatedPcr: direct.stability.critical.estimatedPcr,
  failedCombination: gated.pDelta.byCombo.ABOVE.reason,
}, null, 2));

function beamColumnModel(axialLoad) {
  return {
    nodes: [
      { id: 'B', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'T', x: 0, y: 0, z: L },
    ],
    members: [{ id: 'C', n1: 'B', n2: 'T', matId: 'MAT', secId: 'SEC' }],
    materials: [{
      id: 'MAT', E: 1e6, G: 4e5, Fy: 1e9,
      allow: { fb: 1e9, ft: 1e9, fc: 1e9, fv: 1e9 },
    }],
    sections: [{ id: 'SEC', type: 'direct', A: 1, Iy: I, Iz: I, J: I, Zy: 1, Zz: 1 }],
    loads: [
      { id: 'P', type: 'nodal', node: 'T', P: axialLoad, dir: '-z', case: 'D' },
      { id: 'H', type: 'nodal', node: 'T', P: H, dir: '+x', case: 'W' },
    ],
    loadCases: [{ id: 'D', type: 'dead' }, { id: 'W', type: 'wind' }],
    loadCombinations: [{ id: 'C', factors: { D: 1, W: 1 } }],
    analysisSettings: { validateBeforeSolve: false, responseSpectrum: { enabled: false } },
  };
}

function eulerGateMatrix(loadRatio) {
  return [[1 - loadRatio, 0], [0, 1]];
}

function closeRelative(actual, expected, tolerance, label) {
  const error = Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
  assert.ok(error <= tolerance, `${label}: expected ${expected}, got ${actual}, relative error ${error}`);
}
