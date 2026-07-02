export const POINT_CLOUD_IMPORT_PIPELINE_VERSION = 'p3-m8-pointcloud-pipeline-v1';

export function describePointCloudPipeline() {
  return {
    version: POINT_CLOUD_IMPORT_PIPELINE_VERSION,
    status: 'available-core',
    stages: [
      'load-xyz-ply-pcd',
      'voxel-downsample',
      'outlier-filter',
      'viewer-buffer',
      'story-level-detection',
      'column-beam-wall-extraction',
      'import-candidate-review',
    ],
    currentScope: 'xyz-ply-pcd text loading, normalization, downsample, outlier filtering, and viewer buffer contract',
  };
}
