import { advanceAnalysisState, createAnalysisState, snapshotAnalysisState } from '../state.js';
import { solveNewtonRaphson } from './newtonRaphson.js';

export const LOAD_CONTROL_VERSION = 'p3-m14-load-control-trace-v1';

export function buildLoadControlTrace(options = {}) {
  const increments = Array.isArray(options.increments) && options.increments.length
    ? options.increments.map((value) => finite(value, 0))
    : Array.from({ length: Math.max(1, Math.trunc(finite(options.steps, 4))) }, () => finite(options.dLambda, 0.25));
  let state = createAnalysisState({ u: Math.max(1, Math.trunc(finite(options.dof, 1))), lambda: finite(options.initialLambda, 0) });
  const rows = increments.map((dLambda, index) => {
    const targetLambda = state.lambda + dLambda;
    const nr = solveNewtonRaphson({
      initial: options.initial ?? targetLambda,
      residual: options.residual || ((x) => x - targetLambda),
      tangent: options.tangent || (() => 1),
      maxIterations: options.maxIterations,
      lineSearch: options.lineSearch,
      step: index + 1,
    });
    state = advanceAnalysisState(state, {
      dLambda,
      du: [nr.x],
      converged: nr.converged,
      iterations: nr.iterations,
      events: nr.converged ? [] : [{ step: index + 1, type: 'nonconvergence' }],
    });
    return {
      step: state.step,
      targetLambda,
      dLambda,
      converged: nr.converged,
      iterations: nr.iterations,
      reason: nr.convergenceReason,
      acceptedValue: nr.x,
    };
  });
  return {
    version: LOAD_CONTROL_VERSION,
    contract: {
      milestone: 'P3-M14',
      tickets: ['P3-T50', 'P3-T52'],
      control: 'load',
      stateRule: 'Each row starts from the previous accepted state snapshot.',
      convergenceRule: 'Newton-Raphson must converge within the configured iteration limit for every increment.',
    },
    method: 'incremental-load-control-newton-raphson',
    rows,
    summary: {
      stepCount: rows.length,
      convergedSteps: rows.filter((row) => row.converged).length,
      finalLambda: state.lambda,
      maxIterations: Math.max(0, ...rows.map((row) => row.iterations || 0)),
    },
    finalState: snapshotAnalysisState(state),
    converged: rows.every((row) => row.converged),
    limitations: ['Single-parameter load-control trace; global frame residual assembly is handled by later hardening.'],
  };
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
