import assert from 'node:assert/strict';
import { modelHash } from '../verification/framework/matrix/record.js';
import {
  applyPhase13RepairPreview,
  buildPhase13IssueCenterView,
  buildPhase13ModelCheck,
  createPhase13IssueWaiver,
  previewPhase13ModelRepair,
  undoPhase13Repair,
} from '../src/modeling/phase13ModelCheck.js';

const model = {
  schemaVersion: 5,
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0 },
    { id: 'N1-DUP', x: 0, y: 0, z: 0 },
    { id: 'N2', x: 4, y: 0, z: 0 },
    { id: 'N-ISO', x: 9, y: 9, z: 0 },
  ],
  members: [{ id: 'M1', n1: 'N1-DUP', n2: 'N2' }],
  loads: [], diaphragms: [], stories: [], shells: [], slabs: [], slabPanels: [], massSources: [], analysisCases: [],
};
const validation = {
  errors: [{ code: 'DUPLICATE_NODE', message: 'duplicate node', target: 'N1-DUP', nodeIds: ['N1', 'N1-DUP'] }],
  warnings: [{ code: 'LOCAL_AXIS_REVIEW', message: 'review local axis', target: 'M1' }],
};

const first = buildPhase13ModelCheck(model, { validation });
const second = buildPhase13ModelCheck(model, { validation });
assert.deepEqual(first.issues.map((row) => row.issueId), second.issues.map((row) => row.issueId));
assert.equal(first.ok, false);
assert.ok(first.issues.every((row) => row.objectRefs.length || row.geometryHint));
assert.equal(first.summary.blockers, 1);

const warning = first.issues.find((row) => row.code === 'LOCAL_AXIS_REVIEW');
const waiver = createPhase13IssueWaiver(warning, { reviewer: 'reviewer', reason: 'checked on drawing', createdAt: '2026-08-05' });
assert.equal(buildPhase13ModelCheck(model, { validation, waivers: [waiver] }).issues.find((row) => row.issueId === warning.issueId).waiverStatus, 'waived');
const changed = { ...model, nodes: model.nodes.map((node) => node.id === 'N2' ? { ...node, x: 5 } : node) };
assert.equal(buildPhase13ModelCheck(changed, { validation, waivers: [waiver] }).issues.find((row) => row.issueId === warning.issueId).waiverStatus, 'stale');
assert.throws(() => createPhase13IssueWaiver(first.issues.find((row) => row.severity === 'blocker'), { reason: 'no' }), { code: 'P13_BLOCKER_WAIVER_FORBIDDEN' });

const preview = previewPhase13ModelRepair(model, first.issues.map((row) => row.issueId), { validation });
assert.equal(preview.ok, true);
assert.ok(preview.changes.length > 0);
assert.notEqual(preview.beforeModelHash, preview.afterModelHash);
const applied = applyPhase13RepairPreview(model, preview);
assert.equal(applied.ok, true);
assert.equal(modelHash(applied.model), preview.afterModelHash);
const undone = undoPhase13Repair(applied.model, applied.transaction);
assert.equal(undone.ok, true);
assert.equal(modelHash(undone.model), modelHash(model));

const failed = applyPhase13RepairPreview(model, preview, { validate: () => ({ ok: false, errors: [{ code: 'INJECTED' }] }) });
assert.equal(failed.ok, false);
assert.equal(modelHash(failed.model), modelHash(model));
const stalePreview = applyPhase13RepairPreview(changed, preview);
assert.equal(stalePreview.ok, false);
assert.equal(modelHash(stalePreview.model), modelHash(changed));

const view = buildPhase13IssueCenterView(first, { severity: 'blocker', search: 'duplicate' });
assert.equal(view.count, 1);
assert.equal(view.issues[0].clickTarget.id, 'N1');
assert.ok(view.issues[0].actions.includes('zoom'));

console.log(JSON.stringify({ ok: true, milestone: 'P13-M2', issues: first.summary, repairChanges: preview.changes.length }, null, 2));
