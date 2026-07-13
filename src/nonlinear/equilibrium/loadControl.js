import { solveMdofNewtonStep } from './newton.js';

export const MDOF_LOAD_CONTROL_VERSION = 'p8-m3-mdof-load-control-v2';

export async function runMdofLoadControl(input = {}) {
  const options = input.options || {};
  if (!input.stateStore?.committed) {
    return result(false, 'STATE_STORE_REQUIRED', input.stateStore, [], [], null, 'blocked');
  }
  const targetLambda = explicitFinite(options.targetLambda, 1);
  const initialLambda = explicitFinite(input.stateStore?.committed?.lambda, 0);
  if (targetLambda == null || initialLambda == null) {
    return result(
      false,
      targetLambda == null ? 'LOAD_CONTROL_TARGET_NONFINITE' : 'LOAD_CONTROL_STATE_NONFINITE',
      input.stateStore,
      [],
      [],
      targetLambda,
      'blocked',
    );
  }
  const direction = Math.sign(targetLambda - initialLambda) || 1;
  let stepSize = direction * Math.min(
    Math.abs(targetLambda - initialLambda),
    positive(options.initialStep, Math.abs(targetLambda - initialLambda) || 1),
  );
  const minStep = positive(options.minStep, Math.max(1e-6, Math.abs(stepSize) / 1024));
  const maxStep = positive(options.maxStep, Math.abs(stepSize));
  const cutbackFactor = bounded(options.cutbackFactor, 0.5, 0.05, 0.95);
  const growthFactor = bounded(options.growthFactor, 1.5, 1, 4);
  const fastIterations = positiveInteger(options.fastIterations, 4);
  const maxAttempts = positiveInteger(options.maxAttempts, 10000);
  const acceptedSteps = [];
  const rejectedSteps = [];
  let store = input.stateStore;
  let attempts = 0;

  while (direction * (targetLambda - Number(store.committed.lambda || 0)) > tolerance(targetLambda)) {
    attempts += 1;
    if (attempts > maxAttempts) return result(false, 'LOAD_CONTROL_ATTEMPT_LIMIT', store, acceptedSteps, rejectedSteps, targetLambda);
    const currentLambda = Number(store.committed.lambda || 0);
    const remaining = targetLambda - currentLambda;
    const increment = direction * Math.min(Math.abs(stepSize), Math.abs(remaining));
    const stepTarget = currentLambda + increment;
    const step = await solveMdofNewtonStep({
      assembler: input.assembler,
      stateStore: store,
      targetLambda: stepTarget,
      backend: input.backend,
      matrixClass: input.matrixClass,
      production: input.production,
      signal: input.signal,
      isCancelled: input.isCancelled,
      onProgress: (row) => emit(input, { ...row, attempt: attempts, stepTarget }),
      options: options.newton,
    });
    if (step.ok) {
      store = step.stateStore;
      acceptedSteps.push({
        step: acceptedSteps.length + 1,
        lambda: stepTarget,
        increment,
        iterationCount: step.iterationCount,
        convergence: step.convergence,
        hingeEvents: step.hingeEvents || [],
        responseHash: step.evaluation.responseHash,
        evaluation: step.evaluation,
        stateStore: step.stateStore,
        backend: step.backend,
      });
      if (step.iterationCount <= fastIterations) stepSize = direction * Math.min(maxStep, Math.abs(stepSize) * growthFactor);
      emit(input, { type: 'load-step-accepted', lambda: stepTarget, increment, attempt: attempts });
      continue;
    }
    rejectedSteps.push({
      attempt: attempts,
      fromLambda: currentLambda,
      targetLambda: stepTarget,
      increment,
      reason: step.reason,
      rollbackEquivalent: step.rollbackEquivalent,
    });
    emit(input, { type: 'load-step-rejected', lambda: stepTarget, increment, reason: step.reason, attempt: attempts });
    if (step.status === 'cancelled' || step.reason === 'ANALYSIS_CANCELLED') {
      return result(false, 'ANALYSIS_CANCELLED', store, acceptedSteps, rejectedSteps, targetLambda, 'cancelled');
    }
    if (step.status === 'blocked' || NON_RETRYABLE_FAILURES.has(step.reason)) {
      return result(false, step.reason || 'LOAD_STEP_BLOCKED', store, acceptedSteps, rejectedSteps, targetLambda, 'blocked');
    }
    const cutback = Math.abs(stepSize) * cutbackFactor;
    if (cutback < minStep - tolerance(minStep)) {
      return result(false, 'MINIMUM_LOAD_STEP_REACHED', store, acceptedSteps, rejectedSteps, targetLambda);
    }
    stepSize = direction * Math.max(minStep, cutback);
  }
  return result(true, 'CONVERGED', store, acceptedSteps, rejectedSteps, targetLambda, 'converged');
}

const NON_RETRYABLE_FAILURES = new Set([
  'PRODUCTION_BACKEND_UNAVAILABLE',
  'BACKEND_MATRIX_CLASS_UNSUPPORTED',
  'MDOF_ASSEMBLER_REQUIRED',
  'STATE_DOMAIN_MISMATCH',
  'STATE_STORE_REQUIRED',
  'STATE_REDUCED_DOF_SIZE_MISMATCH',
  'MDOF_STATE_VALUE_NONFINITE',
  'STATE_TRIAL_ALREADY_ACTIVE',
  'TANGENT_NOT_SYMMETRIC',
  'MDOF_CONVERGENCE_VALUE_INVALID',
  'ELEMENT_RESPONSE_INVALID',
  'ELEMENT_EVALUATION_FAILED',
  'STRUCTURAL_MECHANISM_DETECTED',
  'INACTIVE_DOF_RESIDUAL',
  'INACTIVE_MODE_RESIDUAL',
  'INACTIVE_MODE_PATTERN_MISSING',
]);

function result(ok, reason, stateStore, acceptedSteps, rejectedSteps, targetLambda, status = 'failed') {
  return {
    version: MDOF_LOAD_CONTROL_VERSION,
    ok,
    status,
    reason,
    targetLambda,
    finalLambda: Number(stateStore?.committed?.lambda || 0),
    stateStore,
    acceptedSteps,
    rejectedSteps,
    acceptedStepCount: acceptedSteps.length,
    rejectedStepCount: rejectedSteps.length,
    cutbackCount: rejectedSteps.length,
  };
}

function emit(input, payload) {
  if (typeof input.onProgress !== 'function') return;
  try { input.onProgress({ version: MDOF_LOAD_CONTROL_VERSION, ...payload }); } catch { /* Progress is observational. */ }
}

function tolerance(value) {
  return 1e-12 * Math.max(1, Math.abs(Number(value)));
}

function explicitFinite(value, fallback) {
  if (value == null) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  return Math.max(1, Math.trunc(positive(value, fallback)));
}

function bounded(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
