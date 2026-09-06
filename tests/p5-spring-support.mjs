import assert from 'node:assert/strict';
import {
  analyzeModel,
  createModel,
  validateModel,
} from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const model = createSpringSupportModel();
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

assert.ok(document.querySelector('[data-tool="spring"]'), 'native palette should include spring support tool');
assert.ok(document.getElementById('ssSpringSupportPanel'), 'spring support coefficient form should exist');
assert.ok(target.SStructuresAgent.getSnapshot().availableActions.includes('setSpringSupport'));
assert.ok(target.SStructuresAgent.getCapabilities().executeActions.includes('nativeSetSpringSupport'));
assert.ok(target.SStructuresAgent.getCapabilities().milestones.some((item) => item.id === 'P5-M3'));

let snapshot = target.SStructuresAgent.execute('setSpringSupport', {
  nodeId: 'B',
  spring: { kx: 0, ky: 0, kz: 500000, krx: 0, kry: 0, krz: 0 },
});
assert.equal(model.nodes.find((node) => node.id === 'B').support, 'spring');
assert.equal(model.nodes.find((node) => node.id === 'B').spring.kz, 500000);
assert.equal(snapshot.actionResult.node.spring.kz, 500000);
assert.equal(validateModel(model).ok, true);

let analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
assert.ok(Number.isFinite(analysis.byCombo.CO1.reactions.B.rz));
assert.ok(Math.abs(analysis.byCombo.CO1.reactions.B.rz) > 0, 'spring support should create a vertical reaction');

target.SStructuresAgent.execute('selectEntity', { type: 'node', id: 'B' });
document.getElementById('ssSpringKZ').value = '750000';
document.getElementById('ssSpringKX').value = '1000';
document.getElementById('ssApplySpringSupport').click();
assert.equal(model.nodes.find((node) => node.id === 'B').spring.kz, 750000);
assert.equal(model.nodes.find((node) => node.id === 'B').spring.kx, 1000);
assert.equal(document.querySelector('[data-tool="spring"]').classList.contains('active'), true);

snapshot = target.SStructuresAgent.execute('nativeSetSpringSupport', {
  nodeId: 'B',
  spring: { kz: 250000, ky: 2000 },
});
assert.equal(snapshot.nativeModeler.activeTool, 'spring');
assert.equal(model.nodes.find((node) => node.id === 'B').spring.kz, 250000);
assert.equal(model.nodes.find((node) => node.id === 'B').spring.ky, 2000);

analysis = analyzeModel(model);
assert.equal(analysis.ok, true);
assert.ok(Math.abs(analysis.byCombo.CO1.reactions.B.rz) > 0);
assert.ok(analysis.byCombo.CO1.elasticExpansion.features.springSupports >= 1);

console.log(JSON.stringify({
  ok: true,
  support: model.nodes.find((node) => node.id === 'B').support,
  springKz: model.nodes.find((node) => node.id === 'B').spring.kz,
  reactionBz: analysis.byCombo.CO1.reactions.B.rz,
  springSupports: analysis.byCombo.CO1.elasticExpansion.features.springSupports,
}, null, 2));

function createSpringSupportModel() {
  const result = createModel();
  result.nodes = [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, support: null },
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
  result.loads = [
    { id: 'P1', type: 'nodal', node: 'B', P: 10, dir: '-z', case: 'D' },
  ];
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
