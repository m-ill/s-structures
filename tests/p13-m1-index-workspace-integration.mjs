import assert from 'node:assert/strict';
import { createModel } from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { INDEX_PHASE13_ELASTIC_WORKSPACE_VERSION } from '../src/ui/indexPhase13ElasticWorkspace.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const model = createColumnModel();
const document = createFakeIndexDocument();
buildNativeIndexShell(document);
const target = {
  document,
  model: () => model,
  reanalyze: () => {},
  draw: () => {},
  location: { search: '' },
  localStorage: createMemoryStorage(),
  getComputedStyle(element) {
    return { display: element.style?.display || 'block', visibility: element.style?.visibility || 'visible' };
  },
};
document.defaultView = target;
installIndexEngineBridge(target);

const workspace = target.SStructuresPhase13Workspace;
assert.equal(workspace.version, INDEX_PHASE13_ELASTIC_WORKSPACE_VERSION);
assert.ok(document.getElementById('ssPhase13WorkspaceOpen'));
assert.ok(document.getElementById('ssPhase13Workspace'));
assert.equal(document.getElementById('ssPhase13Workspace').hidden, true);

document.getElementById('ssPhase13WorkspaceOpen').click();
assert.equal(workspace.getState().open, true);
assert.equal(document.getElementById('ssPhase13Workspace').hidden, false);
assert.equal(target.SStructuresNativeUI.getState().activeMode, 'elastic');
assert.equal(document.querySelectorAll('[data-p13-workspace]').length, 6);
assert.equal(document.querySelectorAll('[data-testid="p13-tree"]').length, 1);
assert.equal(document.querySelectorAll('[data-testid="p13-center"]').length, 1);
assert.equal(document.querySelectorAll('[data-testid="p13-inspector"]').length, 1);
assert.equal(document.querySelectorAll('[data-testid="p13-drawer"]').length, 1);

await workspace.runAll();
let state = workspace.getState();
assert.equal(state.elasticCaseCount, 6);
assert.equal(state.runState.execution, 'current');
assert.ok(state.runState.runId);
assert.equal(target.SStructuresElasticResultPopup.getState().open, false);
assert.equal(state.invariants.openSeesRuntimeUsed, false);
assert.equal(state.invariants.externalSolverRuntimeDependency, false);
assert.equal(state.invariants.nonlinearInScope, false);
assert.equal(state.invariants.shellDesignTransferAllowed, false);

for (const id of ['model', 'loads', 'analysis', 'results', 'report']) {
  workspace.setWorkspace(id);
  assert.equal(workspace.getState().workspace.workspace, id);
  assert.equal(document.querySelector(`[data-p13-workspace="${id}"]`).classList.contains('active'), true);
}

const selected = model.analysisCases.find((item) => item.id === state.selectedCaseId);
selected.status = 'stale';
workspace.refresh();
state = workspace.getState();
assert.equal(state.runState.execution, 'stale');
assert.equal(state.runState.designTransferAllowed, false);
assert.match(document.getElementById('ssPhase13RunStatus').textContent, /Stale/);

document.getElementById('ssPhase13WorkspaceClose').click();
assert.equal(workspace.getState().open, false);
assert.equal(document.getElementById('ssPhase13Workspace').hidden, true);

console.log(JSON.stringify({
  ok: true,
  version: workspace.version,
  elasticCases: state.elasticCaseCount,
  staleStatus: state.runState.execution,
  ownEngine: state.invariants.openSeesRuntimeUsed === false,
}, null, 2));

function createColumnModel() {
  const result = createModel();
  result.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null, mass: [10, 10, 10] },
  ];
  result.members = [{
    id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' }, releases: { i: 'rigid', j: 'rigid' },
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
