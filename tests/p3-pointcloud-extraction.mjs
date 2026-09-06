import assert from 'node:assert/strict';
import {
  buildAgentManifest,
  buildPointCloudExtractionReview,
  createRepresentativeBuildingModel,
  evaluatePointCloudExtraction,
  extractPointCloudCandidate,
  generateSyntheticPointCloud,
  validateImportCandidate,
} from '../src/index.js';

const model = createRepresentativeBuildingModel('01-regular-office-frame');
const synthetic = generateSyntheticPointCloud(model, { step: 1.2 });
synthetic.groundTruth.walls = [{
  id: 'W1',
  from: [0, 0, 0],
  to: [6, 0, 0],
  z1: 0,
  z2: 3,
  thickness: 0.2,
  confidence: 0.84,
}];
const candidate = extractPointCloudCandidate(synthetic.points, {
  groundTruth: synthetic.groundTruth,
  story: { tolerance: 0.08 },
  column: { xyTolerance: 0.08, zTolerance: 0.08 },
});
const score = evaluatePointCloudExtraction(candidate, synthetic.groundTruth);

assert.equal(validateImportCandidate(candidate).ok, true);
assert.ok(score.storyErrorMax < 0.03, `story error ${score.storyErrorMax}`);
assert.ok(score.columnRecall >= 0.9, `column recall ${score.columnRecall}`);
assert.ok(score.columnPrecision >= 0.9, `column precision ${score.columnPrecision}`);
assert.ok(score.beamRecall >= 0.75, `beam recall ${score.beamRecall}`);
assert.ok(score.beamPrecision >= 0.75, `beam precision ${score.beamPrecision}`);
assert.equal(score.wallRecall, 1);
assert.equal(score.wallCandidateCount, 1);
assert.equal(score.targets.columnRecall, 0.9);
assert.equal(score.targets.beamRecall, 0.75);
assert.deepEqual(score.pass, {
  story: true,
  columnRecall: true,
  columnPrecision: true,
  beamRecall: true,
});
assert.deepEqual(score.review, {
  version: 'p3-m9-pointcloud-review-v1',
  syntheticGate: 'pass',
  failedTargets: [],
  realScanGate: 'pending-owner-file',
  requiredEvidence: ['owner-pointcloud-file', 'field-extraction-review'],
  requiresOwnerScan: true,
  ownerReviewReady: false,
  productionReady: false,
  agentDecision: 'synthetic-benchmark-pass-real-scan-pending',
});
assert.equal(score.validationStatus.realScan, 'pending-owner-file');
assert.equal(score.review.version, 'p3-m9-pointcloud-review-v1');
assert.equal(score.review.productionReady, false);

