import assert from 'node:assert/strict';
import {
  LOAD_ESTIMATION_VERSION,
  applyDesignBasisLoads,
  createModel,
} from '../src/index.js';

const model = createSymmetricModel();
const estimation = applyDesignBasisLoads(model, {
  windPressureX: 2,
  windPressureY: 0,
  seismicCoefficientX: 0,
  seismicCoefficientY: 0,
  accidentalEccentricityRatio: 0.1,
});
const wx = generatedLoads(model, 'WX');
assert.equal(estimation.version, LOAD_ESTIMATION_VERSION);
assert.equal(sum(wx.map((load) => load.P)), estimation.storyLoads.lateral[0].windX);
assert.ok(loadAt(wx, 'T3') > loadAt(wx, 'T1'));
assert.equal(wx[0].derivation.baseEccentricity.y, 0);
assert.equal(wx[0].derivation.accidentalEccentricity.y, 0.4);
assert.equal(wx[0].derivation.eccentricity.y, 0.4);
assert.ok(traceRow(estimation, 'WX-NODE-ST1').inputs.some((input) => input.symbol === 'ea' && input.value === 0.4));

const noAccidental = createSymmetricModel();
applyDesignBasisLoads(noAccidental, { windPressureX: 2, windPressureY: 0, accidentalEccentricityRatio: 0 });
assert.equal(new Set(generatedLoads(noAccidental, 'WX').map((load) => load.P)).size, 1);

console.log(JSON.stringify({
  ok: true,
  version: LOAD_ESTIMATION_VERSION,
  accidentalY: wx[0].derivation.accidentalEccentricity.y,
  wxMin: Math.min(...wx.map((load) => load.P)),
  wxMax: Math.max(...wx.map((load) => load.P)),
}, null, 2));

function createSymmetricModel() {
  const model = createModel();
  model.nodes = [
    node('B1', 0, 0, 0, 'fixed'), node('B2', 4, 0, 0, 'fixed'),
    node('B3', 0, 4, 0, 'fixed'), node('B4', 4, 4, 0, 'fixed'),
    node('T1', 0, 0, 3, null), node('T2', 4, 0, 3, null),
    node('T3', 0, 4, 3, null), node('T4', 4, 4, 3, null),
  ];
  model.members = [member('C1', 'B1', 'T1'), member('C2', 'B2', 'T2'), member('C3', 'B3', 'T3'), member('C4', 'B4', 'T4')];
  model.diaphragms = [{ id: 'D1', type: 'rigid', z: 3 }];
  return model;
}

function node(id, x, y, z, support) {
  return { id, x, y, z, support, mass: support ? undefined : [2, 2, 2] };
}

function member(id, n1, n2) {
  return { id, type: 'frame', n1, n2, matId: 'steel', secId: 'h400' };
}

function generatedLoads(model, caseId) {
  return model.loads.filter((load) => load.generatedBy === LOAD_ESTIMATION_VERSION && load.case === caseId);
}

function loadAt(loads, nodeId) {
  return loads.find((load) => load.node === nodeId)?.P || 0;
}

function sum(values) {
  return Number(values.reduce((acc, value) => acc + value, 0).toFixed(6));
}

function traceRow(estimation, id) {
  return estimation.derivationTrace.rows.find((row) => row.id === id);
}
