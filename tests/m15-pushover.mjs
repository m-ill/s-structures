import assert from 'node:assert/strict';
import {
  buildLateralPatternLoads,
  createModel,
  PUSHOVER_VERSION,
  runPushover,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createPushoverColumnModel();
const pattern = buildLateralPatternLoads(model, {
  direction: '+x',
  total: 30,
  pattern: 'triangular',
  step: 1,
});
assert.equal(pattern.loads.length, 1);
assert.equal(pattern.loads[0].node, 'N2');
assert.equal(pattern.loads[0].P, 30);

const pushover = runPushover(model, {
  controlNodeId: 'N2',
  direction: '+x',
  referenceBaseShear: 20,
  maxLoadFactor: 6,
  steps: 6,
  plasticMomentScale: 0.2,
});
assert.equal(pushover.version, PUSHOVER_VERSION);
assert.equal(pushover.ok, true, JSON.stringify(pushover.warnings, null, 2));
assert.equal(pushover.controlNodeId, 'N2');
assert.equal(pushover.curve.length, 7);
assert.equal(pushover.curve[0].baseShear, 0);
assert.equal(pushover.curve.at(-1).baseShear, 120);
assert.ok(pushover.summary.maxControlDisplacement > 0);
assert.ok(pushover.firstYield, 'test model should reach first hinge yield');
assert.ok(pushover.curve.some((point) => point.yieldedMemberCount > 0 || point.ultimateMemberCount > 0));
assert.ok(['yielded', 'ultimate'].includes(pushover.memberStates.M1.overall));

const target = {
  model: () => model,
  reanalyze: () => {},
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => null,
});
assert.ok(agent.getSnapshot().availableActions.includes('runPushover'));
const apiResult = agent.runPushover({
  controlNodeId: 'N2',
  direction: '+x',
  referenceBaseShear: 20,
  maxLoadFactor: 2,
  steps: 2,
  plasticMomentScale: 0.2,
});
assert.equal(apiResult.version, PUSHOVER_VERSION);
const executeResult = agent.execute('runPushover', {
  controlNodeId: 'N2',
  direction: '+x',
  referenceBaseShear: 20,
  maxLoadFactor: 2,
  steps: 2,
  plasticMomentScale: 0.2,
});
assert.equal(executeResult.pushover.version, PUSHOVER_VERSION);
assert.equal(executeResult.model.memberCount, 1);

console.log(JSON.stringify({
  ok: true,
  steps: pushover.curve.length,
  maxBaseShear: pushover.summary.maxBaseShear,
  maxControlDisplacement: pushover.summary.maxControlDisplacement,
  finalState: pushover.memberStates.M1.overall,
}, null, 2));

function createPushoverColumnModel() {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null, mass: [10, 10, 10] },
  ];
  model.members = [{
    id: 'M1',
    type: 'frame',
    n1: 'N1',
    n2: 'N2',
    matId: 'steel',
    secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' },
    releases: { i: 'rigid', j: 'rigid' },
  }];
  model.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }];
  model.loadCombinations = [{ id: 'CO1', name: 'D', type: 'strength', factors: { D: 1 } }];
  model.loads = [
    { id: 'P1', type: 'nodal', node: 'N2', P: 100, dir: '-z', case: 'D' },
  ];
  return model;
}
