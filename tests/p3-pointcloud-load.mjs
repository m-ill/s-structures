import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildAgentManifest,
  buildPointCloudLayerData,
  describePointCloudPipeline,
  parsePointCloudText,
  processPointCloudText,
} from '../src/index.js';

const xyz = readFileSync('tests/fixtures/pointcloud/mini.xyz', 'utf8');
const ply = readFileSync('tests/fixtures/pointcloud/mini.ply', 'utf8');
const pcd = readFileSync('tests/fixtures/pointcloud/mini.pcd', 'utf8');

assert.equal(parsePointCloudText(xyz).length, 7);
assert.equal(parsePointCloudText(ply).length, 4);
assert.equal(parsePointCloudText(pcd).length, 3);

const processed = processPointCloudText(xyz, {
  voxelSize: 0.05,
  outlier: { radius: 3.2, minNeighbors: 1 },
});
assert.equal(processed.audit.rawCount, 7);
assert.equal(processed.audit.downsampledCount, 4);
assert.equal(processed.audit.outputCount, 3);
assert.deepEqual(processed.audit.stages, ['parse', 'normalize', 'voxel-downsample', 'outlier-filter']);

const layer = buildPointCloudLayerData(processed.points, { zMin: -0.1, zMax: 3.1 });
assert.equal(layer.count, 3);
assert.equal(layer.positions.length, 9);
assert.equal(layer.colors.length, 9);
assert.equal(describePointCloudPipeline().status, 'available-core');
assert.ok(buildAgentManifest().dataContracts.includes('phase3PointCloudViewerBuffer'));

console.log(JSON.stringify({ ok: true, version: 'p3-pointcloud-load', points: layer.count }, null, 2));
