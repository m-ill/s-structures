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

const layer = buildPointCloudLayerData(processed.points, { zMin: -0.1, zMax: 3.1 });
assert.equal(layer.count, 3);
assert.equal(layer.positions.length, 9);
assert.equal(layer.colors.length, 9);

const summary = summarizePointCloudImport(processed, { view: { zMin: -0.1, zMax: 3.1 } });
assert.equal(summary.status, 'ready-for-review');
assert.equal(summary.counts.raw, 7);
assert.equal(summary.counts.viewer, 3);
assert.equal(summary.loader.format, 'xyz');
assert.equal(summary.viewerBuffer.positionLength, 9);
assert.deepEqual(summary.stages, ['parse', 'normalize', 'voxel-downsample', 'outlier-filter']);
assert.equal(describePointCloudPipeline().status, 'available-core');
assert.ok(buildAgentManifest().dataContracts.includes('phase3PointCloudViewerBuffer'));
assert.ok(buildAgentManifest().dataContracts.includes('phase3PointCloudImportSummary'));

console.log(JSON.stringify({ ok: true, version: 'p3-pointcloud-load', points: layer.count }, null, 2));
