import { stableHash } from '../../core/stableHash.js';
import {
  acceptTrialBranch,
  beginStateStep,
  commitStateStep,
  createStateCheckpoint,
  forkTrialState,
  restoreStateCheckpoint,
  rollbackStateStep,
  stateStoreByteSnapshot,
  updateTrialState,
} from '../core/stateStore.js';
import { evaluateMdofConvergence } from './convergence.js';
import { prepareMdofActiveSystem } from './newton.js';
import { requireEquilibriumBackend } from './referenceBackends.js';

export const MDOF_ARC_LENGTH_VERSION = 'p8-m7-mdof-crisfield-arc-length-v1';
export const ARC_LENGTH_SCALING_VERSION = 'p8-m7-arc-length-scaling-v1';
export const ARC_LENGTH_RESTART_VERSION = 'p8-m7-arc-length-restart-v1';

const NON_RETRYABLE = new Set([
  'PRODUCTION_BACKEND_UNAVAILABLE',
  'BACKEND_MATRIX_CLASS_UNSUPPORTED',
  'GPU_BACKEND_UNAVAILABLE',
  'GPU_BACKEND_NOT_ENABLED',
  'GPU_BACKEND_QUALIFICATION_REQUIRED',
  'COMPUTE_TARGET_INVALID',
  'MDOF_ASSEMBLER_REQUIRED',
  'STATE_STORE_REQUIRED',
  'STATE_DOMAIN_MISMATCH',
  'STATE_REDUCED_DOF_SIZE_MISMATCH',
  'STATE_TRIAL_ALREADY_ACTIVE',
  'REFERENCE_LOAD_DERIVATIVE_UNSUPPORTED',
  'ARC_LENGTH_RADIUS_INVALID',
  'ARC_LENGTH_ALPHA_INVALID',
  'ARC_LENGTH_WEIGHT_INVALID',
  'ARC_LENGTH_REFERENCE_VECTOR_ZERO',
  'ARC_LENGTH_GAUGE_MODE_EXCITATION',
  'ARC_LENGTH_INACTIVE_DOF_INCREMENT',
  'ARC_LENGTH_HANDOFF_INVALID',
  'ARC_LENGTH_HANDOFF_STATE_MISMATCH',
]);

export function buildArcLengthScaling(domain, options = {}) {
  const dofCount = Number(domain?.constraint?.reducedDofCount || 0);
  if (!domain?.constraint?.ok || dofCount < 1) {
    throw arcError('ARC_LENGTH_DOMAIN_INVALID', 'A canonical domain with active reduced DOFs is required.');
  }
  const alpha = explicitPositive(options.alpha ?? options.loadScale, 1, 'ARC_LENGTH_ALPHA_INVALID');
  const characteristicLength = explicitPositive(
    options.characteristicLength,
    inferCharacteristicLength(domain),
    'ARC_LENGTH_CHARACTERISTIC_LENGTH_INVALID',
  );
  let weights;
  if (options.weights != null) {
    if (options.weights.length !== dofCount) {
      throw arcError('ARC_LENGTH_WEIGHT_SIZE_INVALID', `Arc-length weights must contain ${dofCount} values.`);
    }
    weights = Array.from(options.weights, (value, index) => explicitPositive(
      value,
      null,
      'ARC_LENGTH_WEIGHT_INVALID',
      `weights[${index}]`,
    ));
  } else {
    const translationWeight = explicitPositive(options.translationWeight, 1, 'ARC_LENGTH_WEIGHT_INVALID');
    const rotationLength = explicitPositive(options.rotationLength, characteristicLength, 'ARC_LENGTH_WEIGHT_INVALID');
    weights = reducedDofKinds(domain.constraint).map((kind) => (
      kind === 'rotation' ? rotationLength ** 2 : translationWeight
    ));
  }
  const core = {
    version: ARC_LENGTH_SCALING_VERSION,
    alpha,
    characteristicLength,
    weights,
    dofKinds: reducedDofKinds(domain.constraint),
  };
  return Object.freeze({ ...core, scalingHash: stableHash(core).slice(0, 24) });
}

export function evaluateSphericalArcConstraint(input = {}) {
  const deltaQ = finiteVector(input.deltaQ, input.scaling?.weights?.length, 'deltaQ');
  const deltaLambda = finite(input.deltaLambda, 'deltaLambda');
  const radius = explicitPositive(input.radius, null, 'ARC_LENGTH_RADIUS_INVALID');
  const scaling = requireScaling(input.scaling, deltaQ.length);
  const displacementMeasure = weightedDot(deltaQ, deltaQ, scaling.weights);
  const loadMeasure = scaling.alpha ** 2 * deltaLambda ** 2;
  const measure = displacementMeasure + loadMeasure;
  const target = radius ** 2;
  const residual = target - measure;
  return Object.freeze({
    version: MDOF_ARC_LENGTH_VERSION,
    radius,
    target,
    measure,
    residual,
    absoluteResidual: Math.abs(residual),
    relativeResidual: Math.abs(residual) / Math.max(target, Number.EPSILON),
    displacementMeasure,
    loadMeasure,
  });
}

export function buildCrisfieldPredictor(input = {}) {
  const tangentDirection = finiteVector(input.tangentDirection, input.scaling?.weights?.length, 'tangentDirection');
  const scaling = requireScaling(input.scaling, tangentDirection.length);
  const radius = explicitPositive(input.radius, null, 'ARC_LENGTH_RADIUS_INVALID');
  const denominator = Math.sqrt(
    weightedDot(tangentDirection, tangentDirection, scaling.weights) + scaling.alpha ** 2,
  );
  if (!(denominator > 0) || !Number.isFinite(denominator)) {
    throw arcError('ARC_LENGTH_PREDICTOR_DIRECTION_INVALID', 'The tangent predictor has zero or non-finite generalized norm.');
  }
  const magnitude = radius / denominator;
  const candidates = [1, -1].map((sign) => {
    const deltaLambda = sign * magnitude;
    const deltaQ = tangentDirection.map((value) => value * deltaLambda);
    return Object.freeze({
      sign,
      deltaLambda,
      deltaQ: Object.freeze(deltaQ),
      constraint: evaluateSphericalArcConstraint({ deltaQ, deltaLambda, radius, scaling }),
    });
  });
  const selected = selectCrisfieldBranch(candidates, {
    previousIncrement: input.previousIncrement,
    scaling,
    direction: input.direction,
  });
  return Object.freeze({
    version: MDOF_ARC_LENGTH_VERSION,
    radius,
    denominator,
    candidates,
    selected,
  });
}

