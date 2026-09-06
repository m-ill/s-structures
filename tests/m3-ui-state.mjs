import assert from 'node:assert/strict';
import {
  applyUdlToSelection,
  buildFrameModel,
  createM3State,
  exportModelJson,
  importModelJson,
  selectEntity,
  selectedMembers,
} from '../src/ui/m3State.js';

const frame = buildFrameModel({ baysX: 2, baysY: 1, stories: 2, bayX: 5, bayY: 4, storyH: 3 });
assert.equal(frame.nodes.length, 18, '2x1 bays and 2 stories should create 18 nodes');
assert.equal(frame.members.length, 26, 'frame generator should create columns and story beams');
assert.equal(frame.nodes.filter((node) => node.support === 'fixed').length, 6, 'base nodes should be fixed');

const state = createM3State(frame);
assert.equal(state.analysis.ok, true, JSON.stringify(state.analysis.validation.errors, null, 2));

selectEntity(state, 'node', 'N7');
assert.ok(selectedMembers(state).length > 0, 'selecting a connected node should provide connected members');

selectEntity(state, 'member', 'M1');
const added = applyUdlToSelection(state, { w: 4, dir: '-z', loadCase: 'D' });
assert.equal(added.length, 1, 'member selection should add one load');
assert.equal(state.model.loads.length, 1, 'state should contain the added load');
assert.equal(state.analysis.ok, true, 'analysis should rerun after load application');

const json = exportModelJson(state);
const imported = createM3State();
const parsed = importModelJson(imported, json);
assert.equal(parsed.ok, true, JSON.stringify(parsed.validation.errors, null, 2));
assert.equal(imported.model.nodes.length, state.model.nodes.length);
assert.equal(imported.model.members.length, state.model.members.length);
assert.equal(imported.model.loads.length, state.model.loads.length);

console.log(JSON.stringify({
  ok: true,
  nodes: frame.nodes.length,
  members: frame.members.length,
  addedLoads: added.length,
}, null, 2));
