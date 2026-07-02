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
assert.ok(candidate.candidates.members.some((m) => m.kind === 'beam'));
assert.ok(buildAgentManifest().dataContracts.includes('phase3PointCloudBenchmark'));

console.log(JSON.stringify({
  ok: true,
  version: 'p3-pointcloud-extraction',
  storyErrorMax: score.storyErrorMax,
  columnRecall: score.columnRecall,
  columnPrecision: score.columnPrecision,
}, null, 2));
