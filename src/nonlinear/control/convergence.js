export const NONLINEAR_CONVERGENCE_VERSION = 'p3-m14-convergence';

export function evaluateConvergenceNorms(current = {}, first = {}, tolerances = {}) {
  const tol = {
    force: Number(tolerances.force ?? 1e-4),
    displacement: Number(tolerances.displacement ?? 1e-4),
    energy: Number(tolerances.energy ?? 1e-6),
  };
  const norms = {
    force: ratio(current.force, first.force),
    displacement: ratio(current.displacement, first.displacement),
    energy: ratio(current.energy, first.energy),
  };
  return {
    version: NONLINEAR_CONVERGENCE_VERSION,
    norms,
    tolerances: tol,
    converged: norms.force <= tol.force && (norms.displacement <= tol.displacement || norms.energy <= tol.energy),
  };
}

export function createConvergenceLog(options = {}) {
  return {
    version: NONLINEAR_CONVERGENCE_VERSION,
    step: Number(options.step || 0),
    maxIterations: Number(options.maxIterations || 30),
    iterations: [],
    converged: false,
    reason: null,
  };
}

export function appendConvergenceIteration(log, check, extra = {}) {
  log.iterations.push({ iteration: log.iterations.length + 1, ...check, ...extra });
  log.converged = !!check.converged;
  if (log.converged) log.reason = 'CONVERGED';
  else if (log.iterations.length >= log.maxIterations) log.reason = 'MAX_ITERATIONS';
  return log;
}

function ratio(value, base) {
  return Math.abs(Number(value) || 0) / Math.max(1e-12, Math.abs(Number(base) || 0));
}
