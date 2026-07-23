import { addMatrices, maxAbs, removeRigidBodyEnergy24, symmetryError } from './shellElementMath.js';
import { buildSlabPlateDkq } from './slabPlateDkq.js';
import { buildWallMembraneQm6 } from './wallMembraneQm6.js';

export const FLAT_SHELL_ALLMAN_DKQ_VERSION = 'p10-m9c-flat-shell-allman-dkq-v2-qualification-blocked';

export function buildFlatShellAllmanDkq(input = {}, options = {}) {
  const membrane = buildWallMembraneQm6(input, { drillingAlpha: options.drillingAlpha ?? input.drillingAlpha ?? 1e-5 });
  if (!membrane.ok) return membrane;
  const plate = buildSlabPlateDkq(input);
  if (!plate.ok) return plate;
  const matrix = removeRigidBodyEnergy24(addMatrices(membrane.matrix, plate.matrix), input.nodes || []);
  const warpTol = positive(options.warpTol, input.warpTol, 1e-2);
  const warpRatio = membrane.frame.maxWarpRatio;
  const warpStatus = warpRatio > 3 * warpTol ? 'split-required' : warpRatio > warpTol ? 'warning' : 'planar';
  const membraneEnergy = maxAbs(membrane.matrix);
  const stabilizationEnergy = membrane.drilling.stiffness;
  const spuriousEnergyRatio = stabilizationEnergy / Math.max(1, membraneEnergy);
  return {
    ok: warpStatus !== 'split-required',
    reason: warpStatus === 'split-required' ? 'SHELL_WARP_EXCEEDS_LIMIT' : null,
    version: FLAT_SHELL_ALLMAN_DKQ_VERSION,
    id: input.id || null,
    formulation: 'shell',
    dofPerNode: 6,
    matrixSize: 24,
    matrix,
    membrane,
    plate,
    frame: membrane.frame,
    area: membrane.area,
    thickness: membrane.thickness,
    warp: { ratio: warpRatio, tolerance: warpTol, status: warpStatus, correction: 'mean-plane-projection-rigid-arm-compatible' },
    drilling: { method: 'allman-compatible-corner-coupling', spuriousEnergyRatio },
    diagnostics: { symmetryError: symmetryError(matrix), spuriousEnergyRatio },
    qualification: {
      status: 'blocked',
      reason: 'SHELL_FLAT_SHELL_DRILLING_QUALIFICATION_REQUIRED',
      allowedUse: 'diagnostic-only',
      designTransferAllowed: false,
      plateStatus: plate.qualification?.status || 'unknown',
    },
    designEligibility: {
      allowed: false,
      reasonCodes: ['SHELL_FLAT_SHELL_DRILLING_QUALIFICATION_REQUIRED'],
    },
    limitations: [
      ...(plate.limitations || []),
      'Shell initial-stress geometric stiffness is not included in M9c; frame Kg remains the P-Delta basis.',
    ],
  };
}

function positive(...values) { for (const value of values) { const n = Number(value); if (Number.isFinite(n) && n > 0) return n; } return 1; }