export function selectCrisfieldBranch(candidatesInput = [], options = {}) {
  const candidates = candidatesInput.map((candidate, index) => ({
    ...candidate,
    deltaQ: finiteVector(candidate.deltaQ, options.scaling?.weights?.length, `candidates[${index}].deltaQ`),
    deltaLambda: finite(candidate.deltaLambda, `candidates[${index}].deltaLambda`),
  }));
  if (!candidates.length) throw arcError('ARC_LENGTH_BRANCH_CANDIDATE_REQUIRED', 'At least one predictor branch is required.');
  const scaling = requireScaling(options.scaling, candidates[0].deltaQ.length);
  const previous = normalizePreviousIncrement(options.previousIncrement, candidates[0].deltaQ.length);
  const requestedDirection = signOr(options.direction, 1);
  const previousNorm = previous ? generalizedNorm(previous.deltaQ, previous.deltaLambda, scaling) : 0;
  const ranked = candidates.map((candidate, index) => {
    const continuation = previousNorm > 0
      ? generalizedDot(
        previous.deltaQ,
        previous.deltaLambda,
        candidate.deltaQ,
        candidate.deltaLambda,
        scaling,
      )
      : requestedDirection * candidate.deltaLambda;
    return { candidate, continuation, index };
  }).sort((left, right) => (
    right.continuation - left.continuation
    || requestedDirection * (right.candidate.deltaLambda - left.candidate.deltaLambda)
    || left.index - right.index
  ));
  const winner = ranked[0];
  return Object.freeze({
    ...winner.candidate,
    deltaQ: Object.freeze(Array.from(winner.candidate.deltaQ)),
    continuation: winner.continuation,
    previousIncrementUsed: previousNorm > 0,
    candidateScores: Object.freeze(ranked.map((row) => Object.freeze({
      sign: row.candidate.sign ?? (Math.sign(row.candidate.deltaLambda) || 1),
      deltaLambda: row.candidate.deltaLambda,
      continuation: row.continuation,
      selected: row === winner,
    }))),
  });
}

export function buildAugmentedArcLengthSystem(input = {}) {
  const tangent = input.tangent;
  const size = Number(tangent?.colCount || 0);
  if (tangent?.format !== 'csc' || tangent.rowCount !== size || size < 1) {
    throw arcError('ARC_LENGTH_TANGENT_INVALID', 'A square CSC tangent is required.');
  }
  const residual = finiteVector(input.residual, size, 'residual');
  const reference = finiteVector(input.reference, size, 'reference');
  const stepDeltaQ = finiteVector(input.stepDeltaQ, size, 'stepDeltaQ');
  const stepDeltaLambda = finite(input.stepDeltaLambda, 'stepDeltaLambda');
  const scaling = requireScaling(input.scaling, size);
  const constraint = evaluateSphericalArcConstraint({
    deltaQ: stepDeltaQ,
    deltaLambda: stepDeltaLambda,
    radius: input.radius,
    scaling,
  });
  if (!(maxAbs(reference) > 0)) {
    throw arcError('ARC_LENGTH_REFERENCE_VECTOR_ZERO', 'The active reference-load derivative is zero.');
  }
  const gradient = stepDeltaQ.map((value, index) => 2 * scaling.weights[index] * value);
  const lambdaGradient = 2 * scaling.alpha ** 2 * stepDeltaLambda;
  if (!(maxAbs(gradient) > 0) && !(Math.abs(lambdaGradient) > 0)) {
    throw arcError('ARC_LENGTH_CONSTRAINT_GRADIENT_ZERO', 'The spherical constraint gradient is zero.');
  }
  const colPtr = new Int32Array(size + 2);
  const rowIdx = [];
  const values = [];
  for (let column = 0; column < size; column += 1) {
    colPtr[column] = values.length;
    for (let offset = tangent.colPtr[column]; offset < tangent.colPtr[column + 1]; offset += 1) {
      rowIdx.push(Number(tangent.rowIdx[offset]));
      values.push(Number(tangent.values[offset]));
    }
    if (gradient[column] !== 0) {
      rowIdx.push(size);
      values.push(gradient[column]);
    }
  }
  colPtr[size] = values.length;
  for (let row = 0; row < size; row += 1) {
    if (reference[row] === 0) continue;
    rowIdx.push(row);
    values.push(-reference[row]);
  }
  rowIdx.push(size);
  values.push(lambdaGradient);
  colPtr[size + 1] = values.length;
  const matrix = Object.freeze({
    version: MDOF_ARC_LENGTH_VERSION,
    format: 'csc',
    rowCount: size + 1,
    colCount: size + 1,
    nrows: size + 1,
    ncols: size + 1,
    nnz: values.length,
    colPtr,
    rowIdx: Int32Array.from(rowIdx),
    values: Float64Array.from(values),
    patternHash: stableHash({ size, colPtr: Array.from(colPtr), rowIdx }).slice(0, 24),
  });
  const rhs = Float64Array.from([...residual, constraint.residual]);
  const equilibrated = equilibrateAugmentedSystem(matrix, rhs);
  return Object.freeze({
    version: MDOF_ARC_LENGTH_VERSION,
    matrix: equilibrated.matrix,
    rhs: equilibrated.rhs,
    rowScales: equilibrated.rowScales,
    columnScales: equilibrated.columnScales,
    constraint,
    gradient: Object.freeze(gradient),
    lambdaGradient,
  });
}

export function adaptArcLengthRadius(input = {}) {
  const radius = explicitPositive(input.radius, null, 'ARC_LENGTH_RADIUS_INVALID');
  const targetIterations = positiveInteger(input.targetIterations, 5);
  const iterationCount = Math.max(1, positiveInteger(input.iterationCount, 1));
  const minimum = explicitPositive(input.minRadius, radius / 64, 'ARC_LENGTH_RADIUS_INVALID');
  const maximum = explicitPositive(input.maxRadius, radius * 8, 'ARC_LENGTH_RADIUS_INVALID');
  if (minimum > maximum) throw arcError('ARC_LENGTH_RADIUS_BOUNDS_INVALID', 'minRadius must not exceed maxRadius.');
  const shrinkLimit = bounded(input.shrinkLimit, 0.5, 0.05, 1);
  const growthLimit = bounded(input.growthLimit, 1.5, 1, 4);
  const rawFactor = Math.sqrt(targetIterations / iterationCount);
  const factor = Math.min(growthLimit, Math.max(shrinkLimit, rawFactor));
  return Object.freeze({
    radius,
    nextRadius: Math.min(maximum, Math.max(minimum, radius * factor)),
    factor,
    rawFactor,
    targetIterations,
    iterationCount,
    minRadius: minimum,
    maxRadius: maximum,
  });
}

