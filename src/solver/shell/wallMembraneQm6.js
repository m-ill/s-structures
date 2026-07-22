import {
  buildShellLocalFrame,
  embedMembrane24,
  multiplyVector,
  qm6MembraneLocal,
  quadAreaInPlane,
  recoverMembraneStress,
  symmetryError,
} from './shellElementMath.js';

export const WALL_MEMBRANE_QM6_VERSION = 'p10-m9a-wall-membrane-qm6-v1';

export function buildWallMembraneQm6(input = {}, options = {}) {
  const nodes = input.nodes || [];
  const material = input.material || {};
  const E = positive(input.E, material.E);
  const nu = bounded(input.nu ?? material.nu, 0.2, 0, 0.49);
  const thickness = positive(input.t, input.thickness, 0.2);
  const frame = buildShellLocalFrame(nodes);
  if (!frame.ok) return frame;
  const local = qm6MembraneLocal(frame.projected, E, nu, thickness);
  if (!local.ok) return local;
  const drillingAlpha = positive(options.drillingAlpha, input.drillingAlpha, 1e-5);
  const embedded = embedMembrane24(local.matrix, frame, drillingAlpha);
  const area = quadAreaInPlane(frame.projected);
  return {
    ok: true,
    version: WALL_MEMBRANE_QM6_VERSION,
    id: input.id || null,
    formulation: 'membrane',
    dofPerNode: 6,
    matrixSize: 24,
    matrix: embedded.matrix,
    localMatrix: local.matrix,
    transform: embedded.transform,
    frame,
    area,
    thickness,
    material: { E, nu, density: nonnegative(input.density, material.density, material.rho, 0) },
    internalModeCount: local.internalModeCount,
    drilling: { method: 'stabilization', alpha: drillingAlpha, stiffness: embedded.drillingStiffness },
    diagnostics: { symmetryError: symmetryError(embedded.matrix), maxWarpRatio: frame.maxWarpRatio },
    limitations: [
      'M9a covers in-plane membrane response only.',
      'Drilling rotation uses stabilization in membrane-only form; the current flat-shell path retains a projected drilling stabilization.',
    ],
  };
}

export function recoverWallMembraneQm6(element, globalDisplacements = []) {
  const local = multiplyVector(element.transform, globalDisplacements);
  const recovered = recoverMembraneStress(
    element.frame.projected,
    local,
    element.material.E,
    element.material.nu,
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
  return {
    ok: true,
    version: WALL_MEMBRANE_QM6_VERSION,
    formulation: 'membrane',
    ...recovered,
    resultants,
    wallShear: resultants.Nxy * width,
    baseMoment: resultants.Nx * width * height / 2,
  };
}

function positive(...values) { for (const value of values) { const n = Number(value); if (Number.isFinite(n) && n > 0) return n; } return 1; }
function nonnegative(...values) { for (const value of values) { const n = Number(value); if (Number.isFinite(n) && n >= 0) return n; } return 0; }
function bounded(value, fallback, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
