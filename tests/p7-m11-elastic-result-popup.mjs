import assert from 'node:assert/strict';
import { createModel } from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { ELASTIC_RESULT_POPUP_VERSION } from '../src/ui/indexElasticResultPopup.js';
import { ELASTIC_RESULT_VISUALIZATION_VERSION } from '../src/ui/elasticResultVisualization.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const model = createElasticColumnModel();
const document = createFakeIndexDocument();
buildNativeIndexShell(document);
const canvasWrap = document.createElement('div');
canvasWrap.id = 'canvasWrap';
canvasWrap.setAttribute('id', canvasWrap.id);
document.body.appendChild(canvasWrap);

let lastResult = null;
const runtimeListeners = new Map();
const localStorage = createMemoryStorage();
const target = {
  document,
  model: () => model,
  reanalyze: () => {
    lastResult = target.analyzeModel(model);
    return lastResult;
  },
  location: { search: '' },
  localStorage,
  innerWidth: 1366,
  innerHeight: 768,
  addEventListener(type, handler) {
    const handlers = runtimeListeners.get(type) || [];
    handlers.push(handler);
    runtimeListeners.set(type, handlers);
  },
  dispatchRuntimeEvent(type) {
    for (const handler of runtimeListeners.get(type) || []) handler.call(target, { type, target });
  },
  draw: () => {},
  activeResult: () => lastResult?.envelope || null,
  getComputedStyle(element) {
    return {
      display: element.style?.display || 'block',
      visibility: element.style?.visibility || 'visible',
    };
  },
};
document.defaultView = target;
const bridge = installIndexEngineBridge(target);

assert.equal(target.SStructuresElasticResultPopup.version, ELASTIC_RESULT_POPUP_VERSION);
assert.equal(target.SStructuresElasticResultPopup.visualizationVersion, ELASTIC_RESULT_VISUALIZATION_VERSION);
assert.equal(document.getElementById('ssElasticResultPopup').parentNode, canvasWrap);
assert.ok(document.getElementById('ssElasticRunAll'));

runCommand('static');
assertPopup('static', 'ssElasticStaticShapeSvgWrap');
assert.equal(target.SStructuresAnalysisCenter.getState().open, false);
assert.equal(document.getElementById('ssElasticResultPopup').style.height, 'auto');

runCommand('direct-pdelta');
let popupState = assertPopup('pdelta', 'ssElasticPDeltaGlobalChart');
assert.equal(popupState.method, 'direct');
const directGraph = bridge.getAnalysisCaseResult('EL-PDELTA').payload.pDelta.graphs.global[0].points.at(-1);
assert.equal(directGraph.responseComponent, 'global-lateral-resultant');
assert.ok(directGraph.maxTotalDisplacement >= directGraph.maxLateralDisplacement);
assert.match(document.getElementById('ssElasticPDeltaGlobalChart').querySelector('.ss-elastic-result-svg').innerHTML, /polyline/);
document.querySelector('[data-result-view="member"]').click();
assert.ok(document.getElementById('ssElasticPDeltaMemberDriftChart'));
target.SStructuresResultSelection.selectEntity('member', 'M1', 'native-modeler');
popupState = target.SStructuresElasticResultPopup.getState();
assert.equal(popupState.selectedMemberId, 'M1');
assert.equal(popupState.activeView, 'member');

runCommand('modal');
assertPopup('modal', 'ssElasticModalShapeSvgWrap');
document.querySelector('[data-result-view="participation"]').click();
assert.ok(document.getElementById('ssElasticModalParticipationChart'));
assert.match(document.getElementById('ssElasticModalParticipationChart').querySelector('.ss-elastic-result-svg').innerHTML, /rect/);

runCommand('rsa');
assertPopup('rsa', 'ssElasticRsaBaseShearChart');
assert.ok(document.getElementById('ssElasticRsaDisplacementChart'));
document.querySelector('[data-result-view="spectrum"]').click();
assert.ok(document.getElementById('ssElasticRsaSpectrumChart'));

runCommand('buckling');
popupState = assertPopup('buckling', 'ssElasticBucklingShapeSvgWrap');
const bucklingResult = bridge.getAnalysisCaseResult('EL-BUCKLING');
assert.ok(bucklingResult.payload.modes.length > 1);
assert.equal(target.SStructuresAnalysisCenter.getState().resultView.sliderMax, bucklingResult.payload.modes.length - 1);
document.querySelector('[data-result-view="factors"]').click();
assert.ok(document.getElementById('ssElasticBucklingFactorChart'));

runCommand('linear-tha');
popupState = assertPopup('tha', 'ssElasticThaChart');
assert.equal(popupState.method, 'linear-modal-superposition-newmark');
document.querySelector('[data-result-view="velocity"]').click();
assert.ok(document.getElementById('ssElasticThaChart'));

document.getElementById('ssElasticResultClose').click();
assert.equal(target.SStructuresElasticResultPopup.getState().open, false);
document.getElementById('ssElasticAnalysis-linear-tha').click();
assert.equal(target.SStructuresElasticResultPopup.getState().open, true);
assert.equal(target.SStructuresElasticResultPopup.getState().selectedCaseId, 'EL-LTHA');

target.SStructuresElasticResultPopup.resetSize();
const popupRoot = document.getElementById('ssElasticResultPopup');
target.innerWidth = 600;
target.dispatchRuntimeEvent('resize');
assert.equal(popupRoot.style.left, '', 'mobile layout must not overwrite the desktop placement');
assert.equal(localStorage.getItem('s-structures:elastic-result-popup:v2'), null);
target.innerWidth = 1366;

console.log(JSON.stringify({
  ok: true,
  popupVersion: ELASTIC_RESULT_POPUP_VERSION,
  visualizationVersion: ELASTIC_RESULT_VISUALIZATION_VERSION,
  cases: model.analysisCases.length,
  bucklingModes: bucklingResult.payload.modes.length,
  finalView: target.SStructuresElasticResultPopup.getState().activeView,
  responsivePlacementPreserved: true,
}, null, 2));

function runCommand(command) {
  target.SStructuresElasticAnalysisRibbon.select(command);
  target.SStructuresElasticAnalysisRibbon.runSelected();
}

function assertPopup(kind, elementId) {
  const state = target.SStructuresElasticResultPopup.getState();
  assert.equal(state.open, true);
  assert.equal(state.visualizationKind, kind);
  assert.equal(state.resultAvailable, true);
  assert.ok(document.getElementById(elementId), `${elementId} should be rendered`);
  assert.equal(document.getElementById('ssElasticResultPopup').getAttribute('data-ss-floating-panel'), '1');
  return state;
}

function createElasticColumnModel() {
  const result = createModel();
  result.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null, mass: [10, 10, 10] },
  ];
  result.members = [{
    id: 'M1',
    type: 'frame',
    n1: 'N1',
    n2: 'N2',
    matId: 'steel',
    secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' },
    releases: { i: 'rigid', j: 'rigid' },
  }];
  result.loadCases = [
    { id: 'D', name: 'Dead', type: 'dead' },
    { id: 'WX', name: 'Wind X', type: 'wind' },
  ];
  result.loadCombinations = [{ id: 'CO1', name: 'D + WX', type: 'strength', factors: { D: 1, WX: 1 } }];
  result.loads = [
    { id: 'PZ', type: 'nodal', node: 'N2', P: 100, dir: '-z', case: 'D' },
    { id: 'PX', type: 'nodal', node: 'N2', P: 10, dir: '+x', case: 'WX' },
  ];
  result.analysisSettings.modalModeCount = 4;
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
