import {
  buildShellLocalFrame,
  mitc4PlateLocal,
  embedPlate24,
  matrixIsFinite,
  pressureLoad24,
  q4GeometryQuality,
  quadAreaInPlane,
  symmetryError,
} from './shellElementMath.js';

export const SLAB_PLATE_MITC4_VERSION = 'p10-m9b-slab-plate-mitc4-v5-finite-geometry-qualified';
export const SLAB_PLATE_NUMERICAL_QUALIFICATION_VERSION = 'p10-m9b-plate-numerical-qualification-v2-mitc4';
export const MITC4_QUALIFIED_ELEMENT_ASPECT_RATIO_MAX = 4;
// A reciprocal condition number of 0.1 limits the Q4 Jacobian condition
// number to 10 at the center and four natural corners. It admits the qualified
// 4:1 rectangle (rcond 0.25) and a 30-degree unit rhombus (about 0.268), while
// rejecting near-collapsed shapes such as a 5-degree rhombus (about 0.0437).
export const MITC4_QUALIFIED_JACOBIAN_RECIPROCAL_CONDITION_MIN = 0.1;
export const MITC4_QUALIFIED_WARP_RATIO_MAX = 1e-2;

export function buildSlabPlateMitc4(input = {}) {
  const nodes = input.nodes || [];
  const material = input.material || {};
  const properties = resolveProperties(input, material, 0.3);
  if (!properties.ok) return properties;
  const { E, nu, thickness, density } = properties;
  const frame = buildShellLocalFrame(nodes);
  if (!frame.ok) return frame;
  const local = mitc4PlateLocal(frame.projected, E, nu, thickness);
  if (!local.ok) return local;
  const embedded = embedPlate24(local.matrix, frame);
  if (!matrixIsFinite(local.matrix) || !matrixIsFinite(embedded.matrix)) {
    return { ok: false, reason: 'SHELL_STIFFNESS_NONFINITE' };
  }
  const area = quadAreaInPlane(frame.projected);
  if (!Number.isFinite(density * thickness * area)) return { ok: false, reason: 'SHELL_MASS_NONFINITE' };
  const geometry = elementGeometry(frame.projected, thickness);
  const aspectQualified = geometry.aspectRatio
    <= MITC4_QUALIFIED_ELEMENT_ASPECT_RATIO_MAX * (1 + 1e-12);
  const jacobianQualified = geometry.minimumJacobianReciprocalCondition
    >= MITC4_QUALIFIED_JACOBIAN_RECIPROCAL_CONDITION_MIN * (1 - 1e-12);
  const warpQualified = frame.maxWarpRatio
    <= MITC4_QUALIFIED_WARP_RATIO_MAX * (1 + 1e-12);
  const geometryBlockers = [
    !aspectQualified ? 'SHELL_ELEMENT_ASPECT_RATIO_OUTSIDE_QUALIFIED_RANGE' : null,
    !jacobianQualified ? 'SHELL_ELEMENT_JACOBIAN_CONDITION_OUTSIDE_QUALIFIED_RANGE' : null,
    !warpQualified ? 'SHELL_WARP_EXCEEDS_QUALIFIED_LIMIT' : null,
  ].filter(Boolean);
  const geometryQualified = geometryBlockers.length === 0;
  const geometryBlocker = geometryBlockers[0] || null;
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
    material: { E, nu, density },
    geometry,
    bendingMatrix: local.Db,
    integration: local.integration,
    pressureLoadIntegration: 'q4-consistent-2x2',
    diagnostics: {
      symmetryError: symmetryError(embedded.matrix),
      maxWarpRatio: frame.maxWarpRatio,
      minimumJacobianReciprocalCondition: geometry.minimumJacobianReciprocalCondition,
    },
    qualification: {
      version: SLAB_PLATE_NUMERICAL_QUALIFICATION_VERSION,
      status: geometryQualified ? 'pass' : 'blocked',
      reason: geometryBlocker,
      allowedUse: geometryQualified ? 'qualified-static-linear-elastic-plate' : 'diagnostic-only',
      designTransferAllowed: false,
      modelMeshConvergenceRequired: true,
      elementAspectRatioMax: MITC4_QUALIFIED_ELEMENT_ASPECT_RATIO_MAX,
      jacobianReciprocalConditionMin: MITC4_QUALIFIED_JACOBIAN_RECIPROCAL_CONDITION_MIN,
      warpRatioMax: MITC4_QUALIFIED_WARP_RATIO_MAX,
      basis: [
        'rigid-body-invariants',
        'constant-curvature-patch',
        'rectangular-aspect-thickness-matrix',
        'q4-jacobian-condition-number',
        'mesh-convergence',
      ],
    },
    designEligibility: {
      allowed: false,
      reasonCodes: [...geometryBlockers, 'SHELL_MODEL_MESH_CONVERGENCE_REQUIRED'],
    },
    limitations: [
      'MITC4 element qualification requires edge-aspect ratio at most 4, Q4 Jacobian condition number at most 10, and node warp ratio at most 1%.',
      'The panel short-edge/thickness range exercised by the formulation benchmarks is evidence metadata, not an element-local acceptance limit.',
      'Element formulation qualification does not certify a user model mesh; design transfer requires model-level mesh-convergence provenance.',
      'Pressure is a linear initial-geometry dead load integrated consistently over the element reference plane.',
      'Thin-plate pressure response excludes punching shear and reinforcement design.',
    ],
  };
}

