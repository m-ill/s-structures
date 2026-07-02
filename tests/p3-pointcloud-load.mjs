import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildAgentManifest,
  buildPointCloudLayerData,
  describePointCloudPipeline,
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
const pipeline = describePointCloudPipeline();
assert.equal(pipeline.status, 'available-core');
assert.equal(pipeline.performanceBudget.preprocessing.targetPoints, 10000000);
assert.equal(pipeline.performanceBudget.viewer.targetFps, 60);
assert.ok(pipeline.unsupportedOrPendingFormats.includes('binary-PCD'));
assert.ok(buildAgentManifest().dataContracts.includes('phase3PointCloudViewerBuffer'));
assert.ok(buildAgentManifest().dataContracts.includes('phase3PointCloudImportSummary'));

console.log(JSON.stringify({ ok: true, version: 'p3-pointcloud-load', points: layer.count }, null, 2));
