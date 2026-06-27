import assert from 'node:assert/strict';
import {
  applyDesignBasisLoads,
  createDesignBasis,
  createDetailedHtmlReport,
  createKdsLoadCombinations,
  createTwoStoryElasticFrameModel,
  LOAD_ESTIMATION_VERSION,
} from '../src/index.js';
import { analyzeForIndex, createIndexAgentApi } from '../src/ui/indexBridge.js';

const defaultBasis = createDesignBasis({ occupancy: 'office' });
assert.equal(defaultBasis.deadLoad, 5.0);
assert.equal(defaultBasis.liveLoad, 2.5);

const model = createTwoStoryElasticFrameModel();
model.loads = [];
model.loadCombinations = [];

const estimation = applyDesignBasisLoads(model, {
  occupancy: 'office',
  deadLoad: 4.8,
  liveLoad: 2.4,
  roofLiveLoad: 1.0,
  windPressureX: 0.65,
  windPressureY: 0.7,
  seismicCoefficientX: 0.08,
  seismicCoefficientY: 0.09,
});
assert.equal(estimation.version, LOAD_ESTIMATION_VERSION);
assert.equal(model.loadEstimation.version, LOAD_ESTIMATION_VERSION);
assert.ok(model.loadCases.some((item) => item.id === 'EX'));
assert.ok(model.loads.some((load) => load.generatedBy === LOAD_ESTIMATION_VERSION && load.case === 'D'));
assert.ok(model.loads.some((load) => load.generatedBy === LOAD_ESTIMATION_VERSION && load.case === 'WX'));
assert.ok(estimation.summary.totalDead > estimation.summary.totalLive);
assert.ok(estimation.storyLoads.gravity.length >= 2);

model.loadCombinations = createKdsLoadCombinations(model);
const analysis = analyzeForIndex(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
assert.ok(analysis.combos.some((combo) => combo.id.includes('WX')));

const report = createDetailedHtmlReport(model, analysis);
assert.equal(report.data.loadDerivation.version, LOAD_ESTIMATION_VERSION);
assert.match(report.html, /Load Derivation Summary/);
assert.match(report.html, /Total dead/);

const agentModel = createTwoStoryElasticFrameModel();
agentModel.loads = [];
const target = {
  model: () => agentModel,
  reanalyze: () => {
    target.result = analyzeForIndex(agentModel);
    return target.result;
  },
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => target.result,
});
const snapshot = agent.execute('applyDesignBasisLoads', {
  designBasis: { occupancy: 'school', deadLoad: 5.2, liveLoad: 3.0 },
});
assert.equal(snapshot.loadEstimation.version, LOAD_ESTIMATION_VERSION);
assert.ok(agentModel.loadEstimation.summary.generatedLoadCount > 0);
assert.equal(agent.getDesignBasisLoadEstimation().version, LOAD_ESTIMATION_VERSION);

console.log(JSON.stringify({
  ok: true,
  version: LOAD_ESTIMATION_VERSION,
  generatedLoads: estimation.summary.generatedLoadCount,
  totalDead: estimation.summary.totalDead,
  totalWindX: estimation.summary.totalWindX,
}, null, 2));
