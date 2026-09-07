import assert from 'node:assert/strict';
import {
  buildDetailedReportData,
  createDetailedHtmlReport,
  createKdsLoadCombinations,
  createTwoStoryElasticFrameModel,
  DETAILED_REPORT_VERSION,
} from '../src/index.js';
import { analyzeForIndex, createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createTwoStoryElasticFrameModel();
model.meta = { name: 'Detailed Report Test Frame' };
model.loadCombinations = createKdsLoadCombinations(model);

const analysis = analyzeForIndex(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
assert.ok(analysis.combos.length >= 4);

const data = buildDetailedReportData(model, analysis, {
  generatedAt: '2026-06-27T00:00:00.000Z',
});
assert.equal(data.version, DETAILED_REPORT_VERSION);
assert.equal(data.title, 'Detailed Report Test Frame');
assert.equal(data.model.memberCount, model.members.length);
assert.equal(data.loadCases.length, model.loadCases.length);
assert.equal(data.combinations.length, model.loadCombinations.length);
assert.equal(data.combinationResults.length, analysis.combos.length);
assert.ok(data.combinationResults.some((row) => row.totalLoad?.some((value) => Math.abs(value) > 0)));
assert.ok(data.memberChecks.length > 0);
assert.ok(data.governingMembers.length > 0);
assert.ok(data.scope.missingScopes.some((item) => item.includes('Foundation design')));
assert.equal(data.codeBasis.loadCombinationCoverage.version, 'm35-kds-load-combination-presets');

const report = createDetailedHtmlReport(model, analysis, {
  generatedAt: '2026-06-27T00:00:00.000Z',
});
assert.match(report.html, /Detailed Report Test Frame/);
assert.match(report.html, /Load Case Trace/);
assert.match(report.html, /Member Check Trace/);
assert.match(report.html, /Remaining Design Scope/);
assert.doesNotMatch(report.html, /Detailed <Report>/);

const target = {
  model: () => model,
  reanalyze: () => {},
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => analysis,
});
assert.equal(agent.getDetailedReport().code, 'RESULT_REQUIRED');
const agentReport = agent.prepareResultView('getDetailedReport', {
  generatedAt: '2026-06-27T00:00:00.000Z',
});
assert.equal(agentReport.data.version, DETAILED_REPORT_VERSION);
assert.equal(agentReport.data.memberChecks.length, model.members.length);

console.log(JSON.stringify({
  ok: true,
  version: data.version,
  combinations: data.combinations.length,
  memberChecks: data.memberChecks.length,
  htmlLength: report.html.length,
}, null, 2));
