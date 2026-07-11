import assert from 'node:assert/strict';
import {
  LOAD_ESTIMATION_VERSION,
  createTwoStoryElasticFrameModel,
  validateModel,
} from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { getNativeUiState } from '../src/ui/indexNativeRibbon.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const document = createFakeIndexDocument();
buildNativeIndexShell(document);

const model = createTwoStoryElasticFrameModel();
model.loads = [];
model.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }];
model.loadCombinations = [{ id: 'CO1', name: 'D', type: 'strength', factors: { D: 1 } }];

let lastResult = null;
const target = {
  document,
  location: { pathname: '/index.html', search: '', hash: '' },
  history: { replaceState() {} },
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
  'ssLoadCasePanel',
  'ssLcAdd',
  'ssLcList',
  'ssLcType',
  'ssKdsPanel',
  'ssKdsOccupancy',
  'ssKdsRegion',
  'ssKdsSoil',
  'ssKdsImportance',
  'ssKdsPreview',
  'ssKdsApply',
  'ssFloorMassGenerate',
]) {
  assert.ok(document.getElementById(id), `${id} should exist`);
}

const capabilities = target.SStructuresAgent.getCapabilities();
assert.ok(capabilities.executeActions.includes('deleteLoadCase'));
assert.ok(capabilities.executeActions.includes('applyDesignBasisLoads'));
assert.ok(capabilities.executeActions.includes('generateFloorMass'));
assert.ok(capabilities.milestones.some((item) => item.id === 'P5-M5'));

document.getElementById('ssLcId').value = 'L';
document.getElementById('ssLcName').value = 'Live load';
document.getElementById('ssLcType').value = 'live';
document.getElementById('ssLcAdd').click();
assert.ok(model.loadCases.some((loadCase) => loadCase.id === 'L' && loadCase.type === 'live'));
assert.ok(document.getElementById('ssLcList').children.length >= 2);

document.getElementById('ssLcName').value = 'Live load edited';
document.getElementById('ssLcType').value = 'roof';
document.getElementById('ssLcUpdate').click();
assert.equal(model.loadCases.find((loadCase) => loadCase.id === 'L').name, 'Live load edited');
assert.equal(model.loadCases.find((loadCase) => loadCase.id === 'L').type, 'roof');

document.getElementById('ssLcId').value = 'TMP';
document.getElementById('ssLcName').value = 'Temporary';
document.getElementById('ssLcType').value = 'other';
document.getElementById('ssLcAdd').click();
assert.ok(model.loadCases.some((loadCase) => loadCase.id === 'TMP'));
document.getElementById('ssLcDelete').click();
assert.equal(model.loadCases.some((loadCase) => loadCase.id === 'TMP'), false);

document.getElementById('ssKdsOccupancy').value = 'school';
document.getElementById('ssLoadBasisFloorArea').value = '144';
document.getElementById('ssLoadBasisRoofArea').value = '120';
document.getElementById('ssLoadBasisDead').value = '5.2';
document.getElementById('ssLoadBasisLive').value = '3.1';
document.getElementById('ssLoadBasisWindX').value = '0.8';
document.getElementById('ssLoadBasisWindY').value = '0.7';
document.getElementById('ssLoadBasisSeisX').value = '0.12';
document.getElementById('ssLoadBasisSeisY').value = '0.11';

document.getElementById('ssKdsPreview').click();
assert.equal(model.designBasis.occupancy, 'school');
assert.equal(model.loads.length, 0);
assert.equal(getNativeUiState(target).loadBasis.status, 'preview');

document.getElementById('ssKdsApply').click();
assert.equal(model.loadEstimation.version, LOAD_ESTIMATION_VERSION);
assert.ok(model.loads.some((load) => load.generatedBy === LOAD_ESTIMATION_VERSION));
assert.ok(model.loadCases.some((loadCase) => loadCase.id === 'WX'));
assert.ok(model.loadCases.some((loadCase) => loadCase.id === 'EX'));
assert.ok(model.loadCombinations.length > 0);
assert.ok(model.loadCombinations.some((combo) => Number(combo.factors?.WX || 0) !== 0 || Number(combo.factors?.EX || 0) !== 0));
assert.equal(getNativeUiState(target).loadBasis.status, 'applied');
assert.ok(getNativeUiState(target).loadBasis.combinationCount > 0);

document.getElementById('ssFloorMassPerFloor').value = '24';
document.getElementById('ssFloorMassGenerate').click();
const elevatedNodes = model.nodes.filter((node) => Number(node.z || 0) > 1e-9);
assert.ok(elevatedNodes.length > 0);
assert.ok(elevatedNodes.every((node) => Array.isArray(node.mass)));
assert.match(document.getElementById('ssFloorMassStatus').textContent, /Mass generated/);

const validation = validateModel(model);
assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));

console.log(JSON.stringify({
  ok: true,
  loadCases: model.loadCases.length,
  generatedLoads: model.loads.filter((load) => load.generatedBy === LOAD_ESTIMATION_VERSION).length,
  combinations: model.loadCombinations.length,
  massNodes: elevatedNodes.filter((node) => Array.isArray(node.mass)).length,
}, null, 2));

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
