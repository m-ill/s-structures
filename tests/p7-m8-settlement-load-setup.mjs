import assert from 'node:assert/strict';
import { createPracticeModel } from '../src/core/modelFactory.js';
import { analyzeModel } from '../src/solver/linear3d.js';
import { runSecondOrderPDelta } from '../src/solver/pdelta/secondOrder.js';

const settlement = settlementModel();
const direct = runSecondOrderPDelta(settlement, { D: 1 }, { loadSteps: 2 });
assert.equal(direct.ok, true, direct.reason);
close(direct.result.disp.C[0], 0.001, 1e-12, 'prescribed displacement');
close(direct.result.disp.B[0], 0.0005, 1e-12, 'partitioned free displacement');
close(direct.result.reactions.A.rx, -5, 1e-9, 'left settlement reaction');
close(direct.result.reactions.C.rx, 5, 1e-9, 'right settlement reaction');
assert.equal(direct.prescribedDisplacements.method, 'partitioned-Kff-Df-equals-Ff-minus-Kfc-Dc');
assert.equal(direct.prescribedDisplacements.count, 1);
assert.equal(direct.result.recovery.elementNodeClosure.status, 'PASS');
assert.equal(direct.result.summary.equilibriumStatus, 'PASS');

const practice = createPracticeModel({
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 3 },
  ],
  members: [{ id: 'M1', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300' }],
  loads: [{ id: 'H', type: 'nodal', node: 'N2', P: 1, dir: '+x', case: 'D-SW' }],
  loadCombinations: [],
  analysisSettings: { validateBeforeSolve: false, responseSpectrum: { enabled: false } },
});
const blocked = analyzeModel(practice);
assert.equal(blocked.ok, false);
assert.equal(blocked.reason, 'LOAD_SETUP_REQUIRED');
assert.deepEqual(blocked.combos, []);
assert.deepEqual(blocked.byCombo, {});
assert.equal(blocked.envelope, null);
assert.equal(blocked.analysisEligibility.eligible, false);
assert.equal(blocked.designEligibility.eligible, false);
assert.equal(blocked.combinationSelection.source, 'blocked-load-setup-required');
assert.ok(!blocked.combinationSelection.comboIds.includes('CO1'));
assert.ok(!blocked.combinationSelection.comboIds.includes('SLS1'));

console.log(JSON.stringify({
  ok: true,
  settlementReaction: direct.result.reactions.C.rx,
  closure: direct.result.recovery.elementNodeClosure.status,
  loadSetupReason: blocked.reason,
}, null, 2));

function settlementModel() {
  return {
    nodes: [
      { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'B', x: 1, y: 0, z: 0 },
      { id: 'C', x: 2, y: 0, z: 0, support: 'fixed', settlement: { ux: 0.001 } },
    ],
    members: [
      { id: 'AB', n1: 'A', n2: 'B', matId: 'MAT', secId: 'SEC' },
      { id: 'BC', n1: 'B', n2: 'C', matId: 'MAT', secId: 'SEC' },
    ],
    materials: [{
      id: 'MAT', E: 1000, G: 400, Fy: 1e9,
      allow: { fb: 1e9, ft: 1e9, fc: 1e9, fv: 1e9 },
    }],
    sections: [{ id: 'SEC', type: 'direct', A: 0.01, Iy: 0.001, Iz: 0.001, J: 0.001, Zy: 1, Zz: 1 }],
    loads: [],
    loadCases: [{ id: 'D', type: 'dead' }],
    loadCombinations: [{ id: 'C', factors: { D: 1 } }],
    analysisSettings: { validateBeforeSolve: false, responseSpectrum: { enabled: false } },
  };
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}
