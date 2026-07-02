import assert from 'node:assert/strict';
import {
  buildAgentManifest,
  buildPhase3PracticeValidationReview,
  PHASE3_PRACTICE_VALIDATION_REVIEW_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const review = buildPhase3PracticeValidationReview();

assert.equal(review.version, PHASE3_PRACTICE_VALIDATION_REVIEW_VERSION);
assert.equal(review.summary.rowCount, 6);
assert.equal(review.summary.evidenceAcceptedCount, 0);
assert.ok(review.summary.missing.includes('drawing-import'));
assert.ok(review.summary.missing.includes('productization'));
assert.equal(review.summary.productionReady, false);
assert.equal(review.summary.ownerReviewRequired, true);
assert.equal(review.summary.agentDecision, 'collect-practice-validation-evidence-before-production-use');
assert.ok(review.sourceDocs.includes('docs/phase3/P3_COMPLETION_AUDIT_2026-07-02.md'));
assert.ok(review.summary.affectedMilestones.includes('P3-M20'));
assert.ok(review.agentUse.finalApprovalFields.includes('productionDeploymentApproved'));

const drawing = review.rows.find((row) => row.id === 'drawing-import');
assert.deepEqual(drawing.milestones, ['P3-M6', 'P3-M7']);
assert.ok(drawing.requiredEvidence.includes('visual overlay evidence for import review'));
assert.ok(drawing.readApis.includes('getPhase3DrawingImportValidationReview'));
assert.equal(drawing.productionBlocker, true);
assert.deepEqual(drawing.evidenceCoverage.missing, ['real-office-dxf-fixtures', 'external-dwg-converter-log', 'import-review-overlay']);

const nonlinear = review.rows.find((row) => row.id === 'nonlinear-engine');
assert.ok(nonlinear.requiredEvidence.includes('simultaneous hinge-controlled equilibrium qualification'));
assert.ok(nonlinear.readApis.includes('getNonlinearAnalysisTrace'));

const productization = review.rows.find((row) => row.id === 'productization');
assert.ok(productization.requiredEvidence.includes('field pilot feedback and backup restore owner acceptance'));
assert.ok(productization.readApis.includes('getLaunchReadinessReport'));

const partialEvidence = buildPhase3PracticeValidationReview({
  evidence: [
    { id: 'real-office-dxf-fixtures', accepted: true, fileId: 'office-dxf-file' },
    { id: 'real-pointcloud-files', status: 'accepted', fileId: 'owner-scan-file' },
    { id: 'security-signoff', accepted: true, reportPath: 'reports/launch-readiness/security.md' },
  ],
});
assert.equal(partialEvidence.summary.evidenceAcceptedCount, 3);
assert.ok(partialEvidence.summary.missing.includes('drawing-import'));
assert.equal(partialEvidence.rows.find((row) => row.id === 'drawing-import').evidenceCoverage.acceptedCount, 1);
assert.equal(partialEvidence.rows.find((row) => row.id === 'point-cloud-import').evidenceCoverage.acceptedCount, 1);
assert.equal(partialEvidence.rows.find((row) => row.id === 'productization').evidenceCoverage.acceptedCount, 1);
assert.equal(partialEvidence.rows.find((row) => row.id === 'drawing-import').evidenceCoverage.rows[0].fileIds[0], 'office-dxf-file');

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3PracticeValidationReview, PHASE3_PRACTICE_VALIDATION_REVIEW_VERSION);
assert.ok(manifest.readApis.includes('getPhase3PracticeValidationReview'));
assert.ok(manifest.dataContracts.includes('phase3PracticeValidationReview'));
assert.equal(manifest.qaCommands.phase3PracticeValidation, 'node tests/p3-practice-validation-review.mjs');

const agent = createIndexAgentApi({ model: () => null, reanalyze: () => {} });
assert.equal(agent.getPhase3PracticeValidationReview().version, PHASE3_PRACTICE_VALIDATION_REVIEW_VERSION);
agent.submitProjectEvidence({ id: 'real-office-dxf-fixtures', accepted: true, fileId: 'agent-dxf-file' });
assert.equal(agent.getPhase3PracticeValidationReview().summary.evidenceAcceptedCount, 1);

console.log(JSON.stringify({
  ok: true,
  version: review.version,
  rows: review.rows.length,
  requiredEvidenceCount: review.summary.requiredEvidenceCount,
}, null, 2));
