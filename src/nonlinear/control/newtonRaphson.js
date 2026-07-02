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
    const alpha = lineSearch ? chooseLineSearchAlpha(options.residual, x, dx0, r) : 1;
    const dx = alpha * dx0;
    const current = { force: r, displacement: dx, energy: dx * r };
    first ||= current;
    const check = evaluateConvergenceNorms(current, first, options.tolerances);
    appendConvergenceIteration(log, check, { residual: r, tangent: kt, dx, alpha, x });
    x += dx;
    if (check.converged) break;
  }
  return { version: NEWTON_RAPHSON_VERSION, x, converged: log.converged, iterations: log.iterations.length, log };
}

export function chooseLineSearchAlpha(residual, x, dx, r0) {
  if (typeof residual !== 'function' || !(Math.abs(dx) > 0)) return 1;
  let best = { alpha: 1, norm: Math.abs(Number(residual(x + dx)) || 0) };
  for (const alpha of [0.5, 0.25, 0.125]) {
    const norm = Math.abs(Number(residual(x + alpha * dx)) || 0);
    if (norm < best.norm) best = { alpha, norm };
  }
  return best.norm <= Math.abs(Number(r0) || 0) ? best.alpha : 1;
}