export function buildArcLengthPathDiagnostics(acceptedSteps = [], rejectedSteps = [], options = {}) {
  const pivotWarningRatio = explicitPositive(options.pivotWarningRatio, 1e-8, 'ARC_LENGTH_PIVOT_WARNING_RATIO_INVALID');
  const loadReversals = [];
  const displacementReversals = [];
  let minimumPivotRatio = Infinity;
  let minimumPivotStep = null;
  let previousLoadSign = 0;
  const previousDisplacementSigns = [];
  for (const row of acceptedSteps) {
    const loadSign = Math.sign(Number(row.increment?.deltaLambda || 0));
    if (loadSign && previousLoadSign && loadSign !== previousLoadSign) {
      loadReversals.push({
        step: row.step,
        lambda: row.lambda,
        previousSign: previousLoadSign,
        sign: loadSign,
        type: 'load-limit-point',
      });
    }
    if (loadSign) previousLoadSign = loadSign;
    (row.increment?.deltaQ || []).forEach((value, dof) => {
      const sign = Math.sign(Number(value || 0));
      if (sign && previousDisplacementSigns[dof] && sign !== previousDisplacementSigns[dof]) {
        displacementReversals.push({
          step: row.step,
          dof,
          lambda: row.lambda,
          previousSign: previousDisplacementSigns[dof],
          sign,
          type: 'displacement-path-reversal',
        });
      }
      if (sign) previousDisplacementSigns[dof] = sign;
    });
    for (const iteration of row.iterations || []) {
      const ratio = Number(iteration.backend?.pivotRatio);
      if (Number.isFinite(ratio) && ratio >= 0 && ratio < minimumPivotRatio) {
        minimumPivotRatio = ratio;
        minimumPivotStep = row.step;
      }
    }
    const predictorRatio = Number(row.diagnostics?.predictorSolve?.pivotRatio);
    if (Number.isFinite(predictorRatio) && predictorRatio >= 0 && predictorRatio < minimumPivotRatio) {
      minimumPivotRatio = predictorRatio;
      minimumPivotStep = row.step;
    }
  }
  const warnings = [];
  if (Number.isFinite(minimumPivotRatio) && minimumPivotRatio < pivotWarningRatio) {
    warnings.push({
      code: 'ARC_LENGTH_NEAR_SINGULAR_PATH',
      message: 'A small pivot ratio indicates a near-singular path; inspect for a limit point or possible bifurcation.',
      step: minimumPivotStep,
      pivotRatio: minimumPivotRatio,
      threshold: pivotWarningRatio,
      classification: 'screening-not-eigenvalue-bifurcation-proof',
    });
  }
  if (loadReversals.length) {
    warnings.push({
      code: 'ARC_LENGTH_LOAD_LIMIT_POINT_CROSSED',
      message: 'The accepted path contains a load-increment sign reversal.',
      steps: loadReversals.map((row) => row.step),
    });
  }
  if (displacementReversals.length) {
    warnings.push({
      code: 'ARC_LENGTH_DISPLACEMENT_REVERSAL_CROSSED',
      message: 'The accepted path contains one or more displacement-increment reversals.',
      steps: [...new Set(displacementReversals.map((row) => row.step))],
    });
  }
  return Object.freeze({
    version: MDOF_ARC_LENGTH_VERSION,
    acceptedStepCount: acceptedSteps.length,
    rejectedStepCount: rejectedSteps.length,
    loadReversals: Object.freeze(loadReversals),
    displacementReversals: Object.freeze(displacementReversals),
    minimumPivotRatio: Number.isFinite(minimumPivotRatio) ? minimumPivotRatio : null,
    minimumPivotStep,
    rejectedReasons: Object.freeze(Object.entries(countBy(rejectedSteps, (row) => row.reason))
      .map(([reason, count]) => Object.freeze({ reason, count }))),
    warnings: Object.freeze(warnings),
  });
}

