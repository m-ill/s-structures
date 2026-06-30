import assert from 'node:assert/strict';
import {
  analyzeModel,
  buildPracticePlatformReadiness,
  createCalculationPackageHtml,
  createDetailedHtmlReport,
  createTwoStoryElasticFrameModel,
  PRACTICE_PLATFORM_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createTwoStoryElasticFrameModel();
model.meta = { name: 'P2 Practice Platform Test', revision: 'R1' };
model.workflow = {
  state: 'review',
  approvalState: 'checking',
  engineer: 'engineer',
  reviewer: 'reviewer',
};

const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const platform = buildPracticePlatformReadiness(model, analysis);
assert.equal(platform.version, PRACTICE_PLATFORM_VERSION);
assert.equal(platform.workflow.project.revision, 'R1');
assert.ok(['OK', 'WARN'].includes(platform.summary.status));
assert.ok(platform.qaChecklist.items.some((item) => item.id === 'design-demand'));
assert.ok(platform.importExport.sources.some((item) => item.id === 'drawing-image'));

const detailed = createDetailedHtmlReport(model, analysis);
assert.equal(detailed.data.practicePlatform.version, PRACTICE_PLATFORM_VERSION);
assert.match(detailed.html, /Platform Workflow And AI QA/);

const pkg = createCalculationPackageHtml(model, analysis);
assert.equal(pkg.data.detailed.practicePlatform.version, PRACTICE_PLATFORM_VERSION);
assert.match(pkg.html, /Practice Platform Readiness/);

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, {
  getLastResult: () => analysis,
});
assert.equal(agent.getPracticePlatformReadiness().version, PRACTICE_PLATFORM_VERSION);
assert.equal(agent.getCapabilities().modules.practicePlatformReadiness, PRACTICE_PLATFORM_VERSION);
assert.ok(agent.getCapabilities().readApis.includes('getPracticePlatformReadiness'));

console.log(JSON.stringify({
  ok: true,
  version: PRACTICE_PLATFORM_VERSION,
  status: platform.summary.status,
  qaOk: platform.summary.qaOk,
  importSources: platform.summary.importSourceCount,
}, null, 2));
