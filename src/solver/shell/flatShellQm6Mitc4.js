import { addMatrices, maxAbs, symmetryError } from './shellElementMath.js';
import { buildSlabPlateMitc4 } from './slabPlateMitc4.js';
import { buildWallMembraneQm6 } from './wallMembraneQm6.js';

export const FLAT_SHELL_QM6_MITC4_VERSION = 'p10-m9c-flat-shell-qm6-mitc4-v5-propagated-hard-scope';
export const FLAT_SHELL_QUALIFIED_WARP_TOLERANCE_MAX = 1e-2;

export function buildFlatShellQm6Mitc4(input = {}, options = {}) {
  const membrane = buildWallMembraneQm6(input, {
    drillingAlpha: options.drillingAlpha ?? input.drillingAlpha ?? 1e-5,
    drillingStiffnessRatioMax: options.drillingStiffnessRatioMax ?? input.drillingStiffnessRatioMax,
  });
  if (!membrane.ok) return membrane;
  const plate = buildSlabPlateMitc4(input);
  if (!plate.ok) return plate;
  const matrix = addMatrices(membrane.matrix, plate.matrix);
  const suppliedWarpTol = options.warpTol ?? input.warpTol;
  const requestedWarpTol = suppliedWarpTol == null
    ? FLAT_SHELL_QUALIFIED_WARP_TOLERANCE_MAX
    : strictNumeric(suppliedWarpTol);
  const warpToleranceValid = Number.isFinite(requestedWarpTol) && requestedWarpTol > 0;
  const warpTol = Math.min(
    warpToleranceValid ? requestedWarpTol : FLAT_SHELL_QUALIFIED_WARP_TOLERANCE_MAX,
    FLAT_SHELL_QUALIFIED_WARP_TOLERANCE_MAX,
  );
  const warpRatio = membrane.frame.maxWarpRatio;
  const warpStatus = warpRatio > 3 * warpTol ? 'split-required' : warpRatio > warpTol ? 'warning' : 'planar';
  const drillingStiffnessRatio = membrane.drilling.stiffnessRatio
    ?? maxAbs(membrane.drillingMatrix) / Math.max(1, maxAbs(membrane.compatibleMatrix));
  const membraneQualified = membrane.qualification?.status === 'pass';
  const plateQualified = plate.qualification?.status === 'pass';
  const elementNumericallyQualified = warpToleranceValid
    && warpStatus === 'planar'
    && membraneQualified
    && plateQualified;
  const qualificationReason = !warpToleranceValid
    ? 'SHELL_WARP_TOLERANCE_INVALID'
    : !membraneQualified
      ? membrane.qualification?.reason || 'SHELL_MEMBRANE_NUMERICAL_QUALIFICATION_REQUIRED'
      : !plateQualified
        ? plate.qualification?.reason || 'SHELL_PLATE_NUMERICAL_QUALIFICATION_REQUIRED'
        : warpStatus === 'warning'
          ? 'SHELL_WARP_REQUIRES_ENGINEERING_REVIEW'
          : warpStatus === 'split-required'
            ? 'SHELL_WARP_EXCEEDS_LIMIT'
            : null;
  return {
    ok: warpStatus !== 'split-required',
    reason: warpStatus === 'split-required' ? 'SHELL_WARP_EXCEEDS_LIMIT' : null,
    version: FLAT_SHELL_QM6_MITC4_VERSION,
    id: input.id || null,
    formulation: 'shell',
    elementFormulation: 'QM6-EAS+MITC4',
    dofPerNode: 6,
    matrixSize: 24,
    matrix,
    membrane,
    plate,
    frame: membrane.frame,
    area: membrane.area,
    thickness: membrane.thickness,
    material: membrane.material,
    warp: {
      ratio: warpRatio,
      tolerance: warpTol,
      requestedTolerance: requestedWarpTol,
      qualifiedToleranceMax: FLAT_SHELL_QUALIFIED_WARP_TOLERANCE_MAX,
      status: warpStatus,
      correction: 'reference-plane-projection-with-rigid-arm',
    },
    drilling: { ...membrane.drilling },
    diagnostics: { symmetryError: symmetryError(matrix), drillingStiffnessRatio },
    qualification: {
      status: elementNumericallyQualified ? 'pass' : 'blocked',
      reason: qualificationReason,
      allowedUse: elementNumericallyQualified ? 'qualified-analysis-mesh-review-required' : 'diagnostic-only',
      designTransferAllowed: false,
      modelMeshConvergenceRequired: true,
      membraneStatus: membrane.qualification?.status || 'unknown',
      plateStatus: plate.qualification?.status || 'unknown',
    },
    designEligibility: {
      allowed: false,
      reasonCodes: [...(qualificationReason ? [qualificationReason] : []), 'SHELL_MODEL_MESH_CONVERGENCE_REQUIRED'],
    },
    limitations: [
      ...(plate.limitations || []),
      'Warning-level warped elements remain analysis-only until an engineering review accepts the reference-plane approximation.',
      'Element formulation qualification does not certify a user model mesh; design transfer requires model-level mesh-convergence provenance.',
      'Shell initial-stress geometric stiffness is not included in M9c; frame Kg remains the P-Delta basis.',
    ],
  };
}

function strictNumeric(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}
