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

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3EngineeringValidationReview, PHASE3_ENGINEERING_VALIDATION_REVIEW_VERSION);
assert.ok(manifest.readApis.includes('getPhase3EngineeringValidationReview'));
assert.ok(manifest.dataContracts.includes('phase3EngineeringValidationReview'));
assert.equal(manifest.qaCommands.phase3EngineeringValidation, 'node tests/p3-engineering-validation-review.mjs');

const agent = createIndexAgentApi({ model: () => null, reanalyze: () => {} });
assert.equal(agent.getPhase3EngineeringValidationReview().version, PHASE3_ENGINEERING_VALIDATION_REVIEW_VERSION);

console.log(JSON.stringify({
  ok: true,
  version: review.version,
  groups: review.groups.length,
  missingWhenEmpty: empty.summary.missing.length,
}, null, 2));
