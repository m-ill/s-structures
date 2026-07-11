import assert from 'node:assert/strict';
import { createModel } from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import {
  ELASTIC_ANALYSIS_COMMANDS,
  ELASTIC_ANALYSIS_RIBBON_VERSION,
} from '../src/ui/indexElasticAnalysisRibbon.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const model = createColumnModel();
const document = createFakeIndexDocument();
buildNativeIndexShell(document);
let lastResult = null;
const target = {
  document,
  model: () => model,
  reanalyze: () => {
    lastResult = target.analyzeModel(model);
    return lastResult;
  },
  location: { search: '' },
  localStorage: createMemoryStorage(),
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
installIndexEngineBridge(target);
target.SStructuresNativeUI.setMode('elastic', { clickLegacy: false });

assert.equal(target.SStructuresElasticAnalysisRibbon.version, ELASTIC_ANALYSIS_RIBBON_VERSION);
assert.equal(document.querySelectorAll('[data-ss-elastic-analysis]').length, ELASTIC_ANALYSIS_COMMANDS.length);
assert.ok(document.getElementById('ssElasticAnalysis-static'));
assert.ok(document.getElementById('ssElasticAnalysis-direct-pdelta'));
assert.ok(document.getElementById('ssElasticAnalysis-modal'));
assert.ok(document.getElementById('ssElasticAnalysis-rsa'));
assert.ok(document.getElementById('ssElasticAnalysis-buckling'));
assert.ok(document.getElementById('ssElasticAnalysis-linear-tha'));
assert.ok(document.getElementById('ssElasticRunAll'));
assert.equal(document.getElementById('ssElasticRunSelected'), null);
assert.equal(document.getElementById('ssElasticAnalysis-static').disabled, true);
assert.equal(target.SStructuresElasticAnalysisRibbon.getState().commands.some((item) => item.selected), false);
assert.equal(document.getElementById('ssNativePDeltaToggle'), null);

const nonlinearCase = target.SStructuresEngine.addAnalysisCase({
  id: 'NL-KEEP',
  kind: 'pushover',
  name: 'Do not run with elastic batch',
  settings: { direction: '+x', steps: 3 },
});
document.getElementById('ssElasticRunAll').click();
let batchState = target.SStructuresElasticAnalysisRibbon.getState();
assert.equal(batchState.lastBatch.total, ELASTIC_ANALYSIS_COMMANDS.length);
assert.equal(batchState.resultCount, ELASTIC_ANALYSIS_COMMANDS.length);
assert.equal(batchState.allResultsAvailable, true);
assert.equal(batchState.lastBatch.okCount + batchState.lastBatch.reviewCount + batchState.lastBatch.failedCount, ELASTIC_ANALYSIS_COMMANDS.length);
assert.equal(nonlinearCase.status, 'not-run');
assert.equal(target.SStructuresAnalysisCenter.getState().open, false);
assert.equal(target.SStructuresElasticResultPopup.getState().selectedCaseId, 'EL-STATIC');
assert.equal(document.getElementById('ssElasticAnalysis-static').disabled, false);
assert.equal(document.getElementById('ssElasticBatchStatus').hidden, false);

let deferredFrame = null;
let deferredTask = null;
target.requestAnimationFrame = (callback) => {
  deferredFrame = callback;
  return 1;
};
target.setTimeout = (callback) => {
  deferredTask = callback;
  return 1;
};
target.SStructuresElasticAnalysisRibbon.runAll({ defer: true });
assert.equal(target.SStructuresElasticAnalysisRibbon.getState().running, true);
assert.equal(document.getElementById('ssElasticRunAll').disabled, true);
assert.equal(document.getElementById('ssElasticBatchStatus').textContent, '실행 중');
deferredFrame();
assert.equal(typeof deferredTask, 'function');
deferredTask();
assert.equal(target.SStructuresElasticAnalysisRibbon.getState().running, false);
assert.match(document.getElementById('ssElasticBatchStatus').textContent, /완료/);
delete target.requestAnimationFrame;
delete target.setTimeout;

model.analysisCases.find((item) => item.id === 'EL-STATIC').status = 'stale';
target.SStructuresElasticAnalysisRibbon.refresh();
assert.equal(target.SStructuresElasticAnalysisRibbon.getState().batchStatus, 'stale');
assert.equal(document.getElementById('ssElasticBatchStatus').textContent, '재실행 필요');
model.analysisCases.find((item) => item.id === 'EL-STATIC').status = 'ok';
target.SStructuresElasticAnalysisRibbon.refresh();

document.getElementById('ssElasticAnalysis-rsa').click();
assert.equal(target.SStructuresElasticResultPopup.getState().selectedCaseId, 'EL-RSA');
assert.equal(target.SStructuresAnalysisCenter.getState().open, false);

target.SStructuresElasticAnalysisRibbon.select('direct-pdelta');
let selected = selectedCase(target);
assert.equal(selected.id, 'EL-PDELTA');
assert.equal(selected.settings.pDeltaMethod, 'direct');
assert.equal(target.SStructuresAnalysisCenter.getState().open, true);
assert.equal(document.getElementById('ssStaticPDeltaMethod').value, 'direct');
assert.ok(document.getElementById('ssStaticCombo'));

target.SStructuresElasticAnalysisRibbon.select('modal');
selected = selectedCase(target);
assert.equal(selected.id, 'EL-MODAL');
assert.ok(document.getElementById('ssModalModeCount'));
assert.ok(document.getElementById('ssModalMassSource'));
document.getElementById('ssModalModeCount').value = '2';
target.SStructuresAnalysisCenter.save();
assert.equal(selectedCase(target).settings.modalModeCount, 2);
target.SStructuresElasticAnalysisRibbon.runSelected();
assert.equal(model.analysisCases.find((item) => item.id === 'EL-MODAL').status, 'ok');
assert.equal(document.getElementById('ssElasticAnalysis-modal').getAttribute('data-status'), 'ok');
assert.ok(document.getElementById('ssChartModal'));

target.SStructuresElasticAnalysisRibbon.select('rsa');
assert.ok(document.getElementById('ssRsaMethod'));
assert.ok(document.getElementById('ssRsaDirections'));
assert.ok(document.getElementById('ssRsaPoints'));
document.getElementById('ssRsaMethod').value = 'CQC';
document.getElementById('ssRsaDirections').value = 'x';
document.getElementById('ssRsaDamping').value = '0.04';
document.getElementById('ssRsaPoints').value = '0:0.3, 0.5:0.8, 3:0.2';
target.SStructuresAnalysisCenter.save();
selected = selectedCase(target);
assert.equal(selected.kind, 'responseSpectrum');
assert.equal(selected.settings.spectrum.method, 'CQC');
assert.deepEqual(selected.settings.spectrum.directions, ['x']);
assert.equal(selected.settings.spectrum.dampingRatio, 0.04);
assert.equal(selected.settings.spectrum.points.length, 3);

target.SStructuresElasticAnalysisRibbon.select('buckling');
selected = selectedCase(target);
assert.equal(selected.settings.preloadCombinationId, 'CO1');
assert.ok(document.getElementById('ssBucklingCombo'));
assert.ok(document.getElementById('ssBucklingModeCount'));

target.SStructuresElasticAnalysisRibbon.select('linear-tha');
assert.ok(document.getElementById('ssLthaAccelerations'));
assert.ok(document.getElementById('ssLthaAccelerationUnit'));
document.getElementById('ssLthaAccelerations').value = '0, 0.1, -0.1, 0';
target.SStructuresAnalysisCenter.save();
selected = selectedCase(target);
assert.equal(selected.kind, 'linearTha');
assert.deepEqual(selected.settings.accelerations, [0, 0.1, -0.1, 0]);

const state = target.SStructuresElasticAnalysisRibbon.getState();
assert.equal(state.commands.length, 6);
assert.equal(state.selectedCaseId, 'EL-LTHA');
assert.equal(state.commands.find((item) => item.key === 'modal').status, 'ok');
assert.equal(state.commands.find((item) => item.key === 'linear-tha').preliminary, true);

console.log(JSON.stringify({
  ok: true,
  commands: state.commands.length,
  caseCount: model.analysisCases.length,
  batchStatus: batchState.batchStatus,
  batchResults: batchState.resultCount,
  nonlinearUntouched: nonlinearCase.status,
  modalStatus: state.commands.find((item) => item.key === 'modal').status,
  rsaMethod: model.analysisCases.find((item) => item.id === 'EL-RSA').settings.spectrum.method,
  thaSamples: selected.settings.accelerations.length,
}, null, 2));

function selectedCase(target) {
  const id = target.SStructuresAnalysisCenter.state.selectedCaseId;
  return target.SStructuresEngine.getAnalysisCases().find((item) => item.id === id);
}

function createColumnModel() {
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
  result.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }];
  result.loadCombinations = [{ id: 'CO1', name: 'D', type: 'strength', factors: { D: 1 } }];
  result.loads = [{ id: 'P1', type: 'nodal', node: 'N2', P: 100, dir: '-z', case: 'D' }];
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
