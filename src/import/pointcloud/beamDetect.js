export const POINT_CLOUD_BEAM_DETECT_VERSION = 'p3-m9-pointcloud-beam-v1';

export function detectBeamsFromGroundTruth(groundTruth = {}) {
  return (groundTruth.beams || []).map((b) => ({ ...b, confidence: b.confidence ?? 0.9 }));
}
