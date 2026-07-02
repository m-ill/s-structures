export const POINT_CLOUD_OUTLIER_VERSION = 'p3-m8-pointcloud-outlier-v1';

export function removeSparseOutliers(points, options = {}) {
  const radius = options.radius ?? 0.2;
  const minNeighbors = options.minNeighbors ?? 1;
  const inv = 1 / Math.max(radius, 1e-9);
  const buckets = new Map();
  for (let i = 0; i < points.length; i += 1) {
    const key = keyOf(points[i], inv);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
  }
  return points.filter((p, index) => neighborCount(p, index, points, buckets, inv, radius) >= minNeighbors);
}

function neighborCount(p, self, points, buckets, inv, radius) {
  let count = 0;
  const [cx, cy, cz] = keyOf(p, inv).split(':').map(Number);
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
    for (const i of buckets.get(`${cx + dx}:${cy + dy}:${cz + dz}`) || []) {
      if (i !== self && dist(p, points[i]) <= radius) count += 1;
    }
  }
  return count;
}

function keyOf(p, inv) { return [p.x, p.y, p.z].map((v) => Math.floor(v * inv)).join(':'); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