export async function solveMdofArcLengthStep(input = {}) {
  const assembler = input.assembler;
  const originalStore = input.stateStore;
  if (!assembler?.domain?.constraint?.ok || typeof assembler.evaluate !== 'function') {
    return immediateFailure(originalStore, 'MDOF_ASSEMBLER_REQUIRED');
  }
  if (!originalStore?.committed) return immediateFailure(originalStore, 'STATE_STORE_REQUIRED');
  if (originalStore.trial) return immediateFailure(originalStore, 'STATE_TRIAL_ALREADY_ACTIVE');
  if (assembler.referenceLoadDerivative?.ok !== true) {
    return immediateFailure(
      originalStore,
      assembler.referenceLoadDerivative?.reason || 'REFERENCE_LOAD_DERIVATIVE_UNSUPPORTED',
      null,
      assembler.referenceLoadDerivative,
    );
  }
  const domainHash = assembler.domain.identity?.domainHash || assembler.domain.hashes?.domainHash || null;
  if (originalStore.domainHash && domainHash && originalStore.domainHash !== domainHash) {
    return immediateFailure(originalStore, 'STATE_DOMAIN_MISMATCH');
  }
  const options = input.options || {};
  const reducedDofCount = assembler.domain.constraint.reducedDofCount;
  let radius;
  let scaling;
  let q0;
  let lambda0;
  let previousIncrement;
  try {
    radius = explicitPositive(input.radius ?? options.radius, null, 'ARC_LENGTH_RADIUS_INVALID');
    scaling = input.scaling?.version === ARC_LENGTH_SCALING_VERSION
      ? requireScaling(input.scaling, reducedDofCount)
      : buildArcLengthScaling(assembler.domain, {
        characteristicLength: assembler.characteristicLength,
        ...(options.scaling || {}),
        alpha: options.alpha ?? options.scaling?.alpha,
      });
    q0 = finiteVector(originalStore.committed.q, reducedDofCount, 'state.q');
    lambda0 = finite(originalStore.committed.lambda, 'state.lambda');
    previousIncrement = normalizePreviousIncrement(
      input.previousIncrement || originalStore.committed.arcLength?.increment,
      reducedDofCount,
    );
  } catch (error) {
    return immediateFailure(originalStore, error.code || 'ARC_LENGTH_INPUT_INVALID', error.message, error.details);
  }
  let backend;
  try {
    backend = requireEquilibriumBackend(input.backend, {
      production: input.production === true,
      matrixClass: 'general',
      dofCount: reducedDofCount + 1,
      memoryLimitBytes: options.memoryLimitBytes,
      backendPreference: options.backendPreference,
      gpuEnabled: options.gpuEnabled === true,
    });
  } catch (error) {
    return immediateFailure(originalStore, error.code || 'BACKEND_PREFLIGHT_FAILED', error.message, error.preflight || error.details);
  }
  const originalSnapshot = stateStoreByteSnapshot(originalStore);
  const committedElementStates = originalStore.committed.elementStates || {};
  let evaluation0 = await safeEvaluate(assembler, q0, lambda0, committedElementStates, input.mode || 'static');
  if (!evaluation0.ok) return immediateFailure(originalStore, evaluation0.reason, evaluation0.message, evaluation0);
  let active0;
  let predictorSolve;
  let predictor;
  try {
    validateGaugeProjection(evaluation0, evaluation0.dResidualDlambdaReduced, options);
    active0 = prepareMdofActiveSystem(evaluation0, assembler, options);
    const activeReference = select(evaluation0.dResidualDlambdaReduced, active0.activeDofs);
    if (!(maxAbs(activeReference) > 0)) throw arcError('ARC_LENGTH_REFERENCE_VECTOR_ZERO', 'The active reference-load derivative is zero.');
    predictorSolve = await backend.solve(active0.matrix, activeReference, linearSolveOptions(options));
    if (!predictorSolve?.ok || !finiteSolution(predictorSolve.x, active0.activeDofCount)) {
      throw arcError(predictorSolve?.reason || 'ARC_LENGTH_PREDICTOR_SOLVE_FAILED', 'The arc-length tangent predictor could not be solved.', predictorSolve);
    }
    const tangentDirection = expand(predictorSolve.x, active0.activeDofs, reducedDofCount);
    predictor = buildCrisfieldPredictor({
      tangentDirection,
      radius,
      scaling,
      previousIncrement,
      direction: input.direction ?? options.direction,
    });
  } catch (error) {
    return immediateFailure(originalStore, error.code || 'ARC_LENGTH_PREDICTOR_FAILED', error.message, error.details || error);
  }
  const q = Float64Array.from(q0, (value, index) => value + predictor.selected.deltaQ[index]);
  let currentQ = q;
  let currentLambda = lambda0 + predictor.selected.deltaLambda;
  let correction = Float64Array.from(predictor.selected.deltaQ);
  let lambdaCorrection = predictor.selected.deltaLambda;
  let evaluation = await safeEvaluate(assembler, currentQ, currentLambda, committedElementStates, input.mode || 'static');
  if (!evaluation.ok) return immediateFailure(originalStore, evaluation.reason, evaluation.message, evaluation);
  let working;
  try {
    working = beginStateStep(originalStore, {
      lambda: currentLambda,
      iteration: 0,
      q: currentQ,
      solver: MDOF_ARC_LENGTH_VERSION,
      arcLength: { radius, scalingHash: scaling.scalingHash, phase: 'predictor' },
    });
    working = updateTrialState(working, trialPatch({
      evaluation,
      q: currentQ,
      correction,
      lambdaCorrection,
      q0,
      lambda0,
      iteration: 0,
      convergence: null,
      constraint: predictor.selected.constraint,
      radius,
      scaling,
      predictor,
    }));
  } catch (error) {
    return failed(originalStore, working, originalSnapshot, error.code || 'STATE_STEP_BEGIN_FAILED', [], error);
  }
  const maxIterations = positiveInteger(options.maxIterations, 30);
  const dofKinds = reducedDofKinds(assembler.domain.constraint);
  const forceScale = Math.max(
    1,
    maxAbs(evaluation0.pExternalReduced),
    maxAbs(evaluation.pExternalReduced),
    maxAbs(evaluation.dResidualDlambdaReduced) * Math.max(1, Math.abs(currentLambda)),
  );
  const iterations = [];
  let solveCount = 1;

  for (let iteration = 0; iteration <= maxIterations; iteration += 1) {
    if (cancelled(input)) return failed(originalStore, working, originalSnapshot, 'ANALYSIS_CANCELLED', iterations, null, 'cancelled');
    const stepDeltaQ = subtract(currentQ, q0);
    const stepDeltaLambda = currentLambda - lambda0;
    const constraint = evaluateSphericalArcConstraint({
      deltaQ: stepDeltaQ,
      deltaLambda: stepDeltaLambda,
      radius,
      scaling,
    });
    let equilibrium;
    try {
      equilibrium = evaluateMdofConvergence({
        residual: evaluation.residualReduced,
        correction,
        q: currentQ,
        external: evaluation.pExternalReduced,
        initialForceResidualNorm: maxAbs(evaluation.residualReduced),
        initialMomentResidualNorm: maxAbs(evaluation.residualReduced),
        forceScale,
        momentScale: forceScale * Math.max(1, assembler.characteristicLength || 1),
        displacementScale: radius,
        rotationScale: radius / Math.max(1, assembler.characteristicLength || 1),
        dofKinds,
      }, options.convergence);
    } catch (error) {
      return failed(originalStore, working, originalSnapshot, error.code || 'CONVERGENCE_EVALUATION_FAILED', iterations, error);
    }
    const arcLimit = nonnegative(options.arcAbsolute, 1e-12)
      + nonnegative(options.arcRelative, 1e-8) * radius ** 2;
    const arcPass = constraint.absoluteResidual <= arcLimit;
    const convergence = {
      ...equilibrium,
      converged: equilibrium.pass.force && arcPass,
      arc: { ...constraint, limit: arcLimit, pass: arcPass },
    };
    if (convergence.converged) {
      try {
        const adaptation = adaptArcLengthRadius({
          radius,
          iterationCount: Math.max(1, solveCount),
          targetIterations: options.targetIterations,
          minRadius: options.minRadius,
          maxRadius: options.maxRadius,
          shrinkLimit: options.shrinkLimit,
          growthLimit: options.growthLimit,
        });
        const increment = Object.freeze({
          deltaQ: Object.freeze(Array.from(stepDeltaQ)),
          deltaLambda: stepDeltaLambda,
          generalizedNorm: generalizedNorm(stepDeltaQ, stepDeltaLambda, scaling),
          branchSign: Math.sign(stepDeltaLambda) || predictor.selected.sign,
          incrementHash: stableHash({ deltaQ: Array.from(stepDeltaQ), deltaLambda: stepDeltaLambda }).slice(0, 24),
        });
        working = updateTrialState(working, trialPatch({
          evaluation,
          q: currentQ,
          correction,
          lambdaCorrection,
          q0,
          lambda0,
          iteration,
          convergence,
          constraint,
          radius,
          scaling,
          predictor,
          increment,
          nextRadius: adaptation.nextRadius,
        }));
        const hingeEvents = collectHingeEvents(evaluation, iteration);
        const committed = commitStateStep(working, {
          converged: true,
          events: [
            {
              type: 'arc-length-converged',
              lambda: currentLambda,
              deltaLambda: stepDeltaLambda,
              radius,
              nextRadius: adaptation.nextRadius,
              iterations: solveCount,
              branchSign: increment.branchSign,
            },
            ...hingeEvents,
          ],
        });
        emit(input, { type: 'arc-length-step-converged', lambda: currentLambda, radius, iteration, branchSign: increment.branchSign });
        return {
          version: MDOF_ARC_LENGTH_VERSION,
          ok: true,
          status: 'converged',
          reason: 'CONVERGED',
          radius,
          nextRadius: adaptation.nextRadius,
          adaptation,
          scaling,
          predictor,
          increment,
          q: Float64Array.from(currentQ),
          u: Float64Array.from(evaluation.u),
          lambda: currentLambda,
          stateStore: committed,
          evaluation,
          convergence,
          hingeEvents,
          iterations,
          iterationCount: solveCount,
          backend: backend.id,
          pathDiagnostics: {
            predictorSolve: clone(predictorSolve?.diagnostics || null),
            tangent: tangentDiagnostics(evaluation.tangentReduced),
          },
        };
      } catch (error) {
        return failed(originalStore, working, originalSnapshot, error.code || 'STATE_STEP_COMMIT_FAILED', iterations, error);
      }
    }
    if (iteration === maxIterations) {
      return failed(originalStore, working, originalSnapshot, 'MAX_ITERATIONS', iterations, { convergence });
    }
    let active;
    let augmented;
    let solved;
    try {
      validateGaugeProjection(evaluation, evaluation.dResidualDlambdaReduced, options);
      active = prepareMdofActiveSystem(evaluation, assembler, options);
      validateInactiveIncrement(stepDeltaQ, active.activeDofs, options);
      augmented = buildAugmentedArcLengthSystem({
        tangent: active.matrix,
        residual: active.rhs,
        reference: select(evaluation.dResidualDlambdaReduced, active.activeDofs),
        stepDeltaQ: select(stepDeltaQ, active.activeDofs),
        stepDeltaLambda,
        radius,
        scaling: selectScaling(scaling, active.activeDofs),
      });
      solved = await backend.solve(augmented.matrix, augmented.rhs, linearSolveOptions(options));
    } catch (error) {
      return failed(originalStore, working, originalSnapshot, error.code || 'ARC_LENGTH_AUGMENTED_SYSTEM_FAILED', iterations, error);
    }
    solveCount += 1;
    if (!solved?.ok || !finiteSolution(solved.x, active.activeDofCount + 1)) {
      return failed(originalStore, working, originalSnapshot, solved?.reason || 'LINEAR_SOLVE_FAILED', iterations, solved);
    }
    const physical = Float64Array.from(solved.x, (value, index) => Number(value) * Number(augmented.columnScales[index]));
    const activeDeltaQ = physical.slice(0, active.activeDofCount);
    const deltaQ = expand(activeDeltaQ, active.activeDofs, reducedDofCount);
    const deltaLambda = Number(physical[active.activeDofCount]);
    const linearResidual = augmentedLinearResidual({
      tangent: active.matrix,
      deltaQ: activeDeltaQ,
      reference: select(evaluation.dResidualDlambdaReduced, active.activeDofs),
      deltaLambda,
      residual: active.rhs,
      gradient: augmented.gradient,
      lambdaGradient: augmented.lambdaGradient,
      constraintResidual: augmented.constraint.residual,
    });
    if (linearResidual.relative > explicitPositive(options.linearRelativeTolerance, 1e-9, 'ARC_LENGTH_LINEAR_TOLERANCE_INVALID')) {
      return failed(originalStore, working, originalSnapshot, 'ARC_LENGTH_LINEAR_RESIDUAL_FAILED', iterations, linearResidual);
    }
    const baseline = augmentedMerit(evaluation.residualReduced, constraint, forceScale);
    const candidates = [];
    let selectedCandidate = null;
    const continuityIncrement = previousIncrement || {
      deltaQ: predictor.selected.deltaQ,
      deltaLambda: predictor.selected.deltaLambda,
    };
    for (const lineAlpha of lineSearchAlphas(options)) {
      const candidateQ = Float64Array.from(currentQ, (value, index) => value + lineAlpha * deltaQ[index]);
      const candidateLambda = currentLambda + lineAlpha * deltaLambda;
      const candidateEvaluation = await safeEvaluate(
        assembler,
        candidateQ,
        candidateLambda,
        committedElementStates,
        input.mode || 'static',
      );
      if (!candidateEvaluation.ok) {
        candidates.push({ alpha: lineAlpha, ok: false, reason: candidateEvaluation.reason });
        continue;
      }
      const candidateStepDeltaQ = subtract(candidateQ, q0);
      const candidateStepDeltaLambda = candidateLambda - lambda0;
      const candidateConstraint = evaluateSphericalArcConstraint({
        deltaQ: candidateStepDeltaQ,
        deltaLambda: candidateStepDeltaLambda,
        radius,
        scaling,
      });
      const continuation = generalizedDot(
        continuityIncrement.deltaQ,
        continuityIncrement.deltaLambda,
        candidateStepDeltaQ,
        candidateStepDeltaLambda,
        scaling,
      );
      const merit = augmentedMerit(candidateEvaluation.residualReduced, candidateConstraint, forceScale);
      const branchPass = continuation >= -nonnegative(options.branchTolerance, 1e-12) * radius ** 2;
      const meritPass = options.lineSearch === false
        || merit <= baseline * Math.max(0, 1 - explicitPositive(options.armijo, 1e-4, 'ARC_LENGTH_ARMIJO_INVALID') * lineAlpha)
        + nonnegative(options.meritTolerance, 1e-14);
      const accepted = branchPass && meritPass;
      candidates.push({
        alpha: lineAlpha,
        ok: true,
        merit,
        accepted,
        branchPass,
        continuation,
        lambda: candidateLambda,
        arcRelativeResidual: candidateConstraint.relativeResidual,
      });
      if (!accepted) continue;
      const candidateCorrection = Float64Array.from(deltaQ, (value) => lineAlpha * value);
      const candidateLambdaCorrection = lineAlpha * deltaLambda;
      const branch = forkTrialState(working, `arc-${iteration + 1}-alpha-${lineAlpha}`, trialPatch({
        evaluation: candidateEvaluation,
        q: candidateQ,
        correction: candidateCorrection,
        lambdaCorrection: candidateLambdaCorrection,
        q0,
        lambda0,
        iteration: iteration + 1,
        convergence: null,
        constraint: candidateConstraint,
        radius,
        scaling,
        predictor,
      }));
      selectedCandidate = {
        alpha: lineAlpha,
        q: candidateQ,
        lambda: candidateLambda,
        correction: candidateCorrection,
        lambdaCorrection: candidateLambdaCorrection,
        evaluation: candidateEvaluation,
        constraint: candidateConstraint,
        continuation,
        branch,
      };
      break;
    }
    if (!selectedCandidate) {
      return failed(originalStore, working, originalSnapshot, 'ARC_LENGTH_LINE_SEARCH_FAILED', iterations, { baseline, candidates });
    }
    try {
      working = acceptTrialBranch(working, selectedCandidate.branch);
    } catch (error) {
      return failed(originalStore, working, originalSnapshot, error.code || 'STATE_BRANCH_ACCEPT_FAILED', iterations, error);
    }
    currentQ = selectedCandidate.q;
    currentLambda = selectedCandidate.lambda;
    correction = selectedCandidate.correction;
    lambdaCorrection = selectedCandidate.lambdaCorrection;
    evaluation = selectedCandidate.evaluation;
    iterations.push({
      iteration: iteration + 1,
      lambda: currentLambda,
      radius,
      acceptedAlpha: selectedCandidate.alpha,
      continuation: selectedCandidate.continuation,
      arcRelativeResidual: selectedCandidate.constraint.relativeResidual,
      norms: convergence.norms,
      ratios: convergence.ratios,
      backend: solved.diagnostics || null,
      linearResidual,
      lineSearch: candidates,
    });
    emit(input, {
      type: 'arc-length-iteration',
      iteration: iteration + 1,
      lambda: currentLambda,
      radius,
      arcRelativeResidual: selectedCandidate.constraint.relativeResidual,
    });
  }
  return failed(originalStore, working, originalSnapshot, 'MAX_ITERATIONS', iterations);
}

