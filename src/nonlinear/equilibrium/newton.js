import {
  acceptTrialBranch,
  beginStateStep,
  commitStateStep,
  forkTrialState,
  rollbackStateStep,
  stateStoreByteSnapshot,
  updateTrialState,
} from '../core/stateStore.js';
import { evaluateMdofConvergence } from './convergence.js';
import { requireEquilibriumBackend } from './referenceBackends.js';

export const MDOF_NEWTON_VERSION = 'p8-m2-full-newton-v1';

export async function solveMdofNewtonStep(input = {}) {
  const assembler = input.assembler;
  const originalStore = input.stateStore;
  if (!assembler?.domain?.constraint?.ok || typeof assembler.evaluate !== 'function') {
    return immediateFailure(originalStore, 'MDOF_ASSEMBLER_REQUIRED');
  }
  const reducedDofCount = assembler.domain.constraint.reducedDofCount;
  const targetLambdaInput = finiteInput(input.targetLambda, 0, 'MDOF_TARGET_LAMBDA_NONFINITE');
  if (!targetLambdaInput.ok) return immediateFailure(originalStore, targetLambdaInput.reason, targetLambdaInput.message);
  const targetLambda = targetLambdaInput.value;
  const matrixClass = input.matrixClass || 'spd';
  let backend;
  try {
    backend = requireEquilibriumBackend(input.backend, {
      production: input.production === true,
      matrixClass,
      dofCount: reducedDofCount,
      memoryLimitBytes: input.options?.memoryLimitBytes,
    });
  } catch (error) {
    return immediateFailure(originalStore, error.code || 'BACKEND_PREFLIGHT_FAILED', error.message, error.preflight);
  }
  if (originalStore?.trial) return immediateFailure(originalStore, 'STATE_TRIAL_ALREADY_ACTIVE');
  const domainHash = assembler.domain.identity?.domainHash || assembler.domain.hashes?.domainHash || null;
  if (originalStore?.domainHash && domainHash && originalStore.domainHash !== domainHash) {
    return immediateFailure(originalStore, 'STATE_DOMAIN_MISMATCH');
  }

  const options = input.options || {};
  const maxIterations = positiveInteger(options.maxIterations, 30);
  const alphas = lineSearchAlphas(options);
  const armijo = positive(options.armijo, 1e-4);
  let originalSnapshot = null;
  try {
    originalSnapshot = originalStore ? stateStoreByteSnapshot(originalStore) : null;
  } catch (error) {
    return immediateFailure(originalStore, error.code || 'STATE_STORE_INVALID', error.message);
  }
  let committedQ;
  try {
    committedQ = normalizeInitialQ(originalStore?.committed?.q, reducedDofCount);
  } catch (error) {
    return immediateFailure(originalStore, error.code || 'STATE_REDUCED_DOF_SIZE_MISMATCH', error.message);
  }
  const committedElementStates = originalStore?.committed?.elementStates || {};
  let working;
  try {
    working = beginStateStep(originalStore, {
      lambda: targetLambda,
      iteration: 0,
      q: committedQ,
      solver: MDOF_NEWTON_VERSION,
    });
  } catch (error) {
    return immediateFailure(originalStore, error.code || 'STATE_STEP_BEGIN_FAILED', error.message);
  }
  let q = Float64Array.from(committedQ);
  let correction = new Float64Array(reducedDofCount);
  let evaluation = await safeEvaluate(assembler, {
    q,
    lambda: targetLambda,
    committedElementStates,
    mode: input.mode || 'static',
  });
  if (!evaluation.ok) return failureResult(originalStore, working, originalSnapshot, evaluation.reason, [], evaluation);
  const dofKinds = reducedDofKinds(assembler.domain.constraint);
  const initialResidual = residualNormsByKind(evaluation.residualReduced, dofKinds);
  const lineSearchScales = residualLineSearchScales(
    initialResidual,
    evaluation.pExternalReduced,
    dofKinds,
    options.convergence,
  );
  const iterations = [];
  let solveCount = 0;

  try {
    working = updateTrialState(working, trialPatch(evaluation, q, correction, 0, null));
  } catch (error) {
    return failureResult(originalStore, working, originalSnapshot, error.code || 'STATE_TRIAL_UPDATE_FAILED', [], error);
  }
  for (let iteration = 0; iteration <= maxIterations; iteration += 1) {
    if (cancelled(input)) {
      return failureResult(originalStore, working, originalSnapshot, 'ANALYSIS_CANCELLED', iterations, null, 'cancelled');
    }
    let convergence;
    try {
      convergence = evaluateMdofConvergence({
        residual: evaluation.residualReduced,
        correction,
        q,
        external: evaluation.pExternalReduced,
        initialForceResidualNorm: initialResidual.force,
        initialMomentResidualNorm: initialResidual.moment,
        displacementScale: options.displacementScale,
        rotationScale: options.rotationScale,
        dofKinds,
      }, options.convergence);
    } catch (error) {
      return failureResult(originalStore, working, originalSnapshot, error.code || 'CONVERGENCE_EVALUATION_FAILED', iterations, error);
    }
    if (convergence.converged) {
      let committed;
      try {
        working = updateTrialState(working, trialPatch(evaluation, q, correction, iteration, convergence));
        committed = commitStateStep(working, {
          converged: true,
          events: [{ type: 'equilibrium-converged', lambda: targetLambda, iterations: solveCount }],
        });
      } catch (error) {
        return failureResult(
          originalStore,
          working,
          originalSnapshot,
          error.code || 'STATE_STEP_COMMIT_FAILED',
          iterations,
          error,
        );
      }
      emitProgress(input, { type: 'step-converged', lambda: targetLambda, iteration, norms: convergence.norms });
      return {
        version: MDOF_NEWTON_VERSION,
        ok: true,
        status: 'converged',
        reason: 'CONVERGED',
        targetLambda,
        stateStore: committed,
        evaluation,
        q: Float64Array.from(q),
        u: Float64Array.from(evaluation.u),
        iterations,
        iterationCount: solveCount,
        elementEvaluationCount: evaluation.diagnostics.cumulativeElementEvaluationCount,
        tangentAssemblyCount: evaluation.diagnostics.tangentAssemblyCount,
        convergence,
        backend: backend.id,
      };
    }
    if (iteration === maxIterations) {
      return failureResult(originalStore, working, originalSnapshot, 'MAX_ITERATIONS', iterations, { convergence });
    }
    if (matrixClass === 'spd' && evaluation.diagnostics.tangentSymmetryError > positive(options.symmetryTolerance, 1e-10)) {
      return failureResult(originalStore, working, originalSnapshot, 'TANGENT_NOT_SYMMETRIC', iterations, {
        symmetryError: evaluation.diagnostics.tangentSymmetryError,
      });
    }

    let solved;
    try {
      solved = await backend.solve(evaluation.tangentReduced, evaluation.residualReduced, {
        matrixClass,
        pivotTolerance: options.pivotTolerance,
        relativeTolerance: options.linearRelativeTolerance,
        maxIterations: options.linearMaxIterations,
      });
    } catch (error) {
      return failureResult(originalStore, working, originalSnapshot, error.code || 'LINEAR_SOLVE_FAILED', iterations, error);
    }
    solveCount += 1;
    if (!solved?.ok || !finiteSolution(solved.x, reducedDofCount)) {
      return failureResult(originalStore, working, originalSnapshot, solved?.reason || 'LINEAR_SOLVE_FAILED', iterations, solved);
    }

    const deltaQ = Float64Array.from(solved.x, Number);
    const baseline = scaledResidualNorm(evaluation.residualReduced, dofKinds, lineSearchScales);
    const candidates = [];
    const evaluatedCandidates = [];
    let selected = null;
    for (const alpha of alphas) {
      if (cancelled(input)) {
        return failureResult(originalStore, working, originalSnapshot, 'ANALYSIS_CANCELLED', iterations, null, 'cancelled');
      }
      const candidateQ = Float64Array.from(q, (value, index) => value + alpha * deltaQ[index]);
      const candidateEvaluation = await safeEvaluate(assembler, {
        q: candidateQ,
        lambda: targetLambda,
        committedElementStates,
        mode: input.mode || 'static',
      });
      if (!candidateEvaluation.ok) {
        candidates.push({ alpha, ok: false, reason: candidateEvaluation.reason, residualNorm: Infinity });
        continue;
      }
      const residualNorm = scaledResidualNorm(candidateEvaluation.residualReduced, dofKinds, lineSearchScales);
      const candidateCorrection = Float64Array.from(deltaQ, (value) => alpha * value);
      const candidate = {
        alpha,
        ok: true,
        residualNorm,
        armijoSatisfied: residualNorm <= baseline * Math.max(0, 1 - armijo * alpha),
        q: candidateQ,
        correction: candidateCorrection,
        evaluation: candidateEvaluation,
      };
      evaluatedCandidates.push(candidate);
      candidates.push({
        alpha,
        ok: true,
        residualNorm,
        armijoSatisfied: candidate.armijoSatisfied,
        responseHash: candidateEvaluation.responseHash,
      });
      if (options.lineSearch === false || candidate.armijoSatisfied) {
        try {
          candidate.branch = forkTrialState(working, `newton-${iteration + 1}-alpha-${alpha}`, trialPatch(
            candidateEvaluation,
            candidateQ,
            candidateCorrection,
            iteration + 1,
            null,
          ));
        } catch (error) {
          return failureResult(
            originalStore,
            working,
            originalSnapshot,
            error.code || 'STATE_BRANCH_CREATE_FAILED',
            iterations,
            error,
          );
        }
        selected = candidate;
        break;
      }
    }
    if (!selected && options.lineSearch !== false) {
      const improved = evaluatedCandidates
        .filter((candidate) => candidate.residualNorm < baseline)
        .sort((a, b) => a.residualNorm - b.residualNorm || b.alpha - a.alpha)[0];
      if (improved) {
        try {
          selected = {
            ...improved,
            branch: forkTrialState(
              working,
              `newton-${iteration + 1}-best-${improved.alpha}`,
              trialPatch(improved.evaluation, improved.q, improved.correction, iteration + 1, null),
            ),
          };
        } catch (error) {
          return failureResult(
            originalStore,
            working,
            originalSnapshot,
            error.code || 'STATE_BRANCH_CREATE_FAILED',
            iterations,
            error,
          );
        }
      }
    }
    if (!selected) {
      iterations.push(iterationRow(iteration + 1, convergence, solved, candidates, null, evaluation));
      return failureResult(originalStore, working, originalSnapshot, 'LINE_SEARCH_FAILED', iterations, { baseline, candidates });
    }
    try {
      working = acceptTrialBranch(working, selected.branch);
    } catch (error) {
      return failureResult(
        originalStore,
        working,
        originalSnapshot,
        error.code || 'STATE_BRANCH_ACCEPT_FAILED',
        iterations,
        error,
      );
    }
    q = selected.q;
    correction = selected.correction;
    evaluation = selected.evaluation;
    const row = iterationRow(iteration + 1, convergence, solved, candidates, selected.alpha, evaluation);
    iterations.push(row);
    emitProgress(input, { type: 'iteration', lambda: targetLambda, ...row });
  }
  return failureResult(originalStore, working, originalSnapshot, 'MAX_ITERATIONS', iterations);
}

