import assert from 'node:assert/strict';
import {
  createModel,
} from '../src/index.js';
import {
  installIndexEngineBridge,
} from '../src/ui/indexBridge.js';
import {
  INDEX_ANALYSIS_CENTER_VERSION,
} from '../src/ui/indexAnalysisCenter.js';
import {
  clampFloatingRect,
  snapFloatingRect,
} from '../src/ui/floatingPanel.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const snappedPanel = snapFloatingRect(
  { left: 990, top: 9, width: 100, height: 100 },
  { left: 0, top: 0, width: 1100, height: 800 },
  { minWidth: 80, minHeight: 80, snapThreshold: 12 },
);
assert.deepEqual(snappedPanel, { left: 1000, top: 0, width: 100, height: 100 });
const clampedPanel = clampFloatingRect(
  { left: -50, top: 900, width: 2000, height: 2000 },
  { left: 8, top: 8, width: 500, height: 300 },
  { minWidth: 100, minHeight: 100, maxWidth: 400, maxHeight: 260 },
);
assert.deepEqual(clampedPanel, { left: 8, top: 48, width: 400, height: 260 });

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
const bridge = installIndexEngineBridge(target);
const agent = target.SStructuresAgent;

assert.equal(target.SStructuresAnalysisCenter.version, INDEX_ANALYSIS_CENTER_VERSION);
const analysisCenter = document.getElementById('ssAnalysisCenter');
assert.ok(analysisCenter);
assert.equal(analysisCenter.getAttribute('data-ss-floating-panel'), '1');
assert.ok(analysisCenter.querySelector('[data-ss-floating-resize]'));
assert.ok(document.getElementById('ssAcAdd'));
assert.ok(document.getElementById('ssAcRunAll'));
assert.ok(agent.getSnapshot().availableActions.includes('addAnalysisCase'));
assert.ok(agent.getSnapshot().availableActions.includes('listAnalysisCases'));
assert.ok(agent.getSnapshot().availableActions.includes('deleteAnalysisCase'));
assert.ok(agent.getSnapshot().availableActions.includes('runAnalysisCase'));
assert.ok(agent.getCapabilities().modules.phase5AnalysisCenter);
assert.ok(agent.getCapabilities().modules.phase5AnalysisRunners);
assert.ok(agent.getCapabilities().dataContracts.includes('phase5AnalysisCenterState'));
assert.ok(agent.getCapabilities().milestones.some((item) => item.id === 'P5-M2'));
assert.equal(agent.getSnapshot().analysisCenter.caseCount, 0);

let snapshot = agent.execute('addAnalysisCase', {
  id: 'AC_MODAL',
  kind: 'modal',
  settings: { modeCount: 2 },
});
assert.equal(snapshot.analysisCase.id, 'AC_MODAL');
assert.equal(snapshot.analysisCenter.caseCount, 1);
assert.equal(model.analysisCases[0].status, 'not-run');
assert.equal(agent.execute('listAnalysisCases').analysisCases.length, 1);

snapshot = agent.execute('updateAnalysisCase', {
  id: 'AC_MODAL',
  patch: { name: 'Mode check', settings: { modalModeCount: 3 } },
});
assert.equal(snapshot.analysisCase.name, 'Mode check');
assert.equal(snapshot.analysisCase.settings.modalModeCount, 3);

snapshot = agent.execute('runAnalysisCase', { id: 'AC_MODAL' });
assert.equal(snapshot.analysisResult.caseId, 'AC_MODAL');
assert.equal(snapshot.analysisResult.kind, 'modal');
assert.equal(snapshot.analysisResult.status, 'ok');
assert.equal(snapshot.analysisCenter.resultCount, 1);
assert.equal(snapshot.analysisCenter.latestResult.caseId, 'AC_MODAL');
assert.equal(model.analysisCases[0].status, 'ok');
assert.ok(model.analysisCases[0].lastRun.summary.modeCount > 0);
assert.equal(target.SStructuresAnalysisCenter.getState().latestResult.view, 'modal-results');