export async function runMdofArcLength(input = {}) {
  const resolved = resolveRunState(input);
  if (!resolved.ok) return runResult(false, resolved.reason, resolved.stateStore, [], [], null, 'blocked', resolved.details);
  const options = input.options || {};
  const maxSteps = positiveInteger(options.steps, 20);
  const maxAttempts = positiveInteger(options.maxAttempts, Math.max(100, maxSteps * 20));
  const cutbackFactor = bounded(options.cutbackFactor, 0.5, 0.05, 0.95);
  let store = resolved.stateStore;
  let previousIncrement = resolved.previousIncrement
    || normalizePreviousIncrement(store.committed.arcLength?.increment, store.committed.q.length);
  let radius;
  try {
    radius = explicitPositive(
      options.initialRadius ?? options.radius ?? store.committed.arcLength?.nextRadius,
      null,
      'ARC_LENGTH_RADIUS_INVALID',
    );
  } catch (error) {
    return runResult(false, error.code, store, [], [], null, 'blocked', serialize(error));
  }
  let minRadius;
  try {
    minRadius = explicitPositive(options.minRadius, radius / 64, 'ARC_LENGTH_RADIUS_INVALID');
    const maxRadius = explicitPositive(options.maxRadius, radius * 8, 'ARC_LENGTH_RADIUS_INVALID');
    if (minRadius > maxRadius) {
      throw arcError('ARC_LENGTH_RADIUS_BOUNDS_INVALID', 'minRadius must not exceed maxRadius.');
    }
  } catch (error) {
    return runResult(false, error.code, store, [], [], radius, 'blocked', serialize(error));
  }
  const acceptedSteps = [];
  const rejectedSteps = [];
  let attempts = 0;
  let termination = null;

  while (acceptedSteps.length < maxSteps) {
    attempts += 1;
    if (attempts > maxAttempts) {
      return runResult(false, 'ARC_LENGTH_ATTEMPT_LIMIT', store, acceptedSteps, rejectedSteps, radius, 'failed', {
        source: resolved.source,
      });
    }
    const step = await solveMdofArcLengthStep({
      ...input,
      stateStore: store,
      previousIncrement,
      radius,
      options: {
        ...options,
        minRadius,
        maxRadius: options.maxRadius,
      },
      onProgress: (row) => emit(input, { ...row, attempt: attempts, acceptedStep: acceptedSteps.length + 1 }),
    });
    if (!step.ok) {
      const rejected = {
        attempt: attempts,
        radius,
        reason: step.reason,
        status: step.status,
        rollbackEquivalent: step.rollbackEquivalent,
        details: step.details || null,
      };
      rejectedSteps.push(rejected);
      try {
        input.onReject?.(Object.freeze({ ...rejected, stateStore: store }));
      } catch (error) {
        return runResult(false, 'ARC_LENGTH_REJECT_CALLBACK_FAILED', store, acceptedSteps, rejectedSteps, radius, 'failed', {
          source: resolved.source,
          callbackError: serialize(error),
        });
      }
      if (step.status === 'cancelled' || step.reason === 'ANALYSIS_CANCELLED') {
        return runResult(false, 'ANALYSIS_CANCELLED', store, acceptedSteps, rejectedSteps, radius, 'cancelled', {
          source: resolved.source,
        });
      }
      if (step.status === 'blocked' || NON_RETRYABLE.has(step.reason)) {
        return runResult(false, step.reason, store, acceptedSteps, rejectedSteps, radius, 'blocked', {
          source: resolved.source,
        });
      }
      const next = radius * cutbackFactor;
      if (next < minRadius - scalarTolerance(minRadius)) {
        return runResult(false, 'MINIMUM_ARC_LENGTH_RADIUS_REACHED', store, acceptedSteps, rejectedSteps, radius, 'failed', {
          source: resolved.source,
        });
      }
      radius = Math.max(minRadius, next);
      emit(input, { type: 'arc-length-step-rejected', attempt: attempts, reason: step.reason, nextRadius: radius });
      continue;
    }
    store = step.stateStore;
    previousIncrement = step.increment;
    radius = step.nextRadius;
    const accepted = {
      step: acceptedSteps.length + 1,
      attempt: attempts,
      radius: step.radius,
      nextRadius: step.nextRadius,
      lambda: step.lambda,
      q: Array.from(step.q),
      u: Array.from(step.u),
      increment: step.increment,
      iterationCount: step.iterationCount,
      convergence: step.convergence,
      hingeEvents: step.hingeEvents,
      responseHash: step.evaluation.responseHash,
      evaluation: step.evaluation,
      stateStore: step.stateStore,
      backend: step.backend,
      iterations: step.iterations,
      diagnostics: step.pathDiagnostics,
    };
    acceptedSteps.push(accepted);
    try {
      input.onCommit?.(Object.freeze(accepted));
    } catch (error) {
      return runResult(false, 'ARC_LENGTH_COMMIT_CALLBACK_FAILED', store, acceptedSteps, rejectedSteps, radius, 'failed', {
        source: resolved.source,
        callbackError: serialize(error),
      });
    }
    emit(input, { type: 'arc-length-step-accepted', step: accepted.step, lambda: step.lambda, radius: step.radius });
    if (typeof input.shouldTerminate === 'function') {
      const decision = input.shouldTerminate(accepted, {
        acceptedSteps,
        rejectedSteps,
        radius,
        previousIncrement,
      });
      if (decision?.stop) {
        termination = decision;
        break;
      }
    }
  }
  const reason = termination?.reason || 'ARC_LENGTH_STEPS_COMPLETED';
  const ok = termination == null || termination.ok !== false;
  const checkpoint = createStateCheckpoint(store, {
    version: ARC_LENGTH_RESTART_VERSION,
    role: 'arc-length-restart',
    reason,
    nextRadius: radius,
    previousIncrementHash: previousIncrement?.incrementHash || null,
  });
  return runResult(ok, reason, store, acceptedSteps, rejectedSteps, radius, ok ? 'converged' : 'terminated', {
    termination,
    restartCheckpoint: checkpoint,
    previousIncrement,
    source: resolved.source,
  });
}