function trialPatch(evaluation, q, correction, iteration, convergence) {
  return {
    lambda: evaluation.lambda,
    iteration,
    q: Array.from(q),
    u: Array.from(evaluation.u),
    residual: Array.from(evaluation.residualReduced),
    elementStates: evaluation.elementStates,
    energies: evaluation.energies,
    norms: convergence ? { ...convergence.norms, ratios: convergence.ratios } : {},
    correction: Array.from(correction),
  };
}

function iterationRow(iteration, convergence, solved, candidates, acceptedAlpha, evaluation) {
  return {
    iteration,
    norms: convergence.norms,
    ratios: convergence.ratios,
    converged: false,
    acceptedAlpha,
    lineSearch: candidates,
    backend: solved?.diagnostics || null,
    tangentValueHash: evaluation.diagnostics.tangentValueHash,
    cumulativeElementEvaluationCount: evaluation.diagnostics.cumulativeElementEvaluationCount,
    tangentAssemblyCount: evaluation.diagnostics.tangentAssemblyCount,
  };
}

function failureResult(originalStore, working, originalSnapshot, reason, iterations = [], details = null, status = 'failed') {
  let rolledBack = originalStore;
  let rollbackError = null;
  try {
    rolledBack = working ? rollbackStateStep(working) : originalStore;
  } catch (error) {
    rollbackError = serializableError(error);
  }
  let rollbackEquivalent = originalSnapshot == null;
  if (originalSnapshot != null) {
    try {
      rollbackEquivalent = stateStoreByteSnapshot(rolledBack) === originalSnapshot;
    } catch (error) {
      rollbackError ||= serializableError(error);
      rollbackEquivalent = false;
    }
  }
  return {
    version: MDOF_NEWTON_VERSION,
    ok: false,
    status,
    reason,
    stateStore: rolledBack,
    rollbackEquivalent,
    committedPreserved: rollbackEquivalent,
    iterations,
    iterationCount: iterations.length,
    details: serializableError(details),
    rollbackError,
  };
}

