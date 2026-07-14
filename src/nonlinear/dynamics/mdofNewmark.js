import { stableHash } from '../../core/stableHash.js';
import {
  beginStateStep,
  commitStateStep,
  createNonlinearStateStore,
  createStateCheckpoint,
  restoreStateCheckpoint,
  rollbackStateStep,
  stateStoreByteSnapshot,
  updateTrialState,
} from '../core/stateStore.js';
import { evaluateMdofConvergence } from '../equilibrium/convergence.js';
import { prepareMdofActiveSystem } from '../equilibrium/newton.js';
import { requireEquilibriumBackend } from '../equilibrium/referenceBackends.js';
import { createDynamicHistoryCollector } from './dynamicHistory.js';
import { recoverDynamicInertia } from './massDomain.js';
import {
  combineCscMatrices,
  cscMatVec,
  cscQuadratic,
  cscSymmetryError,
  extractCscSubmatrix,
  validateDynamicCsc,
} from './sparseMatrix.js';

export const MDOF_NEWMARK_VERSION = 'p8-m8-mdof-newmark-average-acceleration-v1';
export const MDOF_NEWMARK_PARAMETERS = Object.freeze({ beta: 0.25, gamma: 0.5 });

export async function solveMdofNewmarkStep(input = {}) {
  const assembler = input.assembler;
  const massDomain = input.massDomain;
  const damping = input.damping;
  const originalStore = input.stateStore;
  if (!assembler?.domain?.constraint?.ok || typeof assembler.evaluate !== 'function') {
    return immediateFailure(originalStore, 'MDOF_ASSEMBLER_REQUIRED');
  }
  if (!massDomain?.ok || massDomain.reducedDofCount !== assembler.domain.constraint.reducedDofCount) {
    return immediateFailure(originalStore, 'MDOF_MASS_DOMAIN_REQUIRED');
  }
  try {
    validateDynamicCsc(massDomain.matrix);
    validateDynamicCsc(massDomain.fullMatrix);
    validateDynamicCsc(damping?.matrix);
  } catch (error) {
    return immediateFailure(originalStore, error.code || 'MDOF_DYNAMIC_MATRIX_INVALID', error.message, error.details);
  }
  if (!originalStore?.committed || originalStore.trial) {
    return immediateFailure(originalStore, originalStore?.trial ? 'STATE_TRIAL_ALREADY_ACTIVE' : 'STATE_STORE_REQUIRED');
  }
  const count = assembler.domain.constraint.reducedDofCount;
  const domainHash = assembler.domain.identity?.domainHash || assembler.domain.hashes?.domainHash || null;
  if (originalStore.domainHash && domainHash && originalStore.domainHash !== domainHash) {
    return immediateFailure(originalStore, 'STATE_DOMAIN_MISMATCH');
  }
  const options = input.options || {};
  const dt = positive(input.dt ?? options.dt, 'DYNAMIC_DT_INVALID');
  const beta = Number(options.beta ?? MDOF_NEWMARK_PARAMETERS.beta);
  const gamma = Number(options.gamma ?? MDOF_NEWMARK_PARAMETERS.gamma);
  if (beta !== 0.25 || gamma !== 0.5) {
    return immediateFailure(originalStore, 'NEWMARK_PARAMETERS_UNQUALIFIED', 'M8 qualifies only beta=0.25 and gamma=0.5.');
  }
  const time0 = finite(originalStore.committed.time, 0, 'DYNAMIC_STATE_TIME_NONFINITE');
  const targetTime = input.targetTime == null ? time0 + dt : finite(input.targetTime, time0 + dt, 'DYNAMIC_TARGET_TIME_NONFINITE');
  if (Math.abs(targetTime - (time0 + dt)) > 1e-10 * Math.max(1, targetTime)) {
    return immediateFailure(originalStore, 'DYNAMIC_TARGET_TIME_MISMATCH', 'targetTime must equal committed time plus dt.');
  }
  let q0;
  let v0;
  let a0;
  try {
    q0 = stateVector(originalStore.committed.q, count, 'q');
    v0 = stateVector(originalStore.committed.v, count, 'v', true);
    a0 = stateVector(originalStore.committed.a, count, 'a', true);
  } catch (error) {
    return immediateFailure(originalStore, error.code || 'DYNAMIC_STATE_VECTOR_INVALID', error.message);
  }
  const qPredictor = Float64Array.from(q0, (value, index) => (
    value + dt * v0[index] + dt ** 2 * (0.5 - beta) * a0[index]
  ));
  const vPredictor = Float64Array.from(v0, (value, index) => value + dt * (1 - gamma) * a0[index]);
  const accelerationCoefficient = 1 / (beta * dt ** 2);
  const dampingCoefficient = gamma / (beta * dt);
  const matrixPolicy = resolveDynamicMatrixClass(
    assembler,
    input.matrixClass || options.matrixClass || assembler.requiredMatrixClass,
  );
  const matrixClass = matrixPolicy.matrixClass;
  let backend;
  try {
    backend = requireEquilibriumBackend(input.backend, {
      production: input.production === true,
      matrixClass,
      dofCount: count,
      memoryLimitBytes: options.memoryLimitBytes,
      backendPreference: options.backendPreference || options.computeTarget || 'auto',
      gpuEnabled: options.gpuEnabled === true,
    });
  } catch (error) {
    return immediateFailure(originalStore, error.code || 'BACKEND_PREFLIGHT_FAILED', error.message, error.preflight || error.details);
  }
  let snapshot;
  let working;
  try {
    snapshot = stateStoreByteSnapshot(originalStore);
    working = beginStateStep(originalStore, {
      time: targetTime,
      dt,
      q: qPredictor,
      v: vPredictor,
      a: new Array(count).fill(0),
      iteration: 0,
      solver: MDOF_NEWMARK_VERSION,
      integration: { beta, gamma, targetTime },
    });
  } catch (error) {
    return immediateFailure(originalStore, error.code || 'STATE_STEP_BEGIN_FAILED', error.message);
  }
  const committedElementStates = originalStore.committed.elementStates || {};
  const groundMotion = input.groundMotion || zeroGroundMotion(count);
  const groundLoad = groundMotion.effectiveLoadAt(targetTime);
  const groundAcceleration = groundMotion.vectorAt(targetTime);
  const maxIterations = positiveInteger(options.maxIterations, 30);
  const alphas = lineSearchAlphas(options);
  const armijo = positiveOr(options.armijo, 1e-4);
  const dofKinds = reducedDofKinds(assembler.domain.constraint);
  let q = Float64Array.from(qPredictor);
  let correction = new Float64Array(count);
  let evaluation = await evaluateDynamic(q);
  if (!evaluation.ok) return failureResult(originalStore, working, snapshot, evaluation.reason, [], evaluation);
  const initialNorms = residualNorms(evaluation.residualReduced, dofKinds);
  const externalNorms = residualNorms(evaluation.pDynamicExternalReduced, dofKinds);
  const forceScale = Math.max(1, initialNorms.force, externalNorms.force);
  const momentScale = Math.max(1, initialNorms.moment, externalNorms.moment, forceScale * positiveOr(assembler.characteristicLength, 1));
  const iterations = [];
  let solveCount = 0;
  try {
    working = updateTrialState(working, trialPatch(evaluation, q, correction, 0, null));
  } catch (error) {
    return failureResult(originalStore, working, snapshot, error.code || 'STATE_TRIAL_UPDATE_FAILED', iterations, error);
  }

  for (let iteration = 0; iteration <= maxIterations; iteration += 1) {
    if (cancelled(input)) return failureResult(originalStore, working, snapshot, 'ANALYSIS_CANCELLED', iterations, null, 'cancelled');
    let convergence;
    try {
      convergence = evaluateMdofConvergence({
        residual: evaluation.residualReduced,
        correction,
        q,
        external: evaluation.pDynamicExternalReduced,
        initialForceResidualNorm: initialNorms.force,
        initialMomentResidualNorm: initialNorms.moment,
        forceScale,
        momentScale,
        displacementScale: options.displacementScale,
        rotationScale: options.rotationScale,
        dofKinds,
      }, options.convergence);
    } catch (error) {
      return failureResult(originalStore, working, snapshot, error.code || 'DYNAMIC_CONVERGENCE_FAILED', iterations, error);
    }
    if (convergence.converged) {
      let energies;
      try {
        energies = await computeAcceptedEnergies({
          assembler,
          originalStore,
          evaluation,
          massDomain,
          damping,
          groundMotion,
          q0,
          v0,
          targetTime,
          dt,
          committedElementStates,
          options,
        });
      } catch (error) {
        return failureResult(originalStore, working, snapshot, error.code || 'DYNAMIC_ENERGY_AUDIT_FAILED', iterations, error);
      }
      let committed;
      try {
        working = updateTrialState(working, trialPatch(evaluation, q, correction, iteration, convergence, energies));
        committed = commitStateStep(working, {
          converged: true,
          events: [{
            type: 'dynamic-equilibrium-converged',
            time: targetTime,
            dt,
            iterations: solveCount,
          }],
        });
      } catch (error) {
        return failureResult(originalStore, working, snapshot, error.code || 'STATE_STEP_COMMIT_FAILED', iterations, error);
      }
      emitProgress(input, { type: 'dynamic-step-converged', time: targetTime, dt, iteration, norms: convergence.norms });
      return Object.freeze({
        version: MDOF_NEWMARK_VERSION,
        ok: true,
        status: 'converged',
        reason: 'CONVERGED',
        time: targetTime,
        dt,
        stateStore: committed,
        evaluation,
        q: Float64Array.from(evaluation.q),
        v: Float64Array.from(evaluation.v),
        a: Float64Array.from(evaluation.a),
        groundLoad: Float64Array.from(groundLoad),
        groundAcceleration: Float64Array.from(groundAcceleration),
        iterations: Object.freeze(iterations.slice()),
        iterationCount: solveCount,
        convergence,
        energies,
        backend: backend.id,
        matrixClass,
        matrixClassReason: matrixPolicy.reason,
        effectiveTangentHash: evaluation.tangentReduced.valueHash,
      });
    }
    if (iteration === maxIterations) {
      return failureResult(originalStore, working, snapshot, 'MAX_ITERATIONS', iterations, { convergence });
    }
    const symmetryTolerance = positiveOr(options.symmetryTolerance, 1e-10);
    const effectiveTangentSymmetryError = cscSymmetryError(evaluation.tangentReduced);
    if (matrixClass === 'spd' && effectiveTangentSymmetryError > symmetryTolerance) {
      return failureResult(originalStore, working, snapshot, 'DYNAMIC_EFFECTIVE_TANGENT_NONSYMMETRIC', iterations, {
        matrixClass,
        symmetryTolerance,
        effectiveTangentSymmetryError,
        staticTangentSymmetryError: cscSymmetryError(evaluation.staticTangentReduced),
      });
    }
    let linearSystem;
    let solved;
    try {
      linearSystem = prepareMdofActiveSystem(evaluation, assembler, options);
      solved = linearSystem.activeDofCount === 0
        ? { ok: true, x: new Float64Array(0), diagnostics: { method: 'inactive-dof-elimination' } }
        : await backend.solve(linearSystem.matrix, linearSystem.rhs, {
          matrixClass,
          pivotTolerance: options.pivotTolerance,
          relativeTolerance: options.linearRelativeTolerance,
          maxIterations: options.linearMaxIterations,
        });
    } catch (error) {
      return failureResult(originalStore, working, snapshot, error.code || 'LINEAR_SOLVE_FAILED', iterations, error);
    }
    solveCount += 1;
    if (!solved?.ok || !finiteSolution(solved.x, linearSystem.activeDofCount)) {
      return failureResult(originalStore, working, snapshot, solved?.reason || 'LINEAR_SOLVE_FAILED', iterations, solved);
    }
    const deltaQ = expandActiveSolution(solved.x, linearSystem.activeDofs, count);
    const baseline = scaledResidualNorm(evaluation.residualReduced, dofKinds, forceScale, momentScale);
    const candidates = [];
    let selected = null;
    for (const alpha of alphas) {
      if (cancelled(input)) return failureResult(originalStore, working, snapshot, 'ANALYSIS_CANCELLED', iterations, null, 'cancelled');
      const candidateQ = Float64Array.from(q, (value, index) => value + alpha * deltaQ[index]);
      const candidateEvaluation = await evaluateDynamic(candidateQ);
      if (!candidateEvaluation.ok) {
        candidates.push({ alpha, ok: false, reason: candidateEvaluation.reason });
        continue;
      }
      const norm = scaledResidualNorm(candidateEvaluation.residualReduced, dofKinds, forceScale, momentScale);
      const candidate = {
        alpha,
        q: candidateQ,
        correction: Float64Array.from(deltaQ, (value) => alpha * value),
        evaluation: candidateEvaluation,
        residualNorm: norm,
        armijoSatisfied: norm <= baseline * Math.max(0, 1 - armijo * alpha),
      };
      candidates.push({ alpha, ok: true, residualNorm: norm, armijoSatisfied: candidate.armijoSatisfied, responseHash: candidateEvaluation.responseHash });
      if (options.lineSearch === false || candidate.armijoSatisfied) {
        selected = candidate;
        break;
      }
      if (!selected || norm < selected.residualNorm) selected = candidate;
    }
    if (!selected || (options.lineSearch !== false && selected.residualNorm >= baseline)) {
      iterations.push(iterationRow(iteration + 1, convergence, solved, candidates, null, evaluation));
      return failureResult(originalStore, working, snapshot, 'LINE_SEARCH_FAILED', iterations, { baseline, candidates });
    }
    q = selected.q;
    correction = selected.correction;
    evaluation = selected.evaluation;
    try {
      working = updateTrialState(working, trialPatch(evaluation, q, correction, iteration + 1, null));
    } catch (error) {
      return failureResult(originalStore, working, snapshot, error.code || 'STATE_TRIAL_UPDATE_FAILED', iterations, error);
    }
    const row = iterationRow(iteration + 1, convergence, solved, candidates, selected.alpha, evaluation);
    iterations.push(row);
    emitProgress(input, { type: 'dynamic-iteration', time: targetTime, dt, ...row });
  }
  return failureResult(originalStore, working, snapshot, 'MAX_ITERATIONS', iterations);

  async function evaluateDynamic(candidateQ) {
    let staticEvaluation;
    try {
      staticEvaluation = await assembler.evaluate({
        q: candidateQ,
        lambda: 0,
        committedElementStates,
        dt,
        mode: 'dynamic',
      });
    } catch (error) {
      return { ok: false, reason: error.code || 'ASSEMBLER_EVALUATION_FAILED', message: error.message };
    }
    if (!staticEvaluation?.ok) return staticEvaluation || { ok: false, reason: 'ASSEMBLER_EVALUATION_INVALID' };
    const acceleration = Float64Array.from(candidateQ, (value, index) => accelerationCoefficient * (value - qPredictor[index]));
    const velocity = Float64Array.from(vPredictor, (value, index) => value + gamma * dt * acceleration[index]);
    const massForce = cscMatVec(massDomain.matrix, acceleration);
    const dampingForce = cscMatVec(damping.matrix, velocity);
    const residual = Float64Array.from(staticEvaluation.residualReduced, (value, index) => (
      Number(value) + Number(groundLoad[index]) - massForce[index] - dampingForce[index]
    ));
    const effectiveTangent = combineCscMatrices([
      { matrix: staticEvaluation.tangentReduced, factor: 1 },
      { matrix: massDomain.matrix, factor: accelerationCoefficient },
      { matrix: damping.matrix, factor: dampingCoefficient },
    ]);
    return {
      ...staticEvaluation,
      ok: true,
      time: targetTime,
      dt,
      q: Float64Array.from(candidateQ),
      v: velocity,
      a: acceleration,
      staticTangentReduced: staticEvaluation.tangentReduced,
      tangentReduced: effectiveTangent,
      staticResidualReduced: staticEvaluation.residualReduced,
      residualReduced: residual,
      pGroundReduced: Float64Array.from(groundLoad),
      pDynamicExternalReduced: Float64Array.from(staticEvaluation.pExternalReduced, (value, index) => Number(value) + Number(groundLoad[index])),
      massForceReduced: massForce,
      dampingForceReduced: dampingForce,
      newmark: Object.freeze({ beta, gamma, accelerationCoefficient, dampingCoefficient, qPredictor, vPredictor }),
      dynamicResidualHash: stableHash(Array.from(residual)).slice(0, 24),
    };
  }
}

