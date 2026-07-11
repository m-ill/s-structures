import assert from 'node:assert/strict';
import {
  createTwoStoryElasticFrameModel,
  validateModel,
} from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import {
  buildAnalysisCaseResultView,
  INDEX_RESULT_CASE_VIEW_VERSION,
} from '../src/ui/indexResultViews.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const document = createFakeIndexDocument();
buildNativeIndexShell(document);

const model = createTwoStoryElasticFrameModel();
for (const node of model.nodes) {
  if (!node.support) node.mass = [5, 5, 5];
}

const target = {
  document,
  location: { pathname: '/index.html', search: '', hash: '' },
  history: { replaceState() {} },
  localStorage: createMemoryStorage(),
  model: () => model,
  activeResult: () => null,
  reanalyze: () => null,
  draw: () => {},
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

agent.execute('addAnalysisCase', { id: 'AC_MODAL_VIEW', kind: 'modal', settings: { modalModeCount: 3 } });
agent.execute('addAnalysisCase', { id: 'AC_BUCKLE_VIEW', kind: 'buckling', settings: { referenceAxialForces: { M1: 120 } } });
agent.execute('addAnalysisCase', { id: 'AC_PUSH_VIEW', kind: 'pushover', settings: { steps: 3, referenceBaseShear: 50 } });
bridge.runAnalysisCases();

for (const id of ['ssResultCaseSel', 'ssResModeSlider', 'ssResultCaseView']) {
  assert.ok(document.getElementById(id), `${id} should exist`);
}

target.SStructuresAnalysisCenter.select('AC_MODAL_VIEW');
assert.equal(document.getElementById('ssResultCaseSel').value, 'AC_MODAL_VIEW');
assert.equal(document.getElementById('ssResModeSlider').max, '2');
document.getElementById('ssResModeSlider').value = '1';
document.getElementById('ssResModeSlider').dispatchEvent({ type: 'input' });
let view = target.SStructuresAnalysisCenter.getState().resultView;
assert.equal(view.version, INDEX_RESULT_CASE_VIEW_VERSION);
assert.equal(view.kind, 'modal');
assert.equal(view.selectedIndex, 1);
assert.equal(view.overlayState.showModal, true);
assert.equal(view.overlayData.visualKind, 'modal-shape');
assert.ok(view.overlayData.shapeNodeCount > 0);

const directModalView = buildAnalysisCaseResultView(model, bridge.getAnalysisCaseResult('AC_MODAL_VIEW'), { index: 2 });
assert.equal(directModalView.selectedIndex, 2);
assert.equal(directModalView.sliderMax, 2);

target.SStructuresAnalysisCenter.select('AC_BUCKLE_VIEW');
view = target.SStructuresAnalysisCenter.getState().resultView;
assert.equal(view.kind, 'buckling');
assert.equal(view.overlayData.visualKind, 'buckling-trace');
assert.ok(view.overlayData.criticalLoadFactor > 0);
assert.ok(!view.limitations.includes('buckling-mode-shape-not-available-in-current-trace'));

document.getElementById('ssResultCaseSel').value = 'AC_PUSH_VIEW';
document.getElementById('ssResultCaseSel').dispatchEvent({ type: 'change' });
view = target.SStructuresAnalysisCenter.getState().resultView;
assert.equal(view.kind, 'pushover');
assert.equal(view.overlayData.visualKind, 'pushover-hinge-state');
assert.equal(document.getElementById('ssResModeSlider').max, '3');
assert.ok(view.overlayData.members.length > 0);
assert.ok(Object.keys(view.overlayData.stateCounts).length > 0);
assert.equal(target.SStructuresResultCaseView.caseId, 'AC_PUSH_VIEW');

const capabilities = agent.getCapabilities();
assert.ok(capabilities.milestones.some((item) => item.id === 'P5-M9'));
assert.equal(capabilities.modules.phase5ResultCaseViews, INDEX_RESULT_CASE_VIEW_VERSION);
assert.ok(capabilities.dataContracts.includes('phase5ResultCaseView'));

const validation = validateModel(model);
assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));

console.log(JSON.stringify({
  ok: true,
  modalSliderMax: directModalView.sliderMax,
  bucklingFactor: bridge.getAnalysisCaseResult('AC_BUCKLE_VIEW').summary.criticalLoadFactor,
  pushoverMembers: view.overlayData.members.length,
}, null, 2));

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
