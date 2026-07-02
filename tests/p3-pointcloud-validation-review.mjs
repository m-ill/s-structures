import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildAgentManifest,
  buildPhase3PointCloudValidationReview,
  createRepresentativeBuildingModel,
  evaluatePointCloudExtraction,
  extractPointCloudCandidate,
  generateSyntheticPointCloud,
  PHASE3_POINT_CLOUD_VALIDATION_REVIEW_VERSION,
  processPointCloudText,
  summarizePointCloudImport,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const xyz = readFileSync('tests/fixtures/pointcloud/mini.xyz', 'utf8');
const processed = processPointCloudText(xyz, {
  voxelSize: 0.05,
  outlier: { radius: 3.2, minNeighbors: 1 },
});
const importSummary = summarizePointCloudImport(processed, { view: { zMin: -0.1, zMax: 3.1 } });

const model = createRepresentativeBuildingModel('01-regular-office-frame');
const synthetic = generateSyntheticPointCloud(model, { step: 1.2 });
const candidate = extractPointCloudCandidate(synthetic.points, {
  groundTruth: synthetic.groundTruth,
  story: { tolerance: 0.08 },
  column: { xyTolerance: 0.08, zTolerance: 0.08 },
  realScanValidation: 'checked',
});
const benchmark = evaluatePointCloudExtraction(candidate, synthetic.groundTruth, {
  realScanValidation: 'checked',
});
const review = buildPhase3PointCloudValidationReview({
  importSummaries: [{ id: 'mini-xyz', ...importSummary }],
  extractionBenchmarks: [{ id: 'regular-office-synthetic', ...benchmark }],
  realScanEvidence: [{
    id: 'owner-scan-placeholder',
    fileId: 'owner-field-scan.xyz',
    format: 'XYZ',
    status: 'checked',
    ownerProvided: true,
    beamWallValidation: true,
    reviewReportPath: 'reports/pointcloud-validation/owner-field-scan.md',
  }],
  performanceEvidence: [{
    id: 'large-file-budget-placeholder',
    recorded: true,
    pointCount: 1000000,
    parseMs: 1200,
    preprocessMs: 2800,
    viewerFps: 30,
    budget: 'pending-owner-hardware-review',
  }],
});

assert.equal(review.version, PHASE3_POINT_CLOUD_VALIDATION_REVIEW_VERSION);
assert.equal(review.summary.ok, true);
assert.equal(review.summary.productionReady, false);
assert.equal(review.summary.agentDecision, 'pointcloud-import-ready-for-owner-review');
assert.deepEqual(review.summary.missing, []);
assert.equal(review.groups.find((row) => row.id === 'loader-and-worker-fixtures').ok, true);
assert.equal(review.groups.find((row) => row.id === 'real-scan-validation').ok, true);
assert.equal(review.loadRows[0].status, 'validated');
assert.equal(review.loadRows[0].workerPipelineReady, true);
assert.equal(review.extractionRows[0].status, 'synthetic-validated');
assert.equal(review.extractionRows[0].realScanGate, 'pass');
assert.equal(review.extractionRows[0].ownerReviewReady, true);
assert.equal(review.extractionRows[0].productionReady, false);
assert.equal(review.realScanRows[0].status, 'checked');
assert.deepEqual(review.realScanRows[0].missing, []);
assert.equal(review.performanceRows[0].status, 'recorded');
assert.ok(review.requiredEvidence.includes('beam and wall validation without synthetic ground-truth assistance'));

const weakRealScan = buildPhase3PointCloudValidationReview({
  importSummaries: [{ id: 'mini-xyz', ...importSummary }],
  extractionBenchmarks: [{ id: 'regular-office-synthetic', ...benchmark }],
  realScanEvidence: [{
    id: 'owner-scan-without-beam-wall-review',
    fileId: 'owner-field-scan.xyz',
    format: 'XYZ',
    status: 'checked',
    ownerProvided: true,
  }],
  performanceEvidence: [{
    id: 'large-file-budget-placeholder',
    recorded: true,
    pointCount: 1000000,
    parseMs: 1200,
    preprocessMs: 2800,
    viewerFps: 30,
    budget: 'pending-owner-hardware-review',
  }],
});
assert.equal(weakRealScan.groups.find((row) => row.id === 'real-scan-validation').ok, false);
assert.equal(weakRealScan.realScanRows[0].rawStatus, 'checked');
assert.equal(weakRealScan.realScanRows[0].status, 'pending-owner-review');
assert.ok(weakRealScan.realScanRows[0].missing.includes('beam-wall-validation'));
assert.ok(weakRealScan.realScanRows[0].missing.includes('review-report'));
assert.ok(weakRealScan.summary.missing.includes('real-scan-validation'));

const empty = buildPhase3PointCloudValidationReview();
assert.equal(empty.summary.ok, false);
assert.ok(empty.summary.missing.includes('real-scan-validation'));
assert.equal(empty.summary.agentDecision, 'collect-pointcloud-validation-evidence');

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3PointCloudValidationReview, PHASE3_POINT_CLOUD_VALIDATION_REVIEW_VERSION);
assert.ok(manifest.readApis.includes('getPhase3PointCloudValidationReview'));
assert.ok(manifest.dataContracts.includes('phase3PointCloudValidationReview'));
assert.equal(manifest.qaCommands.phase3PointCloudValidation, 'node tests/p3-pointcloud-validation-review.mjs');

const agent = createIndexAgentApi({ model: () => null, reanalyze: () => {} });
assert.equal(agent.getPhase3PointCloudValidationReview().version, PHASE3_POINT_CLOUD_VALIDATION_REVIEW_VERSION);

console.log(JSON.stringify({
  ok: true,
  version: review.version,
  groups: review.groups.length,
  missingWhenEmpty: empty.summary.missing.length,
}, null, 2));
