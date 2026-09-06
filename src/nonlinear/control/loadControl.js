import { advanceAnalysisState, createAnalysisState, snapshotAnalysisState } from '../state.js';
import { solveNewtonRaphson } from './newtonRaphson.js';

export const LOAD_CONTROL_VERSION = 'p3-m14-load-control-trace-v1';

export function buildLoadControlTrace(options = {}) {
  const increments = Array.isArray(options.increments) && options.increments.length
    ? options.increments.map((value) => finite(value, 0))
    : Array.from({ length: Math.max(1, Math.trunc(finite(options.steps, 4))) }, () => finite(options.dLambda, 0.25));
  let state = createAnalysisState({ u: Math.max(1, Math.trunc(finite(options.dof, 1))), lambda: finite(options.initialLambda, 0) });
  let acceptedValue = finite(options.initialAcceptedValue, state.u?.[0] || 0);
  const rows = [];
  for (let index = 0; index < increments.length; index += 1) {
    const dLambda = increments[index];
    const result = solveLoadStep({
      state,
      index,
      dLambda,
      acceptedValue,
      options,
      splitDepth: 0,
    });
    const acceptedState = result.acceptedState;
    acceptedValue = result.acceptedValue;
    rows.push(result.row);
    state = acceptedState;
    if (!result.row.converged && options.continueOnFailure !== true) break;
  }
  return {
    version: LOAD_CONTROL_VERSION,
    contract: {
      milestone: 'P3-M14',
      tickets: ['P3-T50', 'P3-T52'],
      control: 'load',
      stateRule: 'Each row starts from the previous accepted state snapshot.',
      convergenceRule: 'Newton-Raphson must converge within the configured iteration limit for every increment.',
      failurePolicy: 'Record the failed step and stop unless continueOnFailure is enabled; one split retry is available when retrySplitOnFailure is true.',
      retryPolicy: 'Failed increments expose stepSplitRecommended and can be retried as two half increments once.',
    },
    method: 'incremental-load-control-newton-raphson',
    rows,
    summary: {
      stepCount: rows.length,
      convergedSteps: rows.filter((row) => row.converged).length,
      failedSteps: rows.filter((row) => !row.converged).length,
      stepSplitRecommended: rows.some((row) => row.failureReview?.stepSplitRecommended),
      splitRetryAttempted: rows.some((row) => row.failureReview?.splitRetryAttempted),
      finalLambda: state.lambda,
      maxIterations: Math.max(0, ...rows.map((row) => row.iterations || 0)),
    },
    finalState: snapshotAnalysisState(state),
    converged: rows.every((row) => row.converged),
    limitations: ['Single-parameter load-control trace; global frame residual assembly is handled by the P3-M14 global-equilibrium trace.'],
  };
}

function solveLoadStep({ state, index, dLambda, acceptedValue, options, splitDepth }) {
  const targetLambda = state.lambda + dLambda;
  const residual = typeof options.residualFactory === 'function'
    ? options.residualFactory({ targetLambda, dLambda, splitDepth, step: index + 1 })
    : options.residual || ((x) => x - targetLambda);
  const tangent = typeof options.tangentFactory === 'function'
    ? options.tangentFactory({ targetLambda, dLambda, splitDepth, step: index + 1 })
    : options.tangent || (() => 1);
  const nr = solveNewtonRaphson({
    initial: options.initial ?? targetLambda,
    residual,
    tangent,
    maxIterations: options.maxIterations,
    lineSearch: options.lineSearch,
    step: index + 1,
  });
  if (!nr.converged && options.retrySplitOnFailure === true && splitDepth < 1 && Math.abs(dLambda) > 0) {
    const first = solveLoadStep({ state, index, dLambda: dLambda / 2, acceptedValue, options, splitDepth: splitDepth + 1 });
    if (first.row.converged) {
      const second = solveLoadStep({
        state: first.acceptedState,
        index,
        dLambda: dLambda / 2,
        acceptedValue: first.acceptedValue,
        options,
        splitDepth: splitDepth + 1,
      });
      if (second.row.converged) {
        return {
          acceptedState: second.acceptedState,
          acceptedValue: second.acceptedValue,
          row: {
            ...second.row,
            targetLambda,
            dLambda,
            splitRows: [first.row, second.row],
            failureReview: buildFailureReview(nr, { retried: true, recovered: true }),
          },
        };
      }
    }
  }
  const previousAcceptedValue = acceptedValue;
  const du = nr.x - previousAcceptedValue;
  const nextAcceptedValue = nr.converged ? nr.x : previousAcceptedValue;
  const acceptedState = nr.converged
    ? advanceAnalysisState(state, {
        dLambda,
        du: [du],
        converged: true,
        iterations: nr.iterations,
      })
    : markFailedState(state, index + 1, nr.iterations);
  return {
    acceptedState,
    acceptedValue: nextAcceptedValue,
    row: {
      step: nr.converged ? acceptedState.step : index + 1,
      targetLambda,
      dLambda,
      converged: nr.converged,
      iterations: nr.iterations,
      reason: nr.convergenceReason,
      attemptedValue: nr.x,
      acceptedValue: nextAcceptedValue,
      failureReview: buildFailureReview(nr, { retried: false, recovered: false }),
      stateSnapshot: snapshotAnalysisState(acceptedState),
    },
  };
}

function buildFailureReview(nr, retry = {}) {
  if (nr.converged) return null;
  return {
    status: retry.recovered ? 'available' : 'review-required',
    reason: nr.convergenceReason || 'NONCONVERGENCE',
    stepSplitRecommended: true,
    splitRetryAttempted: !!retry.retried,
    splitRetryRecovered: !!retry.recovered,
    agentDecision: retry.recovered ? 'accept-split-load-step-trace' : 'review-load-step-or-enable-split-retry',
  };
}

function markFailedState(state, step, iterations) {
  const out = createAnalysisState(snapshotAnalysisState(state));
  out.converged = false;
  out.iterations = Math.trunc(finite(iterations, 0));
  out.events.push({ step, type: 'nonconvergence' });
  return out;
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
