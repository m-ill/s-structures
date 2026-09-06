import { stableHash } from '../core/stableHash.js';
import { MASS_6DOF_COMPONENTS, normalizeNodeMass6Dof } from '../core/massSchema.js';

export const MASS_6DOF_VERSION = 'p14-m4-six-dof-lumped-mass-v1';
export { MASS_6DOF_COMPONENTS, normalizeNodeMass6Dof } from '../core/massSchema.js';

export function addDirectNodeMass6Dof(mass, nodes = [], indexById = {}, options = {}) {
  const translationOwnedElsewhere = options.translationOwnedElsewhere === true;
  const rows = [];
  for (const node of nodes) {
    const base = Number(indexById[node.id]) * 6;
    if (!Number.isFinite(base) || node.mass == null) continue;
    const vector = normalizeNodeMass6Dof(node.mass, { label: `${node.id}.mass` });
    const start = translationOwnedElsewhere ? 3 : 0;
    for (let component = start; component < 6; component += 1) mass[base + component] += vector[component];
    const owned = translationOwnedElsewhere ? [0, 0, 0, ...vector.slice(3)] : vector;
    if (owned.some((value) => value > 0)) rows.push({
      nodeId: node.id,
      source: 'node.mass',
      components: owned,
      translationOwnedElsewhere,
    });
  }
  return rows;
}

export function buildSixDofMassAudit(model = {}, mass = [], options = {}) {
  const nodes = model.nodes || [];
  const totals = new Array(6).fill(0);
  nodes.forEach((_node, nodeIndex) => {
    for (let component = 0; component < 6; component += 1) {
      totals[component] += Number(mass[nodeIndex * 6 + component]) || 0;
    }
  });
  const directRows = nodes.map((node) => ({
    nodeId: node.id,
    components: normalizeNodeMass6Dof(node.mass, { label: `${node.id}.mass` }),
  })).filter((row) => row.components.some((value) => value > 0));
  const core = {
    version: MASS_6DOF_VERSION,
    formulation: 'full-six-dof-diagonal-lumped-mass-before-constraint-reduction',
    components: MASS_6DOF_COMPONENTS,
    totals,
    translationalMass: totals.slice(0, 3),
    directRotationalInertia: totals.slice(3, 6),
    nodeMassRows: directRows,
    massSourceUsed: options.massSourceUsed === true,
    directTranslationDeduplicated: options.massSourceUsed === true,
    units: {
      translation: model.units?.mass || 't',
      rotation: `${model.units?.mass || 't'}.${model.units?.length || 'm'}2`,
    },
  };
  return Object.freeze({ ...core, auditHash: stableHash(core) });
}

export function buildDiaphragmMassAudit({ nodes = [], groups = [], mass = [], map, reducedMass } = {}) {
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const rows = groups.map((group) => {
    const offsetPolarInertia = [0, 0, 0];
    const directRotationalInertia = [0, 0, 0];
    const translationalMass = [0, 0, 0];
    for (const nodeId of group.nodeIds || []) {
      const index = nodeIndex.get(nodeId);
      if (index == null) continue;
      const node = nodes[index];
      const vector = Array.from({ length: 6 }, (_item, component) => Number(mass[index * 6 + component]) || 0);
      const dx = Number(node.x || 0) - Number(group.center?.x || 0);
      const dy = Number(node.y || 0) - Number(group.center?.y || 0);
      const dz = Number(node.z || 0) - Number(group.center?.z || node.z || 0);
      for (let axis = 0; axis < 3; axis += 1) {
        translationalMass[axis] += vector[axis];
        directRotationalInertia[axis] += vector[3 + axis];
      }
      offsetPolarInertia[0] += vector[1] * dz ** 2 + vector[2] * dy ** 2;
      offsetPolarInertia[1] += vector[0] * dz ** 2 + vector[2] * dx ** 2;
      offsetPolarInertia[2] += vector[0] * dy ** 2 + vector[1] * dx ** 2;
    }
    const columnKeys = map?.columnKeys || [];
    const reducedRz = columnKeys.indexOf(`dia:${group.id}:rz`);
    const expectedRz = directRotationalInertia[2] + offsetPolarInertia[2];
    const actualRz = reducedRz >= 0 ? Number(reducedMass?.[reducedRz]?.[reducedRz]) || 0 : null;
    const tolerance = 1e-10 * Math.max(1, Math.abs(expectedRz));
    return {
      diaphragmId: group.id,
      center: { ...group.center },
      translationalMass,
      directRotationalInertia,
      offsetPolarInertia,
      expectedRz,
      reducedRz,
      actualRz,
      rzConservationResidual: actualRz == null ? null : actualRz - expectedRz,
      passed: actualRz == null || Math.abs(actualRz - expectedRz) <= tolerance,
      ownership: 'direct rotational inertia and translational offset inertia are additive, never substituted or double-counted',
    };
  });
  const core = {
    version: MASS_6DOF_VERSION,
    method: 'transpose(T)-M-T',
    rows,
    passed: rows.every((row) => row.passed),
  };
  return Object.freeze({ ...core, auditHash: stableHash(core) });
}
