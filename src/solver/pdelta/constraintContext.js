import { diaphragmNodeIds } from '../../core/diaphragmGroupSource.js';

export function directDiaphragmIssues(model) {
  const nodes = new Map((model.nodes || []).map(node => [node.id, node]));
  const owners = new Map(), issues = [];
  for (const group of model.diaphragms || []) {
    if (group.type !== 'rigid') continue;
    const ids = diaphragmNodeIds(group, model);
    const points = ids.map(id => nodes.get(id));
    const invalid = ids.length < 2 || new Set(ids).size !== ids.length
      || points.some(node => !node || !['x', 'y', 'z'].every(key => Number.isFinite(Number(node[key]))));
    if (invalid) {
      issues.push({ code: 'DIRECT_DIAPHRAGM_INVALID_NODES', diaphragmId: group.id });
      continue;
    }
    if (points.some(node => Math.abs(Number(node.z) - Number(points[0].z)) > 1e-8)) {
      issues.push({ code: 'DIRECT_DIAPHRAGM_NONPLANAR', diaphragmId: group.id });
    }
    if (group.center && !['x', 'y'].every(key => Number.isFinite(Number(group.center[key])))) {
      issues.push({ code: 'DIRECT_DIAPHRAGM_INVALID_CENTER', diaphragmId: group.id });
    }
    for (const id of ids) {
      if (owners.has(id)) issues.push({ code: 'DIRECT_DIAPHRAGM_OVERLAP', nodeId: id, diaphragmIds: [owners.get(id), group.id] });
      owners.set(id, group.id);
    }
  }
  return issues;
}

// A reduced index is not a node's six-component DOF index.
export function constraintCoordinateKinds(constraint) {
  return constraint.reducedDofs.map(row => {
    const component = row.key.split(':').at(-1);
    return ['rx', 'ry', 'rz', '3', '4', '5'].includes(component) ? 'rotation' : 'translation';
  });
}

export function directMemoryAdmission(model, options = {}) {
  const fullDofs = (model.nodes?.length || 0) * 6;
  // Conservative admission estimate for nested JS matrices, transforms and
  // simultaneous scratch. This is not a measurement of actual heap usage.
  const estimatedBytes = 240 * fullDofs ** 2;
  const maxBytes = options.maxWorkingBytes ?? model.analysisSettings?.maxWorkingBytes ?? 512 * 1024 ** 2;
  return { ok: Number.isFinite(maxBytes) && maxBytes > 0 && estimatedBytes <= maxBytes,
    fullDofs, estimatedBytes, maxBytes, basis: 'conservative-dense-working-set-estimate' };
}