function resolveRunState(input) {
  let stateStore = input.stateStore || null;
  let source = 'state-store';
  try {
    if (input.checkpoint) {
      const domainHash = input.assembler?.domain?.identity?.domainHash || input.assembler?.domain?.hashes?.domainHash || null;
      const restored = restoreStateCheckpoint(input.checkpoint, { domainHash });
      if (stateStore && stateStoreByteSnapshot(stateStore) !== stateStoreByteSnapshot(restored)) {
        throw arcError('ARC_LENGTH_HANDOFF_STATE_MISMATCH', 'The supplied state store does not match the restart checkpoint.');
      }
      stateStore = restored;
      source = 'checkpoint';
    }
    if (!stateStore?.committed) return { ok: false, reason: 'STATE_STORE_REQUIRED', stateStore, source };
    let previousIncrement = normalizePreviousIncrement(
      input.handoff?.sourceIncrement || input.previousIncrement || stateStore.committed.arcLength?.increment,
      stateStore.committed.q.length,
    );
    if (input.handoff) {
      const handoff = input.handoff;
      if (handoff.targetEngine !== 'p8-m7-arc-length' || (handoff.eligible === false && input.allowIneligibleHandoff !== true)) {
        throw arcError('ARC_LENGTH_HANDOFF_INVALID', 'The displacement-control handoff is not eligible for M7 arc-length continuation.');
      }
      if (handoff.sourceStateHash && handoff.sourceStateHash !== stateStore.committedHash) {
        throw arcError('ARC_LENGTH_HANDOFF_STATE_MISMATCH', 'The handoff committed-state hash does not match the restored state.');
      }
      if (input.checkpoint && handoff.checkpointRef && handoff.checkpointRef !== input.checkpoint.integrityHash) {
        throw arcError('ARC_LENGTH_HANDOFF_STATE_MISMATCH', 'The handoff checkpoint reference does not match the supplied checkpoint.');
      }
      source = 'displacement-control-handoff';
      previousIncrement ||= normalizePreviousIncrement(handoff.sourceIncrement, stateStore.committed.q.length);
    }
    return { ok: true, stateStore, previousIncrement, source };
  } catch (error) {
    return {
      ok: false,
      reason: error.code || 'ARC_LENGTH_HANDOFF_INVALID',
      stateStore,
      source,
      details: serialize(error),
    };
  }
}

function trialPatch(input) {
  const stepDeltaQ = subtract(input.q, input.q0);
  const stepDeltaLambda = Number(input.evaluation.lambda) - Number(input.lambda0);
  const increment = input.increment || {
    deltaQ: Array.from(stepDeltaQ),
    deltaLambda: stepDeltaLambda,
    generalizedNorm: generalizedNorm(stepDeltaQ, stepDeltaLambda, input.scaling),
    branchSign: Math.sign(stepDeltaLambda) || input.predictor.selected.sign,
  };
  return {
    lambda: input.evaluation.lambda,
    iteration: input.iteration,
    q: Array.from(input.q),
    u: Array.from(input.evaluation.u),
    residual: Array.from(input.evaluation.residualReduced),
    elementStates: input.evaluation.elementStates,
    energies: input.evaluation.energies,
    norms: input.convergence ? {
      ...input.convergence.norms,
      ratios: input.convergence.ratios,
      arc: input.convergence.arc,
    } : {},
    correction: Array.from(input.correction),
    lambdaCorrection: input.lambdaCorrection,
    arcLength: {
      version: MDOF_ARC_LENGTH_VERSION,
      phase: input.convergence?.converged ? 'converged' : input.iteration > 0 ? 'corrector' : 'predictor',
      radius: input.radius,
      nextRadius: input.nextRadius ?? input.radius,
      scalingHash: input.scaling.scalingHash,
      alpha: input.scaling.alpha,
      constraint: input.constraint,
      increment,
      predictorSign: input.predictor.selected.sign,
      predictorContinuation: input.predictor.selected.continuation,
    },
  };
}

