import assert from 'node:assert/strict';
import {
  analyzeModel,
  applyDesignBasisLoads,
  buildMemberDesignTraceReport,
  createCalculationPackageHtml,
  createDetailedHtmlReport,
  createKdsRuleBasedLoadCombinations,
  createTwoStoryElasticFrameModel,
  MEMBER_DESIGN_TRACE_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createTwoStoryElasticFrameModel();
model.meta = { name: 'Member Design Trace Test' };
model.loads = [];
applyDesignBasisLoads(model, { occupancy: 'office' });
model.loadCombinations = createKdsRuleBasedLoadCombinations(model, { includeService: true });

const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const trace = buildMemberDesignTraceReport(model, analysis);
assert.equal(trace.version, MEMBER_DESIGN_TRACE_VERSION);
assert.equal(trace.summary.memberCount, model.members.length);
assert.equal(trace.summary.unimplementedCount, 0);
assert.ok(trace.summary.checkedCount > 0);
assert.ok(trace.summary.governing.memberId);

const first = trace.rows[0];
assert.equal(first.version, MEMBER_DESIGN_TRACE_VERSION);
assert.ok(first.formulaTrace.length >= 5);
assert.ok(first.formulaTrace.some((row) => row.expression));
assert.ok(first.actionItems.length >= 1);
assert.ok(Object.prototype.hasOwnProperty.call(first.demandTrace, 'N'));

const detailed = createDetailedHtmlReport(model, analysis);
assert.equal(detailed.data.memberDesignTrace.version, MEMBER_DESIGN_TRACE_VERSION);
assert.match(detailed.html, /Member Design Trace Matrix/);

const pkg = createCalculationPackageHtml(model, analysis, {
  title: 'Member Design Trace Calculation Package',
});
assert.match(pkg.html, /Member Design Trace Matrix/);

const target = {
  model: () => model,
  reanalyze: () => {},
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => analysis,
});
const agentTrace = agent.getMemberDesignTraceReport();
assert.equal(agentTrace.version, MEMBER_DESIGN_TRACE_VERSION);
assert.equal(agentTrace.rows.length, model.members.length);

console.log(JSON.stringify({
  ok: true,
  version: MEMBER_DESIGN_TRACE_VERSION,
  members: trace.summary.memberCount,
  governing: trace.summary.governing,
}, null, 2));
