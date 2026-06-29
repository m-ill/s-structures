import assert from 'node:assert/strict';
import {
  DESIGN_BASIS_INPUT_VERSION,
  LOAD_ESTIMATION_VERSION,
  createTwoStoryElasticFrameModel,
} from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { getNativeUiState } from '../src/ui/indexNativeRibbon.js';
import {
  AGENT_COMMAND_EVENT,
  AGENT_API_NODE_ID,
} from '../src/ui/indexAgentCommandBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const document = createFakeIndexDocument();
buildNativeIndexShell(document);

const model = createTwoStoryElasticFrameModel();
model.loads = [];
model.loadCases = [];
let result = null;
const counters = { reanalyze: 0, draw: 0 };
const target = {
  document,
  location: { pathname: '/index.html', search: '', hash: '' },
  history: {
    replaceState() {},
  },
  localStorage: createMemoryStorage(),
  model: () => model,
  activeResult: () => result?.envelope || null,
  reanalyze: () => {
    counters.reanalyze += 1;
    result = target.analyzeModel(model);
    return result;
  },
  draw: () => {
    counters.draw += 1;
  },
  getComputedStyle(element) {
    return {
      display: element.style?.display || 'block',
      visibility: element.style?.visibility || 'visible',
    };
  },
};
document.defaultView = target;

installIndexEngineBridge(target);

const capabilities = target.SStructuresAgent.getCapabilities();
assert.equal(capabilities.modules.designBasisInput, DESIGN_BASIS_INPUT_VERSION);
assert.ok(capabilities.readApis.includes('getDesignBasisInput'));
assert.ok(capabilities.executeActions.includes('setDesignBasisInput'));
assert.ok(capabilities.milestones.some((item) => item.id === 'M47'));

const inputState = target.SStructuresAgent.getDesignBasisInput();
assert.equal(inputState.version, DESIGN_BASIS_INPUT_VERSION);
assert.equal(inputState.loadEstimationVersion, LOAD_ESTIMATION_VERSION);
assert.ok(inputState.occupancyOptions.some((item) => item.id === 'school'));
assert.ok(inputState.numericFields.some((item) => item.id === 'floorArea'));
assert.ok(inputState.numericFields.some((item) => item.id === 'roofArea'));
assert.ok(inputState.numericFields.some((item) => item.id === 'deadLoad'));
assert.ok(inputState.numericFields.some((item) => item.id === 'seismicLiveLoadFactor'));
assert.equal(inputState.generatedModelLoadCount, 0);
assert.ok(inputState.preview.summary.generatedLoadCount > 0);

const occupancy = document.getElementById('ssLoadBasisOccupancy');
const floorArea = document.getElementById('ssLoadBasisFloorArea');
const roofArea = document.getElementById('ssLoadBasisRoofArea');
const deadLoad = document.getElementById('ssLoadBasisDead');
const liveLoad = document.getElementById('ssLoadBasisLive');
const seismicLiveLoadFactor = document.getElementById('ssLoadBasisSeisLiveFactor');
const previewButton = document.getElementById('ssPreviewDesignBasisLoads');
const applyButton = document.getElementById('ssApplyDesignBasisLoads');
const status = document.getElementById('ssLoadBasisStatus');
assert.ok(occupancy);
assert.ok(floorArea);
assert.ok(roofArea);
assert.ok(deadLoad);
assert.ok(liveLoad);
assert.ok(seismicLiveLoadFactor);
assert.ok(previewButton);
assert.ok(applyButton);
assert.ok(status);

occupancy.value = 'school';
occupancy.dispatchEvent({ type: 'change' });
assert.equal(liveLoad.value, '3');

floorArea.value = '144';
roofArea.value = '120';
deadLoad.value = '5.2';
liveLoad.value = '3.1';
document.getElementById('ssLoadBasisWindX').value = '0.8';
document.getElementById('ssLoadBasisSeisX').value = '0.12';
seismicLiveLoadFactor.value = '0.3';

previewButton.click();
assert.equal(model.designBasis.occupancy, 'school');
assert.equal(model.designBasis.floorArea, 144);
assert.equal(model.designBasis.roofArea, 120);
assert.equal(model.designBasis.deadLoad, 5.2);
assert.equal(model.designBasis.seismicLiveLoadFactor, 0.3);
assert.equal(model.loads.length, 0);
assert.equal(getNativeUiState(target).loadBasis.status, 'preview');
assert.match(status.textContent, /preview/);

applyButton.click();
assert.equal(model.loadEstimation.version, LOAD_ESTIMATION_VERSION);
assert.ok(model.loads.some((load) => load.generatedBy === LOAD_ESTIMATION_VERSION));
assert.equal(getNativeUiState(target).loadBasis.status, 'applied');
assert.ok(getNativeUiState(target).loadBasis.generatedModelLoadCount > 0);
assert.ok(counters.reanalyze > 0);

const apiNode = document.getElementById(AGENT_API_NODE_ID);
document.dispatchEvent({
  type: AGENT_COMMAND_EVENT,
  detail: { id: 'basis-read', method: 'getDesignBasisInput' },
});
let response = JSON.parse(apiNode.textContent);
assert.equal(response.ok, true);
assert.equal(response.data.version, DESIGN_BASIS_INPUT_VERSION);

document.dispatchEvent({
  type: AGENT_COMMAND_EVENT,
  detail: {
    id: 'basis-set',
    method: 'execute',
    action: 'setDesignBasisInput',
    payload: { designBasis: { occupancy: 'parking', liveLoad: 4.2 } },
  },
});
response = JSON.parse(apiNode.textContent);
const summary = JSON.parse(apiNode.getAttribute('data-response-summary'));
assert.equal(response.ok, true);
assert.equal(response.data.designBasisInput.basis.occupancy, 'parking');
assert.equal(summary.designBasisInput.occupancy, 'parking');

console.log(JSON.stringify({
  ok: true,
  version: DESIGN_BASIS_INPUT_VERSION,
  generatedLoads: model.loads.filter((load) => load.generatedBy === LOAD_ESTIMATION_VERSION).length,
  commandCount: target.SStructuresAgentCommandBridge.getState().commandCount,
}, null, 2));

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
