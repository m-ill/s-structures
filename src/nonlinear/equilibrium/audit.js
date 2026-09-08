import { NONLINEAR_EQUILIBRIUM_AUDIT_VERSION } from '../../metadata/numericVersions.js';
export { NONLINEAR_EQUILIBRIUM_AUDIT_VERSION };


export function buildNonlinearEquilibriumAudit(nodes = [], external = [], reactions = [], options = {}) {
  const expected = nodes.length * 6;
  const p = finiteVector(external, expected, 'external');
  const r = finiteVector(reactions, expected, 'reactions');
  const currentNodes = currentConfiguration(nodes, options.displacements);
  const load = sixResultants(currentNodes, p);
  const reaction = sixResultants(currentNodes, r);
  const closure = load.map((value, index) => value + reaction[index]);
  const forceScale = Math.max(1, normInf(load.slice(0, 3)), normInf(reaction.slice(0, 3)));
  const momentScale = Math.max(1, normInf(load.slice(3)), normInf(reaction.slice(3)));
  const forceResidual = normInf(closure.slice(0, 3)) / forceScale;
  const momentResidual = normInf(closure.slice(3)) / momentScale;
  const tolerance = positive(options.tolerance, 1e-7);
  return {
    version: NONLINEAR_EQUILIBRIUM_AUDIT_VERSION,
    ok: forceResidual <= tolerance && momentResidual <= tolerance,
    load,
    reaction,
    closure,
    forceResidual,
    momentResidual,
    tolerance,
    configuration: options.displacements == null ? 'reference' : 'current',
  };
}

function currentConfiguration(nodes, displacements) {
  if (displacements == null) return nodes;
  if (displacements.length !== nodes.length * 6) {
    const error = new RangeError(`displacements vector must contain ${nodes.length * 6} values.`);
    error.code = 'EQUILIBRIUM_AUDIT_DISPLACEMENT_SIZE';
    throw error;
  }
  return nodes.map((node, index) => ({
    ...node,
    x: Number(node.x || 0) + finite(displacements[index * 6], `displacements[${index * 6}]`),
    y: Number(node.y || 0) + finite(displacements[index * 6 + 1], `displacements[${index * 6 + 1}]`),
    z: Number(node.z || 0) + finite(displacements[index * 6 + 2], `displacements[${index * 6 + 2}]`),
  }));
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    const error = new TypeError(`${name} must be finite.`);
    error.code = 'EQUILIBRIUM_AUDIT_NONFINITE';
    throw error;
  }
  return number;
}

function sixResultants(nodes, vector) {
  const out = new Array(6).fill(0);
  nodes.forEach((node, index) => {
    const base = index * 6;
    const force = vector.slice(base, base + 3);
    const moment = vector.slice(base + 3, base + 6);
    out[0] += force[0];
    out[1] += force[1];
    out[2] += force[2];
    out[3] += moment[0] + Number(node.y || 0) * force[2] - Number(node.z || 0) * force[1];
    out[4] += moment[1] + Number(node.z || 0) * force[0] - Number(node.x || 0) * force[2];
    out[5] += moment[2] + Number(node.x || 0) * force[1] - Number(node.y || 0) * force[0];
  });
  return out;
}

function finiteVector(values, expected, name) {
  if (values == null || values.length !== expected) {
    const error = new RangeError(`${name} vector must contain ${expected} values.`);
    error.code = 'EQUILIBRIUM_AUDIT_VECTOR_SIZE';
    throw error;
  }
  return Array.from(values, (value, index) => {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      const error = new TypeError(`${name}[${index}] must be finite.`);
      error.code = 'EQUILIBRIUM_AUDIT_NONFINITE';
      throw error;
    }
    return number;
  });
}

function normInf(values) {
  return values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
