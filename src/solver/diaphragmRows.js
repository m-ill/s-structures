export function diaphragmRow(node, dof, group, add) {
  if (!group || ![0, 1, 5].includes(dof)) return null;
  const key = (name) => add(`dia:${group.id}:${name}`);
  if (dof === 0) return [[key('ux'), 1], [key('rz'), -(Number(node.y || 0) - group.center.y)]];
  if (dof === 1) return [[key('uy'), 1], [key('rz'), Number(node.x || 0) - group.center.x]];
  return [[key('rz'), 1]];
}
