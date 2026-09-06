import assert from 'node:assert/strict';
import {
  applyPhase13DiaphragmAssignment,
  applyPhase13StoryGeneration,
  applyPhase13TableEdit,
  buildPhase13EditorSelection,
  previewPhase13DiaphragmAssignment,
  previewPhase13StoryGeneration,
  previewPhase13TableEdit,
  validatePhase13Diaphragms,
} from '../src/modeling/phase13PracticalEditors.js';

const model = {
  nodes: [{ id: 'N1' }, { id: 'N2' }, { id: 'N3' }],
  members: [{ id: 'M1', secId: 'S1' }, { id: 'M2', secId: 'S1' }],
  stories: [], diaphragms: [],
};
const preview = previewPhase13TableEdit(model, { collection: 'members', ids: ['M1', 'M2'], patch: { secId: 'S2' } });
assert.equal(preview.status, 'ready');
const applied = applyPhase13TableEdit(model, preview);
assert.deepEqual(applied.model.members.map((row) => row.secId), ['S2', 'S2']);
assert.equal(previewPhase13TableEdit(model, { collection: 'members', ids: ['M9'], patch: { secId: 'S2' } }).status, 'blocked');
assert.equal(previewPhase13TableEdit(model, { collection: 'members', ids: ['M1'], patch: { unsupported: true } }).status, 'blocked');
const storyPreview = previewPhase13StoryGeneration(model, [{ id: '1F', elevation: 3 }, { id: '2F', elevation: 6 }]);
assert.deepEqual(storyPreview.stories.map((row) => row.height), [3, 3]);
const storyApplied = applyPhase13StoryGeneration(model, storyPreview);
assert.equal(storyApplied.ok, true); assert.equal(storyApplied.model.stories[1].height, 3);
const diaphragmPreview = previewPhase13DiaphragmAssignment(model, { id: 'D1', masterNodeId: 'N1', nodeIds: ['N2', 'N3'], storyId: '1F' });
assert.equal(diaphragmPreview.status, 'ready');
const diaphragmApplied = applyPhase13DiaphragmAssignment(model, diaphragmPreview);
assert.equal(diaphragmApplied.ok, true); assert.equal(validatePhase13Diaphragms(diaphragmApplied.model).ok, true);
const overlap = { ...diaphragmApplied.model, diaphragms: [...diaphragmApplied.model.diaphragms, { id: 'D2', masterNodeId: 'N1', nodeIds: ['N2'] }] };
assert.equal(validatePhase13Diaphragms(overlap).status, 'blocked');
const cycle = { ...model, diaphragms: [{ id: 'D1', masterNodeId: 'N1', nodeIds: ['N2'] }, { id: 'D2', masterNodeId: 'N2', nodeIds: ['N1'] }] };
assert.ok(validatePhase13Diaphragms(cycle).issues.some((row) => row.code === 'DIAPHRAGM_ASSIGNMENT_CYCLE'));
assert.deepEqual(buildPhase13EditorSelection('member', ['M1', 'M1']).ids, ['M1']);
console.log(JSON.stringify({ ok: true, milestone: 'P13-M5', storyAndDiaphragmTransactions: true }, null, 2));
