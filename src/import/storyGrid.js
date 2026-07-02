export function inferStories(nodes, options = {}) {
  const tolerance = options.zTolerance ?? options.tolerance ?? 1e-3;
  const groups = groupAxis(finiteNodes(nodes, 'z'), 'z', tolerance);
  return groups.map((group, index) => ({
    id: `s${index + 1}`,
    z: group.position,
    height: index ? group.position - groups[index - 1].position : 0,
    confidence: group.count >= 2 ? 0.9 : 0.6,
    evidence: { nodeCount: group.count },
  }));
}

export function inferGrids(nodes, options = {}) {
  const tolerance = options.gridTolerance ?? options.tolerance ?? 1e-3;
  const xNodes = finiteNodes(nodes, 'x');
  const yNodes = finiteNodes(nodes, 'y');
  return [
    ...groupAxis(xNodes, 'x', tolerance).map((group, index) => gridRow('X', index, group)),
    ...groupAxis(yNodes, 'y', tolerance).map((group, index) => gridRow('Y', index, group)),
  ];
}

function finiteNodes(nodes, axis) {
  return (nodes || []).filter((node) => Number.isFinite(node?.[axis]));
}

function groupAxis(nodes, axis, tolerance) {
  const sorted = [...nodes].sort((a, b) => a[axis] - b[axis]);
  const groups = [];
  for (const node of sorted) {
    const last = groups.at(-1);
    if (!last || Math.abs(last.position - node[axis]) > tolerance) groups.push({ values: [node[axis]], count: 1, position: node[axis] });
    else {
      last.values.push(node[axis]);
      last.count += 1;
      last.position = last.values.reduce((sum, value) => sum + value, 0) / last.values.length;
    }
  }
  return groups;
}

function gridRow(axis, index, group) {
  return { axis, label: `${axis}${index + 1}`, position: group.position, confidence: group.count >= 2 ? 0.9 : 0.55 };
}