function collectHingeEvents(evaluation, iteration) {
  return Object.entries(evaluation.elementResponses || {}).flatMap(([memberId, response]) => (
    (response.localResponse?.hinges || []).flatMap((hinge) => (hinge.events || []).map((event) => ({
      ...event,
      memberId,
      hingeId: hinge.id,
      propertyId: hinge.propertyId,
      end: hinge.end,
      axis: hinge.axis,
      iteration,
    })))
  ));
}

function failed(originalStore, working, snapshot, reason, iterations = [], details = null, status = 'failed') {
  let rolledBack = originalStore;
  let rollbackError = null;
  try { rolledBack = working ? rollbackStateStep(working) : originalStore; }
  catch (error) { rollbackError = serialize(error); }
  let rollbackEquivalent = false;
  try { rollbackEquivalent = stateStoreByteSnapshot(rolledBack) === snapshot; }
  catch (error) { rollbackError ||= serialize(error); }
  return {
    version: MDOF_ARC_LENGTH_VERSION,
    ok: false,
    status,
    reason,
    stateStore: rolledBack,
    rollbackEquivalent,
    committedPreserved: rollbackEquivalent,
    iterations,
    iterationCount: iterations.length,
    details: serialize(details),
    rollbackError,
  };
}

function immediateFailure(store, reason, message = null, details = null) {
  return {
    version: MDOF_ARC_LENGTH_VERSION,
    ok: false,
    status: 'blocked',
    reason,
    message,
    details: serialize(details),
    stateStore: store || null,
    rollbackEquivalent: true,
    committedPreserved: true,
    iterations: [],
    iterationCount: 0,
  };
}

function runResult(ok, reason, stateStore, acceptedSteps, rejectedSteps, nextRadius, status, extra = {}) {
  const pathDiagnostics = buildArcLengthPathDiagnostics(acceptedSteps, rejectedSteps, extra.pathDiagnosticOptions);
  const { pathDiagnosticOptions: _pathDiagnosticOptions, ...publicExtra } = extra;
  return {
    version: MDOF_ARC_LENGTH_VERSION,
    ok,
    status,
    reason,
    finalLambda: Number(stateStore?.committed?.lambda || 0),
    finalQ: Array.from(stateStore?.committed?.q || []),
    nextRadius,
    stateStore,
    acceptedSteps,
    rejectedSteps,
    acceptedStepCount: acceptedSteps.length,
    rejectedStepCount: rejectedSteps.length,
    cutbackCount: rejectedSteps.length,
    pathDiagnostics,
    ...publicExtra,
  };
}

function tangentDiagnostics(matrix) {
  if (matrix?.format !== 'csc') return null;
  const diagonal = new Array(matrix.colCount).fill(0);
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      if (matrix.rowIdx[offset] === column) diagonal[column] += Number(matrix.values[offset]);
    }
  }
  return {
    minimumDiagonal: diagonal.length ? Math.min(...diagonal) : null,
    maximumDiagonal: diagonal.length ? Math.max(...diagonal) : null,
    negativeDiagonalCount: diagonal.filter((value) => value < 0).length,
    zeroDiagonalCount: diagonal.filter((value) => value === 0).length,
    classification: 'diagonal-screening-not-inertia-or-eigenvalue-count',
  };
}

function countBy(rows, selector) {
  const out = {};
  for (const row of rows || []) {
    const key = String(selector(row) || 'UNKNOWN');
    out[key] = Number(out[key] || 0) + 1;
  }
  return out;
}

async function safeEvaluate(assembler, q, lambda, committedElementStates, mode) {
  try {
    const evaluation = await assembler.evaluate({ q, lambda, committedElementStates, mode });
    return evaluation && typeof evaluation === 'object'
      ? evaluation
      : { ok: false, reason: 'ASSEMBLER_EVALUATION_INVALID' };
  } catch (error) {
    return { ok: false, reason: error.code || 'ASSEMBLER_EVALUATION_FAILED', message: error.message };
  }
}

function validateGaugeProjection(evaluation, reference, options) {
  const tolerance = explicitPositive(options.gaugeProjectionTolerance, 1e-10, 'ARC_LENGTH_GAUGE_TOLERANCE_INVALID');
  for (const group of evaluation.inactiveModeGroupsReduced || []) {
    for (const mode of group || []) {
      const scale = Math.max(1, maxAbs(mode));
      if (Math.abs(dot(mode, reference)) > tolerance * scale * Math.max(1, maxAbs(reference))) {
        throw arcError('ARC_LENGTH_GAUGE_MODE_EXCITATION', 'The reference load projects onto an approved gauge mode.');
      }
    }
  }
}

function validateInactiveIncrement(stepDeltaQ, activeDofs, options) {
  const active = new Set(activeDofs);
  const tolerance = nonnegative(options.inactiveIncrementTolerance, 1e-12);
  for (let index = 0; index < stepDeltaQ.length; index += 1) {
    if (!active.has(index) && Math.abs(stepDeltaQ[index]) > tolerance) {
      throw arcError('ARC_LENGTH_INACTIVE_DOF_INCREMENT', `Inactive reduced DOF ${index} contains a nonzero arc increment.`);
    }
  }
}

function equilibrateAugmentedSystem(matrix, rhs) {
  const size = matrix.rowCount;
  const rowMax = new Float64Array(size);
  for (let column = 0; column < size; column += 1) {
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      const row = matrix.rowIdx[offset];
      rowMax[row] = Math.max(rowMax[row], Math.abs(matrix.values[offset]));
    }
  }
  const rowScales = Float64Array.from(rowMax, (value) => value > 0 ? 1 / value : 1);
  const columnMax = new Float64Array(size);
  for (let column = 0; column < size; column += 1) {
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      const row = matrix.rowIdx[offset];
      columnMax[column] = Math.max(columnMax[column], Math.abs(matrix.values[offset] * rowScales[row]));
    }
  }
  const columnScales = Float64Array.from(columnMax, (value) => value > 0 ? 1 / value : 1);
  const values = Float64Array.from(matrix.values);
  for (let column = 0; column < size; column += 1) {
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      values[offset] *= rowScales[matrix.rowIdx[offset]] * columnScales[column];
    }
  }
  return {
    matrix: Object.freeze({ ...matrix, values }),
    rhs: Float64Array.from(rhs, (value, row) => Number(value) * rowScales[row]),
    rowScales,
    columnScales,
  };
}

