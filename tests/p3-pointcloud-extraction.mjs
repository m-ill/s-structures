import assert from 'node:assert/strict';
import {
  buildAgentManifest,
  createRepresentativeBuildingModel,
  evaluatePointCloudExtraction,
  extractPointCloudCandidate,
  generateSyntheticPointCloud,
  validateImportCandidate,
} from '../src/index.js';

const model = createRepresentativeBuildingModel('01-regular-office-frame');
const synthetic = generateSyntheticPointCloud(model, { step: 1.2 });
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
assert.equal(score.validationStatus.realScan, 'pending-owner-file');
assert.ok(candidate.candidates.members.some((m) => m.kind === 'beam'));
assert.equal(candidate.audit.pointcloud.counts.beams > 0, true);
assert.equal(candidate.audit.pointcloud.evidence.beamSource, 'synthetic-ground-truth-assisted');
assert.equal(candidate.audit.pointcloud.evidence.realScanValidation, 'pending-owner-file');
assert.ok(candidate.audit.pointcloud.limitations.includes('beam-detection-uses-synthetic-ground-truth'));
assert.ok(candidate.audit.pointcloud.limitations.includes('real-field-pointcloud-validation-pending'));
assert.ok(buildAgentManifest().dataContracts.includes('phase3PointCloudBenchmark'));
assert.ok(buildAgentManifest().dataContracts.includes('phase3PointCloudExtractionSummary'));

console.log(JSON.stringify({
  ok: true,
  version: 'p3-pointcloud-extraction',
  storyErrorMax: score.storyErrorMax,
  columnRecall: score.columnRecall,
  columnPrecision: score.columnPrecision,
  beamRecall: score.beamRecall,
  beamPrecision: score.beamPrecision,
}, null, 2));
