import assert from 'node:assert/strict';
import {
  PHASE3_IMPORT_MILESTONE_REVIEW_VERSION,
  buildAgentManifest,
  buildPhase3ImportMilestoneReview,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexAgentApi.js';

const review = buildPhase3ImportMilestoneReview();
assert.equal(review.version, PHASE3_IMPORT_MILESTONE_REVIEW_VERSION);
assert.equal(review.scope, 'P3-M6 to P3-M9 input pipeline');
assert.deepEqual(review.rows.map((row) => row.milestone), ['P3-M6', 'P3-M7', 'P3-M8', 'P3-M9']);
assert.deepEqual(review.rows[0].tickets, ['P3-T26', 'P3-T27', 'P3-T28', 'P3-T29', 'P3-T30', 'P3-T31']);
assert.equal(review.rows[0].status, 'available');
assert.equal(review.rows[1].status, 'preliminary');
assert.equal(review.rows[2].status, 'preliminary');
assert.equal(review.rows[3].status, 'preliminary');
assert.ok(review.rows[0].automatedEvidence.includes('tests/p3-m6-dxf-import.mjs'));
assert.ok(review.rows[1].automatedEvidence.includes('tests/p3-m7-import-review-ui.mjs'));
assert.ok(review.rows[2].externalEvidenceRequired.includes('large-file performance evidence'));
assert.ok(review.rows[3].externalEvidenceRequired.includes('real scan beam/wall validation'));
assert.deepEqual(review.rows.map((row) => row.exitCriteriaSummary.status), [
  'automated-exit-criteria-covered',
  'automated-exit-criteria-covered',
  'automated-exit-criteria-covered',
  'automated-exit-criteria-covered',
]);
assert.equal(review.rows[0].exitCriteria.length, 5);
assert.equal(review.rows[1].exitCriteria.length, 3);
assert.equal(review.rows[2].exitCriteria.length, 3);
assert.equal(review.rows[3].exitCriteria.length, 4);
assert.ok(review.rows[0].exitCriteria.find((row) => row.id === 'M6-E4').requirement.includes('Unsupported entities'));
assert.equal(review.rows[0].exitCriteria.find((row) => row.id === 'M6-E5').evidence, 'tests/p3-m6-dxf-import.mjs');
assert.equal(review.rows[1].exitCriteria.find((row) => row.id === 'M7-E1').source, 'docs/phase3/IMPORT_DXF_DWG_PLAN.md');
assert.equal(review.rows[3].exitCriteria.find((row) => row.id === 'M9-E4').source, 'docs/phase3/IMPORT_POINT_CLOUD_PLAN.md');
assert.equal(review.summary.milestoneCount, 4);
assert.equal(review.summary.exitCriteriaCount, 15);
assert.equal(review.summary.exitCriteriaAutomatedCount, 15);
assert.equal(review.summary.preliminaryCount, 3);
assert.equal(review.summary.productionReady, false);
assert.equal(review.summary.agentDecision, 'import-pipeline-review-required');
assert.equal(review.agentUse.readApi, 'getPhase3ImportMilestoneReview');
assert.ok(review.agentUse.importApis.includes('confirmImport'));

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3ImportMilestoneReview, PHASE3_IMPORT_MILESTONE_REVIEW_VERSION);
assert.ok(manifest.readApis.includes('getPhase3ImportMilestoneReview'));
assert.ok(manifest.dataContracts.includes('phase3ImportMilestoneReview'));
assert.equal(manifest.qaCommands.phase3ImportMilestoneReview, 'node tests/p3-import-milestone-review.mjs');

const agent = createIndexAgentApi({ model: () => null });
assert.equal(agent.getPhase3ImportMilestoneReview().version, PHASE3_IMPORT_MILESTONE_REVIEW_VERSION);

console.log(JSON.stringify({
  ok: true,
  version: review.version,
  milestones: review.rows.map((row) => row.milestone),
  decision: review.summary.agentDecision,
}, null, 2));
