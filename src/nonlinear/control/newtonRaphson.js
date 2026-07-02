import { appendConvergenceIteration, createConvergenceLog, evaluateConvergenceNorms } from './convergence.js';

export const NEWTON_RAPHSON_VERSION = 'p3-m14-newton-raphson';

export function solveNewtonRaphson(options = {}) {
  const maxIterations = Number(options.maxIterations || 30);
  const lineSearch = options.lineSearch !== false;
  const log = createConvergenceLog({ step: options.step, maxIterations });
  let x = Number(options.initial || 0);
  let first = null;
  for (let i = 0; i < maxIterations; i += 1) {
    const r = Number(options.residual?.(x) ?? 0);
    const kt = Number(options.tangent?.(x) ?? 1);
    const dx0 = kt !== 0 ? -r / kt : 0;
    const lineSearchTrace = lineSearch ? chooseLineSearchTrace(options.residual, x, dx0, r) : null;
    const alpha = lineSearchTrace?.acceptedAlpha ?? 1;
    const dx = alpha * dx0;
    const current = { force: r, displacement: dx, energy: dx * r };
    first ||= current;
    const check = evaluateConvergenceNorms(current, first, options.tolerances);
    appendConvergenceIteration(log, check, { residual: r, tangent: kt, dx, alpha, x, lineSearch: lineSearchTrace });
    x += dx;
    if (check.converged) break;
  }
  return {
    version: NEWTON_RAPHSON_VERSION,
    x,
    converged: log.converged,
    iterations: log.iterations.length,
    lineSearchEnabled: lineSearch,
    convergenceReason: log.reason,
    log,
  };
}

export function chooseLineSearchAlpha(residual, x, dx, r0) {
  return chooseLineSearchTrace(residual, x, dx, r0).acceptedAlpha;
}

export function chooseLineSearchTrace(residual, x, dx, r0) {
  if (typeof residual !== 'function' || !(Math.abs(dx) > 0)) {
    return { initialNorm: Math.abs(Number(r0) || 0), acceptedAlpha: 1, acceptedNorm: Math.abs(Number(r0) || 0), improved: false, candidates: [] };
  }
  const initialNorm = Math.abs(Number(r0) || 0);
  const candidates = [1, 0.5, 0.25, 0.125].map((alpha) => ({
    alpha,
    x: x + alpha * dx,
    norm: Math.abs(Number(residual(x + alpha * dx)) || 0),
  }));
  let best = candidates[0];
  for (const candidate of candidates.slice(1)) if (candidate.norm < best.norm) best = candidate;
  const accepted = best.norm <= initialNorm ? best : candidates[0];
  return {
    initialNorm,
    acceptedAlpha: accepted.alpha,
    acceptedNorm: accepted.norm,
    improved: accepted.norm <= initialNorm,
    candidates,
  };
}
