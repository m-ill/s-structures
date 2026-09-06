import { stableHash } from '../../core/stableHash.js';
import { rigidRotationVector } from './rigidBodyModes.js';

export const RIGID_MODE_GAUGE_VERSION = 'p15-m2-unloaded-rigid-mode-gauge-v1';

export function translationFreeRigidRotationComponents(nodesInput = [], componentsInput = [], relativeTolerance = 1e-12) {
  const nodes = Array.from(nodesInput || []);
  const components = [...new Set(Array.from(componentsInput || [], Number))]
    .filter((component) => Number.isInteger(component) && component >= 3 && component <= 5)
    .sort((first, second) => first - second);
  const origin = nodes[0] || {};
  const coordinateScale = Math.max(1, ...nodes.flatMap((node) => [
    Number(node.x || 0) - Number(origin.x || 0),
    Number(node.y || 0) - Number(origin.y || 0),
    Number(node.z || 0) - Number(origin.z || 0),
  ].map(Math.abs)));
  const tolerance = coordinateScale * finitePositive(relativeTolerance, 1e-12);
  return components.filter((component) => {
    const vector = rigidRotationVector(nodes, component);
    const translationMaximum = Math.max(
      0,
      ...nodes.flatMap((_node, nodeIndex) => vector.slice(nodeIndex * 6, nodeIndex * 6 + 3).map(Math.abs)),
    );
    return translationMaximum <= tolerance;
  });
}

/**
 * Resolves exact rigid-rotation null modes without adding artificial
 * stiffness.  A mode may receive one zero-valued coordinate gauge only when
 * its generalized load is zero within the deterministic assembly tolerance.
 * Any loaded mode remains a fail-closed mechanism.
 */
export function resolveUnloadedRigidRotationGauges(input = {}) {
  const nodes = Array.from(input.nodes || []);
  const dimension = nodes.length * 6;
  const force = Array.from(input.force || input.loads || [], Number);
  if (!nodes.length || force.length !== dimension || force.some((value) => !Number.isFinite(value))) {
    return failure('RIGID_MODE_GAUGE_INPUT_INVALID', { dimension, forceLength: force.length });
  }
  const fixedDofs = new Set(Array.from(input.fixedDofs || [], Number));
  const components = [...new Set(Array.from(input.components || input.rigidRotationComponents || [], Number))]
    .filter((component) => Number.isInteger(component) && component >= 3 && component <= 5)
    .sort((first, second) => first - second);
  const relativeTolerance = finitePositive(input.relativeTolerance, 1e-12);
  const forceMaximum = Math.max(0, ...force.map((value) => Math.abs(value)));
  const rows = components.map((component) => {
    const vector = rigidRotationVector(nodes, component);
    const generalizedLoad = dot(vector, force);
    const absoluteWorkScale = vector.reduce(
      (sum, coefficient, index) => sum + Math.abs(coefficient * force[index]),
      0,
    );
    const vectorMaximum = Math.max(1, ...vector.map((value) => Math.abs(value)));
    const translationMaximum = Math.max(
      0,
      ...nodes.flatMap((_node, nodeIndex) => vector.slice(nodeIndex * 6, nodeIndex * 6 + 3).map(Math.abs)),
    );
    const assemblyNoiseFloor = forceMaximum * vectorMaximum * Math.max(1, dimension) * 1e-14;
    const workTolerance = Math.max(absoluteWorkScale * relativeTolerance, assemblyNoiseFloor);
    const loaded = Math.abs(generalizedLoad) > workTolerance;
    const candidateDof = selectGaugeDof(nodes, fixedDofs, vector, component);
    return Object.freeze({
      component,
      axis: ['x', 'y', 'z'][component - 3],
      generalizedLoad,
      absoluteWorkScale,
      workTolerance,
      normalizedLoadProjection: absoluteWorkScale > 0
        ? Math.abs(generalizedLoad) / absoluteWorkScale
        : 0,
      translationMaximum,
      loaded,
      candidateDof,
      candidateLabel: candidateDof == null ? null : dofLabel(nodes, candidateDof),
    });
  });
  const unavailable = rows.filter((row) => row.candidateDof == null);
  if (unavailable.length) {
    return failure('RIGID_MODE_GAUGE_DOF_UNAVAILABLE', {
      components,
      rows,
      relativeTolerance,
    });
  }
  const loadedModes = rows.filter((row) => row.loaded);
  const gaugeDofs = loadedModes.length ? [] : rows.map((row) => row.candidateDof);
  const core = {
    version: RIGID_MODE_GAUGE_VERSION,
    ok: loadedModes.length === 0,
    reason: loadedModes.length ? 'LOADED_RIGID_ROTATION_MODE' : null,
    policy: 'zero-coordinate-gauge-only-for-load-orthogonal-exact-rigid-rotation',
    artificialStiffnessAdded: false,
    relativeTolerance,
    components,
    rows,
    loadedModes,
    gaugeDofs,
    gaugeLabels: gaugeDofs.map((dof) => dofLabel(nodes, dof)),
  };
  return deepFreeze({ ...core, auditHash: stableHash(core) });
}

function selectGaugeDof(nodes, fixedDofs, vector, component) {
  const candidates = nodes
    .map((node, nodeIndex) => ({
      node,
      nodeIndex,
      dof: nodeIndex * 6 + component,
      magnitude: Math.abs(vector[nodeIndex * 6 + component] || 0),
    }))
    .filter((row) => !fixedDofs.has(row.dof) && row.magnitude > 1e-14)
    .sort((first, second) => (
      Number(Boolean(second.node.support)) - Number(Boolean(first.node.support))
      || first.nodeIndex - second.nodeIndex
    ));
  return candidates[0]?.dof ?? null;
}

function dofLabel(nodes, dof) {
  const components = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  const node = nodes[Math.floor(dof / 6)];
  return node ? `${node.id}.${components[dof % 6]}` : `dof:${dof}`;
}

function dot(first, second) {
  return first.reduce((sum, value, index) => sum + value * second[index], 0);
}

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function failure(reason, details) {
  const core = {
    version: RIGID_MODE_GAUGE_VERSION,
    ok: false,
    reason,
    artificialStiffnessAdded: false,
    ...details,
  };
  return deepFreeze({ ...core, auditHash: stableHash(core) });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
