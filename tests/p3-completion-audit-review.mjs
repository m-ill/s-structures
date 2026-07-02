import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildAgentManifest,
  buildPhase3CompletionAuditReview,
  PHASE3_COMPLETION_AUDIT_REVIEW_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const review = buildPhase3CompletionAuditReview();
const remainingReview = readFileSync('docs/user-manual/PHASE3_REMAINING_REVIEW.md', 'utf8');
assert.equal(review.version, PHASE3_COMPLETION_AUDIT_REVIEW_VERSION);
assert.equal(review.summary.milestoneCount, 21);
assert.equal(review.rows[0].milestone, 'P3-M0');
assert.equal(review.rows.at(-1).milestone, 'P3-M20');
assert.equal(review.summary.provenCount, 7);
assert.equal(review.summary.preliminaryCount, 13);
assert.equal(review.summary.manualCount, 1);
assert.equal(review.summary.productionReady, false);
assert.equal(review.summary.completionClaim, 'phase3-m0-m20-repository-traceability-green-owner-and-engineer-review-required');
assert.equal(review.summary.agentDecision, 'continue-practical-validation-before-production-use');
assert.ok(review.sourceDocs.includes('docs/verification/P3_M6_M20_COMPLETION_AUDIT.md'));
assert.ok(review.rows.find((row) => row.milestone === 'P3-M1').evidence.includes('tests/p3-server-api.mjs'));
assert.ok(review.rows.find((row) => row.milestone === 'P3-M5').readApis.includes('listImportCandidates'));
assert.ok(review.rows.find((row) => row.milestone === 'P3-M7').productionBlockers.includes('real DWG conversion remains external-tool dependent'));
assert.ok(review.rows.find((row) => row.milestone === 'P3-M9').productionBlockers.includes('real field scan validation'));
assert.ok(review.rows.find((row) => row.milestone === 'P3-M20').readApis.includes('getPhase3OwnerSignoffReview'));
assert.equal(review.agentUse.readApi, 'getPhase3CompletionAuditReview');
assert.match(remainingReview, /P3-M0 to P3-M20/);
assert.match(remainingReview, /FINAL_USE_REVIEW_REQUIRED/);
assert.match(remainingReview, /getPhase3CompletionAuditReview\(\)/);
assert.match(remainingReview, /getPhase3EvidenceRegister\(\)/);

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3CompletionAuditReview, PHASE3_COMPLETION_AUDIT_REVIEW_VERSION);
assert.ok(manifest.readApis.includes('getPhase3CompletionAuditReview'));
assert.ok(manifest.dataContracts.includes('phase3CompletionAuditReview'));
assert.equal(manifest.qaCommands.phase3CompletionAuditReview, 'node tests/p3-completion-audit-review.mjs');

const agent = createIndexAgentApi({ model: () => null, reanalyze: () => {} });
assert.equal(agent.getPhase3CompletionAuditReview().version, PHASE3_COMPLETION_AUDIT_REVIEW_VERSION);

console.log(JSON.stringify({
  ok: true,
  version: review.version,
  milestones: review.summary.milestoneCount,
  proven: review.summary.provenCount,
  preliminary: review.summary.preliminaryCount,
  manual: review.summary.manualCount,
}, null, 2));
