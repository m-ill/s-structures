import assert from 'node:assert/strict';
import {
  buildAgentManifest,
  buildPhase3EngineeringValidationReview,
  PHASE3_ENGINEERING_VALIDATION_REVIEW_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const review = buildPhase3EngineeringValidationReview({
  nonlinearEvidence: [
    {
      id: 'nl-benchmark-cert',
      milestone: 'P3-M16',
      evidenceType: 'production nonlinear benchmark or solver certification',
      accepted: true,
      reviewer: 'engineer-review-placeholder',
      reportPath: 'reports/engineering-validation/nonlinear-benchmark.md',
    },
    {
      id: 'hinge-fiber-qualification',
      milestone: 'P3-M16',
      evidenceType: 'hinge equilibrium, PMM, fiber, or NLTH qualification',
      accepted: true,
      reviewer: 'engineer-review-placeholder',
      reportPath: 'reports/engineering-validation/hinge-fiber-nlth.md',
    },
  ],
  designEvidence: [
    {
      id: 'code-clause-review',
      milestone: 'P3-M18',
      evidenceType: 'final code clause selection',
      accepted: true,
      reviewer: 'engineer-review-placeholder',
      reportPath: 'reports/engineering-validation/code-clause-review.md',
    },
    {
      id: 'detailing-constructability-review',
      milestone: 'P3-M18',
      evidenceType: 'detailing, constructability, fabrication, or geotechnical approval',
      accepted: true,
      reviewer: 'engineer-review-placeholder',
      reportPath: 'reports/engineering-validation/detailing-constructability.md',
    },
  ],
});

assert.equal(review.version, PHASE3_ENGINEERING_VALIDATION_REVIEW_VERSION);
assert.equal(review.summary.ok, true);
assert.equal(review.summary.productionReady, false);
assert.equal(review.summary.agentDecision, 'engineering-package-ready-for-signoff-review');
assert.deepEqual(review.summary.missing, []);
assert.equal(review.groups.find((row) => row.id === 'nonlinear-benchmark-certification').ok, true);
assert.equal(review.groups.find((row) => row.id === 'detailing-and-constructability-review').ok, true);
assert.equal(review.nonlinearRows.length, 2);
assert.equal(review.designRows.length, 2);
assert.ok(review.requiredEvidence.includes('final KDS code clause selection'));

const empty = buildPhase3EngineeringValidationReview();
assert.equal(empty.summary.ok, false);
assert.ok(empty.summary.missing.includes('hinge-and-fiber-qualification'));
assert.equal(empty.summary.agentDecision, 'collect-engineering-validation-evidence');
assert.deepEqual(empty.projectEvidenceCoverage.missing, [
  'nonlinear-solver-certification',
  'hinge-fiber-nlth-qualification',
  'final-code-clause-selection',
  'detailing-constructability-approval',
]);

const projectEvidenceReview = buildPhase3EngineeringValidationReview({
  evidence: [
    { id: 'nonlinear-solver-certification', accepted: true, fileId: 'nl-cert-file', reportPath: 'reports/engineering-validation/nonlinear.md' },
    { id: 'hinge-fiber-nlth-qualification', status: 'accepted', reportPath: 'reports/engineering-validation/hinge-fiber.md' },
    { id: 'final-code-clause-selection', accepted: true, reportPath: 'reports/engineering-validation/code-clause.md' },
    { id: 'detailing-constructability-approval', accepted: true, reportPath: 'reports/engineering-validation/detailing.md' },
  ],
});
assert.equal(projectEvidenceReview.summary.ok, true);
assert.equal(projectEvidenceReview.summary.productionReady, false);
assert.equal(projectEvidenceReview.summary.projectEvidenceAcceptedCount, 4);
assert.deepEqual(projectEvidenceReview.summary.missing, []);
assert.equal(projectEvidenceReview.nonlinearRows.length, 2);
assert.equal(projectEvidenceReview.designRows.length, 2);
assert.equal(projectEvidenceReview.nonlinearRows[0].fileId, 'nl-cert-file');
assert.deepEqual(projectEvidenceReview.projectEvidenceCoverage.missing, []);

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3EngineeringValidationReview, PHASE3_ENGINEERING_VALIDATION_REVIEW_VERSION);
assert.ok(manifest.readApis.includes('getPhase3EngineeringValidationReview'));
assert.ok(manifest.dataContracts.includes('phase3EngineeringValidationReview'));
assert.equal(manifest.qaCommands.phase3EngineeringValidation, 'node tests/p3-engineering-validation-review.mjs');

const agent = createIndexAgentApi({ model: () => null, reanalyze: () => {} });
assert.equal(agent.getPhase3EngineeringValidationReview().version, PHASE3_ENGINEERING_VALIDATION_REVIEW_VERSION);
agent.submitProjectEvidence({ id: 'final-code-clause-selection', accepted: true, reportPath: 'reports/engineering-validation/agent-code.md' });
assert.equal(agent.getPhase3EngineeringValidationReview().summary.projectEvidenceAcceptedCount, 1);
assert.equal(agent.getPhase3EngineeringValidationReview().designRows.length, 1);

console.log(JSON.stringify({
  ok: true,
  version: review.version,
  groups: review.groups.length,
  missingWhenEmpty: empty.summary.missing.length,
}, null, 2));
