import assert from 'node:assert/strict';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';
import { createModel } from '../src/index.js';

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
assert.equal(snapshot.model.nodeCount, 0);
assert.ok(snapshot.availableActions.includes('addNode'));
assert.ok(snapshot.availableActions.includes('addMember'));
assert.equal(snapshot.agent.selection.exists, false);

let result = agent.execute('addNode', {
  id: 'N1',
  x: 0,
  y: 0,
  z: 0,
  support: 'fixed',
});
assert.equal(result.actionResult.node.id, 'N1');
assert.equal(result.agent.selection.type, 'node');
assert.equal(model.nodes.length, 1);

agent.execute('addNode', {
  id: 'N2',
  x: 0,
  y: 0,
  z: 3,
  mass: [5, 5, 5],
});
assert.equal(model.nodes[1].mass.length, 3);

result = agent.execute('addMember', {
  id: 'M1',
  n1: 'N1',
  n2: 'N2',
  matId: 'steel',
  secId: 'h300',
});
assert.equal(result.agent.selection.type, 'member');
assert.equal(model.members.length, 1);

agent.execute('setMemberSection', {
  memberId: 'M1',
  secId: 'h400',
});
assert.equal(model.members[0].secId, 'h400');

agent.execute('assignSection', {
  memberIds: ['M1'],
  secId: 'h300',
});
assert.equal(model.members[0].secId, 'h300');

agent.execute('addLoadCase', {
  id: 'W',
  name: 'Wind',
  type: 'wind',
});
assert.ok(model.loadCases.some((loadCase) => loadCase.id === 'W'));

agent.execute('addLoadCombination', {
  id: 'CO-W',
  name: 'Wind combo',
  type: 'strength',
  factors: { D: 1, W: 1 },
});
assert.ok(model.loadCombinations.some((combo) => combo.id === 'CO-W'));

result = agent.execute('addLoad', {
  id: 'L1',
  type: 'nodal',
  node: 'N2',
  P: 10,
  dir: '-x',
  case: 'W',
});
assert.equal(result.agent.selection.type, 'load');
assert.equal(model.loads[0].P, 10);

agent.execute('updateLoad', {
  id: 'L1',
  value: 12,
});
assert.equal(model.loads[0].P, 12);
assert.equal(model.loads[0].M, undefined);
assert.equal(model.loads[0].w, undefined);

result = agent.execute('selectEntity', {
  type: 'member',
  id: 'M1',
});
assert.equal(result.agent.selection.type, 'member');
assert.deepEqual(result.agent.selection.nodeIds, ['N1', 'N2']);
assert.deepEqual(result.agent.selection.loadIds, []);

snapshot = agent.execute('runAnalysis');
assert.equal(snapshot.analysis.ok, true, JSON.stringify(snapshot.analysis, null, 2));
assert.equal(snapshot.model.memberCount, 1);
assert.ok(reanalysisCount >= 1);

agent.execute('deleteLoad', { id: 'L1' });
assert.equal(model.loads.length, 0);

agent.execute('deleteMember', { id: 'M1' });
assert.equal(model.members.length, 0);

agent.execute('deleteNode', { id: 'N2' });
assert.equal(model.nodes.length, 1);

assert.throws(() => agent.execute('addMember', { n1: 'N1', n2: 'N404' }), /node not found/);
assert.throws(() => agent.execute('addNode', { id: 'N1' }), /Duplicate id/);

console.log(JSON.stringify({
  ok: true,
  reanalysisCount,
  nodes: model.nodes.length,
  members: model.members.length,
  loadCases: model.loadCases.length,
  combinations: model.loadCombinations.length,
}, null, 2));
