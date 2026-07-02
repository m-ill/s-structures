export const WALL_SLAB_EQUIVALENT_VERSION = 'p3-m12-wall-slab-equivalent';

export function wallToMidPierMember(wall) {
  const z1 = Math.min(...wall.nodes.map((node) => node.z || 0));
  const z2 = Math.max(...wall.nodes.map((node) => node.z || 0));
  const cx = avg(wall.nodes, 'x'); const cy = avg(wall.nodes, 'y');
  const t = Number(wall.thickness || 0.2); const length = Number(wall.length || Math.max(1, wall.width || 1));
  return {
    version: WALL_SLAB_EQUIVALENT_VERSION,
    nodes: [{ id: `${wall.id}-b`, x: cx, y: cy, z: z1 }, { id: `${wall.id}-t`, x: cx, y: cy, z: z2 }],
    member: { id: `${wall.id}-pier`, n1: `${wall.id}-b`, n2: `${wall.id}-t`, type: 'frame', secId: wall.secId || `${wall.id}-sec`, matId: wall.matId || 'concrete' },
    section: { id: wall.secId || `${wall.id}-sec`, type: 'RECT', A: t * length, Iy: length * t ** 3 / 12, Iz: t * length ** 3 / 12, J: t * length * (t ** 2 + length ** 2) / 12, Zy: t * length ** 2 / 6, Zz: length * t ** 2 / 6 },
  };
}

export function summarizeSemiRigidDiaphragm(model = {}) {
  const rows = (model.diaphragms || []).map((item) => ({ id: item.id, type: item.type, nodeCount: item.nodeIds?.length || 0, stiffness: item.inPlaneStiffness || null }));
  return { version: WALL_SLAB_EQUIVALENT_VERSION, semiRigidCount: rows.filter((row) => row.type === 'semiRigid').length, rows };
}

function avg(nodes, key) {
  return nodes.reduce((sum, node) => sum + Number(node[key] || 0), 0) / Math.max(1, nodes.length);
}