export async function runMdofNewmark(input = {}) {
  const assembler = input.assembler;
  const massDomain = input.massDomain;
  const damping = input.damping;
  const groundMotion = input.groundMotion;
  const options = input.options || {};
  if (!assembler?.domain?.constraint?.ok || !massDomain?.ok || !damping?.ok || !groundMotion?.ok) {
    return runFailure('MDOF_NLTH_INPUT_INVALID', input.stateStore || null);
  }
  const domainHash = assembler.domain.identity?.domainHash || assembler.domain.hashes?.domainHash || null;
  let store;
  try {
    const restarting = Boolean(input.checkpoint);
    store = restarting
      ? restoreStateCheckpoint(input.checkpoint, { domainHash })
      : input.stateStore;
    if (!store) throw dynamicError('STATE_STORE_REQUIRED', 'MDOF NLTH requires an initial state store.');
    store = restarting
      ? await validateDynamicRestartState({ ...input, stateStore: store })
      : await initializeDynamicState({ ...input, stateStore: store });
  } catch (error) {
    return runFailure(error.code || 'DYNAMIC_INITIALIZATION_FAILED', input.stateStore || null, error.message, error.details);
  }
  const outputDt = positiveOr(options.outputDt, groundMotion.dt);
  const initialDt = positiveOr(options.initialDt ?? options.dt, outputDt);
  const minDt = positiveOr(options.minDt, initialDt / 64);
  const maximumSubstepLevel = positiveInteger(options.maximumSubstepLevel ?? options.maxSubstepLevel, 12);
  const maximumInternalSteps = positiveInteger(options.maximumInternalSteps, Math.max(1000, groundMotion.pointCount * 128));
  const startTime = Number(store.committed.time || 0);
  const endTime = Math.min(groundMotion.duration, finite(options.endTime, groundMotion.duration, 'DYNAMIC_END_TIME_NONFINITE'));
  if (startTime > endTime + 1e-12) return runFailure('DYNAMIC_RESTART_TIME_OUT_OF_RANGE', store);
  const history = createDynamicHistoryCollector({
    ...(options.history || {}),
    onChunk: input.onChunk || options.history?.onChunk,
  });
  const acceptedSteps = [];
  const rejectedSteps = [];
  const retainStepTrace = options.retainStepTrace !== false;
  const stepTraceLimit = retainStepTrace ? positiveInteger(options.stepTraceLimit, 10000) : 0;
  let acceptedStepCount = 0;
  let rejectedStepCount = 0;
  let lastAcceptedStep = null;
  let internalStep = 0;
  let outputStep = 0;
  let maximumSubstepUsed = 0;
  let lastEvaluation;
  try {
    lastEvaluation = await evaluateCommitted(assembler, store, 0);
    if (!lastEvaluation.ok) throw dynamicError(lastEvaluation.reason || 'DYNAMIC_INITIAL_EVALUATION_FAILED', lastEvaluation.message || 'Initial dynamic evaluation failed.');
    appendOutput(lastEvaluation, 0);
    emitProgress(input, { type: 'dynamic-run-started', time: startTime, endTime, outputDt });
    let nextOutputTime = Math.min(endTime, startTime + outputDt);
    while (Number(store.committed.time) < endTime - timeTolerance(endTime)) {
      if (cancelled(input)) return finalize(false, 'ANALYSIS_CANCELLED', 'cancelled');
      const target = Math.min(endTime, nextOutputTime);
      const interval = await integrateToTarget(store, target, 0, initialDt, lastEvaluation);
      if (!interval.ok) {
        store = interval.stateStore || store;
        lastEvaluation = interval.evaluation || lastEvaluation;
        return finalize(false, interval.reason, interval.status || 'failed', interval);
      }
      store = interval.stateStore;
      lastEvaluation = interval.evaluation;
      outputStep += 1;
      appendOutput(lastEvaluation, interval.substepLevel);
      if (positiveInteger(options.checkpointInterval, 10) > 0 && outputStep % positiveInteger(options.checkpointInterval, 10) === 0) {
        const checkpoint = createStateCheckpoint(store, { role: 'mdof-nlth-restart', outputStep, internalStep });
        history.addCheckpoint(checkpoint, { time: store.committed.time, outputStep, internalStep });
        input.onCheckpoint?.(checkpoint);
      }
      emitProgress(input, {
        type: 'dynamic-output-step',
        outputStep,
        time: store.committed.time,
        endTime,
        progress: endTime > startTime ? (store.committed.time - startTime) / (endTime - startTime) : 1,
      });
      nextOutputTime = Math.min(endTime, startTime + (outputStep + 1) * outputDt);
      if (internalStep > maximumInternalSteps) return finalize(false, 'DYNAMIC_INTERNAL_STEP_LIMIT', 'failed');
    }
    return finalize(true, 'DYNAMIC_TIME_RANGE_COMPLETED', 'completed');
  } catch (error) {
    return finalize(false, error.code || 'DYNAMIC_RUN_FAILED', 'failed', { message: error.message, details: error.details });
  }

  async function integrateToTarget(startStore, targetTime, substepLevel, suggestedDt, startEvaluation) {
    const remaining = targetTime - Number(startStore.committed.time);
    if (remaining <= timeTolerance(targetTime)) {
      return { ok: true, stateStore: startStore, evaluation: startEvaluation, substepLevel };
    }
    if (internalStep >= maximumInternalSteps) {
      return {
        ok: false,
        reason: 'DYNAMIC_INTERNAL_STEP_LIMIT',
        status: 'failed',
        stateStore: startStore,
        evaluation: startEvaluation,
        maximumInternalSteps,
      };
    }
    const dt = Math.min(remaining, suggestedDt);
    const step = await solveMdofNewmarkStep({
      assembler,
      massDomain,
      damping,
      groundMotion,
      stateStore: startStore,
      backend: input.backend,
      production: input.production,
      dt,
      targetTime: Number(startStore.committed.time) + dt,
      signal: input.signal,
      isCancelled: input.isCancelled,
      onProgress: input.onProgress,
      options: { ...options, ...(options.newton || {}) },
    });
    if (step.ok) {
      internalStep += 1;
      maximumSubstepUsed = Math.max(maximumSubstepUsed, substepLevel);
      const row = Object.freeze({
        internalStep,
        time: step.time,
        dt,
        substepLevel,
        iterationCount: step.iterationCount,
        convergence: step.convergence,
        stateHash: step.stateStore.committedHash,
        backend: step.backend,
        matrixClass: step.matrixClass,
        matrixClassReason: step.matrixClassReason,
      });
      store = step.stateStore;
      lastEvaluation = step.evaluation;
      acceptedStepCount += 1;
      lastAcceptedStep = row;
      if (acceptedSteps.length < stepTraceLimit) acceptedSteps.push(row);
      try {
        history.recordInternalStep({ ...row, outputStep: outputStep + 1 });
      } catch (error) {
        return acceptedBoundaryFailure(error.code || 'DYNAMIC_HISTORY_RECORD_FAILED', error);
      }
      try {
        input.onCommit?.(Object.freeze({
          version: MDOF_NEWMARK_VERSION,
          ...row,
          stateStore: step.stateStore,
        }));
      } catch (error) {
        return acceptedBoundaryFailure('DYNAMIC_COMMIT_CALLBACK_FAILED', error);
      }
      if (step.time < targetTime - timeTolerance(targetTime)) {
        const continuation = await integrateToTarget(step.stateStore, targetTime, substepLevel, suggestedDt, step.evaluation);
        return continuation.ok ? { ...continuation, substepLevel: Math.max(substepLevel, continuation.substepLevel || 0) } : continuation;
      }
      return { ok: true, stateStore: step.stateStore, evaluation: step.evaluation, substepLevel };

      function acceptedBoundaryFailure(reason, error) {
        return {
          ok: false,
          reason,
          status: 'failed',
          stateStore: step.stateStore,
          evaluation: step.evaluation,
          message: error?.message || reason,
          details: serializable(error),
        };
      }
    }
    const rejectedRow = Object.freeze({
      time: Number(startStore.committed.time),
      attemptedDt: dt,
      substepLevel,
      reason: step.reason,
      rollbackEquivalent: step.rollbackEquivalent,
    });
    rejectedStepCount += 1;
    if (rejectedSteps.length < stepTraceLimit) rejectedSteps.push(rejectedRow);
    if (step.status === 'cancelled' || step.reason === 'ANALYSIS_CANCELLED') {
      return {
        ok: false,
        reason: 'ANALYSIS_CANCELLED',
        status: 'cancelled',
        stateStore: startStore,
        evaluation: startEvaluation,
      };
    }
    const half = dt / 2;
    if (substepLevel >= maximumSubstepLevel || half < minDt - timeTolerance(minDt)) {
      return {
        ok: false,
        reason: 'DYNAMIC_MINIMUM_DT_REACHED',
        status: 'failed',
        failedStep: step,
        attemptedDt: dt,
        minDt,
        substepLevel,
        stateStore: startStore,
        evaluation: startEvaluation,
      };
    }
    const midpoint = Number(startStore.committed.time) + half;
    const first = await integrateToTarget(startStore, midpoint, substepLevel + 1, half, startEvaluation);
    if (!first.ok) return first;
    return integrateToTarget(first.stateStore, targetTime, substepLevel + 1, half, first.evaluation);
  }

  function appendOutput(evaluation, substepLevel) {
    const groundAcceleration = groundMotion.vectorAt(store.committed.time);
    const inertia = recoverDynamicInertia(massDomain, assembler.domain, store.committed.a, groundAcceleration);
    history.appendOutput({
      time: store.committed.time,
      sourceInternalStep: internalStep,
      sourceSubstepLevel: substepLevel,
      q: store.committed.q,
      v: store.committed.v,
      a: store.committed.a,
      groundAcceleration,
      baseReactionForce: inertia.baseReactionForce,
      baseReactionMoment: inertia.baseReactionMoment,
      elements: recoverDynamicElementHistory(evaluation),
      energies: store.committed.energies?.dynamic || {},
      convergence: store.committed.norms || {},
    });
  }

  function finalize(ok, reason, status, details = null) {
    let checkpoint = null;
    if (store?.committed) {
      checkpoint = createStateCheckpoint(store, { role: 'mdof-nlth-restart', outputStep, internalStep, reason });
      history.addCheckpoint(checkpoint, { time: store.committed.time, outputStep, internalStep, final: true });
    }
    const manifest = history.finalize({
      reason,
      status,
      groundMotionSetHash: groundMotion.setHash,
      massHash: massDomain.massHash,
      dampingHash: damping.dampingHash,
    });
    const finalEnergy = store?.committed?.energies?.dynamic || {};
    const result = {
      version: MDOF_NEWMARK_VERSION,
      ok,
      status,
      reason,
      stateStore: store,
      checkpoint,
      history: manifest,
      acceptedSteps: Object.freeze(acceptedSteps.slice()),
      rejectedSteps: Object.freeze(rejectedSteps.slice()),
      acceptedStepCount,
      rejectedStepCount,
      stepTrace: Object.freeze({
        retained: retainStepTrace,
        limit: stepTraceLimit,
        acceptedRetainedCount: acceptedSteps.length,
        rejectedRetainedCount: rejectedSteps.length,
        acceptedTruncated: acceptedStepCount > acceptedSteps.length,
        rejectedTruncated: rejectedStepCount > rejectedSteps.length,
      }),
      outputStepCount: manifest.outputStepCount,
      internalStepCount: manifest.internalStepCount,
      maximumSubstepLevel: maximumSubstepUsed,
      matrixClass: lastAcceptedStep?.matrixClass || resolveDynamicMatrixClass(
        assembler,
        options.matrixClass || assembler.requiredMatrixClass,
      ).matrixClass,
      matrixClassReason: lastAcceptedStep?.matrixClassReason || resolveDynamicMatrixClass(
        assembler,
        options.matrixClass || assembler.requiredMatrixClass,
      ).reason,
      startTime,
      endTime: Number(store?.committed?.time ?? startTime),
      requestedEndTime: endTime,
      finalEnergy,
      finalEvaluation: lastEvaluation || null,
      energyAudit: Object.freeze({
        residual: Number(finalEnergy.balanceResidual || 0),
        relativeResidual: Math.abs(Number(finalEnergy.balanceResidual || 0)) / Math.max(1, Math.abs(Number(finalEnergy.input || 0))),
      }),
      details,
    };
    return Object.freeze({ ...result, resultHash: stableHash(result).slice(0, 24) });
  }
}

