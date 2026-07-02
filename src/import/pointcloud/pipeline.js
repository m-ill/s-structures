export const POINT_CLOUD_IMPORT_PIPELINE_VERSION = 'p3-pointcloud-pipeline-shell';

export function describePointCloudPipeline() {
  return {
    version: POINT_CLOUD_IMPORT_PIPELINE_VERSION,
    status: 'planned-shell',
    stages: [
      'load-xyz-ply-pcd-las',
      'voxel-downsample',
      'outlier-filter',
      'story-level-detection',
      'column-beam-wall-extraction',
      'import-candidate-review',
    ],
    currentScope: 'contract-only-until-real-files-arrive',
  };
}
