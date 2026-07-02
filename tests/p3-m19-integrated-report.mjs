import assert from 'node:assert/strict';
import {
  analyzeModel,
  applyWorkflowApproval,
  buildAgentManifest,
  buildP3IntegratedResults,
  buildP3IntegratedResultsGate,
  createCalculationPackageHtml,
  createDetailedHtmlReport,
  createTwoStoryElasticFrameModel,
  P3_INTEGRATED_RESULTS_GATE_VERSION,
  P3_INTEGRATED_RESULTS_VERSION,
  revokeWorkflowApproval,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createTwoStoryElasticFrameModel();
const analysis = analyzeModel(model);
assert.equal(analysis.ok, true);

const unlocked = buildP3IntegratedResults(model, analysis);
assert.equal(unlocked.version, P3_INTEGRATED_RESULTS_VERSION);
assert.equal(unlocked.contract.milestone, 'P3-M19');
assert.equal(unlocked.contract.readApi, 'getP3IntegratedResults');
assert.ok(unlocked.contract.reviewFields.includes('integratedGate.ticketCoverage'));
assert.equal(unlocked.integratedGate.version, P3_INTEGRATED_RESULTS_GATE_VERSION);
assert.deepEqual(unlocked.integratedGate.tickets, ['P3-T58', 'P3-T59', 'P3-T61', 'P3-T62']);
assert.equal(unlocked.integratedGate.contract.milestone, 'P3-M19');
assert.deepEqual(unlocked.integratedGate.contract.tickets, ['P3-T58', 'P3-T59', 'P3-T61', 'P3-T62']);
assert.equal(unlocked.integratedGate.contract.featureTicketMap.integratedResultPostprocessing, 'P3-T58');
assert.ok(unlocked.integratedGate.contract.reviewFields.includes('summary.ticketCoverage'));
assert.equal(unlocked.integratedGate.contract.maturity, 'preliminary-integrated-results');
assert.equal(unlocked.integratedGate.ok, false);
assert.equal(unlocked.integratedGate.summary.readyForReviewer, false);
assert.equal(unlocked.integratedGate.summary.completeTicketCoverage, true);
assert.equal(unlocked.integratedGate.integratedReview.status, 'review-required');
assert.equal(unlocked.integratedGate.integratedReview.finalStructuralSignoff, false);
assert.equal(unlocked.integratedGate.integratedReview.launchReady, false);
assert.equal(unlocked.integratedGate.integratedReview.agentDecision, 'hold-before-m20-launch-gate');
assert.ok(unlocked.integratedGate.integratedReview.missing.includes('detailed-design-review'));
assert.ok(unlocked.integratedGate.integratedReview.missing.includes('design-issues'));
assert.equal(unlocked.integratedGate.integratedReview.designIssueRows, unlocked.design.issueRows.length);
assert.equal(unlocked.integratedGate.summary.coveredTicketCount, 4);
assert.equal(unlocked.summary.analysisOk, true);
assert.equal(unlocked.summary.gateOk, false);
assert.equal(unlocked.summary.readyForReviewer, false);
assert.equal(unlocked.summary.completeTicketCoverage, true);
assert.equal(unlocked.summary.benchmarkOk, true);
assert.equal(unlocked.summary.notCheckedCount, 0);
assert.ok(unlocked.summary.designItems > 0);
assert.ok(unlocked.summary.issueRows > 0);
assert.ok(unlocked.nonlinear.version.includes('nonlinear'));
assert.equal(unlocked.benchmarkEvidence.ok, true);
assert.equal(unlocked.benchmarkEvidence.contract.milestone, 'P3-M19');
assert.equal(unlocked.integratedGate.benchmarkEvidence.ok, true);
assert.ok(unlocked.integratedGate.coverage.methodLimitations > 0);
assert.equal(unlocked.integratedGate.summary.methodLimitationCount, unlocked.integratedGate.coverage.methodLimitations);
assert.deepEqual(unlocked.integratedGate.ticketCoverage.map((row) => row.ticket), ['P3-T58', 'P3-T59', 'P3-T61', 'P3-T62']);
assert.deepEqual(unlocked.integratedGate.summary.ticketCoverage.map((row) => row.ticket), ['P3-T58', 'P3-T59', 'P3-T61', 'P3-T62']);
assert.ok(unlocked.integratedGate.ticketCoverage.every((row) => row.covered));
assert.ok(unlocked.integratedGate.ticketCoverage.find((row) => row.ticket === 'P3-T62').evidence.includes('geometry:OK'));

const cleanGate = buildP3IntegratedResultsGate({
  analysis: { ok: true },
  resultPostprocessing: { version: 'post', summary: { storyRowCount: 1, memberRowCount: 1 } },
  nonlinear: { version: 'nonlinear', capacityCurve: [{ baseShear: 1 }], steps: [{ step: 1 }] },
  design: {
    version: 'design',
    issueRows: [],
    designGate: { designReview: { status: 'trace-ready' } },
  },
  workflowLock: { version: 'workflow', editable: true, approvalState: 'not-submitted' },
  benchmarkEvidence: { ok: true, groups: { geometry: true, hingeControl: true, fiberNlth: true } },
  methodLimitations: ['limitation'],
});
assert.equal(cleanGate.integratedReview.status, 'trace-ready');
assert.equal(cleanGate.integratedReview.agentDecision, 'm19-ready-for-m20-launch-review');

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
assert.match(detailed.html, /Benchmark evidence/);
assert.match(detailed.html, /Ready for reviewer/);
assert.match(detailed.html, /integrated-result-postprocessing/);

const pkg = createCalculationPackageHtml(model, analysis);
assert.equal(pkg.data.detailed.phase3IntegratedResults.version, P3_INTEGRATED_RESULTS_VERSION);
assert.ok(pkg.data.sections.some((section) => section.id === 'phase3'));
assert.match(pkg.html, /Phase 3 Integrated Results/);
assert.match(pkg.html, /Nonlinear trace/);
assert.match(pkg.html, /Ticket coverage/);
assert.match(pkg.html, /P3-T58, P3-T59, P3-T61, P3-T62/);
assert.match(pkg.html, /benchmark-regression/);

const target = { model: () => model, reanalyze: () => {} };
const agent = createIndexAgentApi(target, { getLastResult: () => analysis });
const agentResults = agent.getP3IntegratedResults();
assert.equal(agentResults.version, P3_INTEGRATED_RESULTS_VERSION);
assert.equal(agentResults.summary.notCheckedCount, 0);

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3IntegratedResults, P3_INTEGRATED_RESULTS_VERSION);
assert.equal(manifest.modules.phase3IntegratedResultsGate, P3_INTEGRATED_RESULTS_GATE_VERSION);
assert.ok(manifest.readApis.includes('getP3IntegratedResults'));
assert.ok(manifest.dataContracts.includes('phase3IntegratedResults'));
assert.ok(manifest.dataContracts.includes('phase3IntegratedResultsGate'));
assert.ok(manifest.milestones.some((item) => item.id === 'P3-M19'));

console.log(JSON.stringify({
  ok: true,
  version: P3_INTEGRATED_RESULTS_VERSION,
  designItems: unlocked.summary.designItems,
  issueRows: unlocked.summary.issueRows,
  htmlLength: pkg.html.length,
}, null, 2));