async function validateDynamicRestartState(input) {
  const { assembler, massDomain, damping, groundMotion, stateStore: store } = input;
  const options = input.options || {};
  const count = assembler.domain.constraint.reducedDofCount;
  const q = stateVector(store.committed.q, count, 'q');
  const v = stateVector(store.committed.v, count, 'v');
  const a = stateVector(store.committed.a, count, 'a');
  const initialization = store.committed.dynamicInitialization;
  if (!initialization) {
    throw dynamicError('DYNAMIC_RESTART_PROVENANCE_REQUIRED', 'NLTH restart checkpoint does not contain dynamic initialization provenance.');
  }
  const expected = {
    massHash: massDomain.massHash,
    dampingHash: damping.dampingHash,
    groundMotionSetHash: groundMotion.setHash,
  };
  const mismatches = Object.entries(expected)
    .filter(([key, value]) => value && initialization[key] !== value)
    .map(([key, value]) => ({ key, expected: value, actual: initialization[key] || null }));
  if (mismatches.length) {
    throw dynamicError('DYNAMIC_RESTART_PROVENANCE_MISMATCH', 'NLTH restart checkpoint does not match the active mass, damping, or ground-motion domain.', { mismatches });
  }
  const evaluation = await assembler.evaluate({
    q,
    lambda: 0,
    committedElementStates: store.committed.elementStates || {},
    mode: 'dynamic-restart',
    dt: 0,
  });
  if (!evaluation?.ok) {
    throw dynamicError(evaluation?.reason || 'DYNAMIC_RESTART_EVALUATION_FAILED', evaluation?.message || 'Restart-state element evaluation failed.');
  }
  const groundLoad = groundMotion.effectiveLoadAt(store.committed.time);
  const massForce = cscMatVec(massDomain.matrix, a);
  const dampingForce = cscMatVec(damping.matrix, v);
  const residual = Float64Array.from(evaluation.residualReduced, (value, index) => (
    Number(value) + Number(groundLoad[index]) - massForce[index] - dampingForce[index]
  ));
  const scale = Math.max(
    1,
    maxAbs(evaluation.pExternalReduced),
    maxAbs(evaluation.pInternalReduced),
    maxAbs(groundLoad),
    maxAbs(massForce),
    maxAbs(dampingForce),
  );
  const limit = nonnegative(options.restartEquilibriumAbsolute, 1e-7)
    + nonnegative(options.restartEquilibriumRelative, 1e-7) * scale;
  const residualNorm = maxAbs(residual);
  if (residualNorm > limit || evaluation.audit?.ok === false) {
    throw dynamicError('DYNAMIC_RESTART_EQUILIBRIUM_FAILED', 'NLTH restart checkpoint is not in dynamic equilibrium.', {
      residualNorm,
      limit,
      audit: evaluation.audit,
    });
  }
  return store;
}

