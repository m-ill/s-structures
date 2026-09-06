import { stableHash } from '../../core/stableHash.js';

export const PHASE13_SHELL_LAB_VERSION = 'p13-m8-shell-lab-v2';

export function buildPhase13ShellLab(input = {}) {
  const meshQa = normalizeMeshQa(input.meshQa);
  const rows = (input.meshResults || []).map((row) => ({
    meshSize: Number(row.meshSize),
    quantity: Number(row.quantity),
    elementCount: Number(row.elementCount || 0),
    dofCount: Number(row.dofCount || 0),
    meshHash: row.meshHash || stableHash({ meshSize: row.meshSize, elementCount: row.elementCount || 0 }).slice(0, 24),
    runHash: row.runHash || stableHash(row).slice(0, 24),
    formulation: row.formulation || 'cpu-f64-flat-shell',
  })).filter((row) => row.meshSize > 0 && Number.isFinite(row.quantity)).sort((a, b) => b.meshSize - a.meshSize);
  const deltas = rows.slice(1).map((row, index) => Math.abs(row.quantity - rows[index].quantity) / Math.max(Math.abs(row.quantity), 1e-15));
  const tolerance = Number(input.tolerance || 0.02);
  const convergenceAvailable = rows.length >= 3;
  const converged = convergenceAvailable && deltas.at(-1) <= tolerance;
  const phase10EvidenceStatus = input.phase10EvidenceStatus || 'unknown';
  const verifiedOwner = rows.every((row) => row.formulation === 'cpu-f64-flat-shell');
  const blockers = [];
  if (!meshQa.ok) blockers.push(...meshQa.issues.map((row) => row.code));
  if (!convergenceAvailable) blockers.push('SHELL_MESH_CONVERGENCE_REQUIRED');
  else if (!converged) blockers.push('SHELL_MESH_CONVERGENCE_FAILED');
  if (!verifiedOwner) blockers.push('SHELL_UNQUALIFIED_FORMULATION_ROUTE');
  if (phase10EvidenceStatus !== 'PASS') blockers.push('SHELL_PHASE10_EVIDENCE_REQUIRED');
  const reviewReady = blockers.length === 0;
  return deepFreeze({
    version: PHASE13_SHELL_LAB_VERSION,
    status: reviewReady ? 'experimental-converged' : 'experimental-review',
    capabilityMode: reviewReady ? 'SHELL_EXPERIMENTAL_REVIEW_ONLY' : 'SHELL_DESIGN_UNAVAILABLE',
    meshQa,
    rows,
    deltas,
    tolerance,
    convergenceAvailable,
    converged,
    phase10EvidenceStatus,
    verifiedFormulationOwner: verifiedOwner ? 'cpu-f64-flat-shell' : null,
    supportedComponents: ['displacement', 'Mxx', 'Myy', 'Mxy', 'Qx', 'Qy'],
    blockers: [...new Set(blockers)],
    experimental: true,
    reviewWatermark: 'REVIEW REQUIRED — EXPERIMENTAL SHELL',
    designTransferAllowed: false,
    shellDesignTransferAllowed: false,
    frameDesignLeakageAllowed: false,
    gpuVerifiedRouteAllowed: false,
    coreFrameReleaseImpact: 'none',
  });
}

export function buildPhase13ShellContainmentAudit(surfaces = {}) {
  const required = ['ui', 'api', 'agent', 'report', 'calculationPackage'];
  const rows = required.map((surface) => ({ surface, value: surfaces[surface]?.shellDesignTransferAllowed }));
  const blockers = rows.filter((row) => row.value !== false).map((row) => `SHELL_GUARD_${row.surface.toUpperCase()}_MISSING_OR_TRUE`);
  if (surfaces.frameDesignLeakageAllowed === true) blockers.push('SHELL_TO_FRAME_DESIGN_LEAKAGE');
  if (surfaces.gpuVerifiedRouteAllowed === true) blockers.push('SHELL_UNQUALIFIED_GPU_ROUTE');
  return deepFreeze({ version: 'p13-m8-shell-containment-audit-v1', status: blockers.length ? 'blocked' : 'PASS', rows, blockers, shellDesignTransferAllowed: false });
}

function normalizeMeshQa(input = {}) {
  const issues = [];
  if (Number(input.minDetJ ?? 1) <= 0) issues.push({ code: 'SHELL_MESH_DETJ_NONPOSITIVE' });
  if (Number(input.invertedCount || 0) > 0) issues.push({ code: 'SHELL_MESH_INVERTED_ELEMENT' });
  if (Number(input.degenerateCount || 0) > 0) issues.push({ code: 'SHELL_MESH_DEGENERATE_ELEMENT' });
  if (Number(input.maxWarp ?? 0) > Number(input.warpLimit ?? 0.2)) issues.push({ code: 'SHELL_MESH_WARP_LIMIT' });
  if (Number(input.maxAspect ?? 1) > Number(input.aspectLimit ?? 10)) issues.push({ code: 'SHELL_MESH_ASPECT_LIMIT' });
  return { ok: issues.length === 0, status: issues.length ? 'blocked' : 'PASS', issues, input: clone(input) };
}

function clone(value) { return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
