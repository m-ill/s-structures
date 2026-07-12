import { diaphragmRow } from './diaphragmRows.js';

export function buildDiaphragmDofMap(nodes, groups = []) {
  const groupByNode = new Map();
  groups.forEach((group) => group.nodeIds.forEach((id) => groupByNode.set(id, group)));
  const col = new Map();
  const rows = [];
  const add = (key) => {
    if (!col.has(key)) col.set(key, col.size);
    return col.get(key);
  };
  nodes.forEach((node, ni) => {
    const group = groupByNode.get(node.id);
    for (let dof = 0; dof < 6; dof += 1) {
      const row = diaphragmRow(node, dof, group, add);
      rows[ni * 6 + dof] = row || [[add(`n:${node.id}:${dof}`), 1]];
    }
  });
  return {
    rows,
    ncols: col.size,
    diaphragmCount: groups.length,
    columnKeys: [...col.keys()],
  };
}