async function initializeDynamicState(input) {
  const { assembler, massDomain, damping, groundMotion, backend } = input;
  const options = input.options || {};
  const store = input.stateStore;
  const count = assembler.domain.constraint.reducedDofCount;
  const q = stateVector(store.committed.q, count, 'q');
  const v = stateVector(store.committed.v, count, 'v', true);
  const committedElementStates = store.committed.elementStates || {};
  const evaluation = await assembler.evaluate({ q, lambda: 0, committedElementStates, mode: 'dynamic', dt: 0 });
  if (!evaluation?.ok) throw dynamicError(evaluation?.reason || 'DYNAMIC_INITIAL_EVALUATION_FAILED', evaluation?.message || 'Initial evaluation failed.');
  const staticResidual = maxAbs(evaluation.residualReduced);
  const staticScale = Math.max(1, maxAbs(evaluation.pExternalReduced), maxAbs(evaluation.pInternalReduced));
  const staticLimit = nonnegative(options.initialEquilibriumAbsolute, 1e-7)
    + nonnegative(options.initialEquilibriumRelative, 1e-7) * staticScale;
  if (staticResidual > staticLimit || evaluation.audit?.ok === false) {
    throw dynamicError('DYNAMIC_INITIAL_STATE_NOT_EQUILIBRATED', 'NLTH requires a converged gravity-preloaded initial state.', {
      staticResidual,
      staticLimit,
      audit: evaluation.audit,
    });
  }
  const groundLoad = groundMotion.effectiveLoadAt(store.committed.time);
  const dampingForce = cscMatVec(damping.matrix, v);
  const rhs = Float64Array.from(evaluation.residualReduced, (value, index) => Number(value) + Number(groundLoad[index]) - dampingForce[index]);
  const active = Array.from(massDomain.activeDofs || []);
  const activeSet = new Set(active);
  const inactiveResidual = Array.from(rhs).reduce((maximum, value, dof) => activeSet.has(dof) ? maximum : Math.max(maximum, Math.abs(value)), 0);
  if (inactiveResidual > staticLimit) {
    throw dynamicError('DYNAMIC_MASSLESS_DOF_INITIAL_RESIDUAL', 'Initial dynamic load acts on a massless algebraic DOF.', { inactiveResidual, staticLimit });
  }
  let acceleration = new Float64Array(count);
  if (active.length) {
    const matrix = extractCscSubmatrix(massDomain.matrix, active);
    const activeRhs = Float64Array.from(active, (dof) => rhs[dof]);
    const solver = requireEquilibriumBackend(backend, {
      production: input.production === true,
      matrixClass: 'spd',
      dofCount: active.length,
      backendPreference: options.backendPreference || options.computeTarget || 'auto',
      gpuEnabled: options.gpuEnabled === true,
    });
    const solved = await solver.solve(matrix, activeRhs, { matrixClass: 'spd', pivotTolerance: options.pivotTolerance });
    if (!solved?.ok || !finiteSolution(solved.x, active.length)) {
      throw dynamicError(solved?.reason || 'DYNAMIC_INITIAL_ACCELERATION_FAILED', 'Initial acceleration solve failed.', solved);
    }
    active.forEach((dof, index) => { acceleration[dof] = Number(solved.x[index]); });
  }
  const kinetic = 0.5 * cscQuadratic(massDomain.matrix, v);
  const strain = Number(evaluation.energies?.strain || 0);
  const plastic = Number(evaluation.energies?.dissipated || evaluation.energies?.plastic || 0);
  const initialMassForce = cscMatVec(massDomain.matrix, acceleration);
  return createNonlinearStateStore({
    domainHash: store.domainHash,
    revision: store.revision,
    eventSequence: store.eventSequence,
    eventLog: store.eventLog,
    committed: {
      ...store.committed,
      q: Array.from(q),
      u: Array.from(evaluation.u),
      v: Array.from(v),
      a: Array.from(acceleration),
      residual: Array.from(rhs, (value, index) => value - initialMassForce[index]),
      energies: {
        ...(store.committed.energies || {}),
        dynamic: {
          baselineKinetic: kinetic,
          baselineStrain: strain,
          baselinePlastic: plastic,
          kinetic,
          strain,
          plastic,
          damping: 0,
          input: 0,
          balanceResidual: 0,
        },
      },
      dynamicInitialization: {
        version: MDOF_NEWMARK_VERSION,
        staticResidual,
        staticLimit,
        groundMotionSetHash: groundMotion.setHash,
        massHash: massDomain.massHash,
        dampingHash: damping.dampingHash,
      },
      converged: true,
    },
  });
}

