import assert from 'node:assert/strict';
import {
  PHASE3_ELASTIC_MILESTONE_REVIEW_VERSION,
  buildAgentManifest,
  buildPhase3ElasticMilestoneReview,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexAgentApi.js';

const review = buildPhase3ElasticMilestoneReview();
assert.equal(review.version, PHASE3_ELASTIC_MILESTONE_REVIEW_VERSION);
assert.equal(review.scope, 'P3-M10 to P3-M13 elastic engine completeness');
assert.deepEqual(review.rows.map((row) => row.milestone), ['P3-M10', 'P3-M11', 'P3-M12', 'P3-M13']);
assert.deepEqual(review.rows[0].tickets, ['P3-T46', 'P3-T47', 'P3-T48', 'P3-T49']);
assert.deepEqual(review.rows[1].tickets, ['P3-T68', 'P3-T69', 'P3-T70', 'P3-T71', 'P3-T72']);
assert.deepEqual(review.rows[2].tickets, ['P3-T73', 'P3-T74', 'P3-T75']);
assert.deepEqual(review.rows[3].tickets, ['P3-T76', 'P3-T77', 'P3-T78', 'P3-T79', 'P3-T80', 'P3-T81', 'P3-T82']);
assert.ok(review.rows.every((row) => row.status === 'preliminary'));
assert.ok(review.rows[0].automatedEvidence.includes('tests/p3-m10-materials.mjs'));
assert.ok(review.rows[1].contracts.readApis.includes('getElasticExpansionTrace'));
assert.ok(review.rows[2].contracts.dataContracts.includes('phase3ShellQuad4Trace'));
assert.ok(review.rows[3].contracts.readApis.includes('getDynamicCompletenessTrace'));
assert.ok(review.rows[3].remainingValidation.includes('project-specific KDS code exception review'));
assert.deepEqual(review.rows.map((row) => row.exitCriteriaSummary.status), [
  'automated-exit-criteria-covered',
  'automated-exit-criteria-covered',
  'automated-exit-criteria-covered',
  'automated-exit-criteria-covered',
]);
assert.deepEqual(review.rows.map((row) => row.exitCriteria.length), [4, 5, 3, 7]);
assert.ok(review.rows[0].exitCriteria.find((row) => row.id === 'M10-E2').requirement.includes('id@version'));
assert.equal(review.rows[0].exitCriteria.find((row) => row.id === 'M10-E3').evidence, 'tests/p3-section-properties.mjs');
assert.equal(review.rows[1].exitCriteria.find((row) => row.id === 'M11-G5').source, 'docs/phase3/ELASTIC_ENGINE_COMPLETENESS_PLAN.md');
assert.ok(review.rows[2].exitCriteria.find((row) => row.id === 'M12-G8').requirement.includes('Semi-rigid diaphragm'));
assert.equal(review.rows[3].exitCriteria.find((row) => row.id === 'M13-G15').evidence, 'tests/p3-m13-loads-dynamics.mjs');
assert.equal(review.summary.milestoneCount, 4);
assert.equal(review.summary.automatedEvidenceCount, 5);
assert.equal(review.summary.exitCriteriaCount, 19);
assert.equal(review.summary.exitCriteriaAutomatedCount, 19);
assert.equal(review.summary.preliminaryCount, 4);
assert.equal(review.summary.productionReady, false);
assert.equal(review.summary.agentDecision, 'elastic-completeness-engineer-review-required');
assert.equal(review.agentUse.readApi, 'getPhase3ElasticMilestoneReview');
assert.ok(review.agentUse.primaryReviewApis.includes('getLoadsV2Trace'));

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3ElasticMilestoneReview, PHASE3_ELASTIC_MILESTONE_REVIEW_VERSION);
assert.ok(manifest.readApis.includes('getPhase3ElasticMilestoneReview'));
assert.ok(manifest.dataContracts.includes('phase3ElasticMilestoneReview'));
assert.equal(manifest.qaCommands.phase3ElasticMilestoneReview, 'node tests/p3-elastic-milestone-review.mjs');

const agent = createIndexAgentApi({ model: () => null });
assert.equal(agent.getPhase3ElasticMilestoneReview().version, PHASE3_ELASTIC_MILESTONE_REVIEW_VERSION);

console.log(JSON.stringify({
  ok: true,
  version: review.version,
  milestones: review.rows.map((row) => row.milestone),
  decision: review.summary.agentDecision,
}, null, 2));
