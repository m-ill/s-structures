export function nodeMassValue(node) {
  const mass = node?.mass;
  if (Array.isArray(mass)) {
    return Math.max(0, ...mass.slice(0, 3).map((value) => Number(value) || 0));
  }
  return Math.max(0, Number(mass) || 0);
}

export function weightedCenter(nodes, weightOf = nodeMassValue) {
  const total = nodes.reduce((sum, node) => sum + weightOf(node), 0);
  if (total <= 0) return { x: null, y: null, total: 0 };
  return {
    x: round6(nodes.reduce((sum, node) => sum + Number(node.x || 0) * weightOf(node), 0) / total),
    y: round6(nodes.reduce((sum, node) => sum + Number(node.y || 0) * weightOf(node), 0) / total),
    total: round6(total),
  };
}

export function round6(value) {
  return Number(Number(value || 0).toFixed(6));
}