async function computeAcceptedEnergies(input) {
  const previous = input.originalStore.committed;
  const previousEvaluation = await input.assembler.evaluate({
    q: input.q0,
    lambda: 0,
    committedElementStates: input.committedElementStates,
    dt: input.dt,
    mode: 'dynamic',
  });
  if (!previousEvaluation?.ok) throw dynamicError(previousEvaluation?.reason || 'DYNAMIC_ENERGY_PREVIOUS_EVALUATION_FAILED', previousEvaluation?.message || 'Previous-state energy evaluation failed.');
  const q = input.evaluation.q;
  const v = input.evaluation.v;
  const dq = Float64Array.from(q, (value, index) => value - input.q0[index]);
  const force0 = Float64Array.from(previousEvaluation.pExternalReduced, (value, index) => Number(value) + Number(input.groundMotion.effectiveLoadAt(previous.time)[index]));
  const force1 = input.evaluation.pDynamicExternalReduced;
  const externalIncrement = 0.5 * dotSum(force0, force1, dq);
  const midpointVelocity = Float64Array.from(v, (value, index) => 0.5 * (value + input.v0[index]));
  const dampingForce = cscMatVec(input.damping.matrix, midpointVelocity);
  const dampingPower = dot(midpointVelocity, dampingForce);
  const dampingPowerTolerance = nonnegative(input.options?.dampingPowerTolerance, 1e-10);
  if (dampingPower < -dampingPowerTolerance) {
    throw dynamicError('DYNAMIC_DAMPING_NEGATIVE_POWER', 'The damping matrix produces negative energy dissipation for the accepted step.', {
      dampingPower,
      dampingPowerTolerance,
      dampingHash: input.damping.dampingHash || null,
    });
  }
  const dampingIncrement = input.dt * Math.max(0, dampingPower);
  const prior = previous.energies?.dynamic || {};
  const baselineKinetic = finite(prior.baselineKinetic, 0, 'DYNAMIC_ENERGY_NONFINITE');
  const baselineStrain = finite(prior.baselineStrain, Number(previousEvaluation.energies?.strain || 0), 'DYNAMIC_ENERGY_NONFINITE');
  const baselinePlastic = finite(prior.baselinePlastic, Number(previousEvaluation.energies?.dissipated || previousEvaluation.energies?.plastic || 0), 'DYNAMIC_ENERGY_NONFINITE');
  const kinetic = 0.5 * cscQuadratic(input.massDomain.matrix, v);
  const strain = Number(input.evaluation.energies?.strain || 0);
  const plastic = Number(input.evaluation.energies?.dissipated || input.evaluation.energies?.plastic || 0);
  const dampingEnergy = Number(prior.damping || 0) + dampingIncrement;
  const inputEnergy = Number(prior.input || 0) + externalIncrement;
  const balanceResidual = inputEnergy - (
    kinetic - baselineKinetic
    + strain - baselineStrain
    + plastic - baselinePlastic
    + dampingEnergy
  );
  return Object.freeze({
    baselineKinetic,
    baselineStrain,
    baselinePlastic,
    kinetic,
    strain,
    plastic,
    damping: dampingEnergy,
    input: inputEnergy,
    externalIncrement,
    dampingIncrement,
    dampingPower,
    balanceResidual,
  });
}

