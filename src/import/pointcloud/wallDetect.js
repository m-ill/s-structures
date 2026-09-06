export const POINT_CLOUD_WALL_DETECT_VERSION = 'p3-m9-pointcloud-wall-v1';

export function detectWallsFromGroundTruth(groundTruth = {}) {
  return (groundTruth.walls || []).map((wall, index) => normalizeWall(wall, index, 'synthetic-ground-truth-assisted'));
}

export function detectWallsFromOptions(options = {}) {
  return (options.walls || []).map((wall, index) => normalizeWall(wall, index, 'user-review-input'));
}

export function buildWallExtractionReview(walls = [], options = {}) {
  const realScan = options.realScanValidation || 'pending-owner-file';
  const available = walls.length > 0;
  return {
    version: POINT_CLOUD_WALL_DETECT_VERSION,
    status: available ? 'review-candidates-available' : 'preliminary-no-wall-candidate',
    productionReady: false,
    realScanValidation: realScan,
    candidateCount: walls.length,
    candidates: walls.map((wall) => ({
      id: wall.id,
      from: wall.from,
      to: wall.to,
      z1: wall.z1,
      z2: wall.z2,
      thickness: wall.thickness,
      confidence: wall.confidence,
      band: confidenceBand(wall.confidence),
      evidence: wall.evidence,
      midPierReady: !!(wall.length > 0 && wall.height > 0 && wall.thickness > 0),
    })),
    limitations: [
      'wall-panel-candidates-require-human-review',
      'plane-extraction-from-real-scan-pending',
      'wall-mid-pier-model-conversion-not-applied-in-pointcloud-import-v1',
    ],
  };
}

function normalizeWall(wall = {}, index, source) {
  const from = point(wall.from || [wall.x1, wall.y1, wall.z1]);
  const to = point(wall.to || [wall.x2, wall.y2, wall.z1]);
  const z1 = number(wall.z1 ?? Math.min(from[2], to[2]), 0);
  const z2 = number(wall.z2 ?? (wall.height != null ? z1 + Number(wall.height || 0) : Math.max(from[2], to[2])), z1);
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const height = Math.max(0, z2 - z1);
  const confidence = number(wall.confidence, source === 'synthetic-ground-truth-assisted' ? 0.82 : 0.65);
  return {
    id: wall.id || `W${index + 1}`,
    from: [from[0], from[1], z1],
    to: [to[0], to[1], z1],
    z1,
    z2,
    length,
    height,
    thickness: number(wall.thickness, 0.2),
    confidence,
    evidence: source === 'synthetic-ground-truth-assisted'
      ? ['synthetic-wall-panel-ground-truth', 'story-continuity']
      : ['user-supplied-wall-panel', 'review-required'],
    source,
  };
}

function point(value) {
  return [number(value?.[0], 0), number(value?.[1], 0), number(value?.[2], 0)];
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function confidenceBand(value) {
  if (!Number.isFinite(value)) return 'unknown';
  if (value >= 0.8) return 'high';
  if (value >= 0.5) return 'review';
  return 'audit-only';
}
