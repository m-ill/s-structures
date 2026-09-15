import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { createModel } from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';
const document = createFakeIndexDocument(); buildNativeIndexShell(document);
let model = createModel();
const events = new EventTarget();
setMaxListeners(32, events); // Browser EventTarget has no Node listener warning threshold.
const target = { document, model: () => model, reanalyze() {}, draw() {}, location: { search: '' },
  addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events), CustomEvent,
};
document.defaultView = target;
const bridge = installIndexEngineBridge(target);
const workspace = target.SStructuresPhase13Workspace;
const tree = document.querySelector('[data-testid="p13-tree"]');
assert.equal(tree.children.length, 0, 'closed workbench does not advertise stale model contents');
workspace.open();
assert.equal(workspace.getState().model.nodes, 0);
assert.equal(document.getElementById('ssPhase13Workspace').getAttribute('aria-modal'), 'false');
model.nodes = [{id:'N1',x:0,y:0,z:0,support:'fixed'}, {id:'N2',x:0,y:0,z:3}];
model.members = [{id:'M1',n1:'N1',n2:'N2',matId:'steel',secId:'h300',type:'frame'}];
bridge.markAnalysisCasesStale('test-input-commit');
const allText = node => [node.textContent || '', ...node.children.map(allText)].join(' ');
assert.match(allText(tree), /2절점 · 1부재/);
for (const mode of ['modeling', 'nonlinear', 'memo']) {
  workspace.open(); target.SStructuresNativeUI.setMode(mode);
  assert.equal(workspace.getState().open, false, `${mode} must reveal its workspace`);
  assert.equal(tree.children.length, 0);
}
workspace.open();
target.SStructuresNativeUI.setMode('elastic');
assert.equal(workspace.getState().open, true);
document.getElementById('ssPhase13ReturnToModel').click();
assert.equal(target.SStructuresNativeUI.getState().activeMode, 'modeling');
assert.equal(workspace.getState().open, false);
model = createModel(); workspace.open();
assert.equal(workspace.getState().model.nodes, 0, 'new page must not retain previous model counts');
const escape = new Event('keydown'); Object.defineProperty(escape, 'key', {value:'Escape'}); events.dispatchEvent(escape);
assert.equal(workspace.getState().open, false);
console.log('PASS current model refresh, page replacement, all mode exits, explicit model return and Escape');
