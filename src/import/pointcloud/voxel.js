export const POINT_CLOUD_VOXEL_VERSION = 'p3-m8-pointcloud-voxel-v1';

export function voxelDownsample(points, size = 0.05, limit = Infinity) {
  const cells = new Map();
  for (const p of points) {
    const key = [p.x, p.y, p.z].map((v) => Math.floor(v / size)).join(':');
    const cell = cells.get(key) || { x: 0, y: 0, z: 0, n: 0, color: p.color || null };
    cell.x += p.x; cell.y += p.y; cell.z += p.z; cell.n += 1;
    cells.set(key, cell);
  }
  const out = [];
  for (const cell of cells.values()) {
    if (out.length >= limit) break;
    out.push({ x: cell.x / cell.n, y: cell.y / cell.n, z: cell.z / cell.n, color: cell.color, count: cell.n });
  }
  return out;
}
