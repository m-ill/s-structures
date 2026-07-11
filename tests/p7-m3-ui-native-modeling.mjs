import assert from 'node:assert/strict';
import { installIndexFloatingPanels } from '../src/ui/indexFloatingPanels.js';
import { installIndexNativeModeler } from '../src/ui/indexNativeModeler.js';
import { PHASE7_MODELING_WORKFLOW_VERSION } from '../src/ui/phase7ModelingWorkflow.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const model = { materials: [], sections: [], nodes: [], members: [], loads: [], stories: [], diaphragms: [] };
let reanalysisCount = 0;
let staleCount = 0;
const bridge = {
  getCurrentModel: () => model,
  markAnalysisCasesStale: () => { staleCount += 1; },
};
const target = { model: () => model, reanalyze: () => { reanalysisCount += 1; } };
const native = installIndexNativeModeler(target, { bridge });

const incomplete = native.executeCommand('previewGridStory', {
  xGrids: [0, 5], yGrids: [0, 4], levels: [0, 3],
});
assert.equal(incomplete.ok, false);
assert.ok(incomplete.errors.includes('roleDefaults.column.matId:required'));

const gridInput = {
  xGrids: [{ label: 'A', coordinate: 0 }, { label: 'B', coordinate: 5 }],
  yGrids: [{ label: '1', coordinate: 0 }, { label: '2', coordinate: 4 }],
  levels: [{ id: 'BASE', elevation: 0 }, { id: 'L1', elevation: 3 }, { id: 'L2', elevation: 6 }],
  roleDefaults: {
    column: { matId: 'SS275@1', secId: 'H-300x150x6.5x9@1' },
    beam: { matId: 'SS275@1', secId: 'H-300x150x6.5x9@1' },
  },
};
const preview = native.executeCommand('previewGridStory', gridInput);
assert.equal(preview.version, PHASE7_MODELING_WORKFLOW_VERSION);
assert.equal(preview.ok, true, JSON.stringify(preview.errors));
assert.equal(preview.plan.nodes.length, 12);
assert.equal(preview.plan.members.length, 16);
assert.equal(model.nodes.length, 0, 'preview must not mutate');
const applied = native.executeCommand('applyGridStory', { preview });
assert.equal(applied.ok, true, JSON.stringify(applied.errors));
assert.equal(model.nodes.length, 12);
assert.equal(model.members.length, 16);
assert.equal(native.getState().phase7.undoDepth, 1);

const duplicateAppend = native.executeCommand('previewGridStory', { input: gridInput, options: { mode: 'append' } });
assert.equal(duplicateAppend.ok, false);
assert.equal(model.nodes.length, 12);

const selected = native.executeCommand('selectMembersByFilter', { role: 'beam', storyId: 'L2' });
assert.equal(selected.count, 4);
assert.deepEqual(native.getState().phase7.selection.memberIds, selected.ids);
assert.equal(target.__SStructuresAgentState.multiSelection.ids.length, 4);

const copyPreview = native.executeCommand('previewCopyStory', {
  sourceStoryId: 'L2', targetStoryId: 'L3', targetElevation: 9, includeMembers: true, includeColumns: true,
  columnDefaults: { matId: 'SS275@1', secId: 'H-300x150x6.5x9@1' },
});
assert.equal(copyPreview.ok, true, JSON.stringify(copyPreview.errors));
const copied = native.executeCommand('applyCopyStory', { preview: copyPreview });
assert.equal(copied.ok, true, JSON.stringify(copied.errors));
assert.ok(model.stories.some((story) => story.id === 'L3'));

