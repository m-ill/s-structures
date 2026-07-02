import { bboxOfPoints } from '../point.js';

export const POINT_CLOUD_NORMALIZE_VERSION = 'p3-m8-pointcloud-normalize-v1';

export function normalizePointCloud(points, options = {}) {
  const bbox = bboxOfPoints(points) || { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  const origin = options.origin || bbox.min;
  const scale = options.scale ?? inferScale(bbox);
  const normalized = points.map((p, id) => ({
    id: p.id || `P${id + 1}`,
    x: (p.x - origin.x) * scale,
    y: (p.y - origin.y) * scale,
    z: (p.z - origin.z) * scale,
    color: p.color || null,
  }));
  return { points: normalized, audit: { inputCount: points.length, bbox, origin, scale } };
}

function inferScale(bbox) {
  const size = Math.max(bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y, bbox.max.z - bbox.min.z);
  return size > 1000 ? 0.001 : 1;
}