export function buildSlabPressureLoad(element, pressure) {
  if (pressure == null || typeof pressure === 'boolean' || (typeof pressure === 'string' && pressure.trim() === '')) {
    throw Object.assign(new RangeError('Shell pressure must be finite.'), { code: 'SHELL_PRESSURE_INVALID' });
  }
  const value = strictNumeric(pressure);
  if (!Number.isFinite(value)) {
    throw Object.assign(new RangeError('Shell pressure must be finite.'), { code: 'SHELL_PRESSURE_INVALID' });
  }
  if (!Number.isFinite(value * element.area)) {
    throw Object.assign(new RangeError('Shell pressure resultant is not finite.'), { code: 'SHELL_PRESSURE_LOAD_NONFINITE' });
  }
  const load = pressureLoad24(element.frame, element.area, value);
  if (load.some((entry) => !Number.isFinite(entry))) {
    throw Object.assign(new RangeError('Shell pressure load is not finite.'), { code: 'SHELL_PRESSURE_LOAD_NONFINITE' });
  }
  return load;
}

export function plateClosedForm({ E, nu = 0.3, thickness, a, q, support = 'simply-supported' } = {}) {
  const values = [E, nu, thickness, a, q].map(strictNumeric);
  if (![values[0], values[2], values[3]].every((value) => Number.isFinite(value) && value > 0)
    || !Number.isFinite(values[1]) || values[1] < 0 || values[1] >= 0.5
    || !Number.isFinite(values[4])
    || !['simply-supported', 'fixed'].includes(support)) {
    throw Object.assign(new RangeError('Closed-form plate inputs are invalid.'), { code: 'SHELL_PLATE_CLOSED_FORM_INPUT_INVALID' });
  }
  [E, nu, thickness, a, q] = values;
  const D = E * thickness ** 3 / (12 * (1 - nu ** 2));
  const alpha = support === 'fixed' ? 0.00126 : 0.00406;
  const wCenter = alpha * q * a ** 4 / D;
  if (!Number.isFinite(D) || !(D > 0) || !Number.isFinite(wCenter)) {
    throw Object.assign(new RangeError('Closed-form plate result is not finite.'), { code: 'SHELL_PLATE_CLOSED_FORM_NONFINITE' });
  }
  return { D, alpha, wCenter, support };
}

export function lumpedPlateMass(element) {
  const total = element.material.density * element.thickness * element.area;
  if (!Number.isFinite(total)) {
    throw Object.assign(new RangeError('Shell lumped mass is not finite.'), { code: 'SHELL_MASS_NONFINITE' });
  }
  return { total, perNode: total / 4, translationalDofs: ['ux', 'uy', 'uz'], rotationalMassIncluded: false };
}

function elementGeometry(projected, thickness) {
  const quality = q4GeometryQuality(projected);
  return {
    ...quality,
    shortestEdgeThicknessRatio: quality.shortestEdge / thickness,
  };
}

function resolveProperties(input, material, defaultNu) {
  const E = strictNumeric(input.E ?? material.E);
  if (!Number.isFinite(E) || E <= 0) return { ok: false, reason: 'SHELL_MATERIAL_E_INVALID' };
  const suppliedNu = input.nu ?? material.nu;
  const nu = suppliedNu == null ? defaultNu : strictNumeric(suppliedNu);
  if (!Number.isFinite(nu) || nu < 0 || nu >= 0.5) return { ok: false, reason: 'SHELL_MATERIAL_NU_INVALID' };
  const suppliedThickness = input.t ?? input.thickness;
  const thickness = strictNumeric(suppliedThickness);
  if (!Number.isFinite(thickness) || thickness <= 0) return { ok: false, reason: 'SHELL_THICKNESS_INVALID' };
  const suppliedDensity = input.density ?? material.density ?? material.rho;
  const density = suppliedDensity == null ? 0 : strictNumeric(suppliedDensity);
  if (!Number.isFinite(density) || density < 0) return { ok: false, reason: 'SHELL_DENSITY_INVALID' };
  return { ok: true, E, nu, thickness, density };
}

function strictNumeric(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}