function immediateFailure(store, reason, message = null, details = null) {
  return {
    version: MDOF_NEWTON_VERSION,
    ok: false,
    status: 'blocked',
    reason,
    message,
    stateStore: store || null,
    rollbackEquivalent: true,
    committedPreserved: true,
    iterations: [],
    iterationCount: 0,
    details: serializableError(details),
  };
}

function normalizeInitialQ(values, count) {
  if (values == null || values.length === 0) return new Float64Array(count);
  if (values.length !== count) {
    const error = new RangeError(`Committed q must contain ${count} values.`);
    error.code = 'STATE_REDUCED_DOF_SIZE_MISMATCH';
    throw error;
  }
  return Float64Array.from(values, (value, index) => {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      const error = new TypeError(`Committed q[${index}] must be finite.`);
      error.code = 'MDOF_STATE_VALUE_NONFINITE';
      throw error;
    }
    return number;
  });
}

function reducedDofKinds(constraint) {
  return (constraint.reducedDofs || []).map((row) => {
    const key = String(row.key || '');
    if (/:(3|4|5)$/.test(key) || /:(rx|ry|rz)$/.test(key)) return 'rotation';
    return 'translation';
  });
}

function lineSearchAlphas(options) {
  if (options.lineSearch === false) return [1];
  const values = Array.isArray(options.lineSearchAlphas) && options.lineSearchAlphas.length
    ? options.lineSearchAlphas
    : [1, 0.5, 0.25, 0.125, 0.0625];
  const rows = [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0 && value <= 1))]
    .sort((a, b) => b - a);
  return rows.length ? rows : [1];
}

