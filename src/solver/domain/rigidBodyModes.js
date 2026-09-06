export function rigidRotationVector(nodes, component) {
  const origin = nodes[0] || {};
  const ox = Number(origin.x || 0);
  const oy = Number(origin.y || 0);
  const oz = Number(origin.z || 0);
  const vector = new Array(nodes.length * 6).fill(0);
  nodes.forEach((node, index) => {
    const x = Number(node.x || 0) - ox;
    const y = Number(node.y || 0) - oy;
    const z = Number(node.z || 0) - oz;
    const translation = component === 3
      ? [0, -z, y]
      : component === 4 ? [z, 0, -x] : [-y, x, 0];
    vector[index * 6] = translation[0];
    vector[index * 6 + 1] = translation[1];
    vector[index * 6 + 2] = translation[2];
    vector[index * 6 + component] = 1;
  });
  return vector;
}