function augmentedLinearResidual(input) {
  const closure = Float64Array.from(input.residual, (value) => -Number(value));
  const tangentAction = new Float64Array(input.residual.length);
  for (let column = 0; column < input.tangent.colCount; column += 1) {
    for (let offset = input.tangent.colPtr[column]; offset < input.tangent.colPtr[column + 1]; offset += 1) {
      const row = input.tangent.rowIdx[offset];
      const value = input.tangent.values[offset] * input.deltaQ[column];
      tangentAction[row] += value;
      closure[row] += value;
    }
  }
  for (let row = 0; row < closure.length; row += 1) closure[row] -= input.reference[row] * input.deltaLambda;
  const constraintClosure = dot(input.gradient, input.deltaQ)
    + input.lambdaGradient * input.deltaLambda
    - input.constraintResidual;
  const absolute = Math.max(maxAbs(closure), Math.abs(constraintClosure));
  const scale = Math.max(
    1,
    maxAbs(input.residual),
    maxAbs(tangentAction),
    maxAbs(input.reference) * Math.abs(input.deltaLambda),
    Math.abs(input.constraintResidual),
  );
  return {
    absolute,
    relative: absolute / scale,
    forceClosure: Array.from(closure),
    constraintClosure,
  };
}

function augmentedMerit(residual, constraint, forceScale) {
  return Math.hypot(
    maxAbs(residual) / Math.max(forceScale, Number.EPSILON),
    constraint.relativeResidual,
  );
}

function linearSolveOptions(options) {
  return {
    matrixClass: 'general',
    pivotTolerance: options.pivotTolerance,
    relativeTolerance: options.linearRelativeTolerance,
    maxIterations: options.linearMaxIterations,
  };
}

function lineSearchAlphas(options) {
  if (options.lineSearch === false) return [1];
  const source = Array.isArray(options.lineSearchAlphas)
    ? options.lineSearchAlphas
    : [1, 0.5, 0.25, 0.125, 0.0625];
  const values = [...new Set(source.map(Number).filter((value) => Number.isFinite(value) && value > 0 && value <= 1))]
    .sort((left, right) => right - left);
  return values.length ? values : [1];
}

function normalizePreviousIncrement(value, dofCount) {
  if (value == null) return null;
  const deltaQ = finiteVector(value.deltaQ, dofCount, 'previousIncrement.deltaQ');
  const deltaLambda = finite(value.deltaLambda, 'previousIncrement.deltaLambda');
  return Object.freeze({
    ...clone(value),
    deltaQ: Object.freeze(deltaQ),
    deltaLambda,
  });
}

function requireScaling(value, size) {
  if (value?.version !== ARC_LENGTH_SCALING_VERSION || value.weights?.length !== size) {
    throw arcError('ARC_LENGTH_SCALING_INVALID', 'A compatible M7 arc-length scaling contract is required.');
  }
  if (!(Number(value.alpha) > 0) || !Number.isFinite(Number(value.alpha))) {
    throw arcError('ARC_LENGTH_ALPHA_INVALID', 'Arc-length alpha must be finite and positive.');
  }
  value.weights.forEach((weight, index) => {
    if (!(Number(weight) > 0) || !Number.isFinite(Number(weight))) {
      throw arcError('ARC_LENGTH_WEIGHT_INVALID', `Arc-length weight ${index} must be finite and positive.`);
    }
  });
  return value;
}

function selectScaling(scaling, activeDofs) {
  const core = {
    version: ARC_LENGTH_SCALING_VERSION,
    alpha: scaling.alpha,
    characteristicLength: scaling.characteristicLength,
    weights: activeDofs.map((index) => scaling.weights[index]),
    dofKinds: activeDofs.map((index) => scaling.dofKinds[index]),
  };
  return Object.freeze({ ...core, scalingHash: stableHash(core).slice(0, 24) });
}

function reducedDofKinds(constraint) {
  return (constraint.reducedDofs || []).map((row) => (
    /:(3|4|5|rx|ry|rz)$/.test(String(row.key || '')) ? 'rotation' : 'translation'
  ));
}

function inferCharacteristicLength(domain) {
  const nodes = domain?.nodes || [];
  if (nodes.length < 2) return 1;
  const xs = nodes.map((node) => Number(node.x || 0));
  const ys = nodes.map((node) => Number(node.y || 0));
  const zs = nodes.map((node) => Number(node.z || 0));
  return Math.max(
    1,
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    Math.max(...zs) - Math.min(...zs),
  );
}

function generalizedNorm(deltaQ, deltaLambda, scaling) {
  return Math.sqrt(Math.max(0, generalizedDot(deltaQ, deltaLambda, deltaQ, deltaLambda, scaling)));
}

function generalizedDot(q1, lambda1, q2, lambda2, scaling) {
  return weightedDot(q1, q2, scaling.weights) + scaling.alpha ** 2 * Number(lambda1) * Number(lambda2);
}

function weightedDot(left, right, weights) {
  let value = 0;
  for (let index = 0; index < left.length; index += 1) {
    value += Number(weights[index]) * Number(left[index]) * Number(right[index]);
  }
  return value;
}

function select(values, indices) {
  return Float64Array.from(indices, (index) => Number(values[index]));
}

function expand(values, activeDofs, size) {
  const output = new Float64Array(size);
  activeDofs.forEach((dof, index) => { output[dof] = Number(values[index]); });
  return output;
}

function subtract(left, right) {
  return Float64Array.from(left, (value, index) => Number(value) - Number(right[index]));
}

function finiteSolution(values, size) {
  return values != null && values.length === size && Array.from(values).every((value) => Number.isFinite(Number(value)));
}

function finiteVector(values, size, name) {
  if (values == null || typeof values.length !== 'number' || (size != null && values.length !== size)) {
    throw arcError('ARC_LENGTH_VECTOR_SIZE_INVALID', `${name} must contain ${size ?? 'the required number of'} values.`);
  }
  return Array.from(values, (value, index) => finite(value, `${name}[${index}]`));
}

function dot(left, right) {
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value += Number(left[index]) * Number(right[index]);
  return value;
}

function maxAbs(values) {
  let maximum = 0;
  for (const value of values || []) maximum = Math.max(maximum, Math.abs(Number(value)));
  return maximum;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw arcError('ARC_LENGTH_VALUE_NONFINITE', `${name} must be finite.`);
  return number;
}

function explicitPositive(value, fallback, code, name = 'value') {
  const source = value == null ? fallback : value;
  const number = Number(source);
  if (!Number.isFinite(number) || number <= 0) throw arcError(code, `${name} must be finite and positive.`);
  return number;
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonnegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function bounded(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function signOr(value, fallback) {
  const sign = Math.sign(Number(value));
  return sign || fallback;
}

function scalarTolerance(value) {
  return 1e-12 * Math.max(1, Math.abs(Number(value)));
}

function emit(input, payload) {
  if (typeof input.onProgress !== 'function') return;
  try { input.onProgress({ version: MDOF_ARC_LENGTH_VERSION, ...payload }); } catch { /* observational */ }
}

function cancelled(input) {
  return input.signal?.aborted === true || (typeof input.isCancelled === 'function' && input.isCancelled() === true);
}

function serialize(value) {
  if (!value) return value;
  if (value instanceof Error) return { name: value.name, code: value.code || null, message: value.message, details: clone(value.details) };
  try { return structuredClone(value); } catch { return { message: String(value) }; }
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function arcError(code, message, details = null) {
  const error = new Error(message);
  error.name = 'MdofArcLengthError';
  error.code = code;
  error.details = details;
  return error;
}