function cancelled(input) {
  return input.signal?.aborted === true || (typeof input.isCancelled === 'function' && input.isCancelled() === true);
}

function emitProgress(input, payload) {
  if (typeof input.onProgress !== 'function') return;
  try { input.onProgress({ version: MDOF_NEWTON_VERSION, ...payload }); } catch { /* UI callbacks do not own solver state. */ }
}

function finiteSolution(values, length) {
  return values != null && values.length === length && Array.from(values).every((value) => Number.isFinite(Number(value)));
}

function residualNormsByKind(values, kinds) {
  let force = 0;
  let moment = 0;
  Array.from(values).forEach((value, index) => {
    if (kinds[index] === 'rotation') moment = Math.max(moment, Math.abs(Number(value)));
    else force = Math.max(force, Math.abs(Number(value)));
  });
  return { force, moment };
}

function residualLineSearchScales(initial, external, kinds, criteria = {}) {
  const externalNorms = residualNormsByKind(external, kinds);
  return {
    force: Math.max(initial.force, externalNorms.force, positive(criteria.forceScaleFloor, 1)),
    moment: Math.max(
      initial.moment,
      externalNorms.moment,
      positive(criteria.momentScaleFloor, criteria.forceScaleFloor ?? 1),
    ),
  };
}

function scaledResidualNorm(values, kinds, scales) {
  let sum = 0;
  Array.from(values).forEach((value, index) => {
    const scale = kinds[index] === 'rotation' ? scales.moment : scales.force;
    const normalized = Number(value) / Math.max(scale, Number.EPSILON);
    sum += normalized * normalized;
  });
  return Math.sqrt(sum);
}

async function safeEvaluate(assembler, options) {
  try {
    const evaluation = await assembler.evaluate(options);
    if (!evaluation || typeof evaluation !== 'object') {
      return { ok: false, reason: 'ASSEMBLER_EVALUATION_INVALID' };
    }
    return evaluation;
  } catch (error) {
    return {
      ok: false,
      reason: error?.code || 'ASSEMBLER_EVALUATION_FAILED',
      message: error?.message || String(error),
    };
  }
}

function finiteInput(value, fallback, reason) {
  if (value == null) return { ok: true, value: fallback };
  const number = Number(value);
  if (!Number.isFinite(number)) return { ok: false, reason, message: 'Target load factor must be finite.' };
  return { ok: true, value: number };
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  return Math.max(1, Math.trunc(positive(value, fallback)));
}

function serializableError(value) {
  if (!value) return value;
  if (value instanceof Error) return { name: value.name, code: value.code || null, message: value.message };
  try { return structuredClone(value); } catch { return { message: String(value) }; }
}
