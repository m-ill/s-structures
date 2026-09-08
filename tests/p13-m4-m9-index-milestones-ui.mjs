import assert from 'node:assert/strict';
import { createModel } from '../src/index.js';
import { modelHash } from '../verification/framework/matrix/record.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const model = createFixture();
const document = createFakeIndexDocument();
buildNativeIndexShell(document);
const target = {
  document,
  model: () => model,
  reanalyze: () => {},
  draw: () => {},
  location: { search: '' },
  localStorage: createMemoryStorage(),
  getComputedStyle(element) { return { display: element.style?.display || 'block', visibility: element.style?.visibility || 'visible' }; },
};
document.defaultView = target;
installIndexEngineBridge(target);
const workspace = target.SStructuresPhase13Workspace;
workspace.open();

workspace.setWorkspace('loads');
workspace.openKdsProcedures(true);
assert.ok(document.querySelector('[data-testid="p13-kds-source-validate"]'));
workspace.setKdsSource({
  packId: 'KDS-PROJECT', sourceId: 'KDS-PROJECT', authority: 'fixture-authority', code: 'KDS fixture', edition: '2026', effectiveDate: '2026-01-01',
  sourceLocator: 'offline://fixture', sourceHash: 'a'.repeat(64), fixtureHash: 'b'.repeat(64), formulaVersion: 'v1',
  clauseMap: { 'wind-story-transfer': 'W-1', 'seismic-story-distribution': 'E-1', 'snow-project-input': 'S-1' },
  reviewer: 'source reviewer', approvedAt: '2026-08-05T00:00:00Z', reviewStatus: 'approved', branchCoverageApproved: true,
});
workspace.runKdsProcedure('seismic-story-distribution', { baseShear: 90, units: { baseShear: 'kN' } });
workspace.approveKdsProcedure({ reviewer: 'project reviewer', memo: 'fixture approval', approvedAt: '2026-08-05T01:00:00Z' });
assert.equal(workspace.getState().kds.sourceStatus, 'approved');
assert.equal(workspace.getState().kds.procedureStatus, 'review-ready');
assert.equal(workspace.getState().kds.approvalStatus, 'approved');

workspace.setWorkspace('model');
workspace.setModelSurface('practical-editors');
assert.ok(document.querySelector('[data-testid="p13-editor-batch-preview"]'));
workspace.selectEditorObjects('member', ['M1']);
assert.equal(workspace.getState().workspace.selection.id, 'M1');
workspace.previewEditorEdit({ collection: 'members', ids: ['M1'], patch: { secId: 'h400' } });
assert.equal(workspace.getState().practicalEditors.preview.status, 'ready');
workspace.applyEditorPreview();
assert.equal(model.members[0].secId, 'h400');
assert.equal(workspace.getState().practicalEditors.canUndo, true);
workspace.undoEditorChange();
assert.equal(model.members[0].secId, 'h300');

await workspace.runAll();
workspace.setWorkspace('results');
assert.equal(workspace.getState().resultsDashboard.available, true);
assert.ok(document.querySelector('[data-testid="p13-result-tab-member-forces"]'));
const dashboard = workspace.getResultsDashboard();
assert.ok(dashboard.runId); assert.ok(dashboard.resultHash);

workspace.setWorkspace('report');
workspace.setReviewTab('mgt');
const beforeImportHash = modelHash(model);
workspace.previewMgtImport(validMgt());
assert.notEqual(workspace.getState().reviewHub.mgtStatus, 'blocked');
workspace.commitMgtDraft('MGT-DRAFT-UI');
assert.equal(workspace.getState().reviewHub.draftRevisionId, 'MGT-DRAFT-UI');
assert.equal(modelHash(model), beforeImportHash);

workspace.setReviewTab('shell');
workspace.evaluateShellLab('1,1,10\n0.5,1.01,40\n0.25,1.005,160', { tolerance: 0.02, phase10EvidenceStatus: 'PASS', meshQa: { minDetJ: 0.2, maxWarp: 0.05, maxAspect: 2 } });
assert.equal(workspace.getState().reviewHub.shellStatus, 'experimental-converged');
assert.equal(workspace.getState().reviewHub.shellDesignTransferAllowed, false);

workspace.setReviewTab('release');
const uiSnapshot = workspace.getMilestoneSnapshot();
const agentSnapshot = target.SStructuresAgent.getPhase13MilestoneSnapshot();
assert.equal(agentSnapshot.releaseGate.manifestHash, uiSnapshot.releaseGate.manifestHash);
assert.equal(agentSnapshot.milestones.M8.containment.status, uiSnapshot.milestones.M8.containment.status);
assert.equal(uiSnapshot.releaseGate.workflowReleaseQualified, false);
assert.equal(uiSnapshot.releaseGate.finalDesignTransferAllowed, false);
assert.equal(uiSnapshot.releaseGate.shellDesignTransferAllowed, false);
assert.equal(target.SStructuresAgent.getDetailedReport().code, 'RESULT_REQUIRED');
target.SStructuresEngine.analyzeModel(model);
const report = target.SStructuresAgent.prepareResultView('getDetailedReport');
assert.equal(report.data.phase13Milestones.releaseGate.manifestHash, uiSnapshot.releaseGate.manifestHash);
assert.match(report.html, /data-section="phase13-milestones"/);

console.log(JSON.stringify({
  ok: true,
  milestones: ['P13-M4', 'P13-M5', 'P13-M6', 'P13-M7', 'P13-M8', 'P13-M9'],
  kdsSourceBound: true,
  practicalEditorUndo: true,
  tableViewportSelectionParity: true,
  immutableResultDashboard: true,
  mgtDraftOnly: true,
  shellContained: true,
  releaseFailClosed: true,
}, null, 2));

function createFixture() {
  const result = createModel();
  result.meta = { ...(result.meta || {}), id: 'P13-M4-M9-UI', revisionId: 'R1' };
  result.nodes = [{ id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' }, { id: 'N2', x: 0, y: 0, z: 4, mass: [10, 10, 10] }];
  result.members = [{ id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300', localAxis: { roll: 0, strongAxis: 'z' }, releases: { i: 'rigid', j: 'rigid' } }];
  result.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }];
  result.loadCombinations = [{ id: 'CO1', name: 'D', type: 'strength', factors: { D: 1 }, origin: 'manual', userModified: true }];
  result.loads = [{ id: 'P1', type: 'nodal', node: 'N2', P: 100, dir: '-z', case: 'D' }];
  result.stories = [{ id: 'S1', name: '1F', z: 3, elevation: 3, weight: 100 }, { id: 'S2', name: '2F', z: 6, elevation: 6, weight: 80 }];
  result.diaphragms = [];
  return result;
}

function validMgt() {
  return '*NODE\nN1,0,0,0\nN2,4,0,0\n*MATERIAL\nMAT,Steel,200000,77000\n*SECTION\nSEC,H,0.01,0.001,0.002,0.0001\n*ELEMENT\nM1,FRAME,N1,N2,MAT,SEC\n*LOADCASE\nD,dead\n*CONLOAD\nL1,N2,D,10,-z';
}

function createMemoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}
