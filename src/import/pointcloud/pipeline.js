export const POINT_CLOUD_IMPORT_PIPELINE_VERSION = 'p3-m8-pointcloud-pipeline-v1';

export function describePointCloudPipeline() {
  return {
    version: POINT_CLOUD_IMPORT_PIPELINE_VERSION,
    status: 'available-core',
    stages: [
      'load-xyz-ply-pcd',
      'normalize-origin-units',
      'voxel-downsample',
      'outlier-filter',
      'viewer-buffer',
      'story-level-detection',
      'column-beam-wall-extraction',
      'import-candidate-review',
    ],
    currentScope: 'xyz-ply-pcd text loading, normalization, downsample, outlier filtering, and viewer buffer contract',
    performanceBudget: {
      preprocessing: { targetPoints: 10000000, targetSeconds: 30, status: 'pending-large-fixture' },
      viewer: { targetPoints: 2000000, targetFps: 60, status: 'contract-only' },
    },
    unsupportedOrPendingFormats: ['LAS', 'LAZ', 'E57', 'binary-PCD'],
    realScanValidation: 'pending-owner-file',
  };
}
