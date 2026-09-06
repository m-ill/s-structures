import assert from 'node:assert/strict';
import {
  PHASE3_PRODUCTIZATION_MILESTONE_REVIEW_VERSION,
  buildAgentManifest,
  buildPhase3ProductizationMilestoneReview,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexAgentApi.js';

const review = buildPhase3ProductizationMilestoneReview();
assert.equal(review.version, PHASE3_PRODUCTIZATION_MILESTONE_REVIEW_VERSION);
assert.equal(review.scope, 'P3-M19 to P3-M20 integrated results and launch readiness');
assert.deepEqual(review.rows.map((row) => row.milestone), ['P3-M19', 'P3-M20']);
assert.deepEqual(review.rows[0].tickets, ['P3-T58', 'P3-T59', 'P3-T61', 'P3-T62']);
assert.deepEqual(review.rows[1].tickets, ['P3-T63', 'P3-T64', 'P3-T65', 'P3-T66', 'P3-T67']);
assert.deepEqual(review.rows[0].productizationScopes, [
  'integrated-result-postprocessing',
  'calculation-report-method-limitations',
  'workflow-lock',
  'benchmark-regression',
]);
assert.ok(review.rows[1].productizationScopes.includes('beta-pilot-scenarios'));
assert.ok(review.rows.every((row) => row.status === 'preliminary'));
assert.equal(review.rows[0].contracts.gatePath, 'integratedGate.integratedReview');
assert.equal(review.rows[1].contracts.gatePath, 'releaseGate.releaseReview');
assert.equal(review.rows[0].contracts.finalApprovalField, 'finalStructuralSignoff');
assert.equal(review.rows[1].contracts.finalApprovalField, 'productionDeploymentApproved');
assert.ok(review.rows[0].contracts.readApis.includes('getP3IntegratedResults'));
assert.ok(review.rows[1].contracts.readApis.includes('getLaunchReadinessReport'));
assert.ok(review.rows[0].contracts.dataContracts.includes('phase3IntegratedResultsGate'));
assert.ok(review.rows[1].contracts.dataContracts.includes('phase3LaunchReadinessGate'));
assert.ok(review.rows[0].remainingValidation.includes('owner approval of workflow lock policy'));
assert.ok(review.rows[1].remainingValidation.includes('backup restore owner acceptance'));
assert.deepEqual(review.rows.map((row) => row.exitCriteriaSummary.status), [
  'automated-exit-criteria-covered',
  'automated-exit-criteria-covered',
]);
assert.deepEqual(review.rows.map((row) => row.exitCriteria.length), [5, 6]);
assert.equal(review.rows[0].exitCriteria.find((row) => row.id === 'M19-T58').ticket, 'P3-T58');
assert.ok(review.rows[0].exitCriteria.find((row) => row.id === 'M19-GATE').requirement.includes('final structural sign-off'));
assert.equal(review.rows[0].exitCriteria.find((row) => row.id === 'M19-T62').evidence, 'npm.cmd run test:p3');
assert.equal(review.rows[1].exitCriteria.find((row) => row.id === 'M20-T63').source, 'docs/phase3/QA_RELEASE_PLAN.md');
assert.ok(review.rows[1].exitCriteria.find((row) => row.id === 'M20-T66').requirement.includes('Performance, security, backup/restore'));
assert.ok(review.rows[1].exitCriteria.find((row) => row.id === 'M20-GATE').requirement.includes('owner deployment approval'));
assert.equal(review.summary.milestoneCount, 2);
assert.equal(review.summary.automatedEvidenceCount, 6);
assert.equal(review.summary.exitCriteriaCount, 11);
assert.equal(review.summary.exitCriteriaAutomatedCount, 11);
assert.equal(review.summary.productionReady, false);
assert.equal(review.summary.agentDecision, 'productization-owner-review-required');
assert.ok(review.summary.productizationScopes.includes('performance-security-launch-gate'));
assert.equal(review.agentUse.readApi, 'getPhase3ProductizationMilestoneReview');

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3ProductizationMilestoneReview, PHASE3_PRODUCTIZATION_MILESTONE_REVIEW_VERSION);
assert.ok(manifest.readApis.includes('getPhase3ProductizationMilestoneReview'));
assert.ok(manifest.dataContracts.includes('phase3ProductizationMilestoneReview'));
assert.equal(manifest.qaCommands.phase3ProductizationMilestoneReview, 'node tests/p3-productization-milestone-review.mjs');
assert.equal(manifest.reviewGates.integratedResults.finalApprovalField, 'finalStructuralSignoff');
assert.equal(manifest.reviewGates.launchReadiness.finalApprovalField, 'productionDeploymentApproved');

const agent = createIndexAgentApi({ model: () => null });
assert.equal(agent.getPhase3ProductizationMilestoneReview().version, PHASE3_PRODUCTIZATION_MILESTONE_REVIEW_VERSION);

console.log(JSON.stringify({
  ok: true,
  version: review.version,
  milestones: review.rows.map((row) => row.milestone),
  decision: review.summary.agentDecision,
}, null, 2));
