import {
  buildShellLocalFrame,
  embedMembrane24,
  multiplyVector,
  QM6_FORMULATION,
  q4GeometryQuality,
  qm6MembraneLocal,
  quadAreaInPlane,
  recoverMembraneStress,
  symmetryError,
} from './shellElementMath.js';

export const WALL_MEMBRANE_QM6_VERSION = 'p10-m9a-wall-membrane-qm6-eas-v5-finite-dimensionless-qualified';
export const DRILLING_ALPHA_QUALIFIED_RANGE = Object.freeze({ min: 1e-6, max: 1e-4 });
export const DRILLING_STIFFNESS_RATIO_QUALIFIED_MAX = 1e-4;
export const WALL_MEMBRANE_QUALIFIED_ELEMENT_ASPECT_RATIO_MAX = 4;
export const WALL_MEMBRANE_QUALIFIED_JACOBIAN_RECIPROCAL_CONDITION_MIN = 0.1;
export const WALL_MEMBRANE_QUALIFIED_WARP_RATIO_MAX = 1e-2;

export function buildWallMembraneQm6(input = {}, options = {}) {
  const nodes = input.nodes || [];
  const material = input.material || {};
  const properties = resolveProperties(input, material, 0.2);
  if (!properties.ok) return properties;
  const { E, nu, thickness, density } = properties;
  const frame = buildShellLocalFrame(nodes);
  if (!frame.ok) return frame;
  const local = qm6MembraneLocal(frame.projected, E, nu, thickness);
  if (!local.ok) return local;
  const suppliedDrillingAlpha = options.drillingAlpha ?? input.drillingAlpha;
  const requestedDrillingAlpha = suppliedDrillingAlpha == null ? 1e-5 : strictNumeric(suppliedDrillingAlpha);
  const drillingAlphaInRange = Number.isFinite(requestedDrillingAlpha)
    && requestedDrillingAlpha >= DRILLING_ALPHA_QUALIFIED_RANGE.min
    && requestedDrillingAlpha <= DRILLING_ALPHA_QUALIFIED_RANGE.max;
  const drillingAlpha = drillingAlphaInRange
    ? requestedDrillingAlpha
    : Math.min(
      DRILLING_ALPHA_QUALIFIED_RANGE.max,
      Math.max(
        DRILLING_ALPHA_QUALIFIED_RANGE.min,
        Number.isFinite(requestedDrillingAlpha) ? requestedDrillingAlpha : 1e-5,
      ),
    );
  const embedded = embedMembrane24(local.matrix, frame, drillingAlpha, { E, nu, thickness });
  if (!embedded.ok) return embedded;
  const suppliedRatioMax = options.drillingStiffnessRatioMax !== undefined
    ? options.drillingStiffnessRatioMax
    : input.drillingStiffnessRatioMax;
  const ratioLimitProvided = suppliedRatioMax !== undefined;
  const requestedRatioMax = strictNumeric(suppliedRatioMax);
  const ratioLimitValid = !ratioLimitProvided || (Number.isFinite(requestedRatioMax) && requestedRatioMax > 0);
  const drillingStiffnessRatioMax = Math.min(
    DRILLING_STIFFNESS_RATIO_QUALIFIED_MAX,
    ratioLimitValid && ratioLimitProvided
      ? requestedRatioMax
      : DRILLING_STIFFNESS_RATIO_QUALIFIED_MAX,
  );
  const drillingRatioQualified = embedded.drillingStiffnessRatio <= drillingStiffnessRatioMax;
  const geometry = q4GeometryQuality(frame.projected);
  const geometryBlockers = [
    geometry.aspectRatio > WALL_MEMBRANE_QUALIFIED_ELEMENT_ASPECT_RATIO_MAX * (1 + 1e-12)
      ? 'SHELL_ELEMENT_ASPECT_RATIO_OUTSIDE_QUALIFIED_RANGE' : null,
    geometry.minimumJacobianReciprocalCondition < WALL_MEMBRANE_QUALIFIED_JACOBIAN_RECIPROCAL_CONDITION_MIN * (1 - 1e-12)
      ? 'SHELL_ELEMENT_JACOBIAN_CONDITION_OUTSIDE_QUALIFIED_RANGE' : null,
    frame.maxWarpRatio > WALL_MEMBRANE_QUALIFIED_WARP_RATIO_MAX * (1 + 1e-12)
      ? 'SHELL_WARP_EXCEEDS_QUALIFIED_LIMIT' : null,
  ].filter(Boolean);
  const drillingQualified = drillingAlphaInRange && ratioLimitValid && drillingRatioQualified;
  const drillingBlocker = !drillingAlphaInRange
    ? 'SHELL_DRILLING_ALPHA_OUTSIDE_QUALIFIED_RANGE'
    : !ratioLimitValid
      ? 'SHELL_DRILLING_STIFFNESS_RATIO_LIMIT_INVALID'
      : !drillingRatioQualified
        ? 'SHELL_DRILLING_STIFFNESS_RATIO_EXCEEDED'
        : null;
  const qualificationBlockers = [...geometryBlockers, ...(drillingBlocker ? [drillingBlocker] : [])];
  const numericallyQualified = qualificationBlockers.length === 0;
  const area = quadAreaInPlane(frame.projected);
  if (!Number.isFinite(density * thickness * area)) return { ok: false, reason: 'SHELL_MASS_NONFINITE' };
  return {
    ok: true,
    version: WALL_MEMBRANE_QM6_VERSION,
    id: input.id || null,
    formulation: 'membrane',
    elementFormulation: local.formulation,
    enhancedStrainMapping: local.enhancedStrainMapping,
    dofPerNode: 6,
    matrixSize: 24,
    matrix: embedded.matrix,
    compatibleMatrix: embedded.membraneMatrix,
    drillingMatrix: embedded.drillingMatrix,
    localMatrix: local.matrix,
    transform: embedded.transform,
    frame,
    area,
    thickness,
    material: { E, nu, density },
    internalModeCount: local.internalModeCount,
    internalDisplacementOperator: local.internalDisplacementOperator,
    jacobianQuality: local.jacobianQuality,
    geometry,
    reference: QM6_FORMULATION.reference,
    drilling: {
      method: embedded.drillingMethod,
      alpha: drillingAlpha,
      requestedAlpha: requestedDrillingAlpha,
      qualifiedAlphaRange: DRILLING_ALPHA_QUALIFIED_RANGE,
      penaltyModulus: embedded.drillingPenaltyModulus,
      maxMatrixEntry: embedded.drillingStiffness,
      stiffnessRatio: embedded.drillingStiffnessRatio,
      stiffnessRatioMax: drillingStiffnessRatioMax,
      requestedStiffnessRatioMax: ratioLimitProvided ? requestedRatioMax : null,
      stiffnessRatioLimitValid: ratioLimitValid,
      dofScalingCharacteristicLength: embedded.dofScalingCharacteristicLength,
    },
    diagnostics: {
      symmetryError: symmetryError(embedded.matrix),
      maxWarpRatio: frame.maxWarpRatio,
      drillingStiffnessRatio: embedded.drillingStiffnessRatio,
      minimumJacobianReciprocalCondition: geometry.minimumJacobianReciprocalCondition,
    },
    qualification: {
      status: numericallyQualified ? 'pass' : 'blocked',
      reason: qualificationBlockers[0] || null,
      membranePatchStatus: 'PASS',
      drillingStatus: drillingQualified ? 'PASS' : 'BLOCKED',
      allowedUse: numericallyQualified ? 'qualified-linear-elastic-membrane' : 'diagnostic-only',
      designTransferAllowed: false,
      modelMeshConvergenceRequired: true,
      elementAspectRatioMax: WALL_MEMBRANE_QUALIFIED_ELEMENT_ASPECT_RATIO_MAX,
      jacobianReciprocalConditionMin: WALL_MEMBRANE_QUALIFIED_JACOBIAN_RECIPROCAL_CONDITION_MIN,
      warpRatioMax: WALL_MEMBRANE_QUALIFIED_WARP_RATIO_MAX,
    },
    designEligibility: {
      allowed: false,
      reasonCodes: [...qualificationBlockers, 'SHELL_MODEL_MESH_CONVERGENCE_REQUIRED'],
    },
    limitations: [
      'M9a covers in-plane membrane response only.',
      'Element formulation qualification does not certify a user model mesh; design transfer requires model-level mesh-convergence provenance.',
      'Design transfer requires element edge-aspect ratio at most 4, Q4 Jacobian condition number at most 10, and node warp ratio at most 1%.',
      'Drilling rotation uses a Hughes-Brezzi curl-compatible penalty; sensitivity remains governed by drillingAlpha.',
    ],
  };
}

