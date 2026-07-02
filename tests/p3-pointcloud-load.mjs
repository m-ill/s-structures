import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildAgentManifest,
  buildPointCloudLayerData,
  describePointCloudPipeline,
  handlePointCloudWorkerMessage,
  POINT_CLOUD_EXTERNAL_CONVERSION_GUIDANCE,
  POINT_CLOUD_UNSUPPORTED_FORMAT,
  parsePointCloudText,
  parsePointCloudWithAudit,
  processPointCloudText,
  summarizePointCloudImport,
} from '../src/index.js';

const xyz = readFileSync('tests/fixtures/pointcloud/mini.xyz', 'utf8');
const ply = readFileSync('tests/fixtures/pointcloud/mini.ply', 'utf8');
const pcd = readFileSync('tests/fixtures/pointcloud/mini.pcd', 'utf8');

assert.equal(parsePointCloudText(xyz).length, 7);
assert.equal(parsePointCloudText(ply).length, 4);
assert.equal(parsePointCloudText(pcd).length, 3);
const loadedXyz = parsePointCloudWithAudit(xyz);
assert.equal(loadedXyz.audit.format, 'xyz');
assert.equal(loadedXyz.audit.parsedCount, 7);
assert.equal(loadedXyz.audit.rejectedCount, 0);
const loadedPly = parsePointCloudWithAudit(ply);
assert.equal(loadedPly.audit.format, 'ply');
assert.equal(loadedPly.audit.dataLineCount, 4);
assert.equal(loadedPly.audit.parsedCount, 4);
assert.equal(loadedPly.audit.rejectedCount, 0);
assert.equal(loadedPly.audit.colorCount, 4);
const loadedPcd = parsePointCloudWithAudit(pcd);
assert.equal(loadedPcd.audit.format, 'pcd');
assert.equal(loadedPcd.audit.dataLineCount, 3);
assert.equal(loadedPcd.audit.parsedCount, 3);
assert.equal(loadedPcd.audit.rejectedCount, 0);
assert.equal(loadedPcd.audit.colorCount, 0);

assertUnsupportedPointCloud(
  () => parsePointCloudWithAudit('ply\nformat binary_little_endian 1.0\nend_header\n', { format: 'ply' }),
  'binary-PLY',
);
assertUnsupportedPointCloud(
  () => parsePointCloudWithAudit('# .PCD v0.7\nFIELDS x y z\nPOINTS 1\nDATA binary\n', { format: 'pcd' }),
  'binary-PCD',
);
assertUnsupportedPointCloud(
  () => parsePointCloudWithAudit('', { format: 'las' }),
  'LAS',
);
assert.match(POINT_CLOUD_EXTERNAL_CONVERSION_GUIDANCE.LAS, /Convert LAS/);

const processed = processPointCloudText(xyz, {
  voxelSize: 0.05,
  outlier: { radius: 3.2, minNeighbors: 1 },
});
assert.equal(processed.audit.rawCount, 7);
assert.equal(processed.audit.loader.parsedCount, 7);
assert.equal(processed.audit.downsampledCount, 4);
assert.equal(processed.audit.outputCount, 3);
assert.deepEqual(processed.audit.stages, ['parse', 'normalize', 'voxel-downsample', 'outlier-filter']);
assert.deepEqual(processed.audit.stageRows.map((row) => row.id), ['parse', 'normalize', 'voxel-downsample', 'outlier-filter']);
assert.equal(processed.audit.stageRows[0].inputCount, 7);
assert.equal(processed.audit.stageRows[0].outputCount, 7);
assert.equal(processed.audit.stageRows[2].droppedCount, 3);
assert.equal(processed.audit.stageRows[3].droppedCount, 1);
assert.equal(processed.audit.bboxSize.x, 20);
assert.equal(processed.audit.originShift.distance, 0);
assert.equal(processed.audit.stageRows[1].originShift.distance, 0);
const workerMessage = handlePointCloudWorkerMessage({
  type: 'process-pointcloud-text',
  requestId: 'm8-worker-001',
  text: xyz,
  options: { voxelSize: 0.05, outlier: { radius: 3.2, minNeighbors: 1 } },
});
assert.equal(workerMessage.ok, true);
assert.equal(workerMessage.requestId, 'm8-worker-001');
assert.equal(workerMessage.result.audit.stageRows.length, 4);
assert.equal(workerMessage.transferable.pointCount, workerMessage.result.points.length);
const workerUnsupported = handlePointCloudWorkerMessage({
  type: 'process-pointcloud-text',
  requestId: 'm8-worker-unsupported',
  text: '',
  options: { format: 'las' },
});
assert.equal(workerUnsupported.ok, false);
assert.equal(workerUnsupported.requestId, 'm8-worker-unsupported');
assert.equal(workerUnsupported.error.code, POINT_CLOUD_UNSUPPORTED_FORMAT);
assert.match(workerUnsupported.error.guidance, /Convert LAS/);
const workerUnknown = handlePointCloudWorkerMessage({ type: 'unknown-message', requestId: 'm8-worker-unknown' });
assert.equal(workerUnknown.ok, false);
assert.equal(workerUnknown.error.code, 'POINT_CLOUD_WORKER_UNKNOWN_MESSAGE');

const layer = buildPointCloudLayerData(processed.points, { zMin: -0.1, zMax: 3.1 });
assert.equal(layer.count, 3);
assert.equal(layer.positions.length, 9);
assert.equal(layer.colors.length, 9);
assert.equal(layer.metadata.positionType, 'Float32Array');
assert.equal(layer.metadata.colorType, 'Uint8Array');
assert.equal(layer.metadata.positionBytes, 36);
assert.equal(layer.metadata.colorBytes, 9);
assert.equal(layer.metadata.totalBytes, 45);
assert.deepEqual(layer.metadata.transferableBuffers, ['positions.buffer', 'colors.buffer']);
assert.equal(layer.metadata.zFilter.min, -0.1);
assert.equal(layer.metadata.zFilter.max, 3.1);

