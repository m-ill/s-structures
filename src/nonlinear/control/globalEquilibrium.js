import { GLOBAL_EQUILIBRIUM_VERSION } from '../../metadata/numericVersions.js';
export { GLOBAL_EQUILIBRIUM_VERSION };
import { matVec, solveLinear } from '../../solver/linear3dElement.js';
import { buildNonlinearTangentAssembly } from '../assembly.js';
import { NONLINEAR_CONVERGENCE_VERSION, evaluateConvergenceNorms } from './convergence.js';



export function runGlobalEquilibriumTrace(model = {}, state = {}, options = {}) {
  const assembly = options.assembly || buildNonlinearTangentAssembly(model, state, options.assemblyOptions);
  const ndof = assembly.ndof || assembly.K?.length || 0;
  const free = Array.isArray(options.freeDofs) && options.freeDofs.length
    ? options.freeDofs.map((value) => Math.trunc(Number(value))).filter((value) => value >= 0 && value < ndof)
    : Array.isArray(assembly.freeDofs) && assembly.freeDofs.length ? assembly.freeDofs : freeDofs(ndof, options.fixedDofs);
  const load = buildLoadVector(ndof, options.loads);
  const displacement = vector(options.displacement, ndof);
  const maxIterations = Math.max(1, Math.trunc(Number(options.maxIterations || 6)));
  const tolerance = options.tolerances || {};
  const rows = [];
  let u = displacement;
  let first = null;
  let converged = false;
  let reason = 'MAX_ITERATIONS';

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const internal = matVec(assembly.K || [], u);
    const residual = load.map((value, index) => value - (internal[index] || 0));
    const reducedResidual = free.map((index) => residual[index] || 0);
    const reducedK = free.map((i) => free.map((j) => assembly.K?.[i]?.[j] || 0));
    const solvedDu = solveLinear(reducedK, reducedResidual);
    const duReduced = solvedDu || new Array(free.length).fill(0);
    const du = new Array(ndof).fill(0);
    free.forEach((index, i) => { du[index] = duReduced[i] || 0; });
    const current = {
      force: norm(reducedResidual),
      displacement: norm(duReduced),
      energy: Math.abs(dot(duReduced, reducedResidual)),
    };
    first ||= current;
    const check = evaluateConvergenceNorms(current, first, tolerance);
    rows.push({
      iteration,
      version: NONLINEAR_CONVERGENCE_VERSION,
      residualNorm: current.force,
      displacementNorm: current.displacement,
      energyNorm: current.energy,
      norms: check.norms,
      tolerances: check.tolerances,
      converged: check.converged,
      solved: !!solvedDu || check.converged,
      lineSearch: { acceptedAlpha: 1, candidates: [{ alpha: 1, norm: current.force }] },
    });
    if (check.converged) {
      converged = true;
      reason = 'CONVERGED';
      break;
    }
    if (!solvedDu || !duReduced.every(Number.isFinite)) {
      reason = 'SINGULAR_TANGENT';
      break;
    }
    u = u.map((value, index) => value + du[index]);
  }

  return {
    version: GLOBAL_EQUILIBRIUM_VERSION,
    contract: {
      milestone: 'P3-M14',
      tickets: ['P3-T51', 'P3-T52'],
      method: 'reduced-global-residual-newton-trace',
      convergence: 'force plus displacement-or-energy norm',
      agentUse: 'AI agents can inspect residual norms before accepting later hinge/fiber traces.',
    },
    assembly: {
      version: assembly.version,
      ok: assembly.ok,
      ndof,
      freeDofCount: free.length,
      summary: assembly.summary,
    },
    rows,
    converged,
    reason,
    finalDisplacement: u,
    summary: {
      iterationCount: rows.length,
      initialResidualNorm: rows[0]?.residualNorm || 0,
      finalResidualNorm: rows.at(-1)?.residualNorm || 0,
      maxDisplacementNorm: Math.max(0, ...rows.map((row) => row.displacementNorm || 0)),
      maxEnergyNorm: Math.max(0, ...rows.map((row) => row.energyNorm || 0)),
    },
  };
}

function buildLoadVector(ndof, loads) {
  const out = new Array(ndof).fill(0);
  for (const item of loads || [{ dof: 0, value: 1 }]) {
    const index = Math.trunc(Number(item.dof ?? item.index ?? 0));
    if (index >= 0 && index < ndof) out[index] += Number(item.value ?? item.P ?? 0);
  }
  return out;
}

function freeDofs(ndof, fixed = []) {
  const fixedSet = new Set((fixed || []).map((value) => Math.trunc(Number(value))).filter((value) => value >= 0));
  return Array.from({ length: ndof }, (_, index) => index).filter((index) => !fixedSet.has(index));
}

function vector(values, length) {
  const input = Array.isArray(values) ? values : [];
  return Array.from({ length }, (_, index) => Number(input[index]) || 0);
}

function norm(values) {
  return Math.sqrt((values || []).reduce((sum, value) => sum + Number(value || 0) ** 2, 0));
}

function dot(a, b) {
  return (a || []).reduce((sum, value, index) => sum + Number(value || 0) * Number(b?.[index] || 0), 0);
}
