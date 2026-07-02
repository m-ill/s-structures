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
  return {
    points: normalized,
    audit: {
      inputCount: points.length,
      bbox,
      bboxSize: bboxSize(bbox),
      origin,
      originShift: originShift(origin, scale),
      scale,
    },
  };
}

function inferScale(bbox) {
  const size = Math.max(bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y, bbox.max.z - bbox.min.z);
  return size > 1000 ? 0.001 : 1;
}

function bboxSize(bbox) {
  return {
    x: (bbox.max.x - bbox.min.x),
    y: (bbox.max.y - bbox.min.y),
    z: (bbox.max.z - bbox.min.z),
  };
}

function originShift(origin, scale) {
  const vector = {
    x: -origin.x * scale,
    y: -origin.y * scale,
    z: -origin.z * scale,
  };
  return {
    vector,
    distance: Math.hypot(vector.x, vector.y, vector.z),
  };
}