const summary = summarizePointCloudImport(processed, { view: { zMin: -0.1, zMax: 3.1 } });
assert.equal(summary.contract.milestone, 'P3-M8');
assert.deepEqual(summary.contract.tickets, ['P3-T36', 'P3-T37', 'P3-T38', 'P3-T39', 'P3-T40']);
assert.equal(summary.status, 'ready-for-review');
assert.equal(summary.counts.raw, 7);
assert.equal(summary.counts.viewer, 3);
assert.equal(summary.normalization.bboxSize.x, 20);
assert.equal(summary.normalization.originShift.distance, 0);
assert.equal(summary.loader.format, 'xyz');
assert.equal(summary.viewerBuffer.positionLength, 9);
assert.equal(summary.viewerBuffer.metadata.positionType, 'Float32Array');
assert.equal(summary.viewerBuffer.metadata.filteredCount, 3);
assert.equal(summary.viewerBuffer.transferable.ready, true);
assert.equal(summary.viewerBuffer.transferable.totalBytes, 45);
assert.equal(summary.stageRows[2].id, 'voxel-downsample');
assert.equal(summary.stageRows[3].id, 'outlier-filter');
assert.deepEqual(summary.stages, ['parse', 'normalize', 'voxel-downsample', 'outlier-filter']);
assert.equal(summary.readiness.textLoaderReady, true);
assert.equal(summary.readiness.workerPipelineReady, true);
assert.equal(summary.readiness.viewerBufferReady, true);
assert.equal(summary.readiness.largeFilePerformance, 'pending-large-fixture');
assert.equal(summary.readiness.realScanValidation, 'pending-owner-file');
assert.ok(summary.readiness.pendingFormats.includes('LAS'));
assert.equal(summary.review.fixtureReady, true);
assert.equal(summary.review.productionReady, false);
assert.equal(summary.review.ownerReviewRequired, true);
assert.equal(summary.review.evidenceClass, 'compact-fixture');
assert.equal(summary.review.agentDecision, 'collect-pointcloud-field-evidence');
assert.ok(summary.review.missing.includes('large-file-performance'));
assert.ok(summary.review.missing.includes('real-scan-validation'));
assert.equal(summary.warnings.includes('pointcloud-origin-shifted'), false);

const shiftedSummary = summarizePointCloudImport(shiftPointCloudText(xyz, { x: 5000, y: 7000, z: 0 }), {
  voxelSize: 0.05,
  outlier: { radius: 3.2, minNeighbors: 1 },
  view: { zMin: -0.1, zMax: 3.1 },
});
assert.equal(shiftedSummary.normalization.origin.x, 5000);
assert.equal(shiftedSummary.normalization.origin.y, 7000);
assert.equal(shiftedSummary.normalization.originShift.vector.x, -5000);
assert.equal(shiftedSummary.normalization.originShift.vector.y, -7000);
assert.ok(shiftedSummary.normalization.originShift.distance > 8000);
assert.ok(shiftedSummary.warnings.includes('pointcloud-origin-shifted'));
assert.ok(shiftedSummary.review.warnings.includes('pointcloud-origin-shifted'));
const yUpSummary = summarizePointCloudImport([
  '0 0 0',
  '0 3 0',
  '4 3 0',
  '4 0 0',
].join('\n'), {
  upAxis: 'y',
  voxelSize: 0.01,
  outlier: { radius: 10, minNeighbors: 1 },
});
assert.equal(yUpSummary.normalization.axis.sourceUp, 'y');
assert.equal(yUpSummary.normalization.axis.targetUp, 'z');
assert.equal(yUpSummary.normalization.axis.remapped, true);
assert.deepEqual(yUpSummary.normalization.axis.mapping, { x: 'x', y: 'z', z: 'y' });
assert.equal(yUpSummary.normalization.bboxSize.z, 3);
assert.ok(yUpSummary.warnings.includes('pointcloud-axis-remapped-to-z-up'));
const pipeline = describePointCloudPipeline();
assert.equal(pipeline.status, 'available-core');
assert.equal(pipeline.performanceBudget.preprocessing.targetPoints, 10000000);
assert.equal(pipeline.performanceBudget.viewer.targetFps, 60);
assert.ok(pipeline.unsupportedOrPendingFormats.includes('binary-PCD'));
assert.ok(buildAgentManifest().dataContracts.includes('phase3PointCloudViewerBuffer'));
assert.ok(buildAgentManifest().dataContracts.includes('phase3PointCloudImportSummary'));

console.log(JSON.stringify({ ok: true, version: 'p3-pointcloud-load', points: layer.count }, null, 2));

function shiftPointCloudText(text, delta) {
  return String(text).split(/\r?\n/).map((line) => {
    const values = line.trim().split(/\s+/).map(Number);
    if (values.length < 3 || !values.slice(0, 3).every(Number.isFinite)) return line;
    return [
      values[0] + delta.x,
      values[1] + delta.y,
      values[2] + delta.z,
      ...values.slice(3),
    ].join(' ');
  }).join('\n');
}

function assertUnsupportedPointCloud(fn, format) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, POINT_CLOUD_UNSUPPORTED_FORMAT);
    assert.equal(error.format, format);
    assert.equal(typeof error.guidance, 'string');
    assert.ok(error.guidance.length > 0);
    return true;
  });
}
