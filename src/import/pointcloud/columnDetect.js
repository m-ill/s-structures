export const POINT_CLOUD_COLUMN_DETECT_VERSION = 'p3-m9-pointcloud-column-v1';

export function detectColumns(points, stories, options = {}) {
  const xyTol = options.xyTolerance ?? 0.12;
  const zTol = options.zTolerance ?? 0.12;
  const groups = new Map();
  for (const p of points) {
    const key = [p.x, p.y].map((v) => Math.round(v / xyTol)).join(':');
    const g = groups.get(key) || { x: 0, y: 0, points: [] };
    g.x += p.x; g.y += p.y; g.points.push(p); groups.set(key, g);
  }
  const columns = [];
  for (const g of groups.values()) {
    const cx = g.x / g.points.length; const cy = g.y / g.points.length;
    for (let i = 0; i < stories.length - 1; i += 1) {
      const z1 = stories[i].z; const z2 = stories[i + 1].z;
      const has1 = g.points.some((p) => Math.abs(p.z - z1) <= zTol);
      const has2 = g.points.some((p) => Math.abs(p.z - z2) <= zTol);
      const mids = g.points.filter((p) => p.z > z1 + zTol && p.z < z2 - zTol).length;
      if (has1 && has2 && mids >= (options.minMidPoints ?? 1)) {
        columns.push({ x: cx, y: cy, z1, z2, confidence: Math.min(1, (mids + 2) / 6) });
      }
    }
  }
  return columns;
}
