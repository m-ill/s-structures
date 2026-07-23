import {
  buildShellLocalFrame,
  dkqPlateLocal,
  embedPlate24,
  pressureLoad24,
  quadAreaInPlane,
  symmetryError,
} from './shellElementMath.js';

export const SLAB_PLATE_DKQ_VERSION = 'p10-m9b-slab-plate-dkq-v2-qualification-blocked';
export const SLAB_PLATE_NUMERICAL_QUALIFICATION_VERSION = 'p10-m9b-plate-numerical-qualification-v1';

export function buildSlabPlateDkq(input = {}) {
  const nodes = input.nodes || [];
  const material = input.material || {};
  const E = positive(input.E, material.E);
  const nu = bounded(input.nu ?? material.nu, 0.3, 0, 0.49);
  const thickness = positive(input.t, input.thickness, 0.2);
  const frame = buildShellLocalFrame(nodes);
  if (!frame.ok) return frame;
  const local = dkqPlateLocal(frame.projected, E, nu, thickness);
  if (!local.ok) return local;
  const embedded = embedPlate24(local.matrix, frame);
  const area = quadAreaInPlane(frame.projected);
  return {
    ok: true,
    version: SLAB_PLATE_DKQ_VERSION,
    id: input.id || null,
    formulation: 'plate',
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
      status: 'blocked',
      reason: 'SHELL_PLATE_NUMERICAL_QUALIFICATION_FAILED',
      allowedUse: 'diagnostic-only',
      designTransferAllowed: false,
    },
    designEligibility: {
      allowed: false,
      reasonCodes: ['SHELL_PLATE_NUMERICAL_QUALIFICATION_FAILED'],
    },
    limitations: [
      'Plate bending is not numerically qualified for rectangular, high-aspect-ratio, thick, or thin panels; use diagnostic results only.',
      'Thin-plate pressure response excludes punching shear and reinforcement design.',
    ],
  };
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
