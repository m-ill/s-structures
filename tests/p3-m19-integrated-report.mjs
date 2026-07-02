import assert from 'node:assert/strict';
import {
  analyzeModel,
  applyWorkflowApproval,
  buildAgentManifest,
  buildP3IntegratedResults,
  createCalculationPackageHtml,
  createDetailedHtmlReport,
  createTwoStoryElasticFrameModel,
  P3_INTEGRATED_RESULTS_VERSION,
  revokeWorkflowApproval,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createTwoStoryElasticFrameModel();
const analysis = analyzeModel(model);
assert.equal(analysis.ok, true);

const unlocked = buildP3IntegratedResults(model, analysis);
assert.equal(unlocked.version, P3_INTEGRATED_RESULTS_VERSION);
assert.equal(unlocked.summary.analysisOk, true);
assert.equal(unlocked.summary.notCheckedCount, 0);
assert.ok(unlocked.summary.designItems > 0);
assert.ok(unlocked.summary.issueRows >= 0);
assert.ok(unlocked.nonlinear.version.includes('nonlinear'));

const approved = applyWorkflowApproval(model, { state: 'approved', rev: 'R2' });
assert.equal(approved.locked, true);
assert.equal(approved.editable, false);
assert.equal(buildP3IntegratedResults(model, analysis).workflowLock.locked, true);

const revoked = revokeWorkflowApproval(model, 'design-update');
assert.equal(revoked.locked, false);
assert.equal(revoked.editable, true);

const detailed = createDetailedHtmlReport(model, analysis);
assert.equal(detailed.data.phase3IntegratedResults.version, P3_INTEGRATED_RESULTS_VERSION);
assert.match(detailed.html, /Phase 3 Integrated Design And Nonlinear Trace/);
assert.match(detailed.html, /Not checked count/);

const pkg = createCalculationPackageHtml(model, analysis);
assert.equal(pkg.data.detailed.phase3IntegratedResults.version, P3_INTEGRATED_RESULTS_VERSION);
assert.ok(pkg.data.sections.some((section) => section.id === 'phase3'));
assert.match(pkg.html, /Phase 3 Integrated Results/);
assert.match(pkg.html, /Nonlinear trace/);

const target = { model: () => model, reanalyze: () => {} };
const agent = createIndexAgentApi(target, { getLastResult: () => analysis });
const agentResults = agent.getP3IntegratedResults();
assert.equal(agentResults.version, P3_INTEGRATED_RESULTS_VERSION);
assert.equal(agentResults.summary.notCheckedCount, 0);

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3IntegratedResults, P3_INTEGRATED_RESULTS_VERSION);
assert.ok(manifest.readApis.includes('getP3IntegratedResults'));
assert.ok(manifest.dataContracts.includes('phase3IntegratedResults'));
assert.ok(manifest.milestones.some((item) => item.id === 'P3-M19'));

console.log(JSON.stringify({
  ok: true,
  version: P3_INTEGRATED_RESULTS_VERSION,
  designItems: unlocked.summary.designItems,
  issueRows: unlocked.summary.issueRows,
  htmlLength: pkg.html.length,
}, null, 2));
