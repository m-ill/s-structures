import { parsePointCloudWithAudit } from './loaders.js';
import { normalizePointCloud } from './normalize.js';
import { removeSparseOutliers } from './outlier.js';
import { voxelDownsample } from './voxel.js';

export const POINT_CLOUD_WORKER_PIPELINE_VERSION = 'p3-m8-pointcloud-worker-v1';

export function processPointCloudText(text, options = {}) {
  const loaded = parsePointCloudWithAudit(text, options);
  const raw = loaded.points;
  const normalized = normalizePointCloud(raw, options);
  const downsampled = voxelDownsample(normalized.points, options.voxelSize ?? 0.05, options.pointLimit ?? Infinity);
  const filtered = removeSparseOutliers(downsampled, options.outlier || {});
  return {
    version: POINT_CLOUD_WORKER_PIPELINE_VERSION,
    points: filtered,
    audit: {
      ...normalized.audit,
      loader: loaded.audit,
      rawCount: raw.length,
      downsampledCount: downsampled.length,
      outputCount: filtered.length,
      stages: ['parse', 'normalize', 'voxel-downsample', 'outlier-filter'],
    },
  };
}