async function evaluateCommitted(assembler, store, dt) {
  return assembler.evaluate({
    q: store.committed.q,
    lambda: 0,
    committedElementStates: store.committed.elementStates,
    mode: 'dynamic',
    dt,
  });
}

function trialPatch(evaluation, q, correction, iteration, convergence, dynamicEnergies = null) {
  return {
    time: evaluation.time,
    lambda: 0,
    iteration,
    q: Array.from(q),
    u: Array.from(evaluation.u),
    v: Array.from(evaluation.v),
    a: Array.from(evaluation.a),
    residual: Array.from(evaluation.residualReduced),
    elementStates: evaluation.elementStates,
    energies: dynamicEnergies ? { ...evaluation.energies, dynamic: dynamicEnergies } : evaluation.energies,
    norms: convergence ? { ...convergence.norms, ratios: convergence.ratios, limits: convergence.limits } : {},
    correction: Array.from(correction),
    dynamic: {
      version: MDOF_NEWMARK_VERSION,
      dt: evaluation.dt,
      staticResidualHash: stableHash(Array.from(evaluation.staticResidualReduced)).slice(0, 24),
      dynamicResidualHash: evaluation.dynamicResidualHash,
      effectiveTangentHash: evaluation.tangentReduced.valueHash,
    },
  };
}