const strictScore = evaluatePointCloudExtraction(candidate, synthetic.groundTruth, {
  columnRecallTarget: 1.1,
});
assert.equal(strictScore.review.syntheticGate, 'fail');
assert.ok(strictScore.review.failedTargets.includes('column-recall-target'));
assert.ok(strictScore.review.requiredEvidence.includes('synthetic-extraction-regression-fix'));
assert.ok(strictScore.review.requiredEvidence.includes('owner-pointcloud-file'));
assert.equal(strictScore.review.agentDecision, 'fix-extraction-before-review');
assert.equal(strictScore.review.requiresOwnerScan, true);
const checkedScore = evaluatePointCloudExtraction(candidate, synthetic.groundTruth, {
  realScanValidation: 'checked',
});
assert.equal(checkedScore.validationStatus.realScan, 'checked');
assert.equal(checkedScore.review.realScanGate, 'pass');
assert.deepEqual(checkedScore.review.requiredEvidence, []);
assert.equal(checkedScore.review.ownerReviewReady, true);
assert.equal(checkedScore.review.productionReady, false);
assert.equal(checkedScore.review.agentDecision, 'pointcloud-import-ready-for-owner-review');
const failedReview = buildPointCloudExtractionReview({ realScanValidation: 'failed' });
assert.equal(failedReview.realScanGate, 'failed');
assert.deepEqual(failedReview.requiredEvidence, ['clean-or-replace-owner-pointcloud-file']);
assert.equal(failedReview.agentDecision, 'collect-or-clean-real-scan');
const scanOnlyCandidate = extractPointCloudCandidate(synthetic.points, {
  story: { tolerance: 0.08 },
  column: { xyTolerance: 0.08, zTolerance: 0.08 },
  realScanValidation: 'checked',
});
assert.equal(validateImportCandidate(scanOnlyCandidate).ok, true);
assert.equal(scanOnlyCandidate.audit.pointcloud.contract.source, 'scan-only-preliminary');
assert.equal(scanOnlyCandidate.audit.pointcloud.evidence.extractionStatus.beams, 'not-detected');
assert.equal(scanOnlyCandidate.audit.pointcloud.evidence.beamSource, 'not-detected');
assert.equal(scanOnlyCandidate.audit.pointcloud.candidateReview.sourceAssistance, 'scan-only');
assert.equal(scanOnlyCandidate.audit.pointcloud.candidateReview.productionReady, false);
assert.equal(scanOnlyCandidate.audit.pointcloud.candidateReview.humanReviewRequired, true);
assert.equal(scanOnlyCandidate.audit.pointcloud.candidateReview.blockers.includes('synthetic-ground-truth-assisted-extraction'), false);
assert.equal(scanOnlyCandidate.audit.pointcloud.candidateReview.blockers.includes('real-scan-validation-not-checked'), false);
assert.ok(scanOnlyCandidate.audit.pointcloud.limitations.includes('real-field-pointcloud-owner-review-required'));
assert.equal(scanOnlyCandidate.audit.pointcloud.limitations.includes('real-field-pointcloud-validation-pending'), false);
assert.ok(scanOnlyCandidate.audit.pointcloud.limitations.includes('beam-detection-not-available-without-ground-truth'));
assert.ok(candidate.candidates.members.some((m) => m.kind === 'beam'));
assert.equal(candidate.audit.pointcloud.contract.milestone, 'P3-M9');
assert.deepEqual(candidate.audit.pointcloud.contract.tickets, ['P3-T41', 'P3-T42', 'P3-T43', 'P3-T44', 'P3-T45']);
assert.equal(candidate.audit.pointcloud.contract.output, 'ImportCandidate');
assert.equal(candidate.audit.pointcloud.counts.beams > 0, true);
assert.equal(candidate.audit.pointcloud.counts.walls, 1);
assert.equal(candidate.audit.pointcloud.evidence.extractionStatus.stories, 'available');
assert.equal(candidate.audit.pointcloud.evidence.extractionStatus.columns, 'available');
assert.equal(candidate.audit.pointcloud.evidence.extractionStatus.beams, 'synthetic-assisted');
assert.equal(candidate.audit.pointcloud.evidence.extractionStatus.walls, 'review-candidates-available');
assert.equal(candidate.audit.pointcloud.evidence.extractionStatus.importCandidate, 'generated');
assert.equal(candidate.audit.pointcloud.evidence.beamSource, 'synthetic-ground-truth-assisted');
assert.equal(candidate.audit.pointcloud.evidence.realScanValidation, 'pending-owner-file');
assert.equal(candidate.audit.pointcloud.evidence.review.realScanGate, 'pending-owner-file');
assert.equal(candidate.audit.pointcloud.evidence.review.agentDecision, 'synthetic-benchmark-pass-real-scan-pending');
assert.equal(candidate.audit.pointcloud.evidence.review.productionReady, false);
assert.equal(candidate.audit.pointcloud.candidateReview.importCandidateGenerated, true);
assert.equal(candidate.audit.pointcloud.candidateReview.candidateToAnalysisPath, 'available-after-human-review');
assert.equal(candidate.audit.pointcloud.candidateReview.sourceAssistance, 'synthetic-ground-truth-assisted');
assert.equal(candidate.audit.pointcloud.candidateReview.humanReviewRequired, true);
assert.equal(candidate.audit.pointcloud.candidateReview.productionReady, false);
assert.ok(candidate.audit.pointcloud.candidateReview.blockers.includes('synthetic-ground-truth-assisted-extraction'));
assert.ok(candidate.audit.pointcloud.candidateReview.blockers.includes('real-scan-validation-not-checked'));
assert.equal(candidate.audit.pointcloud.candidateReview.relatedTest, 'tests/p3-pointcloud-e2e.mjs');
assert.equal(candidate.audit.pointcloud.candidateReview.agentDecision, 'review-pointcloud-candidate-before-analysis');
assert.equal(candidate.audit.pointcloud.importCandidateTrace.validationOk, true);
assert.equal(candidate.audit.pointcloud.importCandidateTrace.counts.nodes, candidate.candidates.nodes.length);
assert.equal(candidate.audit.pointcloud.importCandidateTrace.counts.members, candidate.candidates.members.length);
assert.equal(candidate.audit.pointcloud.importCandidateTrace.memberKinds.column > 0, true);
assert.equal(candidate.audit.pointcloud.importCandidateTrace.memberKinds.beam > 0, true);
assert.equal(candidate.audit.pointcloud.importCandidateTrace.candidateToAnalysisPath, 'available-after-human-review');
assert.equal(candidate.audit.pointcloud.importCandidateTrace.agentDecision, 'review-pointcloud-import-candidate-before-analysis');
assert.deepEqual(candidate.audit.pointcloud.evidence.confidenceBands, {
  high: '>=0.8',
  review: '0.5-0.8',
  auditOnly: '<0.5',
});
assert.equal(candidate.audit.pointcloud.evidence.candidates.stories.length > 0, true);
assert.equal(candidate.audit.pointcloud.evidence.candidates.columns.length > 0, true);
assert.equal(candidate.audit.pointcloud.evidence.candidates.beams.length > 0, true);
assert.equal(candidate.audit.pointcloud.evidence.candidates.walls.length, 1);
assert.ok(candidate.audit.pointcloud.evidence.candidates.columns[0].evidence.includes('vertical-continuity'));
assert.ok(candidate.audit.pointcloud.evidence.candidates.beams[0].evidence.includes('synthetic-ground-truth-assisted'));
assert.equal(candidate.audit.pointcloud.evidence.candidates.walls[0].band, 'high');
assert.equal(candidate.audit.pointcloud.evidence.wallExtraction.status, 'review-candidates-available');
assert.equal(candidate.audit.pointcloud.evidence.wallExtraction.productionReady, false);
assert.equal(candidate.audit.pointcloud.evidence.wallExtraction.candidateCount, 1);
assert.equal(candidate.audit.pointcloud.evidence.wallExtraction.candidates[0].midPierReady, true);
assert.ok(candidate.audit.pointcloud.limitations.includes('beam-detection-uses-synthetic-ground-truth'));
assert.ok(candidate.audit.pointcloud.limitations.includes('wall-candidates-require-human-review'));
assert.ok(candidate.audit.pointcloud.limitations.includes('real-field-pointcloud-validation-pending'));
assert.ok(buildAgentManifest().dataContracts.includes('phase3PointCloudBenchmark'));
assert.ok(buildAgentManifest().dataContracts.includes('phase3PointCloudExtractionSummary'));
assert.ok(buildAgentManifest().dataContracts.includes('phase3PointCloudWallDetectionTrace'));

console.log(JSON.stringify({
  ok: true,
  version: 'p3-pointcloud-extraction',
  storyErrorMax: score.storyErrorMax,
  columnRecall: score.columnRecall,
  columnPrecision: score.columnPrecision,
  beamRecall: score.beamRecall,
  beamPrecision: score.beamPrecision,
  wallRecall: score.wallRecall,
}, null, 2));
