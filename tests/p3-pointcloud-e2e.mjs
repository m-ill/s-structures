import assert from 'node:assert/strict';
import {
  analyzeModel,
  createRepresentativeBuildingModel,
  extractPointCloudCandidate,
  generateSyntheticPointCloud,
  importCandidateToModel,
  validateImportCandidate,
} from '../src/index.js';

const sourceModel = createRepresentativeBuildingModel('01-regular-office-frame');
const synthetic = generateSyntheticPointCloud(sourceModel, { step: 1.2 });
const candidate = extractPointCloudCandidate(synthetic.points, {
  groundTruth: synthetic.groundTruth,
  story: { tolerance: 0.08 },
  column: { xyTolerance: 0.08, zTolerance: 0.08 },
});
assert.equal(validateImportCandidate(candidate).ok, true);
assert.equal(candidate.audit.pointcloud.candidateReview.importCandidateGenerated, true);
assert.equal(candidate.audit.pointcloud.candidateReview.candidateToAnalysisPath, 'available-after-human-review');
assert.equal(candidate.audit.pointcloud.importCandidateTrace.validationOk, true);
assert.equal(candidate.audit.pointcloud.importCandidateTrace.candidateToAnalysisPath, 'available-after-human-review');

const model = importCandidateToModel(candidate, { topDeadLoad: 1 });
const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
assert.ok(model.nodes.length > 0);
assert.ok(model.members.length > 0);
assert.equal(model.meta.importReview.required, true);
assert.equal(model.meta.importReview.status, 'review-required');
assert.equal(model.meta.importReview.candidateToAnalysisPath, 'available-after-human-review');
assert.equal(model.meta.importReview.humanReviewRequired, true);
assert.equal(model.meta.importReview.agentDecision, 'review-import-candidate-before-final-use');
assert.ok(analysis.envelope.dmax >= 0);

console.log(JSON.stringify({
  ok: true,
  version: 'p3-pointcloud-e2e',
  nodes: model.nodes.length,
  members: model.members.length,
  combos: analysis.combos.map((c) => c.id),
}, null, 2));
