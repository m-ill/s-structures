import { parsePointCloudWithAudit } from './loaders.js';
import { normalizePointCloud } from './normalize.js';
import { removeSparseOutliers } from './outlier.js';
import { voxelDownsample } from './voxel.js';
import { buildPointCloudLayerData } from '../../viewer/pointCloudLayer.js';

export const POINT_CLOUD_WORKER_PIPELINE_VERSION = 'p3-m8-pointcloud-worker-v1';

export function handlePointCloudWorkerMessage(message = {}) {
  const requestId = message.requestId || null;
  try {
    if (message.type !== 'process-pointcloud-text') {
      return {
        version: POINT_CLOUD_WORKER_PIPELINE_VERSION,
        ok: false,
        requestId,
        error: {
          code: 'POINT_CLOUD_WORKER_UNKNOWN_MESSAGE',
          message: `Unsupported point-cloud worker message: ${message.type || 'unknown'}`,
        },
      };
    }
    const result = processPointCloudText(message.text || '', message.options || {});
    const layer = buildPointCloudLayerData(result.points, message.options?.view || {});
    return {
      version: POINT_CLOUD_WORKER_PIPELINE_VERSION,
      ok: true,
      requestId,
      result,
      transferable: {
        pointCount: result.points.length,
        viewerPointCount: layer.count,
        buffers: layer.metadata?.transferableBuffers || [],
        totalBytes: layer.metadata?.totalBytes || 0,
        metadata: layer.metadata || null,
      },
    };
  } catch (error) {
    return {
      version: POINT_CLOUD_WORKER_PIPELINE_VERSION,
      ok: false,
      requestId,
      error: {
        code: error.code || 'POINT_CLOUD_WORKER_FAILED',
        message: error.message || 'Point-cloud worker failed.',
        format: error.format || null,
        guidance: error.guidance || null,
      },
    };
  }
}

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
