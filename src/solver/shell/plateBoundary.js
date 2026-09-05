import { stableHash } from '../../core/stableHash.js';

export const PLATE_BOUNDARY_VERSION = 'p15-m4-plate-boundary-v1';
export const PLATE_BOUNDARY_TYPES = Object.freeze([
  'simply-supported-soft',
  'simply-supported-hard',
  'clamped',
]);

/**
 * Canonical boundary-condition owner for the reduced [w, rx, ry] plate DOFs.
 * The legacy `simply-supported` spelling is retained as a compatibility alias
 * for the soft condition, but the resolved support is always explicit.
 */
export function buildPlateBoundaryTemplate(mesh, support = 'simply-supported') {
  const requestedKind = String(support).toLowerCase();
  const kind = requestedKind === 'simply-supported' ? 'simply-supported-soft' : requestedKind;
  if (!PLATE_BOUNDARY_TYPES.includes(kind)) {
    throw boundaryError('SHELL_PLATE_BOUNDARY_INVALID', `Unsupported plate boundary: ${support}`);
  }
  if (!Array.isArray(mesh?.nodes)) {
    throw boundaryError('SHELL_PLATE_BOUNDARY_MESH_INVALID', 'Plate boundary resolution requires mesh nodes.');
  }

  const nodeIndex = new Map(mesh.nodes.map((node, index) => [node.id, index]));
  if (nodeIndex.size !== mesh.nodes.length) {
    throw boundaryError('SHELL_PLATE_BOUNDARY_NODE_DUPLICATE', 'Plate boundary node ids must be unique.');
  }
  const boundaryIds = new Set(Object.values(mesh.boundary || {}).flat());
  const xEdges = new Set([...(mesh.boundary?.u0 || []), ...(mesh.boundary?.u1 || [])]);
  const yEdges = new Set([...(mesh.boundary?.v0 || []), ...(mesh.boundary?.v1 || [])]);
  const constrained = [];

  for (const node of mesh.nodes) {
    if (!boundaryIds.has(node.id)) continue;
    constrain(constrained, nodeIndex, node.id, 'w', 0);
    if (kind === 'clamped') {
      constrain(constrained, nodeIndex, node.id, 'rx', 1);
      constrain(constrained, nodeIndex, node.id, 'ry', 2);
    } else if (kind === 'simply-supported-hard') {
      if (xEdges.has(node.id)) constrain(constrained, nodeIndex, node.id, 'rx', 1);
      if (yEdges.has(node.id)) constrain(constrained, nodeIndex, node.id, 'ry', 2);
    }
  }

  const core = {
    version: PLATE_BOUNDARY_VERSION,
    support: kind,
    requestedSupport: requestedKind,
    constrained,
    constrainedDofs: [...new Set(constrained.map((row) => row.activeDof))].sort((a, b) => a - b),
    preview: Object.fromEntries(mesh.nodes.map((node) => [
      node.id,
      constrained.filter((row) => row.nodeId === node.id).map((row) => row.component),
    ])),
  };
  return deepFreeze({ ...core, boundaryHash: stableHash(core) });
}

function constrain(rows, nodeIndex, nodeId, component, componentIndex) {
  const index = nodeIndex.get(nodeId);
  if (!Number.isInteger(index)) {
    throw boundaryError('SHELL_PLATE_NODE_MISSING', `Missing node ${nodeId}.`);
  }
  rows.push({ nodeId, component, activeDof: index * 3 + componentIndex });
}

function boundaryError(code, message) {
  return Object.assign(new Error(message), { code });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
