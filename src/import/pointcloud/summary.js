import { buildPointCloudLayerData } from '../../viewer/pointCloudLayer.js';
import { describePointCloudPipeline } from './pipeline.js';
import { processPointCloudText } from './worker.js';

export const POINT_CLOUD_IMPORT_SUMMARY_VERSION = 'p3-m8-pointcloud-import-summary-v1';

export function summarizePointCloudImport(input, options = {}) {
  const processed = Array.isArray(input?.points) ? input : processPointCloudText(input, options);
  const layer = buildPointCloudLayerData(processed.points || [], options.view || {});
  const audit = processed.audit || {};
  const pipeline = describePointCloudPipeline();
  const readiness = buildReadiness(audit, layer, pipeline);
  const warnings = buildWarnings(audit, layer);
  const review = buildReview(readiness, warnings);
  return {
    version: POINT_CLOUD_IMPORT_SUMMARY_VERSION,
    contract: buildContract(pipeline),
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
      bboxSize: audit.bboxSize || null,
      origin: audit.origin || null,
      originShift: audit.originShift || null,
      axis: audit.axis || null,
      scale: audit.scale ?? null,
    },
    loader: audit.loader || null,
    stages: audit.stages || pipeline.stages,
    stageRows: audit.stageRows || [],
    viewerBuffer: {
      version: layer.version,
      count: layer.count,
      positionLength: layer.positions.length,
      colorLength: layer.colors.length,
      metadata: layer.metadata || null,
      transferable: {
        ready: !!layer.metadata?.transferableBuffers?.length,
        buffers: layer.metadata?.transferableBuffers || [],
        totalBytes: layer.metadata?.totalBytes || 0,
      },
      zFilter: {
        min: layer.metadata?.zFilter?.min ?? options.view?.zMin ?? null,
        max: layer.metadata?.zFilter?.max ?? options.view?.zMax ?? null,
      },
    },
    readiness,
    review,
    warnings,
  };
}

function buildContract(pipeline) {
  return {
    milestone: 'P3-M8',
    tickets: ['P3-T36', 'P3-T37', 'P3-T38', 'P3-T39', 'P3-T40'],
    dataContracts: ['phase3PointCloudLoader', 'phase3PointCloudViewerBuffer', 'phase3PointCloudImportSummary'],
    pipelineVersion: pipeline.version,
  };
}

function buildReadiness(audit, layer, pipeline) {
  const loader = audit.loader || {};
  return {
    fixtureFormatsReady: ['xyz', 'ply', 'pcd'],
    detectedFormat: loader.format || null,
    textLoaderReady: ['xyz', 'txt', 'ply', 'pcd'].includes(loader.format),
    workerPipelineReady: Array.isArray(audit.stageRows) && audit.stageRows.length >= 4,
    viewerBufferReady: layer.count > 0 && layer.metadata?.positionType === 'Float32Array',
    transferableReady: !!layer.metadata?.transferableBuffers?.length,
    largeFilePerformance: pipeline.performanceBudget?.preprocessing?.status || 'unknown',
    viewerPerformance: pipeline.performanceBudget?.viewer?.status || 'unknown',
    realScanValidation: pipeline.realScanValidation || 'unknown',
    pendingFormats: pipeline.unsupportedOrPendingFormats || [],
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
  if (audit.originShift?.distance > 0) warnings.push('pointcloud-origin-shifted');
  if (audit.axis?.remapped) warnings.push('pointcloud-axis-remapped-to-z-up');
  if (layer.count === 0) warnings.push('pointcloud-view-filter-empty');
  return warnings;
}

function buildReview(readiness, warnings) {
  const missing = [];
  if (!readiness.textLoaderReady) missing.push('text-loader');
  if (!readiness.workerPipelineReady) missing.push('worker-pipeline');
  if (!readiness.viewerBufferReady) missing.push('viewer-buffer');
  if (readiness.largeFilePerformance !== 'validated') missing.push('large-file-performance');
  if (readiness.realScanValidation !== 'checked') missing.push('real-scan-validation');
  return {
    fixtureReady: missing.every((item) => !['text-loader', 'worker-pipeline', 'viewer-buffer'].includes(item)),
    productionReady: false,
    ownerReviewRequired: true,
    missing,
    warnings,
    evidenceClass: readiness.realScanValidation === 'checked' ? 'field-scan' : 'compact-fixture',
    agentDecision: missing.length
      ? 'collect-pointcloud-field-evidence'
      : 'pointcloud-load-ready-for-owner-review',
  };
}
