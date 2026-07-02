import { buildPointCloudLayerData } from '../../viewer/pointCloudLayer.js';
import { describePointCloudPipeline } from './pipeline.js';
import { processPointCloudText } from './worker.js';

export const POINT_CLOUD_IMPORT_SUMMARY_VERSION = 'p3-m8-pointcloud-import-summary-v1';

export function summarizePointCloudImport(input, options = {}) {
  const processed = Array.isArray(input?.points) ? input : processPointCloudText(input, options);
  const layer = buildPointCloudLayerData(processed.points || [], options.view || {});
  const audit = processed.audit || {};
  const pipeline = describePointCloudPipeline();
  return {
    version: POINT_CLOUD_IMPORT_SUMMARY_VERSION,
    pipelineVersion: pipeline.version,
    workerVersion: processed.version || null,
    status: buildStatus(processed, layer),
    counts: {
      raw: audit.rawCount ?? audit.inputCount ?? 0,
      downsampled: audit.downsampledCount ?? null,
      output: audit.outputCount ?? (processed.points || []).length,
      viewer: layer.count,
    },
    normalization: {
      bbox: audit.bbox || null,
      origin: audit.origin || null,
      scale: audit.scale ?? null,
    },
    stages: audit.stages || pipeline.stages,
    viewerBuffer: {
      version: layer.version,
      count: layer.count,
      positionLength: layer.positions.length,
      colorLength: layer.colors.length,
      zFilter: {
        min: options.view?.zMin ?? null,
        max: options.view?.zMax ?? null,
      },
    },
    warnings: buildWarnings(audit, layer),
  };
}

function buildStatus(processed, layer) {
  if (!processed || !Array.isArray(processed.points)) return 'invalid';
  if (processed.points.length === 0) return 'empty';
  if (layer.count === 0) return 'loaded-not-visible';
  return 'ready-for-review';
}

function buildWarnings(audit, layer) {
  const warnings = [];
  if ((audit.rawCount ?? audit.inputCount ?? 0) === 0) warnings.push('pointcloud-empty-input');
  if (audit.scale && audit.scale !== 1) warnings.push('pointcloud-scale-inferred');
  if (layer.count === 0) warnings.push('pointcloud-view-filter-empty');
  return warnings;
}