export function recoverWallMembraneQm6(element, globalDisplacements = []) {
  const rawDisplacement = Array.from(globalDisplacements || []);
  const displacement = rawDisplacement.map(strictNumeric);
  if (displacement.length !== 24 || displacement.some((value) => !Number.isFinite(value))) {
    return {
      ok: false,
      reason: 'SHELL_DISPLACEMENT_VECTOR_INVALID',
      qualification: { status: 'blocked', reason: 'SHELL_DISPLACEMENT_VECTOR_INVALID' },
      designEligibility: { allowed: false, reasonCodes: ['SHELL_DISPLACEMENT_VECTOR_INVALID'] },
    };
  }
  const local = multiplyVector(element.transform, displacement);
  const recovered = recoverMembraneStress(
    element.frame.projected,
    local,
    element.material.E,
    element.material.nu,
    0,
    0,
    { internalDisplacementOperator: element.internalDisplacementOperator },
  );
  if (!recovered.ok) return recovered;
  const resultants = {
    Nx: recovered.stress.sx * element.thickness,
    Ny: recovered.stress.sy * element.thickness,
    Nxy: recovered.stress.txy * element.thickness,
  };
  const xs = element.frame.projected.map((point) => point.x);
  const ys = element.frame.projected.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const wallShear = resultants.Nxy * width;
  const baseMoment = resultants.Nx * width * height / 2;
  const responseValues = [
    ...Object.values(recovered.strain || {}),
    ...Object.values(recovered.stress || {}),
    ...Object.values(resultants),
    wallShear,
    baseMoment,
  ];
  if (responseValues.some((value) => !Number.isFinite(value))) {
    return {
      ok: false,
      reason: 'SHELL_RECOVERY_NONFINITE',
      qualification: { status: 'blocked', reason: 'SHELL_RECOVERY_NONFINITE' },
      designEligibility: { allowed: false, reasonCodes: ['SHELL_RECOVERY_NONFINITE'] },
    };
  }
  return {
    ok: true,
    version: WALL_MEMBRANE_QM6_VERSION,
    formulation: 'membrane',
    elementFormulation: element.elementFormulation,
    ...recovered,
    resultants,
    wallShear,
    baseMoment,
    qualification: element.qualification,
    designEligibility: element.designEligibility,
    limitations: element.limitations,
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
