import assert from 'node:assert/strict';
import {
  analyzeModel,
  createModel,
  validateModel,
} from '../src/index.js';
import { expandAdvancedLoads } from '../src/solver/elasticExpansion.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const model = createLoadConditionModel();
const document = createFakeIndexDocument();
buildNativeIndexShell(document);

let lastResult = null;
const target = {
  document,
  location: { search: '' },
  localStorage: createMemoryStorage(),
  model: () => model,
  activeResult: () => lastResult?.envelope || null,
  reanalyze: () => {
    lastResult = target.analyzeModel(model);
    return lastResult;
  },
  draw: () => {},
  getComputedStyle(element) {
    return {
      display: element.style?.display || 'block',
      visibility: element.style?.visibility || 'visible',
    };
  },
};
document.defaultView = target;

installIndexEngineBridge(target);

for (const id of [
  'ssAdvancedLoadConditionPanel',
  'ssSettleDof',
  'ssSettleValue',
  'ssSettleCase',
  'ssLoadType',
  'ssLoadW1',
  'ssLoadW2',
  'ssLoadFrom',
  'ssLoadTo',
  'ssLoadDir',
  'ssTempMode',
  'ssTempDt',
  'ssTempTop',
  'ssTempBot',
  'ssTempH',
  'ssMemberBehavior',
]) {
  assert.ok(document.getElementById(id), `${id} should exist`);
}

const capabilities = target.SStructuresAgent.getCapabilities();
for (const action of [
  'setSettlement',
  'addPartialLoad',
  'addTemperatureLoad',
  'setMemberBehavior',
  'nativeSetSettlement',
  'nativeAddPartialLoad',
  'nativeAddTemperatureLoad',
  'nativeSetMemberBehavior',
]) {
  assert.ok(capabilities.executeActions.includes(action), `${action} should be exposed`);
}
assert.ok(capabilities.milestones.some((item) => item.id === 'P5-M4'));
assert.ok(document.querySelector('[data-tool="settle"]'));
assert.ok(document.querySelector('[data-tool="temp"]'));

let snapshot = target.SStructuresAgent.execute('setSettlement', {
  nodeId: 'B',
  settlement: { uz: -0.01 },
});
assert.equal(snapshot.actionResult.node.settlement.uz, -0.01);

snapshot = target.SStructuresAgent.execute('addPartialLoad', {
  id: 'LP1',
  memberId: 'M1',
  w: 2.5,
  from: 0.2,
  to: 0.7,
  dir: '-z',
  case: 'D',
});
assert.equal(snapshot.actionResult.load.type, 'udl-partial');
assert.equal(snapshot.actionResult.load.from, 0.2);
assert.equal(snapshot.actionResult.load.to, 0.7);

snapshot = target.SStructuresAgent.execute('addTemperatureLoad', {
  id: 'LT1',
  memberId: 'M1',
  dT: 18,
  case: 'D',
});
assert.equal(snapshot.actionResult.load.type, 'temperature');
assert.equal(snapshot.actionResult.load.dT, 18);

target.SStructuresAgent.execute('selectEntity', { type: 'node', id: 'B' });
document.getElementById('ssSettleDof').value = 'ux';
document.getElementById('ssSettleValue').value = '0.002';
document.getElementById('ssApplySettlement').click();
assert.equal(model.nodes.find((node) => node.id === 'B').settlement.ux, 0.002);
assert.equal(document.querySelector('[data-tool="settle"]').classList.contains('active'), true);

target.SStructuresAgent.execute('selectEntity', { type: 'member', id: 'M1' });
document.getElementById('ssLoadType').value = 'trapezoid';
document.getElementById('ssLoadW1').value = '1.5';
document.getElementById('ssLoadW2').value = '4.5';
document.getElementById('ssLoadFrom').value = '0.1';
document.getElementById('ssLoadTo').value = '0.9';
document.getElementById('ssApplyPartialLoad').click();
const trapezoid = model.loads.find((load) => load.type === 'trapezoid');
assert.equal(trapezoid.w1, 1.5);
assert.equal(trapezoid.w2, 4.5);
assert.equal(trapezoid.from, 0.1);
assert.equal(trapezoid.to, 0.9);

target.SStructuresAgent.execute('selectEntity', { type: 'member', id: 'M1' });
document.getElementById('ssTempMode').value = 'tgradient';
document.getElementById('ssTempTop').value = '30';
document.getElementById('ssTempBot').value = '10';
document.getElementById('ssTempH').value = '0.3';
document.getElementById('ssApplyTemperatureLoad').click();
const gradient = model.loads.find((load) => load.type === 'tgradient');
assert.equal(gradient.dTtop, 30);
assert.equal(gradient.dTbot, 10);
assert.equal(gradient.h, 0.3);

assert.equal(validateModel(model).ok, true);
let analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
const features = analysis.byCombo.CO1.elasticExpansion.features;
assert.equal(features.settlements, 1);
assert.equal(features.partialDistributed, 1);
assert.equal(features.trapezoid, 1);
assert.equal(features.temperature, 1);
assert.equal(features.temperatureGradient, 1);
assert.ok(analysis.byCombo.CO1.elasticExpansion.review.settlementForceTraceReady);
assert.ok(analysis.byCombo.CO1.elasticExpansion.handcalc.some((row) => row.type === 'udl-partial'));
assert.ok(analysis.byCombo.CO1.elasticExpansion.handcalc.some((row) => row.type === 'temperature'));

target.SStructuresAgent.execute('selectEntity', { type: 'member', id: 'M1' });
document.getElementById('ssMemberBehavior').value = 'truss';
document.getElementById('ssApplyMemberBehavior').click();
assert.equal(model.members.find((member) => member.id === 'M1').type, 'truss');
assert.equal(expandAdvancedLoads(model.loads, model).trace.features.trussMembers, 1);

snapshot = target.SStructuresAgent.execute('nativeSetMemberBehavior', {
  memberId: 'M1',
  type: 'compressionOnly',
});
assert.equal(model.members.find((member) => member.id === 'M1').type, 'compressionOnly');
assert.equal(expandAdvancedLoads(model.loads, model).trace.features.compressionOnlyMembers, 1);

console.log(JSON.stringify({
  ok: true,
  loadTypes: model.loads.map((load) => load.type),
  settlement: model.nodes.find((node) => node.id === 'B').settlement,
  behavior: model.members.find((member) => member.id === 'M1').type,
  features: expandAdvancedLoads(model.loads, model).trace.features,
}, null, 2));

function createLoadConditionModel() {
  const result = createModel();
  result.nodes = [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, support: 'spring', spring: { kx: 1000000, kz: 1000000 } },
  ];
  result.members = [{
    id: 'M1',
    type: 'frame',
    n1: 'A',
    n2: 'B',
    matId: 'steel',
    secId: 'h300',
    releases: { i: 'rigid', j: 'rigid' },
  }];
  result.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }];
  result.loadCombinations = [{ id: 'CO1', name: 'D', type: 'strength', factors: { D: 1 } }];
  result.loads = [];
  return result;
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
