import assert from 'node:assert/strict';
import {
  analyzeModel,
  applyDesignBasisLoads,
  buildResultPostprocessing,
  createCalculationPackageHtml,
  createDetailedHtmlReport,
  createKdsRuleBasedLoadCombinations,
  createTwoStoryElasticFrameModel,
  RESULT_POSTPROCESSING_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createTwoStoryElasticFrameModel();
model.meta = { name: 'P2 Result Postprocessing Test' };
model.loads = [];
applyDesignBasisLoads(model, {
  windPressureX: 0.9,
  windPressureY: 0.7,
  seismicCoefficientX: 0.11,
  seismicCoefficientY: 0.1,
});
model.loadCombinations = createKdsRuleBasedLoadCombinations(model, { includeService: true });

const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const post = buildResultPostprocessing(model, analysis);
assert.equal(post.version, RESULT_POSTPROCESSING_VERSION);
assert.ok(post.storyResults.some((row) => Math.abs(row.cumulativeShearX) > 0));
assert.ok(post.memberStationForces.some((row) => row.stationCount > 20 && row.governing.comboId));
assert.ok(post.foundationReactions.some((row) => row.reactions.rz.comboMax));
assert.equal(post.summary.memberRowCount, model.members.length);

const detailed = createDetailedHtmlReport(model, analysis);
assert.equal(detailed.data.resultPostprocessing.version, RESULT_POSTPROCESSING_VERSION);
assert.match(detailed.html, /Result Postprocessing Tables/);

const pkg = createCalculationPackageHtml(model, analysis);
assert.equal(pkg.data.detailed.resultPostprocessing.version, RESULT_POSTPROCESSING_VERSION);
assert.match(pkg.html, /Result Postprocessing/);

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, {
  getLastResult: () => analysis,
});
const agentPost = agent.prepareResultView('getResultPostprocessing');
assert.equal(agentPost.version, RESULT_POSTPROCESSING_VERSION);
assert.equal(agent.getCapabilities().modules.resultPostprocessing, RESULT_POSTPROCESSING_VERSION);
assert.ok(agent.getCapabilities().readApis.includes('getResultPostprocessing'));

console.log(JSON.stringify({
  ok: true,
  version: RESULT_POSTPROCESSING_VERSION,
  storyRows: post.summary.storyRowCount,
  memberRows: post.summary.memberRowCount,
  foundationRows: post.summary.foundationRowCount,
}, null, 2));
