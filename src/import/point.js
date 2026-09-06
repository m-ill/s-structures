export function toPoint3(input) {
  if (Array.isArray(input)) return { x: Number(input[0]), y: Number(input[1]), z: Number(input[2] || 0) };
  return { x: Number(input?.x), y: Number(input?.y), z: Number(input?.z || 0) };
}

export function isFinitePoint(point) {
  const p = toPoint3(point);
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

export function pointKey(point, tolerance = 1e-3) {
  const p = toPoint3(point);
  const scale = 1 / Math.max(tolerance, 1e-12);
  return [p.x, p.y, p.z].map((value) => Math.round(value * scale)).join(':');
}

export function distance3(a, b) {
  const pa = toPoint3(a);
  const pb = toPoint3(b);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
}

export function bboxOfPoints(points) {
  if (!points.length) return null;
  const min = { ...points[0] };
  const max = { ...points[0] };
  for (const point of points) {
    min.x = Math.min(min.x, point.x); min.y = Math.min(min.y, point.y); min.z = Math.min(min.z, point.z);
    max.x = Math.max(max.x, point.x); max.y = Math.max(max.y, point.y); max.z = Math.max(max.z, point.z);
  }
  return { min, max };
}
