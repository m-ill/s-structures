import assert from 'node:assert/strict';
import { createPracticeModel } from '../src/core/modelFactory.js';
import { applyGridStoryPlan, planCopyStory, planGridStoryModel } from '../src/modeling/gridStory.js';
import { applyModelRepairs, inspectModelGeometry } from '../src/modeling/repair.js';
import { selectMembersByFilter } from '../src/modeling/selection.js';
import { applyModelChangeSet, undoModelTransaction } from '../src/modeling/transaction.js';

const defaultPlan = planGridStoryModel({
  xGrids: [0, 5],
  yGrids: [0, 4],
  levels: [0, 3],
});
assert.equal(defaultPlan.ok, true, JSON.stringify(defaultPlan.errors));
assert.ok(defaultPlan.members.length > 0);
assert.ok(defaultPlan.members.every((member) => member.matId === 'SS275@1'));
assert.ok(defaultPlan.members.every((member) => member.secId === 'H-300x150x6.5x9@1'));

const plan = planGridStoryModel({
  xGrids: [{ label: 'A', coordinate: 0 }, { label: 'B', coordinate: 5 }, { label: 'C', coordinate: 12 }],
  yGrids: [{ label: '1', coordinate: 0 }, { label: '2', coordinate: 4 }],
  levels: [{ id: 'BASE', elevation: 0 }, { id: 'L1', elevation: 3.3 }, { id: 'L2', elevation: 7.1 }],
  roleDefaults: { column: { matId: 'steel', secId: 'h400' }, beam: { matId: 'steel', secId: 'h300' } },
});
assert.equal(plan.ok, true, JSON.stringify(plan.errors));
assert.equal(plan.nodes.length, 18);
assert.equal(plan.members.filter((item) => item.design.role === 'column').length, 12);
assert.equal(plan.members.filter((item) => item.design.role === 'beam').length, 14);

const blank = createPracticeModel();
const applied = applyGridStoryPlan(blank, plan);
assert.equal(applied.ok, true, JSON.stringify(applied.errors));
assert.equal(applied.model.nodes.length, 18);
assert.equal(applied.transaction.summary['nodes.add'], 18);
assert.equal(blank.nodes.length, 0, 'planning/apply must not mutate the input model');

const l2Beams = selectMembersByFilter(applied.model, { role: 'beam', storyId: 'L2' });
assert.equal(l2Beams.length, 7);
const windowColumns = selectMembersByFilter(applied.model, {
  role: 'column', bounds: { minX: -0.1, maxX: 5.1, minY: -0.1, maxY: 4.1, minZ: -0.1, maxZ: 7.2 },
});
assert.equal(windowColumns.length, 8);

const copy = planCopyStory(applied.model, {
  sourceStoryId: 'L2', targetStoryId: 'L3', targetElevation: 10.9, includeMembers: true, includeColumns: true, includeLoads: true,
});
assert.equal(copy.ok, true, JSON.stringify(copy.errors));
const copied = applyModelChangeSet(applied.model, copy);
assert.equal(copied.ok, true, JSON.stringify(copied.errors));
assert.ok(copied.model.stories.some((item) => item.id === 'L3'));
assert.ok(copied.model.members.some((item) => item.design?.storyId === 'L3'));

const damaged = structuredClone(applied.model);
damaged.nodes.push({ ...damaged.nodes[0], id: 'DUPLICATE' });
damaged.members.push({ ...damaged.members[0], id: 'ZERO', n1: damaged.nodes[0].id, n2: 'DUPLICATE' });
damaged.nodes.push({ id: 'ISOLATED', x: 99, y: 99, z: 99, support: null });
damaged.nodes.push({ id: 'SHELL-REF', x: 98, y: 98, z: 98, support: null });
damaged.shells = [{ id: 'SHELL-1', nodeIds: ['DUPLICATE', 'SHELL-REF'] }];
const inspection = inspectModelGeometry(damaged);
assert.equal(inspection.summary.duplicateNodeCount, 1);
assert.ok(inspection.zeroLengthMembers.includes('ZERO'));
assert.ok(inspection.isolatedNodes.includes('ISOLATED'));
assert.equal(inspection.isolatedNodes.includes('SHELL-REF'), false, 'shell references must protect nodes from isolated-node removal');
const repaired = applyModelRepairs(damaged);
assert.equal(repaired.ok, true, JSON.stringify(repaired.errors));
assert.equal(repaired.model.nodes.some((item) => item.id === 'DUPLICATE'), false);
assert.equal(repaired.model.members.some((item) => item.id === 'ZERO'), false);
assert.equal(repaired.model.nodes.some((item) => item.id === 'ISOLATED'), false);
assert.ok(repaired.model.nodes.some((item) => item.id === 'SHELL-REF'));
assert.equal(repaired.model.shells[0].nodeIds.includes('DUPLICATE'), false);
assert.ok(repaired.model.shells[0].nodeIds.includes(damaged.nodes[0].id));

const invalid = applyModelChangeSet(applied.model, {
  name: 'invalid atomic change',
  changes: [
    { op: 'update', collection: 'members', id: applied.model.members[0].id, patch: { secId: 'SHOULD-NOT-APPLY' } },
    { op: 'update', collection: 'members', id: 'DOES-NOT-EXIST', patch: { secId: 'SHOULD-NOT-APPLY' } },
  ],
});
assert.equal(invalid.ok, false);
assert.equal(invalid.model, applied.model);
assert.notEqual(applied.model.members[0].secId, 'SHOULD-NOT-APPLY', 'failed transaction must not partially mutate');

const replaced = applyModelChangeSet(applied.model, {
  id: 'replace-member',
  changes: [{ op: 'replace', collection: 'members', id: applied.model.members[0].id, value: {
    ...applied.model.members[0], secId: 'h400', temporary: true,
  } }],
});
assert.equal(replaced.ok, true);
assert.equal(replaced.model.members[0].temporary, true);
const replaceUndone = undoModelTransaction(replaced.model, replaced.transaction);
assert.equal(replaceUndone.model.members[0].temporary, undefined, 'replace undo must restore the exact prior row');
const mismatchedId = applyModelChangeSet(applied.model, {
  changes: [{ op: 'replace', collection: 'members', id: applied.model.members[0].id, value: { ...applied.model.members[0], id: 'OTHER' } }],
});
assert.equal(mismatchedId.ok, false);
assert.ok(mismatchedId.errors.some((item) => item.code === 'ID_MISMATCH'));

const crossingMiss = selectMembersByFilter({
  nodes: [{ id: 'A', x: -1, y: 0, z: 0 }, { id: 'B', x: 1, y: 2, z: 0 }],
  members: [{ id: 'AB', n1: 'A', n2: 'B' }],
}, {
  selectionMode: 'crossing',
  bounds: { minX: -0.9, maxX: -0.7, minY: 1.7, maxY: 1.9, minZ: -0.1, maxZ: 0.1 },
});
assert.deepEqual(crossingMiss, [], 'crossing selection must clip the segment, not only overlap bounding boxes');

const undone = undoModelTransaction(repaired.model, repaired.transaction);
assert.equal(undone.ok, true);
assert.equal(undone.model.nodes.length, damaged.nodes.length);
assert.equal(undone.model.members.length, damaged.members.length);

console.log(JSON.stringify({
  ok: true,
  nodes: applied.model.nodes.length,
  members: applied.model.members.length,
  copiedStoryChanges: copy.changes.length,
  repaired: inspection.summary,
}, null, 2));
