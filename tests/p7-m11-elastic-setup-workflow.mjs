import assert from 'node:assert/strict';
import { createModel } from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import {
  ELASTIC_SETUP_STEPS,
  ELASTIC_SETUP_WORKFLOW_VERSION,
} from '../src/ui/indexElasticSetupWorkflow.js';
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

const workflow = target.SStructuresElasticSetupWorkflow;
assert.equal(workflow.version, ELASTIC_SETUP_WORKFLOW_VERSION);
assert.equal(document.querySelectorAll('[data-ss-elastic-step]').length, ELASTIC_SETUP_STEPS.length);
assert.equal(document.body.classList.contains('ss-guided-elastic-ready'), true);
assert.equal(document.getElementById('ssKdsPanel').style.display || '', '');
assert.equal(workflow.state.draft.projectId, 'LOCAL-MODEL');
assert.equal(model.meta.projectId, 'LOCAL-MODEL');

workflow.open(0);
assert.equal(workflow.getState().open, true);
assert.equal(workflow.getState().stepId, 'basis');
assert.match(document.querySelector('.ss-ew-purpose').children[1].textContent, /하중값과 조합식/);
assert.equal(document.getElementById('ssEwProjectId').value, 'LOCAL-MODEL');
document.getElementById('ssEwDesignMethod').value = 'strength';
document.getElementById('ssEwOccupancy').value = 'office';
workflow.go(1);
assert.equal(model.meta.projectId, 'LOCAL-MODEL');
assert.equal(model.designBasis.designMethod, 'strength');
assert.equal(workflow.getState().stepId, 'loads');

document.getElementById('ssEwDead').value = '5';
document.getElementById('ssEwLive').value = '2.5';
document.getElementById('ssEwMassPerFloor').value = '10';
workflow.applyLoads();
assert.ok(model.loadCases.some((item) => item.id === 'D'));
assert.ok(model.loadCases.some((item) => item.id === 'L'));
assert.ok(model.nodes.some((node) => node.mass || node.masses));

workflow.go(2);
let state = workflow.getState();
assert.equal(state.stepId, 'combinations');
assert.equal(state.combinationAudit.invalidStrengthCount, 0);
assert.equal(state.combinationAudit.reviewRequiredCount, 2);
assert.equal(model.loadCombinations.some((combo) => combo.id === 'CO1'), false);
assert.match(document.querySelector('.note-review').textContent, /최신 KDS 후보 강도조합 2개/);
workflow.previewCombinations();
state = workflow.getState();
assert.equal(state.hasPreview, true);
assert.ok(workflow.state.comboPreview.generated.some((combo) => combo.sourcePreset === 'KDS22-ST-01'));
const gravity = workflow.state.comboPreview.generated.find((combo) => combo.sourcePreset === 'KDS22-ST-02');
assert.equal(gravity.factors.D, 1.2);
assert.equal(gravity.factors.L, 1.6);

document.getElementById('ssEwReviewer').value = 'PE-KR-001';
document.getElementById('ssEwApprovalNote').value = 'KDS 계수, 하중 매핑 및 적용 방향 검토 완료';
document.getElementById('ssEwApprovalChecked').checked = true;
workflow.applyCombinations();
state = workflow.getState();
assert.equal(state.combinationAudit.invalidStrengthCount, 0);
assert.equal(state.combinationAudit.reviewRequiredCount, 0);
assert.ok(state.combinationAudit.approvedStrengthCount >= 2);
assert.equal(model.loadCombinations.some((combo) => combo.id === 'CO1'), false);
assert.equal(model.loadCombinations.find((combo) => combo.id === 'SLS1').type, 'service');
assert.equal(model.loadCombinations.find((combo) => combo.id === 'SLS1').purpose, 'deflection');
assert.ok(model.loadCombinations.some((combo) => combo.approvalStatus === 'project-approved'));
assert.ok(model.loadCombinations.some((combo) => combo.factors.D === 1.2 && combo.factors.L === 1.6));

workflow.go(3);
workflow.runValidation();
assert.ok(document.getElementById('ssEwRunValidation'));
assert.equal(workflow.state.validation.errors.length, 0);

workflow.go(4);
await workflow.runFirstOrder();
const firstOrder = model.analysisCases.find((item) => item.id === 'EL-STATIC');
assert.ok(firstOrder);
assert.equal(firstOrder.settings.pDeltaMethod, 'off');
assert.equal(firstOrder.status, 'ok');
const firstOrderAttempt = target.SStructuresEngine.getAnalysisLatestAttempt('EL-STATIC');
assert.equal(firstOrderAttempt.status, 'ok');
assert.equal(firstOrderAttempt.designBlocked, false);
assert.equal(firstOrderAttempt.summary.designEligibility.eligible, false);
assert.equal(firstOrderAttempt.summary.designEligibility.reason, 'PDELTA_THETA_LIMIT_EXCEEDED');

workflow.go(5);
assert.equal(document.querySelectorAll('.ss-ew-advanced-row').length, 5);
workflow.selectAdvanced('rsa');
assert.equal(workflow.getState().open, false);
assert.equal(target.SStructuresAnalysisCenter.state.selectedCaseId, 'EL-RSA');
assert.equal(target.SStructuresAnalysisCenter.getState().open, true);

model.nodes[0].support = null;
workflow.open(4);
await workflow.runFirstOrder();
assert.equal(target.SStructuresEngine.getAnalysisLatestAttempt('EL-STATIC').status, 'failed');
assert.equal(workflow.state.messageKind, 'error');
assert.match(workflow.state.message, /실패/);
assert.equal(workflow.getState().steps[4].status, 'required');

console.log(JSON.stringify({
  ok: true,
  steps: ELASTIC_SETUP_STEPS.length,
  approvedCombinations: state.combinationAudit.approvedCount,
  firstOrderStatus: firstOrder.status,
  selectedAdvanced: target.SStructuresAnalysisCenter.state.selectedCaseId,
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
  result.loadCases = [
    { id: 'D', name: 'Dead', type: 'dead', family: 'D' },
    { id: 'L', name: 'Live', type: 'live', family: 'L' },
  ];
  result.loadCombinations = [
    { id: 'CO1', name: '1.0D+1.0L', type: 'strength', factors: { D: 1, L: 1 } },
    { id: 'SLS1', name: '1.0D+1.0L', type: 'service', factors: { D: 1, L: 1 } },
  ];
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