function failureResult(originalStore, working, snapshot, reason, iterations = [], details = null, status = 'failed') {
  let rolledBack = originalStore;
  let rollbackError = null;
  try { rolledBack = working ? rollbackStateStep(working) : originalStore; } catch (error) { rollbackError = serializable(error); }
  let rollbackEquivalent = false;
  try { rollbackEquivalent = stateStoreByteSnapshot(rolledBack) === snapshot; } catch (error) { rollbackError ||= serializable(error); }
  return Object.freeze({
    version: MDOF_NEWMARK_VERSION,
    ok: false,
    status,
    reason,
    stateStore: rolledBack,
    rollbackEquivalent,
    committedPreserved: rollbackEquivalent,
    iterations: Object.freeze(iterations.slice()),
    iterationCount: iterations.length,
    details: serializable(details),
    rollbackError,
  });
}

function immediateFailure(store, reason, message = null, details = null) {
  return Object.freeze({
    version: MDOF_NEWMARK_VERSION,
    ok: false,
    status: 'blocked',
    reason,
    message,
    stateStore: store || null,
    rollbackEquivalent: true,
    committedPreserved: true,
    iterations: Object.freeze([]),
    iterationCount: 0,
    details: serializable(details),
  });
}

function runFailure(reason, store, message = null, details = null) {
  return Object.freeze({
    version: MDOF_NEWMARK_VERSION,
    ok: false,
    status: reason === 'ANALYSIS_CANCELLED' ? 'cancelled' : 'blocked',
    reason,
    message,
    details,
    stateStore: store,
    acceptedSteps: Object.freeze([]),
    rejectedSteps: Object.freeze([]),
    acceptedStepCount: 0,
    rejectedStepCount: 0,
  });
}

function iterationRow(iteration, convergence, solved, candidates, acceptedAlpha, evaluation) {
  return Object.freeze({
    iteration,
    norms: convergence.norms,
    ratios: convergence.ratios,
    acceptedAlpha,
    lineSearch: Object.freeze(candidates.slice()),
    backend: solved?.diagnostics || null,
    effectiveTangentHash: evaluation.tangentReduced.valueHash,
    dynamicResidualHash: evaluation.dynamicResidualHash,
  });
}

function resolveDynamicMatrixClass(assembler, requestedClass) {
  if (assembler.requiredMatrixClass === 'general') {
    return Object.freeze({ matrixClass: 'general', reason: 'assembler-required-general' });
  }
  const stateDependentElement = (assembler.elements || []).find((entry) => (
    entry?.usesDistributedFiber === true
    || (Array.isArray(entry?.hingeAssignments) && entry.hingeAssignments.length > 0)
  ));
  if (stateDependentElement) {
    return Object.freeze({
      matrixClass: 'general',
      reason: `state-dependent-dynamic-tangent:${stateDependentElement.id || 'element'}`,
    });
  }
  return String(requestedClass || 'spd').toLowerCase() === 'general'
    ? Object.freeze({ matrixClass: 'general', reason: 'explicit-general-request' })
    : Object.freeze({ matrixClass: 'spd', reason: 'conservative-symmetric-effective-tangent' });
}

