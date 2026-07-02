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
  const stageRows = buildStageRows(loaded, normalized, downsampled, filtered);
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
      stageRows,
    },
  };
}

function buildStageRows(loaded, normalized, downsampled, filtered) {
  const parsedCount = loaded.audit?.parsedCount || 0;
  return [
    {
      id: 'parse',
      inputCount: loaded.audit?.dataLineCount || 0,
      outputCount: parsedCount,
      rejectedCount: loaded.audit?.rejectedCount || 0,
    },
    {
      id: 'normalize',
      inputCount: normalized.audit?.inputCount || 0,
      outputCount: normalized.points?.length || 0,
      scale: normalized.audit?.scale ?? null,
      origin: normalized.audit?.origin || null,
      originShift: normalized.audit?.originShift || null,
    },
    {
      id: 'voxel-downsample',
      inputCount: normalized.points?.length || 0,
      outputCount: downsampled.length,
      droppedCount: Math.max(0, (normalized.points?.length || 0) - downsampled.length),
    },
    {
      id: 'outlier-filter',
      inputCount: downsampled.length,
      outputCount: filtered.length,
      droppedCount: Math.max(0, downsampled.length - filtered.length),
    },
  ];
}
