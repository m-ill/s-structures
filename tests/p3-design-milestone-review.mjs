import assert from 'node:assert/strict';
import {
  PHASE3_DESIGN_MILESTONE_REVIEW_VERSION,
  buildAgentManifest,
  buildPhase3DesignMilestoneReview,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexAgentApi.js';

const review = buildPhase3DesignMilestoneReview();
assert.equal(review.version, PHASE3_DESIGN_MILESTONE_REVIEW_VERSION);
assert.equal(review.scope, 'P3-M17 to P3-M18 detailed design modules');
assert.deepEqual(review.rows.map((row) => row.milestone), ['P3-M17', 'P3-M18']);
assert.deepEqual(review.rows[0].tickets, ['P3-T87', 'P3-T88', 'P3-T89', 'P3-T90']);
assert.deepEqual(review.rows[1].tickets, ['P3-T91', 'P3-T92', 'P3-T93', 'P3-T94', 'P3-T95']);
assert.deepEqual(review.rows[0].designScopes, ['rc-beam', 'rc-column', 'rc-wall', 'rc-slab']);
assert.deepEqual(review.rows[1].designScopes, [
  'steel-member',
  'connection-base-plate',
  'foundation',
  'issue-formula-integration',
  'serviceability-hook',
]);
assert.ok(review.rows.every((row) => row.status === 'preliminary'));
assert.equal(review.rows[0].contracts.gatePath, 'rcDesignGate.rcReview');
assert.equal(review.rows[1].contracts.gatePath, 'designGate.designReview');
assert.equal(review.rows[0].contracts.finalApprovalField, 'finalPermitDesign');
assert.equal(review.rows[1].contracts.finalApprovalField, 'finalPermitDesign');
assert.ok(review.rows[0].contracts.readApis.includes('getRcDetailedDesignReport'));
assert.ok(review.rows[1].contracts.readApis.includes('getP3DetailedDesignReport'));
assert.ok(review.rows[0].contracts.dataContracts.includes('phase3RcDesignGate'));
assert.ok(review.rows[1].contracts.dataContracts.includes('phase3DetailedDesignGate'));
assert.ok(review.rows[0].remainingValidation.includes('reinforcement drawing production'));
assert.ok(review.rows[1].remainingValidation.includes('geotechnical settlement and bearing certification'));
assert.deepEqual(review.rows.map((row) => row.exitCriteriaSummary.status), [
  'automated-exit-criteria-covered',
  'automated-exit-criteria-covered',
]);
assert.deepEqual(review.rows.map((row) => row.exitCriteria.length), [5, 6]);
assert.equal(review.rows[0].exitCriteria.find((row) => row.id === 'M17-T87').ticket, 'P3-T87');
assert.ok(review.rows[0].exitCriteria.find((row) => row.id === 'M17-GATE').requirement.includes('final permit-design separation'));
assert.equal(review.rows[0].exitCriteria.find((row) => row.id === 'M17-T90').source, 'docs/phase3/DESIGN_MODULES_PLAN.md');
assert.equal(review.rows[1].exitCriteria.find((row) => row.id === 'M18-T93').evidence, 'tests/p3-design-steel-foundation.mjs');
assert.ok(review.rows[1].exitCriteria.find((row) => row.id === 'M18-T95').requirement.includes('Serviceability evidence'));
assert.ok(review.rows[1].exitCriteria.find((row) => row.id === 'M18-GATE').requirement.includes('analysis status'));
assert.equal(review.summary.milestoneCount, 2);
assert.equal(review.summary.automatedEvidenceCount, 2);
assert.equal(review.summary.exitCriteriaCount, 11);
assert.equal(review.summary.exitCriteriaAutomatedCount, 11);
assert.equal(review.summary.productionReady, false);
assert.equal(review.summary.agentDecision, 'detailed-design-engineer-review-required');
assert.ok(review.summary.designScopes.includes('foundation'));
assert.equal(review.agentUse.readApi, 'getPhase3DesignMilestoneReview');

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3DesignMilestoneReview, PHASE3_DESIGN_MILESTONE_REVIEW_VERSION);
assert.ok(manifest.readApis.includes('getPhase3DesignMilestoneReview'));
assert.ok(manifest.dataContracts.includes('phase3DesignMilestoneReview'));
assert.equal(manifest.qaCommands.phase3DesignMilestoneReview, 'node tests/p3-design-milestone-review.mjs');
assert.equal(manifest.reviewGates.rcDetailedDesign.finalApprovalField, 'finalPermitDesign');
assert.equal(manifest.reviewGates.detailedDesignIntegration.finalApprovalField, 'finalPermitDesign');

const agent = createIndexAgentApi({ model: () => null });
assert.equal(agent.getPhase3DesignMilestoneReview().version, PHASE3_DESIGN_MILESTONE_REVIEW_VERSION);

console.log(JSON.stringify({
  ok: true,
  version: review.version,
  milestones: review.rows.map((row) => row.milestone),
  decision: review.summary.agentDecision,
}, null, 2));
