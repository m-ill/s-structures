import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  analyzeModel,
  buildAgentManifest,
  buildFinalUseReleaseReview,
  buildPhase3EvidenceRegister,
  buildPhase3FinalApprovalReview,
  buildPilotProjectValidation,
  buildP3IntegratedResults,
  createTwoStoryElasticFrameModel,
  FINAL_USE_RELEASE_REVIEW_VERSION,
  PERFORMANCE_BUDGETS,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const manifest = buildAgentManifest();
const empty = buildFinalUseReleaseReview();
assert.equal(empty.version, FINAL_USE_RELEASE_REVIEW_VERSION);
assert.equal(empty.summary.status, 'FINAL_USE_BLOCKED');
assert.equal(empty.summary.productionReady, false);
assert.ok(empty.summary.blockingReviews.includes('practice-validation'));
assert.ok(empty.summary.blockingReviews.includes('owner-signoff'));
assert.ok(empty.summary.blockingReviews.includes('evidence-register'));
assert.ok(empty.summary.blockingReviews.includes('launch-readiness'));
assert.equal(empty.agentUse.readApi, 'getFinalUseReleaseReview');
assert.ok(empty.agentUse.relatedApis.includes('getLaunchReadinessReport'));

const evidence = buildPhase3EvidenceRegister().rows.map((row) => ({
  id: row.id,
  accepted: true,
  reviewer: 'reviewer',
  reportPath: `reports/final-use/${row.id}.md`,
}));
const finalApprovalReview = buildPhase3FinalApprovalReview();
const finalApprovals = Object.fromEntries(
  finalApprovalReview.requiredApprovalGroups.map((group) => [group.fields[0], true]),
);
const evidenceAndApprovalOnly = buildFinalUseReleaseReview({ evidence, finalApprovals });
assert.equal(evidenceAndApprovalOnly.summary.productionReady, false);
assert.deepEqual(evidenceAndApprovalOnly.summary.blockingReviews, ['launch-readiness']);
assert.equal(evidenceAndApprovalOnly.rows.find((row) => row.id === 'practice-validation').status, 'ACCEPTED');
assert.equal(evidenceAndApprovalOnly.rows.find((row) => row.id === 'owner-signoff').status, 'ACCEPTED');
assert.equal(evidenceAndApprovalOnly.rows.find((row) => row.id === 'evidence-register').status, 'ACCEPTED');
assert.equal(evidenceAndApprovalOnly.rows.find((row) => row.id === 'launch-readiness').status, 'REVIEW_REQUIRED');

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const agentContract = JSON.parse(readFileSync('docs/user-manual/agent-contract.json', 'utf8'));
const pilotReports = readdirSync('reports/launch-readiness').filter((name) => /^pilot-\d\d\.md$/.test(name)).sort();
const model = createTwoStoryElasticFrameModel();
const analysis = analyzeModel(model);
const integrated = buildP3IntegratedResults(model, analysis);
const launchEvidence = {
  fullSuiteGreen: true,
  benchmarkGreen: true,
  pointCloudGreen: true,
  platformGreen: true,
  importGreen: true,
  performanceBudgets: PERFORMANCE_BUDGETS.map((row) => ({
    id: row.id,
    value: row.unit === 'fps-min' ? row.limit : row.limit * 0.5,
  })),
  securityEvidence: { signed: true, reportPath: 'reports/launch-readiness/performance-security.md', items: ['security'] },
  backupRestoreEvidence: { recorded: true, reportPath: 'reports/launch-readiness/backup-restore.md', items: ['backup'] },
  designVerificationEvidence: { recorded: true, reportPath: 'docs/verification/DESIGN_MODULE_VERIFICATION.md', items: ['design'] },
  ownerSignoffChecklistRecorded: true,
  calculationTraceConnected: true,
  notCheckedCount: integrated.summary.notCheckedCount,
  manifest,
  agentContract,
  pilot: buildPilotProjectValidation({ limit: 10 }),
  pilotReports: { count: pilotReports.length, files: pilotReports },
  manual: { updated: true },
  packageJson,
  files: { indexHtml: true, serverMain: true },
  licenseText: readFileSync('LICENSE.txt', 'utf8'),
};
const approved = buildFinalUseReleaseReview({ evidence, finalApprovals, launchEvidence });
assert.equal(approved.summary.status, 'FINAL_USE_APPROVED');
assert.equal(approved.summary.productionReady, true);
assert.equal(approved.summary.agentSafeStatus, 'PRODUCTION_APPROVED');
assert.deepEqual(approved.summary.blockingReviews, []);
assert.deepEqual(approved.summary.missing, []);
assert.ok(approved.rows.every((row) => row.status === 'ACCEPTED'));
assert.equal(approved.reviews.launchReadinessReport.finalUseReview.status, 'FINAL_USE_REVIEW_ACCEPTED');

assert.equal(manifest.modules.finalUseReleaseReview, FINAL_USE_RELEASE_REVIEW_VERSION);
assert.ok(manifest.readApis.includes('getFinalUseReleaseReview'));
assert.ok(manifest.dataContracts.includes('finalUseReleaseReview'));
assert.equal(manifest.qaCommands.finalUseReleaseReview, 'node tests/final-use-release-review.mjs');
assert.ok(manifest.milestones.find((row) => row.id === 'POST-P5-M1'));
assert.ok(manifest.interpretationRules.some((rule) => rule.includes('getFinalUseReleaseReview()')));

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, { getLastResult: () => analysis });
assert.equal(agent.getFinalUseReleaseReview().version, FINAL_USE_RELEASE_REVIEW_VERSION);
assert.equal(agent.getFinalUseReleaseReview().summary.productionReady, false);
assert.equal(agent.getFinalUseReleaseReview({ evidence, finalApprovals, ...launchEvidence }).summary.productionReady, true);
assert.ok(agent.getCapabilities().readApis.includes('getFinalUseReleaseReview'));
assert.equal(agent.getCapabilities().modules.finalUseReleaseReview, FINAL_USE_RELEASE_REVIEW_VERSION);

console.log(JSON.stringify({
  ok: true,
  version: FINAL_USE_RELEASE_REVIEW_VERSION,
  approved: approved.summary.productionReady,
  blockingWhenEmpty: empty.summary.blockingReviews.length,
}, null, 2));
