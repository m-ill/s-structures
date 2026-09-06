import assert from 'node:assert/strict';
import {
  buildReportData,
  createHtmlReport,
  createPortalFrameSample,
  REPORT_EXPORT_VERSION,
} from '../src/index.js';
import { analyzeForIndex, createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createPortalFrameSample();
model.meta = { name: 'Portal <Frame> & Report' };
for (const node of model.nodes) {
  if (!node.support) node.mass = [5, 5, 5];
}

const analysis = analyzeForIndex(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const data = buildReportData(model, analysis, {
  generatedAt: '2026-06-25T00:00:00.000Z',
});
assert.equal(data.version, REPORT_EXPORT_VERSION);
assert.equal(data.title, 'Portal <Frame> & Report');
assert.equal(data.model.nodeCount, model.nodes.length);
assert.equal(data.model.memberCount, model.members.length);
assert.equal(data.loadCases.length, model.loadCases.length);
assert.equal(data.combinations.length, model.loadCombinations.length);
assert.equal(data.analysis.status, 'OK');
assert.ok(data.analysis.maxDisplacement > 0);
assert.ok(data.memberForces.length > 0);
assert.ok(data.design.rows.length > 0);
assert.ok(data.scope.limitations.some((item) => item.includes('preliminary')));

const report = createHtmlReport(model, analysis, {
  generatedAt: '2026-06-25T00:00:00.000Z',
});
assert.equal(report.data.version, REPORT_EXPORT_VERSION);
assert.match(report.html, /S-Structures Report|Portal/);
assert.match(report.html, /Member Force Envelope/);
assert.match(report.html, /Design Summary/);
assert.match(report.html, /Portal &lt;Frame&gt; &amp; Report/);
assert.doesNotMatch(report.html, /Portal <Frame> & Report/);

const target = {
  model: () => model,
  reanalyze: () => {},
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => analysis,
});
const agentReport = agent.getReport({
  generatedAt: '2026-06-25T00:00:00.000Z',
});
assert.equal(agentReport.data.model.loadCount, model.loads.length);
assert.match(agentReport.html, /Load Combinations/);

console.log(JSON.stringify({
  ok: true,
  nodes: data.model.nodeCount,
  members: data.model.memberCount,
  designRows: data.design.rows.length,
  htmlLength: report.html.length,
}, null, 2));
