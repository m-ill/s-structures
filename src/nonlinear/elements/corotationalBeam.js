export const COROTATIONAL_BEAM_VERSION = 'p3-m14-corotational-beam';

export function buildCorotationalBeamState(nodeI = {}, nodeJ = {}, u = {}) {
  const xi = point(nodeI, u[nodeI.id]);
  const xj = point(nodeJ, u[nodeJ.id]);
  const dx = xj.map((v, i) => v - xi[i]);
  const length = Math.hypot(...dx);
  const e1 = length > 0 ? dx.map((v) => v / length) : [1, 0, 0];
  return {
    version: COROTATIONAL_BEAM_VERSION,
    nodeI: nodeI.id,
    nodeJ: nodeJ.id,
    length,
    rotation: { e1 },
  };
}

export function geometricStiffnessTrace({ axialForce = 0, length = 0 } = {}) {
  const L = Math.max(1e-12, Number(length) || 0);
  const kg = Number(axialForce || 0) / L;
  return {
    version: COROTATIONAL_BEAM_VERSION,
    method: 'beam-column-geometric-stiffness-trace',
    axialForce: Number(axialForce) || 0,
    length: L,
    kg,
    matrix2: [[kg, -kg], [-kg, kg]],
  };
}

export function estimateCantileverLargeDisplacement({ P = 0, L = 1, E = 1, I = 1 } = {}) {
  const linear = Number(P) * Number(L) ** 3 / (3 * Number(E) * Number(I));
  const ratio = Math.abs(linear) / Math.max(1e-12, Number(L));
  const displacement = linear / (1 + 0.32 * ratio ** 2);
  return {
    version: COROTATIONAL_BEAM_VERSION,
    method: 'corotational-cantilever-large-displacement-screening',
    linear,
    displacement,
  };
}

function point(node, disp = []) {
  return [node.x, node.y, node.z].map((v, i) => Number(v || 0) + Number(disp[i] || 0));
}
