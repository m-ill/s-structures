import assert from 'node:assert/strict';
import {
  analyzeModel,
  buildConnectionFoundationReport,
  CONNECTION_FOUNDATION_VERSION,
  createDetailedHtmlReport,
  createPortalFrameSample,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createPortalFrameSample();
model.foundationParams = { allowableBearing: 180, frictionCoefficient: 0.5 };
model.connectionParams = { nominalCapacity: 300 };

const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const review = buildConnectionFoundationReport(model, analysis);
assert.equal(review.version, CONNECTION_FOUNDATION_VERSION);
assert.equal(review.summary.connectionCount, model.members.length);
assert.equal(review.summary.foundationCount, model.nodes.filter((node) => node.support).length);
assert.ok(review.connectionRows[0].equivalentDemand >= 0);
assert.ok(review.foundationRows.every((row) => row.requiredArea >= 0));
assert.equal(review.assumptions.allowableBearing, 180);
assert.equal(review.assumptions.nominalConnectionCapacity, 300);

const report = createDetailedHtmlReport(model, analysis);
assert.equal(report.data.connectionFoundation.version, CONNECTION_FOUNDATION_VERSION);
assert.match(report.html, /Connection And Foundation Preliminary Review/);
assert.match(report.html, /Max sliding ratio/);

const target = {
  model: () => model,
  reanalyze: () => {},
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => analysis,
});
const agentReview = agent.prepareResultView('getConnectionFoundationReport');
assert.equal(agentReview.version, CONNECTION_FOUNDATION_VERSION);
assert.equal(agentReview.foundationRows.length, review.foundationRows.length);

console.log(JSON.stringify({
  ok: true,
  version: CONNECTION_FOUNDATION_VERSION,
  connections: review.summary.connectionCount,
  foundations: review.summary.foundationCount,
  maxSliding: review.summary.maxSlidingRatio,
}, null, 2));
