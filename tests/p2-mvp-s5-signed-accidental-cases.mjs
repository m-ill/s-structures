import assert from 'node:assert/strict';
import {
  LOAD_ESTIMATION_VERSION,
  applyDesignBasisLoads,
  createKdsRuleBasedLoadCombinations,
  createModel,
} from '../src/index.js';

const model = createMassModel();
const estimation = applyDesignBasisLoads(model, {
  windPressureX: 2,
  windPressureY: 0,
  seismicCoefficientX: 0.1,
  seismicCoefficientY: 0,
  accidentalEccentricityRatio: 0.1,
});

assert.equal(estimation.summary.signedAccidentalCases, true);
assert.ok(model.loadCases.some((item) => item.id === 'WXAP'));
assert.ok(model.loadCases.some((item) => item.id === 'WXAN'));
assert.ok(traceRow(estimation, 'WXAP-NODE-ST1'));
assert.equal(loadAt(model, 'WXAP', 'T3') > loadAt(model, 'WXAP', 'T1'), true);
assert.equal(loadAt(model, 'WXAN', 'T3') < loadAt(model, 'WXAN', 'T1'), true);

const combos = createKdsRuleBasedLoadCombinations(model);
const signedCombo = combos.find((combo) => combo.id === 'KDS-ST-04-WXAP');
assert.ok(signedCombo);
assert.equal(signedCombo.factors.WXAP > 0, true);
assert.equal(signedCombo.ruleTrace.explicitSigned, true);
assert.equal(combos.some((combo) => combo.id === 'KDS-ST-04-WXAP-N'), false);

console.log(JSON.stringify({
  ok: true,
  version: LOAD_ESTIMATION_VERSION,
  cases: model.loadCases.filter((item) => /A[PN]$/.test(item.id)).length,
  signedCombos: combos.filter((combo) => combo.ruleTrace?.explicitSigned).length,
}, null, 2));

function createMassModel() {
  const model = createModel();
  model.nodes = [
    node('B1', 0, 0, 0, 'fixed'), node('B2', 4, 0, 0, 'fixed'),
    node('B3', 0, 4, 0, 'fixed'), node('B4', 4, 4, 0, 'fixed'),
    node('T1', 0, 0, 3), node('T2', 4, 0, 3), node('T3', 0, 4, 3), node('T4', 4, 4, 3),
  ];
  model.members = ['1', '2', '3', '4'].map((id, i) => member(`C${id}`, `B${id}`, `T${i + 1}`));
  model.diaphragms = [{ id: 'D1', type: 'rigid', z: 3 }];
  return model;
}

function node(id, x, y, z, support) {
  return { id, x, y, z, support, mass: support ? undefined : [2, 2, 2] };
}

function member(id, n1, n2) {
  return { id, type: 'frame', n1, n2, matId: 'steel', secId: 'h400' };
}

function loadAt(model, caseId, nodeId) {
  return model.loads.find((load) => load.case === caseId && load.node === nodeId)?.P || 0;
}

function traceRow(estimation, id) {
  return estimation.derivationTrace.rows.find((row) => row.id === id);
}
