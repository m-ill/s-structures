import assert from 'node:assert/strict';
import { createTwoStoryElasticFrameModel, migrateModel } from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexAgentApi.js';

const model = createTwoStoryElasticFrameModel();
for (const node of model.nodes) {
  if (Number(node.z) > 0) node.mass = [10, 10, 10];
}
model.analysisCases = [{
  id: 'THA-PRELIMINARY',
  name: 'Preliminary THA',
  kind: 'linearTha',
  settings: {
    modalModeCount: 3,
    direction: 'x',
    dampingRatio: 0.05,
    dt: 0.02,
    accelerations: [0, 0.1, 0],
  },
  input: {},
  status: 'not-run',
  lastRun: null,
}];

const target = { model: () => model };
const api = createIndexAgentApi(target, null);
const result = api.runAnalysisCase('THA-PRELIMINARY');
assert.equal(result.status, 'preliminary');
assert.equal(result.qualification, 'preliminary');
assert.equal(model.analysisCases[0].status, 'preliminary');
assert.equal(model.analysisCases[0].lastRun.status, 'preliminary');

const roundTrip = migrateModel(model).model.analysisCases[0];
assert.equal(roundTrip.status, 'preliminary');
assert.equal(roundTrip.lastRun.status, 'preliminary');
assert.equal(roundTrip.lastRun.resultKey, 'THA-PRELIMINARY');
assert.equal(roundTrip.lastRun.resultRef, 'THA-PRELIMINARY');

console.log(JSON.stringify({
  ok: true,
  runnerStatus: result.status,
  storedStatus: model.analysisCases[0].status,
  persistedLastRunStatus: roundTrip.lastRun.status,
}, null, 2));
