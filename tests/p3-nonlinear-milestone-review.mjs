import assert from 'node:assert/strict';
import {
  PHASE3_NONLINEAR_MILESTONE_REVIEW_VERSION,
  buildAgentManifest,
  buildPhase3NonlinearMilestoneReview,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexAgentApi.js';

const review = buildPhase3NonlinearMilestoneReview();
assert.equal(review.version, PHASE3_NONLINEAR_MILESTONE_REVIEW_VERSION);
assert.equal(review.scope, 'P3-M14 to P3-M16 nonlinear engine');
assert.deepEqual(review.rows.map((row) => row.milestone), ['P3-M14', 'P3-M15', 'P3-M16']);
assert.deepEqual(review.rows[0].tickets, ['P3-T50', 'P3-T51', 'P3-T52', 'P3-T53']);
assert.deepEqual(review.rows[1].tickets, ['P3-T54', 'P3-T55', 'P3-T56']);
assert.deepEqual(review.rows[2].tickets, ['P3-T83', 'P3-T84', 'P3-T85', 'P3-T86']);
assert.deepEqual(review.rows[0].scopeLadder, ['N1']);
assert.deepEqual(review.rows[1].scopeLadder, ['N2', 'N3', 'N4']);
assert.deepEqual(review.rows[2].scopeLadder, ['N5', 'N6']);
assert.deepEqual(review.summary.scopeLadder, ['N1', 'N2', 'N3', 'N4', 'N5', 'N6']);
assert.deepEqual(review.summary.benchmarkCases, ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']);
assert.ok(review.rows.every((row) => row.status === 'preliminary'));
assert.ok(review.rows[0].contracts.dataContracts.includes('phase3NonlinearGlobalEquilibriumTrace'));
assert.equal(review.rows[0].contracts.gatePath, 'geometryGate.solverReview');
assert.equal(review.rows[1].contracts.gatePath, 'hingeControlGate.controlReview');
assert.equal(review.rows[2].contracts.gatePath, 'fiberNlthGate.fiberNlthReview');
assert.equal(review.rows[0].contracts.finalApprovalField, 'productionEquilibriumSolver');
assert.equal(review.rows[1].contracts.finalApprovalField, 'productionHingeEquilibriumLoop');
assert.equal(review.rows[2].contracts.finalApprovalField, 'productionSeismicQualification');
assert.ok(review.rows[1].contracts.readApis.includes('runPushover'));
assert.ok(review.rows[2].remainingValidation.includes('production seismic qualification and owner record review'));
assert.equal(review.summary.milestoneCount, 3);
assert.equal(review.summary.automatedEvidenceCount, 3);
assert.equal(review.summary.productionReady, false);
assert.equal(review.summary.agentDecision, 'nonlinear-engine-review-required');
assert.equal(review.agentUse.primaryReviewApi, 'getNonlinearAnalysisTrace');

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3NonlinearMilestoneReview, PHASE3_NONLINEAR_MILESTONE_REVIEW_VERSION);
assert.ok(manifest.readApis.includes('getPhase3NonlinearMilestoneReview'));
assert.ok(manifest.dataContracts.includes('phase3NonlinearMilestoneReview'));
assert.equal(manifest.qaCommands.phase3NonlinearMilestoneReview, 'node tests/p3-nonlinear-milestone-review.mjs');
assert.equal(manifest.reviewGates.nonlinearGeometry.finalApprovalField, 'productionEquilibriumSolver');
assert.equal(manifest.reviewGates.nonlinearHingeControl.finalApprovalField, 'productionHingeEquilibriumLoop');
assert.equal(manifest.reviewGates.nonlinearFiberNlth.finalApprovalField, 'productionSeismicQualification');

const agent = createIndexAgentApi({ model: () => null });
assert.equal(agent.getPhase3NonlinearMilestoneReview().version, PHASE3_NONLINEAR_MILESTONE_REVIEW_VERSION);

console.log(JSON.stringify({
  ok: true,
  version: review.version,
  milestones: review.rows.map((row) => row.milestone),
  decision: review.summary.agentDecision,
}, null, 2));
