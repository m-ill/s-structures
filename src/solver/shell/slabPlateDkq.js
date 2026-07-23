import {
  buildShellLocalFrame,
  mitc4PlateLocal,
  embedPlate24,
  pressureLoad24,
  quadAreaInPlane,
  symmetryError,
} from './shellElementMath.js';

export const SLAB_PLATE_MITC4_VERSION = 'p10-m9b-slab-plate-mitc4-v1';
export const SLAB_PLATE_DKQ_VERSION = SLAB_PLATE_MITC4_VERSION;
export const SLAB_PLATE_NUMERICAL_QUALIFICATION_VERSION = 'p10-m9b-plate-numerical-qualification-v2-mitc4';

export function buildSlabPlateMitc4(input = {}) {
  const nodes = input.nodes || [];
  const material = input.material || {};
  const E = positive(input.E, material.E);
  const nu = bounded(input.nu ?? material.nu, 0.3, 0, 0.49);
  const thickness = positive(input.t, input.thickness, 0.2);
  const frame = buildShellLocalFrame(nodes);
  if (!frame.ok) return frame;
  const local = mitc4PlateLocal(frame.projected, E, nu, thickness);
  if (!local.ok) return local;
  const embedded = embedPlate24(local.matrix, frame);
  const area = quadAreaInPlane(frame.projected);
  return {
    ok: true,
    version: SLAB_PLATE_MITC4_VERSION,
    id: input.id || null,
    formulation: 'plate',
    elementFormulation: 'MITC4',
    theory: 'Reissner-Mindlin',
    dofPerNode: 6,
    matrixSize: 24,
    matrix: embedded.matrix,
    localMatrix: local.matrix,
    transform: embedded.transform,
    frame,
    area,
    thickness,
    material: { E, nu, density: nonnegative(input.density, material.density, material.rho, 0) },
    bendingMatrix: local.Db,
    integration: local.integration,
    diagnostics: { symmetryError: symmetryError(embedded.matrix), maxWarpRatio: frame.maxWarpRatio },
    qualification: {
      version: SLAB_PLATE_NUMERICAL_QUALIFICATION_VERSION,
      status: 'pass',
      reason: null,
      allowedUse: 'qualified-static-linear-elastic-plate',
      designTransferAllowed: true,
      basis: ['rigid-body-invariants', 'constant-curvature-patch', 'rectangular-aspect-thickness-matrix', 'mesh-convergence'],
    },
    designEligibility: {
      allowed: true,
      reasonCodes: [],
    },
    limitations: [
      'MITC4 internal qualification covers linear-elastic static plates through aspect ratio 4 and short-side/thickness ratios 15 to 100; external XV-10 remains required for product release.',
      'Thin-plate pressure response excludes punching shear and reinforcement design.',
    ],
  };
}

// Deprecated compatibility entry point. New code should use buildSlabPlateMitc4.
export function buildSlabPlateDkq(input = {}) {
  return buildSlabPlateMitc4(input);
}

export function buildSlabPressureLoad(element, pressure) {
  return pressureLoad24(element.frame, element.area, Number(pressure) || 0);
}

export function plateClosedForm({ E, nu = 0.3, thickness, a, q, support = 'simply-supported' } = {}) {
  const D = E * thickness ** 3 / (12 * (1 - nu ** 2));
  const alpha = support === 'fixed' ? 0.00126 : 0.00406;
  return { D, alpha, wCenter: alpha * q * a ** 4 / D, support };
}

export function lumpedPlateMass(element) {
  const total = element.material.density * element.thickness * element.area;
  return { total, perNode: total / 4, translationalDofs: ['ux', 'uy', 'uz'], rotationalMassIncluded: false };
}

function positive(...values) { for (const value of values) { const n = Number(value); if (Number.isFinite(n) && n > 0) return n; } return 1; }
function nonnegative(...values) { for (const value of values) { const n = Number(value); if (Number.isFinite(n) && n >= 0) return n; } return 0; }
function bounded(value, fallback, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
