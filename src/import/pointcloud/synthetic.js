export const POINT_CLOUD_SYNTHETIC_VERSION = 'p3-m9-pointcloud-synthetic-v1';

export function generateSyntheticPointCloud(model, options = {}) {
  const step = options.step ?? 1;
  const points = [];
  const columns = []; const beams = [];
  const nodeMap = new Map(model.nodes.map((n) => [n.id, n]));
  for (const m of model.members) {
    const a = nodeMap.get(m.n1); const b = nodeMap.get(m.n2);
    if (!a || !b) continue;
    const role = m.design?.role || (Math.abs((a.z || 0) - (b.z || 0)) > 0.5 ? 'column' : 'beam');
    sampleLine(a, b, step).forEach((p) => points.push({ ...p, role }));
    if (role === 'column') columns.push({ x: a.x, y: a.y, z1: Math.min(a.z, b.z), z2: Math.max(a.z, b.z) });
    if (role === 'beam') beams.push({ from: [a.x, a.y, a.z], to: [b.x, b.y, b.z] });
  }
  return { points, groundTruth: { columns, beams, stories: uniqueZ(model.nodes) } };
}

function sampleLine(a, b, step) {
  const len = Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  const n = Math.max(2, Math.ceil(len / step));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z || 0, b.z || 0, t) };
  });
}
function lerp(a, b, t) { return a + (b - a) * t; }
function uniqueZ(nodes) { return [...new Set(nodes.map((n) => Math.round((n.z || 0) * 1000) / 1000))].sort((a, b) => a - b); }