function zeroGroundMotion(count) {
  return Object.freeze({
    ok: true,
    effectiveLoadAt: () => new Float64Array(count),
    vectorAt: () => new Float64Array(3),
  });
}

function recoverDynamicElementHistory(evaluation = {}) {
  return Object.freeze(Object.fromEntries(
    Object.entries(evaluation.elementResponses || {}).sort(([left], [right]) => left.localeCompare(right)).map(([elementId, response]) => {
      const local = response.localResponse || {};
      const distributed = local.distributedFiber || null;
      return [elementId, Object.freeze({
        localResistingForce: Object.freeze(Array.from(local.resistingForce || [], Number)),
        hinges: Object.freeze((local.hinges || []).map((hinge) => Object.freeze({
          id: hinge.id,
          propertyId: hinge.propertyId || null,
          end: hinge.end || null,
          axis: hinge.axis || null,
          rotation: Number(hinge.rotation || 0),
          moment: Number(hinge.moment || 0),
          tangent: Number(hinge.tangent || 0),
          state: hinge.state || null,
          branch: hinge.branch || null,
          point: hinge.point || null,
          energies: hinge.energies || null,
        }))),
        distributedFiber: distributed ? Object.freeze({
          sectionId: distributed.sectionId || null,
          integrationRule: distributed.integrationRule || null,
          points: Object.freeze((distributed.points || []).map((point) => Object.freeze({
            id: point.id,
            station: Number(point.station || 0),
            weight: Number(point.weight || 0),
            generalizedStrain: Object.freeze(sectionVector(point.generalizedStrain, ['epsilon0', 'kappaY', 'kappaZ'])),
            force: Object.freeze(sectionVector(point.force, ['N', 'My', 'Mz'])),
            yieldedFiberCount: Number(point.yieldedFiberCount || 0),
            fiberCount: Number(point.fiberCount || 0),
            energy: point.energy || null,
          }))),
        }) : null,
        energies: response.energies || null,
      })];
    }),
  ));
}

function sectionVector(value, keys) {
  const normalize = (item, name) => {
    const number = Number(item ?? 0);
    if (!Number.isFinite(number)) throw dynamicError('DYNAMIC_FIBER_HISTORY_NONFINITE', `${name} must be finite.`);
    return number;
  };
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return Array.from(value, (item, index) => normalize(item, `fiber[${index}]`));
  }
  if (value && typeof value === 'object') return keys.map((key) => normalize(value[key], `fiber.${key}`));
  return [];
}

function stateVector(values, count, name, emptyAsZero = false) {
  if ((values == null || values.length === 0) && emptyAsZero) return new Float64Array(count);
  if (values == null || values.length !== count) throw dynamicError('DYNAMIC_STATE_VECTOR_SIZE', `${name} must contain ${count} values.`);
  return Float64Array.from(values, (value, index) => finite(value, 0, `${name}[${index}]`));
}

function reducedDofKinds(constraint) {
  return (constraint.reducedDofs || []).map((row) => {
    const key = String(row.key || '');
    return /:(3|4|5)$/.test(key) || /:(rx|ry|rz)$/.test(key) ? 'rotation' : 'translation';
  });
}

function residualNorms(values, kinds) {
  let force = 0;
  let moment = 0;
  Array.from(values).forEach((value, index) => {
    if (kinds[index] === 'rotation') moment = Math.max(moment, Math.abs(Number(value)));
    else force = Math.max(force, Math.abs(Number(value)));
  });
  return { force, moment };
}

function scaledResidualNorm(values, kinds, forceScale, momentScale) {
  let sum = 0;
  Array.from(values).forEach((value, index) => {
    const scale = kinds[index] === 'rotation' ? momentScale : forceScale;
    sum += (Number(value) / Math.max(Number.EPSILON, scale)) ** 2;
  });
  return Math.sqrt(sum);
}

function lineSearchAlphas(options) {
  if (options.lineSearch === false) return [1];
  const source = Array.isArray(options.lineSearchAlphas) ? options.lineSearchAlphas : [1, 0.5, 0.25, 0.125, 0.0625];
  const values = [...new Set(source.map(Number).filter((value) => Number.isFinite(value) && value > 0 && value <= 1))].sort((a, b) => b - a);
  return values.length ? values : [1];
}

function expandActiveSolution(values, activeDofs, count) {
  const output = new Float64Array(count);
  activeDofs.forEach((dof, index) => { output[dof] = Number(values[index]); });
  return output;
}

function finiteSolution(values, count) {
  return values != null && values.length === count && Array.from(values).every((value) => Number.isFinite(Number(value)));
}

function maxAbs(values) {
  return Array.from(values || []).reduce((maximum, value) => Math.max(maximum, Math.abs(Number(value))), 0);
}

function dot(left, right) {
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value += Number(left[index]) * Number(right[index]);
  return value;
}

function dotSum(left, right, vector) {
  let value = 0;
  for (let index = 0; index < vector.length; index += 1) value += (Number(left[index]) + Number(right[index])) * Number(vector[index]);
  return value;
}

function cancelled(input) {
  return input.signal?.aborted === true || (typeof input.isCancelled === 'function' && input.isCancelled() === true);
}

function emitProgress(input, payload) {
  if (typeof input.onProgress !== 'function') return;
  try { input.onProgress({ version: MDOF_NEWMARK_VERSION, ...payload }); } catch { /* Callbacks do not own solver state. */ }
}

function timeTolerance(value) {
  return 1e-12 * Math.max(1, Math.abs(Number(value)));
}

function finite(value, fallback, code) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw dynamicError(code, `${code} must be finite.`);
  return number;
}

function positive(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || !(number > 0)) throw dynamicError(code, `${code} must be positive.`);
  return number;
}

function positiveOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonnegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function serializable(value) {
  if (value == null) return value;
  if (value instanceof Error) return { name: value.name, code: value.code || null, message: value.message, details: value.details || null };
  try { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  catch { return { message: String(value) }; }
}

function dynamicError(code, message, details = null) {
  const error = new Error(message);
  error.name = 'MdofNewmarkError';
  error.code = code;
  error.details = details;
  return error;
}