bridge.addAnalysisCase({
  id: 'AC_NLTH',
  kind: 'nlth',
  settings: { accelerations: [0, 0.1, -0.1], dt: 0.02, mass: 1, stiffness: 100 },
});
bridge.addAnalysisCase({
  id: 'AC_PDELTA_OFF',
  kind: 'static',
  settings: { pDelta: false },
});
bridge.addAnalysisCase({
  id: 'AC_PDELTA_ON',
  kind: 'static',
  settings: { pDelta: true },
});
bridge.addAnalysisCase({
  id: 'AC_BUCKLING',
  kind: 'buckling',
  settings: { referenceAxialForces: { M1: 100 } },
});
bridge.addAnalysisCase({
  id: 'AC_THA',
  kind: 'linearTha',
  settings: { modalModeCount: 2, direction: 'y', dt: 0.02, accelerations: [0, 0.1, -0.1, 0] },
});
bridge.addAnalysisCase({
  id: 'AC_FAIL',
  kind: 'buckling',
  settings: { preloadCombinationId: 'MISSING' },
});
const results = bridge.runAnalysisCases();
assert.equal(results.length, 7);
assert.equal(Object.keys(bridge.getAnalysisResults()).length, 7);

snapshot = agent.getSnapshot();
assert.equal(snapshot.analysisCenter.caseCount, 7);
assert.equal(snapshot.analysisCenter.resultCount, 7);
assert.equal(snapshot.model.analysisCaseCount, 7);
assert.equal(model.analysisCases.find((item) => item.id === 'AC_NLTH').lastRun.summary.rowCount, 3);
assert.equal(bridge.getAnalysisCaseResult('AC_PDELTA_OFF').summary.pDelta, false);
assert.equal(bridge.getAnalysisCaseResult('AC_PDELTA_ON').summary.pDelta, true);
assert.ok(bridge.getAnalysisCaseResult('AC_PDELTA_ON').payload.pDelta);
assert.ok(bridge.getAnalysisCaseResult('AC_BUCKLING').summary.criticalLoadFactor > 0);
assert.equal(bridge.getAnalysisCaseResult('AC_THA').summary.rowCount, 4);
assert.equal(bridge.getAnalysisCaseResult('AC_FAIL').status, 'failed');
assert.match(bridge.getAnalysisCaseResult('AC_FAIL').message, /not produce|PRELOAD_COMBINATION_NOT_FOUND/);
target.SStructuresAnalysisCenter.select('AC_FAIL');
assert.equal(target.SStructuresAnalysisCenter.getState().latestResult.status, 'failed');
assert.match(document.querySelector('.ss-ac-log').textContent, /not produce|PRELOAD_COMBINATION_NOT_FOUND/);

snapshot = agent.execute('setNodeMass', { nodeId: 'N2', mass: [11, 11, 11] });
assert.equal(model.analysisCases.find((item) => item.id === 'AC_MODAL').status, 'stale');
assert.ok(snapshot.analysisCenter.statuses.stale >= 1);

const removed = agent.execute('deleteAnalysisCase', { id: 'AC_FAIL' });
assert.equal(removed.analysisCase.id, 'AC_FAIL');
assert.equal(agent.execute('listAnalysisCases').analysisCases.length, 6);

bridge.analyzeModel(model);
const calculationPackage = agent.prepareResultView('getCalculationPackage', { title: 'Phase 5 Analysis Center Package' });
assert.equal(calculationPackage.data.detailed.analysisCases.caseCount, 6);
assert.equal(calculationPackage.data.detailed.analysisCases.resultCount, 6);
assert.match(calculationPackage.html, /Phase 5 Analysis Cases/);
assert.match(calculationPackage.html, /AC_NLTH/);
assert.match(calculationPackage.html, /AC_PDELTA_ON/);

console.log(JSON.stringify({
  ok: true,
  caseCount: snapshot.analysisCenter.caseCount,
  resultCount: snapshot.analysisCenter.resultCount,
  modalStatus: model.analysisCases[0].status,
  nlthRows: model.analysisCases.find((item) => item.id === 'AC_NLTH').lastRun.summary.rowCount,
  packageCases: calculationPackage.data.detailed.analysisCases.caseCount,
  pDeltaOn: bridge.getAnalysisCaseResult('AC_PDELTA_ON').summary.pDelta,
  bucklingFactor: bridge.getAnalysisCaseResult('AC_BUCKLING').summary.criticalLoadFactor,
  thaRows: bridge.getAnalysisCaseResult('AC_THA').summary.rowCount,
}, null, 2));

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
  result.loads = [
    { id: 'P1', type: 'nodal', node: 'N2', P: 100, dir: '-z', case: 'D' },
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