model.nodes.push({ ...model.nodes[0], id: 'DUPLICATE' });
model.members.push({ ...model.members[0], id: 'ZERO', n1: model.nodes[0].id, n2: 'DUPLICATE' });
model.nodes.push({ id: 'ISOLATED', x: 99, y: 99, z: 99 });
const repairPreview = native.executeCommand('previewModelRepairs');
assert.equal(repairPreview.inspection.summary.duplicateNodeCount, 1);
assert.ok(repairPreview.inspection.zeroLengthMembers.includes('ZERO'));
const repaired = native.executeCommand('applyModelRepairs', { preview: repairPreview });
assert.equal(repaired.ok, true, JSON.stringify(repaired.errors));
assert.equal(model.nodes.some((node) => node.id === 'DUPLICATE'), false);
assert.equal(model.members.some((member) => member.id === 'ZERO'), false);
const undoRepair = native.undo();
assert.equal(undoRepair.ok, true);
assert.ok(model.nodes.some((node) => node.id === 'DUPLICATE'));
assert.ok(model.members.some((member) => member.id === 'ZERO'));

const invalidReference = native.executeCommand('previewGridStory', {
  ...gridInput,
  roleDefaults: {
    ...gridInput.roleDefaults,
    beam: { matId: 'SS275@1', secId: 'NO-SUCH-SECTION' },
  },
});
assert.equal(invalidReference.ok, false);
assert.ok(invalidReference.errors.some((error) => error.code === 'INVALID_SECTION_REFERENCE'));
const summarizedPreview = native.getState().phase7.lastPreview;
assert.equal(summarizedPreview.preview.memberCount, 16);
assert.doesNotThrow(() => JSON.stringify(native.getState()));

const document = createFakeIndexDocument();
buildNativeIndexShell(document);
const storage = createMemoryStorage();
const workspaceTarget = {
  document,
  localStorage: storage,
  innerWidth: 1000,
  innerHeight: 700,
  addEventListener() {},
};
document.defaultView = workspaceTarget;
const workspace = installIndexFloatingPanels(workspaceTarget);
assert.ok(workspace.getState().propertyPanel.floating);
assert.ok(document.getElementById('ssWorkspaceReset'), 'workspace reset control must remain outside managed panels');
workspace.setVisible('properties', false);
const main = document.getElementById('main') || document.body;
const peerA = document.createElement('section');
const peerB = document.createElement('section');
main.appendChild(peerA);
main.appendChild(peerB);
workspace.registerPanel('peer-a', peerA, { minWidth: 100, minHeight: 100, defaultWidth: 200, defaultHeight: 160 });
workspace.registerPanel('peer-b', peerB, { minWidth: 100, minHeight: 100, defaultWidth: 180, defaultHeight: 160 });
workspace.move('peer-a', { left: 100, top: 100, width: 200, height: 160 });
const peerSnapped = workspace.move('peer-b', { left: 311, top: 102, width: 180, height: 160 });
assert.equal(peerSnapped.left, 300);
assert.equal(peerSnapped.top, 100);
const docked = workspace.dock('peer-b', 'right', { dockRatio: 0.3 });
assert.equal(Math.round(docked.left + docked.width), 992);
workspace.applyPreset('analysis');
assert.equal(workspace.getWorkspaceState().preset, 'analysis');
workspace.reset('modeling');
assert.equal(workspace.getWorkspaceState().preset, 'modeling');
assert.ok(storage.getItem('s-structures:phase7-workspace'));

const restrictedDocument = createFakeIndexDocument();
buildNativeIndexShell(restrictedDocument);
const restrictedTarget = { document: restrictedDocument, innerWidth: 800, innerHeight: 600, addEventListener() {} };
Object.defineProperty(restrictedTarget, 'localStorage', { get() { throw new Error('storage blocked'); } });
restrictedDocument.defaultView = restrictedTarget;
assert.doesNotThrow(() => installIndexFloatingPanels(restrictedTarget), 'blocked browser storage must not prevent UI initialization');

console.log(JSON.stringify({
  ok: true,
  version: PHASE7_MODELING_WORKFLOW_VERSION,
  nodeCount: model.nodes.length,
  memberCount: model.members.length,
  reanalysisCount,
  staleCount,
  workspacePreset: workspace.getWorkspaceState().preset,
}, null, 2));

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
