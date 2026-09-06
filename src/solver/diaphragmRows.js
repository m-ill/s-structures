export function diaphragmRow(node, dof, group, add) {
  if (!group || ![0, 1, 5].includes(dof)) return null;
  const key = (name) => add(`dia:${group.id}:${name}`);
  if (dof === 0) {
    const rotationCoefficient = -(Number(node.y || 0) - group.center.y);
    return rotationCoefficient === 0
      ? [[key('ux'), 1]]
      : [[key('ux'), 1], [key('rz'), rotationCoefficient]];
  }
  if (dof === 1) {
    const rotationCoefficient = Number(node.x || 0) - group.center.x;
    return rotationCoefficient === 0
      ? [[key('uy'), 1]]
      : [[key('uy'), 1], [key('rz'), rotationCoefficient]];
  }
  return [[key('rz'), 1]];
}
