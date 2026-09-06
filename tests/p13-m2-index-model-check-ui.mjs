import assert from 'node:assert/strict';
import { createModel } from '../src/index.js';
import { modelHash } from '../verification/framework/matrix/record.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const model = createIssueModel();
const document = createFakeIndexDocument();
buildNativeIndexShell(document);
const storage = createMemoryStorage();
const target = {
  document,
  model: () => model,
  reanalyze: () => {},
  draw: () => {},
  location: { search: '' },
  localStorage: storage,
  getComputedStyle(element) {
    return { display: element.style?.display || 'block', visibility: element.style?.visibility || 'visible' };
  },
};
document.defaultView = target;
installIndexEngineBridge(target);
const workspace = target.SStructuresPhase13Workspace;
workspace.open();
workspace.setWorkspace('model');
const originalHash = modelHash(model);

let state = workspace.getState();
assert.ok(state.modelCheck.summary.total > 0);
assert.ok(state.modelCheck.summary.repairable > 0);
assert.ok(document.getElementById('p13IssueSearch'));
assert.ok(document.getElementById('p13IssueSeverity'));

const check = target.SStructuresPhase13Workspace.getState().modelCheck;
const repairableIds = [...document.querySelectorAll('[data-p13-issue-id]')]
  .map((node) => node.getAttribute('data-p13-issue-id'))
  .filter(Boolean);
assert.ok(repairableIds.length > 0);
workspace.previewIssueRepair(repairableIds);
state = workspace.getState();
assert.ok(state.modelCheck.preview?.changes > 0);
assert.ok(document.querySelector('[data-testid="p13-repair-preview"]'));

document.querySelector('[data-testid="p13-repair-apply"]').click();
state = workspace.getState();
assert.equal(state.modelCheck.preview, null);
assert.equal(state.modelCheck.canUndo, true);
assert.notEqual(modelHash(model), originalHash);
assert.equal(model.analysisCases.find((item) => item.id === 'EL-STATIC').status, 'stale');

document.querySelector('[data-testid="p13-repair-undo"]').click();
state = workspace.getState();
assert.equal(state.modelCheck.canUndo, false);
assert.equal(modelHash(model), originalHash);

const warningId = [...document.querySelectorAll('[data-p13-issue-id]')]
  .map((node) => node.getAttribute('data-p13-issue-id'))
  .find((id) => {
    workspace.selectIssue(id);
    return workspace.getState().modelCheck.selectedIssueId === id
      && document.querySelector(`[data-testid="p13-waive-${id}"]`);
  });
assert.ok(warningId);
workspace.waiveIssue(warningId, { reviewer: 'UI Reviewer', reason: '도면과 현장 조건을 확인함', createdAt: '2026-08-05T00:00:00.000Z' });
state = workspace.getState();
assert.equal(state.modelCheck.waiverCount, 1);
assert.ok(state.modelCheck.summary.waived >= 1);

model.nodes.find((item) => item.id === 'N2').x = 5;
workspace.refresh();
state = workspace.getState();
assert.equal(state.modelCheck.summary.waived, 0);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P13-M2',
  issueCount: check.summary.total,
  repairAppliedAndUndone: true,
  waiverStored: state.modelCheck.waiverCount,
  staleWaiverAutoApproved: false,
}, null, 2));

function createIssueModel() {
  const result = createModel();
  result.meta = { ...(result.meta || {}), id: 'P13-M2-UI' };
  result.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N1-DUP', x: 0, y: 0, z: 0, support: null },
    { id: 'N2', x: 4, y: 0, z: 0, support: null },
    { id: 'N-ISO', x: 9, y: 9, z: 0, support: null },
  ];
  result.members = [{
    id: 'M1', type: 'frame', n1: 'N1-DUP', n2: 'N2', matId: 'steel', secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' }, releases: { i: 'rigid', j: 'rigid' },
  }];
  result.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }];
  result.loadCombinations = [{ id: 'CO1', name: 'D', type: 'strength', factors: { D: 1 } }];
  result.loads = [];
  result.analysisCases = [{ id: 'EL-STATIC', name: 'Static', kind: 'static', status: 'ok', settings: { comboId: 'CO1' } }];
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
