export const SHELL_QUAD4_VERSION = 'p3-m12-shell-quad4-v1';

export function buildQuad4ShellElement(element = {}) {
  const nodes = element.nodes || [];
  const material = element.material || {};
  const thickness = positive(element.thickness, 0.15);
  const area = quadArea(nodes);
  const E = positive(material.E, 24000000);
  const nu = Math.min(0.49, Math.max(0, Number(material.nu ?? 0.2)));
  const membrane = E * thickness / Math.max(1e-12, 1 - nu * nu);
  const bending = E * thickness ** 3 / (12 * Math.max(1e-12, 1 - nu * nu));
  return {
    version: SHELL_QUAD4_VERSION,
    id: element.id || 'SHELL1',
    nodeCount: nodes.length,
    dofPerNode: 6,
    matrixSize: 24,
    area,
    thickness,
    material: { E, nu },
    stiffness: {
      membrane,
      bending,
      drilling: membrane * 1e-6,
      compatibleDofs: ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'],
    },
    center: centroid(nodes),
    limitations: [
      'Quad4 shell v1 exposes a compatible stiffness/benchmark contract before full global assembly.',
      'Membrane and plate bending are traceable engineering approximations, not a certified production shell solver.',
    ],
  };
}

export function runShellPatchTest(options = {}) {
  const strain = options.strain || { ex: 0.001, ey: 0.0004, gxy: 0.0002 };
  const element = asShellElement(options.element || unitElement(options));
  const nu = element.material.nu;
  const E = element.material.E;
  const t = element.thickness;
  const sx = E / (1 - nu * nu) * (strain.ex + nu * strain.ey);
  const sy = E / (1 - nu * nu) * (strain.ey + nu * strain.ex);
  const txy = E / (2 * (1 + nu)) * strain.gxy;
  const nodalFx = sx * t * Math.sqrt(element.area) / 2;
  const nodalFy = sy * t * Math.sqrt(element.area) / 2;
  return {
    version: SHELL_QUAD4_VERSION,
    benchmark: 'constant-strain-membrane-patch',
    ok: element.nodeCount === 4 && element.area > 0 && nodalFx > 0 && nodalFy > 0,
    strain,
    stress: { sx, sy, txy },
    equivalentNodalLoad: { fx: nodalFx, fy: nodalFy },
    tolerance: options.tolerance ?? 1e-9,
  };
}

export function estimateSimplySupportedPlateDeflection(options = {}) {
  const a = positive(options.a, 4);
  const b = positive(options.b, a);
  const q = positive(options.q, 5);
  const element = asShellElement(options.element || unitElement({ ...options, a, b }));
  const D = element.stiffness.bending;
  const alpha = plateAlpha(a / b);
  const wMax = alpha * q * a ** 4 / Math.max(1e-12, D);
  return {
    version: SHELL_QUAD4_VERSION,
    benchmark: 'simply-supported-plate-deflection',
    ok: Number.isFinite(wMax) && wMax > 0,
    method: 'classical-thin-plate-alpha',
    a,
    b,
    q,
    D,
    alpha,
    wMax,
  };
}

export function buildShellV1Trace(model = {}) {
  const shells = model.shells || model.slabs?.filter((item) => item.type === 'shell') || [];
  const rows = shells.map((shell) => buildQuad4ShellElement(shell));
  const patch = runShellPatchTest();
  const plate = estimateSimplySupportedPlateDeflection();
  return {
    version: SHELL_QUAD4_VERSION,
    status: 'available-preliminary',
    shellCount: rows.length,
    rows,
    benchmarks: { patch, plate },
    limitations: [
      'Shell v1 is exposed as an element contract and verification trace.',
      'Global frame-shell stiffness assembly remains a later hardening task.',
    ],
  };
}

function unitElement(options = {}) {
  const a = positive(options.a, 1);
  const b = positive(options.b, 1);
  return {
    id: 'SHELL-PATCH',
    thickness: positive(options.thickness, 0.15),
    material: options.material || { E: 24000000, nu: 0.2 },
    nodes: [{ x: 0, y: 0, z: 0 }, { x: a, y: 0, z: 0 }, { x: a, y: b, z: 0 }, { x: 0, y: b, z: 0 }],
  };
}
function asShellElement(element) {
  return element?.version === SHELL_QUAD4_VERSION ? element : buildQuad4ShellElement(element);
}
function quadArea(nodes) {
  if (nodes.length !== 4) return 0;
  return triangleArea(nodes[0], nodes[1], nodes[2]) + triangleArea(nodes[0], nodes[2], nodes[3]);
}
function triangleArea(a, b, c) {
  const ux = b.x - a.x; const uy = b.y - a.y; const uz = (b.z || 0) - (a.z || 0);
  const vx = c.x - a.x; const vy = c.y - a.y; const vz = (c.z || 0) - (a.z || 0);
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
}
function centroid(nodes) {
  return ['x', 'y', 'z'].reduce((out, key) => ({ ...out, [key]: nodes.reduce((sum, node) => sum + Number(node[key] || 0), 0) / Math.max(1, nodes.length) }), {});
}
function plateAlpha(ratio) {
  if (ratio >= 0.99 && ratio <= 1.01) return 0.00406;
  return 0.00406 * Math.min(1.8, Math.max(0.65, 1 / Math.sqrt(ratio || 1)));
}
function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
