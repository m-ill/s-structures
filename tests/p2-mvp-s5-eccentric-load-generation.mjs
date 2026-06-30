import assert from 'node:assert/strict';
import {
  LOAD_ESTIMATION_VERSION,
  STORY_MASS_SUMMARY_VERSION,
  applyDesignBasisLoads,
  createModel,
} from '../src/index.js';

const model = createMassOffsetModel();
const estimation = applyDesignBasisLoads(model, {
  deadLoad: 5,
  liveLoad: 2,
  roofLiveLoad: 1,
  windPressureX: 2,
  windPressureY: 0,
  seismicCoefficientX: 0.1,
  seismicCoefficientY: 0,
});

const wx = generatedLoads(model, 'WX');
const ex = generatedLoads(model, 'EX');
assert.equal(estimation.version, LOAD_ESTIMATION_VERSION);
assert.equal(estimation.storyMassSummary.version, STORY_MASS_SUMMARY_VERSION);
assert.equal(sum(wx.map((load) => load.P)), estimation.storyLoads.lateral[0].windX);
assert.equal(wx.every((load) => load.derivation.distributionMethod === 'story-eccentric'), true);
assert.ok(loadAt(wx, 'T3') > loadAt(wx, 'T1'));
assert.ok(loadAt(ex, 'T3') > loadAt(ex, 'T1'));
assert.equal(estimation.derivationTrace.rows.some((row) => row.id === 'WX-NODE-ST1' && row.formula.includes('Mz')), true);

const uniformModel = createMassOffsetModel();
applyDesignBasisLoads(uniformModel, { windPressureX: 2 }, { eccentricDistribution: false });
const uniformWx = generatedLoads(uniformModel, 'WX');
assert.equal(new Set(uniformWx.map((load) => load.P)).size, 1);

console.log(JSON.stringify({
  ok: true,
  version: LOAD_ESTIMATION_VERSION,
  storyMass: STORY_MASS_SUMMARY_VERSION,
  wxMin: Math.min(...wx.map((load) => load.P)),
  wxMax: Math.max(...wx.map((load) => load.P)),
}, null, 2));

function createMassOffsetModel() {
  const model = createModel();
  model.nodes = [
    node('B1', 0, 0, 0, 'fixed'), node('B2', 4, 0, 0, 'fixed'),
    node('B3', 0, 4, 0, 'fixed'), node('B4', 4, 4, 0, 'fixed'),
    node('T1', 0, 0, 3, null, 1), node('T2', 4, 0, 3, null, 1),
    node('T3', 0, 4, 3, null, 3), node('T4', 4, 4, 3, null, 3),
  ];
  model.members = [member('C1', 'B1', 'T1'), member('C2', 'B2', 'T2'), member('C3', 'B3', 'T3'), member('C4', 'B4', 'T4')];
  model.diaphragms = [{ id: 'D1', type: 'rigid', z: 3 }];
  return model;
}

function node(id, x, y, z, support, mass) {
  return { id, x, y, z, support, mass: mass == null ? undefined : [mass, mass, mass] };
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
