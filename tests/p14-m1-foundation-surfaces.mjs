import assert from 'node:assert/strict';
import { analyzeModel, assignFoundationTransaction, buildDetailedReportData, buildFoundationInspector, createDetailedHtmlReport, createModel, upsertFoundationPropertyTransaction, validateModel } from '../src/index.js';
import { executeModelingAction, ensureAgentState, INDEX_AGENT_ACTIONS_VERSION } from '../src/ui/indexAgentActions.js';
import { applyModelChangeSet, undoModelTransaction } from '../src/modeling/transaction.js';

const model = baseModel();
const target = {};
const state = ensureAgentState(target);
const created = executeModelingAction(model, state, 'createFoundationProperty', {
  id: 'WF-AGENT',
  localY: { lineStiffness: 12000 },
  localZ: { derivation: { subgradeModulus: 8000, tributaryWidth: 2 } },
});
assert.equal(created.property.localZ.lineStiffness, 16000);
executeModelingAction(model, state, 'assignMemberFoundation', { memberIds: ['M1', 'M2'], foundationId: 'WF-AGENT' });
assert.equal(model.members[0].foundationId, 'WF-AGENT');
assert.ok(executeModelingAction(model, state, 'removeMemberFoundation', { memberId: 'M2' }).changed);
executeModelingAction(model, state, 'assignMemberFoundation', { memberId: 'M2', foundationId: 'WF-AGENT' });
assert.equal(validateModel(model).ok, true);

const reopened = JSON.parse(JSON.stringify(model));
assert.equal(validateModel(reopened).ok, true);
assert.equal(reopened.foundationProperties[0].propertyHash, model.foundationProperties[0].propertyHash);

const transactionModel = baseModel();
const transaction = applyModelChangeSet(transactionModel, {
  id: 'foundation-transaction',
  name: 'Assign distributed foundation',
  changes: [
    { op: 'add', collection: 'foundationProperties', id: 'WF-TX', value: { ...created.property, id: 'WF-TX' } },
    { op: 'update', collection: 'members', id: 'M1', patch: { foundationId: 'WF-TX' } },
  ],
}, { validate: validateModel });
assert.equal(transaction.ok, true, JSON.stringify(transaction.errors));
const undone = undoModelTransaction(transaction.model, transaction.transaction, { validate: validateModel });
assert.equal(undone.ok, true, JSON.stringify(undone.errors));
assert.equal(undone.model.foundationProperties.length, 0);
assert.equal(undone.model.members[0].foundationId, undefined);

const modularModel = baseModel();
const propertyTx = upsertFoundationPropertyTransaction(modularModel, created.property);
assert.equal(propertyTx.ok, true, JSON.stringify(propertyTx.errors));
const assignmentTx = assignFoundationTransaction(propertyTx.model, { memberIds: ['M1', 'M2'], foundationId: 'WF-AGENT' });
assert.equal(assignmentTx.ok, true, JSON.stringify(assignmentTx.errors));
assert.equal(assignmentTx.model.members.filter((row) => row.foundationId === 'WF-AGENT').length, 2);

const analysis = analyzeModel(reopened);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors));
const inspector = buildFoundationInspector(reopened, analysis, { memberId: 'M1', comboId: 'D_ONLY' });
assert.equal(inspector.selectedMemberCount, 1);
assert.equal(inspector.members[0].response.status, 'SOLVED');
assert.equal(inspector.glyphs[0].activeLocalY, true);
const report = buildDetailedReportData(reopened, analysis, { generatedAt: '2026-08-27T00:00:00.000Z' });
assert.equal(report.foundationResponse.assignedMemberCount, 2);
assert.equal(report.foundationResponse.solvedMemberCount, 2);
assert.ok(report.foundationResponse.totalStrainEnergy > 0);
const html = createDetailedHtmlReport(reopened, analysis, { generatedAt: '2026-08-27T00:00:00.000Z' }).html;
assert.match(html, /Distributed Foundation Response/);
assert.match(html, /WF-AGENT/);

assert.throws(
  () => executeModelingAction(reopened, state, 'deleteFoundationProperty', { id: 'WF-AGENT' }),
  /assigned to members/,
);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P14-M1',
  agentVersion: INDEX_AGENT_ACTIONS_VERSION,
  reportVersion: report.foundationResponse.version,
  solvedMembers: report.foundationResponse.solvedMemberCount,
  transactionUndo: true,
  saveReopen: true,
  inspectorGlyphs: inspector.glyphs.length,
}, null, 2));

function baseModel() {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'pin' },
    { id: 'N2', x: 2, y: 0, z: 0, support: null },
    { id: 'N3', x: 4, y: 0, z: 0, support: 'custom', fix: [false, true, true, false, false, false] },
  ];
  model.members = [
    { id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300', releases: { i: 'rigid', j: 'rigid' } },
    { id: 'M2', type: 'frame', n1: 'N2', n2: 'N3', matId: 'steel', secId: 'h300', releases: { i: 'rigid', j: 'rigid' } },
  ];
  model.loadCases = [{ id: 'D', name: 'D', type: 'dead' }];
  model.loadCombinations = [{ id: 'D_ONLY', name: 'D', type: 'strength', factors: { D: 1 } }];
  model.loads = [{ id: 'P', type: 'nodal', node: 'N2', P: 20, dir: '-z', case: 'D' }];
  model.analysisSettings = { ...model.analysisSettings, includeSelfWeight: false };
  return model;
}
