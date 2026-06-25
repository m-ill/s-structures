import assert from 'node:assert/strict';
import { createModel } from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createModel();
let reanalysisCount = 0;
const target = {
  model: () => model,
  reanalyze: () => {
    reanalysisCount += 1;
  },
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => null,
});

let snapshot = agent.getSnapshot();
assert.ok(snapshot.availableActions.includes('createGridFrame'));
assert.ok(snapshot.availableActions.includes('applyLoadTemplate'));
assert.ok(snapshot.availableActions.includes('generateFloorMass'));

let result = agent.execute('createGridFrame', {
  baysX: 2,
  baysY: 1,
  stories: 2,
  bayX: 5,
  bayY: 4,
  storyH: 3,
});
assert.equal(result.actionResult.nodesAdded, 18);
assert.equal(result.actionResult.membersAdded, 26);
assert.equal(model.nodes.length, 18);
assert.equal(model.members.length, 26);
assert.equal(model.nodes.filter((node) => node.support === 'fixed').length, 6);

result = agent.execute('autoAssignMemberRoles');
assert.deepEqual(result.actionResult.roles, { beam: 14, column: 12, brace: 0 });

result = agent.execute('generateFloorMass', { massPerFloor: 18 });
assert.equal(result.actionResult.floorCount, 2);
assert.equal(result.actionResult.updatedNodes, 12);
assert.ok(model.nodes.filter((node) => (node.z || 0) > 0).every((node) => (
  Array.isArray(node.mass) && node.mass[0] === 3 && node.mass[1] === 3 && node.mass[2] === 3
)));

const beamCount = model.members.filter((member) => member.design?.role === 'beam').length;
result = agent.execute('applyLoadTemplate', {
  template: 'gravityUdl',
  case: 'D',
  w: 4,
});
assert.equal(result.actionResult.addedLoadIds.length, beamCount);
assert.equal(model.loads.length, beamCount);
assert.ok(model.loads.every((load) => load.source === 'template:gravityUdl' && load.case === 'D'));

result = agent.execute('applyLoadTemplate', {
  template: 'gravityUdl',
  case: 'D',
  w: 5,
});
assert.equal(result.actionResult.removedLoadCount, beamCount);
assert.equal(result.actionResult.addedLoadIds.length, beamCount);
assert.equal(model.loads.length, beamCount);
assert.ok(model.loads.every((load) => load.type !== 'udl' || load.w === 5));

const elevatedNodeCount = model.nodes.filter((node) => (node.z || 0) > 0).length;
result = agent.execute('applyLoadTemplate', {
  template: 'windX',
  case: 'W',
  total: 12,
});
assert.equal(result.actionResult.addedLoadIds.length, elevatedNodeCount);
assert.equal(result.actionResult.perNode, 1);
assert.ok(result.actionResult.comboIdsAdded.includes('CO-W'));
assert.ok(model.loadCases.some((loadCase) => loadCase.id === 'W' && loadCase.type === 'wind'));
assert.ok(model.loadCombinations.some((combo) => combo.factors?.W === 1));
assert.equal(model.loads.length, beamCount + elevatedNodeCount);

result = agent.execute('copyStory', {
  fromZ: 6,
  toZ: 9,
});
assert.equal(result.actionResult.nodesAdded, 6);
assert.equal(result.actionResult.membersAdded, 13);
assert.equal(model.nodes.length, 24);
assert.equal(model.members.length, 39);

snapshot = agent.execute('runAnalysis');
assert.equal(snapshot.analysis.ok, true, JSON.stringify(snapshot.analysis, null, 2));
assert.equal(snapshot.model.nodeCount, 24);
assert.equal(snapshot.model.memberCount, 39);
assert.ok(reanalysisCount >= 6);

console.log(JSON.stringify({
  ok: true,
  nodes: model.nodes.length,
  members: model.members.length,
  loads: model.loads.length,
  reanalysisCount,
}, null, 2));
