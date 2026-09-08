import { MDOF_DISPLACEMENT_CONTROL_VERSION, PHYSICAL_CONTROL_COORDINATE_VERSION } from '../../metadata/numericVersions.js';
export { MDOF_DISPLACEMENT_CONTROL_VERSION, PHYSICAL_CONTROL_COORDINATE_VERSION };
import { stableHash } from '../../core/stableHash.js';
import { constraintRowEntries } from '../../solver/domain/constraintSystem.js';
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
import { prepareMdofActiveSystem } from './newton.js';
import { requireEquilibriumBackend } from './referenceBackends.js';




const COMPONENT_INDEX = Object.freeze({
  x: 0, ux: 0,
  y: 1, uy: 1,
  z: 2, uz: 2,
  rx: 3,
  ry: 4,
  rz: 5,
});

export function resolvePhysicalControlCoordinate(domain, input = {}) {
  if (!domain?.constraint?.ok || !Array.isArray(domain.nodes)) {
    throw controlError('CONTROL_DOMAIN_INVALID', 'A canonical analysis domain is required.');
  }
  const nodeId = clean(input.nodeId || input.controlNodeId);
  const nodeIndex = domain.nodes.findIndex((node) => String(node.id) === nodeId);
  if (nodeIndex < 0) throw controlError('CONTROL_NODE_NOT_FOUND', `Control node ${nodeId || '(missing)'} was not found.`);
  const fullVector = new Float64Array(domain.constraint.fullDofCount);
  let component = clean(input.component || input.dof).toLowerCase();
  let direction = null;
  if (Array.isArray(input.direction)) {
    if (input.direction.length !== 3) throw controlError('CONTROL_DIRECTION_INVALID', 'Control direction must contain exactly 3 values.');
    const values = input.direction.map(Number);
    const length = Math.hypot(...values);
    if (!(length > 0) || values.some((value) => !Number.isFinite(value))) {
      throw controlError('CONTROL_DIRECTION_INVALID', 'Control direction must be a finite nonzero 3-vector.');
    }
    direction = values.map((value) => value / length);
    direction.forEach((value, index) => { fullVector[nodeIndex * 6 + index] = value; });
    component = 'direction';
  } else {
    const index = COMPONENT_INDEX[component];
    if (!Number.isInteger(index)) throw controlError('CONTROL_COMPONENT_INVALID', `Unsupported control component ${component || '(missing)'}.`);
    if (index >= 3) throw controlError('CONTROL_ROTATION_UNSUPPORTED', 'P8-M5 qualifies translational physical control coordinates only.');
    fullVector[nodeIndex * 6 + index] = finite(input.sign, 1, 'control.sign');
  }
  const reduced = new Float64Array(domain.constraint.reducedDofCount);
  let offset = 0;
  for (let fullDof = 0; fullDof < fullVector.length; fullDof += 1) {
    const coefficient = fullVector[fullDof];
    if (coefficient === 0) continue;
    offset += coefficient * Number(domain.constraint.prescribed?.[fullDof] || 0);
    for (const [reducedDof, value] of constraintRowEntries(domain.constraint, fullDof)) {
      reduced[reducedDof] += coefficient * Number(value);
    }
  }
  const norm = maxAbs(reduced);
  if (!(norm > 0)) {
    throw controlError('CONTROL_DOF_CONSTRAINED', `Control coordinate ${nodeId}:${component} has no active reduced DOF.`);
  }
  const core = {
    version: PHYSICAL_CONTROL_COORDINATE_VERSION,
    nodeId,
    nodeIndex,
    component,
    direction,
    fullVector: Array.from(fullVector),
    reducedVector: Array.from(reduced),
    prescribedOffset: offset,
    constraintHash: domain.constraint.hash || null,
  };
  const coordinate = {
    ...core,
    coordinateHash: stableHash(core).slice(0, 24),
  };
  Object.defineProperty(coordinate, 'value', {
    enumerable: false,
    value(q = []) { return evaluatePhysicalControlCoordinate(coordinate, q); },
  });
  return Object.freeze(coordinate);
}

export function evaluatePhysicalControlCoordinate(control, q = []) {
  const reduced = control?.reducedVector;
  if (reduced == null || q.length !== reduced.length) {
    throw controlError('CONTROL_REDUCED_SIZE_MISMATCH', `Control vector requires ${reduced?.length ?? 0} reduced values.`);
  }
  return Number(control.prescribedOffset || 0) + dot(reduced, q);
}

export function buildAugmentedDisplacementSystem(input = {}) {
  const tangent = input.tangent;
  const size = Number(tangent?.colCount || 0);
  if (tangent?.format !== 'csc' || tangent.rowCount !== size || size < 1) {
    throw controlError('AUGMENTED_TANGENT_INVALID', 'A square CSC tangent is required.');
  }
  const reference = finiteVector(input.reference, size, 'reference');
  const control = finiteVector(input.control, size, 'control');
  const residual = finiteVector(input.residual, size, 'residual');
  const controlResidual = finite(input.controlResidual, 0, 'controlResidual');
  if (!(maxAbs(control) > 0)) throw controlError('AUGMENTED_CONTROL_VECTOR_ZERO', 'The active control vector is zero.');
  if (!(maxAbs(reference) > 0)) throw controlError('AUGMENTED_REFERENCE_VECTOR_ZERO', 'The lateral reference vector is zero.');
  const matrixScale = Math.max(1, maxAbs(tangent.values), maxAbs(reference));
  const requestedScale = Number(input.controlEquationScale);
  const controlEquationScale = Number.isFinite(requestedScale) && requestedScale > 0
    ? requestedScale
    : Math.min(1e100, matrixScale / maxAbs(control));
  const colPtr = new Int32Array(size + 2);
  const rowIdx = [];
  const values = [];
  for (let column = 0; column < size; column += 1) {
    colPtr[column] = values.length;
    for (let offset = tangent.colPtr[column]; offset < tangent.colPtr[column + 1]; offset += 1) {
      rowIdx.push(Number(tangent.rowIdx[offset]));
      values.push(Number(tangent.values[offset]));
    }
    if (control[column] !== 0) {
      rowIdx.push(size);
      values.push(controlEquationScale * control[column]);
    }
  }
  colPtr[size] = values.length;
  for (let row = 0; row < size; row += 1) {
    if (reference[row] === 0) continue;
    rowIdx.push(row);
    values.push(-reference[row]);
  }
  colPtr[size + 1] = values.length;
  if (values.some((value) => !Number.isFinite(value))) {
    throw controlError('AUGMENTED_MATRIX_NONFINITE', 'Augmented displacement-control matrix is non-finite.');
  }
  const matrix = Object.freeze({
    version: MDOF_DISPLACEMENT_CONTROL_VERSION,
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
  const unscaledRhs = Float64Array.from([...residual, controlEquationScale * controlResidual]);
  const scaled = equilibrateAugmentedSystem(matrix, unscaledRhs);
  return Object.freeze({
    version: MDOF_DISPLACEMENT_CONTROL_VERSION,
    matrix: scaled.matrix,
    rhs: scaled.rhs,
    controlEquationScale,
    rowScales: scaled.rowScales,
    columnScales: scaled.columnScales,
  });
}

export async function solveMdofDisplacementStep(input = {}) {
  const assembler = input.assembler;
  const originalStore = input.stateStore;
  if (!assembler?.domain?.constraint?.ok || typeof assembler.evaluate !== 'function') {
    return immediateFailure(originalStore, 'MDOF_ASSEMBLER_REQUIRED');
  }
  if (!originalStore?.committed) return immediateFailure(originalStore, 'STATE_STORE_REQUIRED');
  if (originalStore.trial) return immediateFailure(originalStore, 'STATE_TRIAL_ALREADY_ACTIVE');
  if (assembler.referenceLoadDerivative?.ok !== true) {
    return immediateFailure(originalStore, assembler.referenceLoadDerivative?.reason || 'REFERENCE_LOAD_DERIVATIVE_UNSUPPORTED', null, assembler.referenceLoadDerivative);
  }
  const domainHash = assembler.domain.identity?.domainHash || assembler.domain.hashes?.domainHash || null;
  if (originalStore.domainHash && domainHash && originalStore.domainHash !== domainHash) {
    return immediateFailure(originalStore, 'STATE_DOMAIN_MISMATCH');
  }
  if (input.targetDisplacement == null) return immediateFailure(originalStore, 'CONTROL_TARGET_REQUIRED');
  let target;
  try {
    target = finite(input.targetDisplacement, null, 'targetDisplacement');
  } catch (error) {
    return immediateFailure(originalStore, error.code, error.message);
  }
  let control;
  try {
    control = input.control?.version === PHYSICAL_CONTROL_COORDINATE_VERSION
      ? input.control
      : resolvePhysicalControlCoordinate(assembler.domain, input.control || {});
  } catch (error) {
    return immediateFailure(originalStore, error.code || 'CONTROL_COORDINATE_INVALID', error.message);
  }
  const reducedDofCount = assembler.domain.constraint.reducedDofCount;
  let q;
  try {
    q = normalizedQ(originalStore.committed.q, reducedDofCount);
  } catch (error) {
    return immediateFailure(originalStore, error.code, error.message);
  }
  let lambda = finite(originalStore.committed.lambda, 0, 'state.lambda');
  const committedElementStates = originalStore.committed.elementStates || {};
  const options = input.options || {};
  const maxIterations = positiveInteger(options.maxIterations, 30);
  const alphas = lineSearchAlphas(options);
  const originalSnapshot = stateStoreByteSnapshot(originalStore);
  let backend;
  try {
    backend = requireEquilibriumBackend(input.backend, {
      production: input.production === true,
      matrixClass: 'general',
      dofCount: reducedDofCount + 1,
      memoryLimitBytes: options.memoryLimitBytes,
    });
  } catch (error) {
    return immediateFailure(originalStore, error.code || 'BACKEND_PREFLIGHT_FAILED', error.message, error.preflight);
  }
  let working;
  try {
    working = beginStateStep(originalStore, {
      lambda,
      iteration: 0,
      q,
      solver: MDOF_DISPLACEMENT_CONTROL_VERSION,
      controlTarget: target,
      controlCoordinateHash: control.coordinateHash,
    });
  } catch (error) {
    return immediateFailure(originalStore, error.code || 'STATE_STEP_BEGIN_FAILED', error.message);
  }
  let correction = new Float64Array(reducedDofCount);
  let lambdaCorrection = 0;
  let evaluation = await safeEvaluate(assembler, q, lambda, committedElementStates, input.mode || 'static');
  if (!evaluation.ok) return failed(originalStore, working, originalSnapshot, evaluation.reason, [], evaluation);
  const initialResidual = maxAbs(evaluation.residualReduced);
  const forceScale = Math.max(1, initialResidual, maxAbs(evaluation.pExternalReduced));
  const controlScale = Math.max(
    positive(options.controlScaleFloor, 1e-6),
    Math.abs(target),
    Math.abs(target - evaluatePhysicalControlCoordinate(control, q)),
  );
  const dofKinds = reducedDofKinds(assembler.domain.constraint);
  const iterations = [];
  let solveCount = 0;
  working = updateTrialState(working, trialPatch(evaluation, q, correction, lambda, lambdaCorrection, 0, null, control, target));

  for (let iteration = 0; iteration <= maxIterations; iteration += 1) {
    if (cancelled(input)) return failed(originalStore, working, originalSnapshot, 'ANALYSIS_CANCELLED', iterations, null, 'cancelled');
    const controlValue = evaluatePhysicalControlCoordinate(control, q);
    const controlResidual = target - controlValue;
    let convergence;
    try {
      const equilibrium = evaluateMdofConvergence({
        residual: evaluation.residualReduced,
        correction,
        q,
        external: evaluation.pExternalReduced,
        initialForceResidualNorm: initialResidual,
        initialMomentResidualNorm: initialResidual,
        forceScale,
        momentScale: forceScale * Math.max(1, assembler.characteristicLength || 1),
        displacementScale: controlScale,
        rotationScale: 1,
        dofKinds,
      }, options.convergence);
      const controlLimit = nonnegative(options.controlAbsolute, 1e-10)
        + nonnegative(options.controlRelative, 1e-8) * controlScale;
      const controlPass = Math.abs(controlResidual) <= controlLimit;
      convergence = {
        ...equilibrium,
        converged: equilibrium.pass.force && (equilibrium.pass.displacement || equilibrium.pass.energy) && controlPass,
        control: { value: controlValue, target, residual: controlResidual, limit: controlLimit, pass: controlPass },
      };
    } catch (error) {
      return failed(originalStore, working, originalSnapshot, error.code || 'CONVERGENCE_EVALUATION_FAILED', iterations, error);
    }
    if (convergence.converged) {
      try {
        working = updateTrialState(working, trialPatch(
          evaluation, q, correction, lambda, lambdaCorrection, iteration, convergence, control, target,
        ));
        const hingeEvents = collectHingeEvents(evaluation, iteration);
        const committed = commitStateStep(working, {
          converged: true,
          events: [
            { type: 'displacement-control-converged', lambda, targetDisplacement: target, iterations: solveCount },
            ...hingeEvents,
          ],
        });
        emit(input, { type: 'displacement-step-converged', target, controlValue, lambda, iteration });
        return {
          version: MDOF_DISPLACEMENT_CONTROL_VERSION,
          ok: true,
          status: 'converged',
          reason: 'CONVERGED',
          targetDisplacement: target,
          control,
          controlValue,
          lambda,
          q: Float64Array.from(q),
          u: Float64Array.from(evaluation.u),
          stateStore: committed,
          evaluation,
          convergence,
          hingeEvents,
          iterations,
          iterationCount: solveCount,
          backend: backend.id,
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
    let activeControl;
    try {
      validateGaugeProjection(evaluation, control.reducedVector, evaluation.dResidualDlambdaReduced, options);
      active = prepareMdofActiveSystem(evaluation, assembler, options);
      activeControl = select(control.reducedVector, active.activeDofs);
      const inactiveControl = control.reducedVector.some((value, index) => value !== 0 && !active.activeDofs.includes(index));
      if (inactiveControl) throw controlError('CONTROL_DOF_INACTIVE', 'The control coordinate contains an eliminated inactive DOF.');
      augmented = buildAugmentedDisplacementSystem({
        tangent: active.matrix,
        residual: active.rhs,
        reference: select(evaluation.dResidualDlambdaReduced, active.activeDofs),
        control: activeControl,
        controlResidual,
        controlEquationScale: options.controlEquationScale,
      });
    } catch (error) {
      return failed(originalStore, working, originalSnapshot, error.code || 'AUGMENTED_SYSTEM_FAILED', iterations, error);
    }
    let solved;
    try {
      solved = await backend.solve(augmented.matrix, augmented.rhs, {
        matrixClass: 'general',
        pivotTolerance: options.pivotTolerance,
        relativeTolerance: options.linearRelativeTolerance,
        maxIterations: options.linearMaxIterations,
      });
    } catch (error) {
      return failed(originalStore, working, originalSnapshot, error.code || 'LINEAR_SOLVE_FAILED', iterations, error);
    }
    solveCount += 1;
    if (!solved?.ok || solved.x?.length !== active.activeDofCount + 1 || Array.from(solved.x).some((value) => !Number.isFinite(Number(value)))) {
      return failed(originalStore, working, originalSnapshot, solved?.reason || 'LINEAR_SOLVE_FAILED', iterations, solved);
    }
    const physicalSolution = Float64Array.from(solved.x, (value, index) => Number(value) * Number(augmented.columnScales[index]));
    const activeDeltaQ = physicalSolution.slice(0, active.activeDofCount);
    const deltaQ = expand(activeDeltaQ, active.activeDofs, reducedDofCount);
    const deltaLambda = Number(physicalSolution[active.activeDofCount]);
    const linearResidual = augmentedLinearResidual(
      active.matrix,
      activeDeltaQ,
      select(evaluation.dResidualDlambdaReduced, active.activeDofs),
      deltaLambda,
      active.rhs,
      activeControl,
      controlResidual,
    );
    if (linearResidual.relative > positive(options.linearRelativeTolerance, 1e-9)) {
      return failed(originalStore, working, originalSnapshot, 'AUGMENTED_LINEAR_RESIDUAL_FAILED', iterations, linearResidual);
    }
    const baseline = augmentedResidualNorm(evaluation.residualReduced, controlResidual, forceScale, controlScale);
    const candidates = [];
    let selected = null;
    for (const alpha of alphas) {
      const candidateQ = Float64Array.from(q, (value, index) => value + alpha * deltaQ[index]);
      const candidateLambda = lambda + alpha * deltaLambda;
      const candidateEvaluation = await safeEvaluate(
        assembler, candidateQ, candidateLambda, committedElementStates, input.mode || 'static',
      );
      if (!candidateEvaluation.ok) {
        candidates.push({ alpha, ok: false, reason: candidateEvaluation.reason });
        continue;
      }
      const candidateControlResidual = target - evaluatePhysicalControlCoordinate(control, candidateQ);
      const norm = augmentedResidualNorm(
        candidateEvaluation.residualReduced,
        candidateControlResidual,
        Math.max(forceScale, maxAbs(candidateEvaluation.pExternalReduced)),
        controlScale,
      );
      const accepted = options.lineSearch === false || norm <= baseline * Math.max(0, 1 - positive(options.armijo, 1e-4) * alpha);
      candidates.push({ alpha, ok: true, norm, accepted, lambda: candidateLambda });
      if (!accepted) continue;
      const candidateCorrection = Float64Array.from(deltaQ, (value) => alpha * value);
      const branch = forkTrialState(working, `disp-${iteration + 1}-alpha-${alpha}`, trialPatch(
        candidateEvaluation,
        candidateQ,
        candidateCorrection,
        candidateLambda,
        alpha * deltaLambda,
        iteration + 1,
        null,
        control,
        target,
      ));
      selected = {
        alpha,
        q: candidateQ,
        lambda: candidateLambda,
        correction: candidateCorrection,
        lambdaCorrection: alpha * deltaLambda,
        evaluation: candidateEvaluation,
        branch,
      };
      break;
    }
    if (!selected) {
      return failed(originalStore, working, originalSnapshot, 'LINE_SEARCH_FAILED', iterations, { baseline, candidates });
    }
    working = acceptTrialBranch(working, selected.branch);
    q = selected.q;
    lambda = selected.lambda;
    correction = selected.correction;
    lambdaCorrection = selected.lambdaCorrection;
    evaluation = selected.evaluation;
    iterations.push({
      iteration: iteration + 1,
      acceptedAlpha: selected.alpha,
      lambda,
      controlValue: evaluatePhysicalControlCoordinate(control, q),
      norms: convergence.norms,
      ratios: convergence.ratios,
      control: convergence.control,
      backend: solved.diagnostics || null,
      lineSearch: candidates,
    });
    emit(input, { type: 'displacement-iteration', iteration: iteration + 1, lambda, controlValue: evaluatePhysicalControlCoordinate(control, q) });
  }
  return failed(originalStore, working, originalSnapshot, 'MAX_ITERATIONS', iterations);
}

export async function runMdofDisplacementControl(input = {}) {
  if (!input.stateStore?.committed) return runResult(false, 'STATE_STORE_REQUIRED', input.stateStore, [], [], null, 'blocked');
  let control;
  try {
    control = input.control?.version === PHYSICAL_CONTROL_COORDINATE_VERSION
      ? input.control
      : resolvePhysicalControlCoordinate(input.assembler?.domain, input.control || {});
  } catch (error) {
    return runResult(false, error.code || 'CONTROL_COORDINATE_INVALID', input.stateStore, [], [], null, 'blocked');
  }
  const target = Number(input.options?.targetDisplacement ?? input.targetDisplacement);
  if (!Number.isFinite(target)) return runResult(false, 'CONTROL_TARGET_NONFINITE', input.stateStore, [], [], null, 'blocked', { control });
  const initial = evaluatePhysicalControlCoordinate(control, input.stateStore.committed.q || []);
  const direction = Math.sign(target - initial) || 1;
  const requestedSteps = positiveInteger(input.options?.steps, 20);
  let increment = direction * Math.min(
    Math.abs(target - initial),
    positive(input.options?.initialIncrement, Math.abs(target - initial) / requestedSteps || 1),
  );
  const minStep = positive(input.options?.minIncrement, Math.max(1e-10, Math.abs(increment) / 1024));
  const maxStep = positive(input.options?.maxIncrement, Math.max(Math.abs(increment), Math.abs(target - initial) / requestedSteps));
  const cutbackFactor = bounded(input.options?.cutbackFactor, 0.5, 0.05, 0.95);
  const growthFactor = bounded(input.options?.growthFactor, 1.35, 1, 3);
  const fastIterations = positiveInteger(input.options?.fastIterations, 5);
  const maxAttempts = positiveInteger(input.options?.maxAttempts, 10000);
  const eventTolerance = positive(input.options?.eventLocalizationTolerance, Math.max(minStep, Math.abs(increment) / 16));
  const acceptedSteps = [];
  const rejectedSteps = [];
  let store = input.stateStore;
  let attempts = 0;
  let termination = null;

  while (direction * (target - evaluatePhysicalControlCoordinate(control, store.committed.q || [])) > scalarTolerance(target)) {
    attempts += 1;
    if (attempts > maxAttempts) return runResult(false, 'DISPLACEMENT_CONTROL_ATTEMPT_LIMIT', store, acceptedSteps, rejectedSteps, target, 'failed', { control });
    const from = evaluatePhysicalControlCoordinate(control, store.committed.q || []);
    const remaining = target - from;
    const stepIncrement = direction * Math.min(Math.abs(increment), Math.abs(remaining));
    const stepTarget = from + stepIncrement;
    const step = await solveMdofDisplacementStep({
      ...input,
      control,
      stateStore: store,
      targetDisplacement: stepTarget,
      options: input.options?.newton || input.options,
      onProgress: (row) => emit(input, { ...row, attempt: attempts, stepTarget }),
    });
    if (!step.ok) {
      const rejected = {
        attempt: attempts,
        fromDisplacement: from,
        targetDisplacement: stepTarget,
        increment: stepIncrement,
        reason: step.reason,
        rollbackEquivalent: step.rollbackEquivalent,
        details: step.details || null,
      };
      rejectedSteps.push(rejected);
      try {
        input.onReject?.(Object.freeze({ ...rejected, stateStore: store }));
      } catch (error) {
        return runResult(false, 'DISPLACEMENT_REJECT_CALLBACK_FAILED', store, acceptedSteps, rejectedSteps, target, 'failed', {
          control,
          callbackError: serialize(error),
        });
      }
      if (step.status === 'cancelled' || step.reason === 'ANALYSIS_CANCELLED') {
        return runResult(false, 'ANALYSIS_CANCELLED', store, acceptedSteps, rejectedSteps, target, 'cancelled', { control });
      }
      if (step.status === 'blocked' || NON_RETRYABLE.has(step.reason)) {
        return runResult(false, step.reason, store, acceptedSteps, rejectedSteps, target, 'blocked', { control });
      }
      if (Math.abs(increment) * cutbackFactor < minStep - scalarTolerance(minStep)) {
        return runResult(false, 'MINIMUM_DISPLACEMENT_STEP_REACHED', store, acceptedSteps, rejectedSteps, target, 'failed', { control });
      }
      increment = direction * Math.max(minStep, Math.abs(increment) * cutbackFactor);
      continue;
    }
    const eventTypes = step.hingeEvents.filter((event) => ['yield', 'capping', 'residual', 'failure'].includes(event.type));
    if (
      input.options?.eventAware !== false
      && eventTypes.length
      && Math.abs(stepIncrement) > eventTolerance + scalarTolerance(eventTolerance)
      && Math.abs(stepIncrement) > minStep + scalarTolerance(minStep)
    ) {
      const rejected = {
        attempt: attempts,
        fromDisplacement: from,
        targetDisplacement: stepTarget,
        increment: stepIncrement,
        reason: 'HINGE_EVENT_CUTBACK',
        eventTypes: [...new Set(eventTypes.map((event) => event.type))],
        rollbackEquivalent: true,
      };
      rejectedSteps.push(rejected);
      try {
        input.onReject?.(Object.freeze({ ...rejected, stateStore: store }));
      } catch (error) {
        return runResult(false, 'DISPLACEMENT_REJECT_CALLBACK_FAILED', store, acceptedSteps, rejectedSteps, target, 'failed', {
          control,
          callbackError: serialize(error),
        });
      }
      increment = direction * Math.max(minStep, Math.abs(increment) * cutbackFactor);
      continue;
    }
    store = step.stateStore;
    const accepted = {
      step: acceptedSteps.length + 1,
      targetDisplacement: stepTarget,
      controlDisplacement: step.controlValue,
      increment: stepIncrement,
      lambda: step.lambda,
      iterationCount: step.iterationCount,
      convergence: step.convergence,
      hingeEvents: step.hingeEvents,
      responseHash: step.evaluation.responseHash,
      evaluation: step.evaluation,
      stateStore: step.stateStore,
      backend: step.backend,
    };
    acceptedSteps.push(accepted);
    try {
      input.onCommit?.(Object.freeze(accepted));
    } catch (error) {
      return runResult(false, 'DISPLACEMENT_COMMIT_CALLBACK_FAILED', store, acceptedSteps, rejectedSteps, target, 'failed', {
        control,
        callbackError: serialize(error),
      });
    }
    emit(input, { type: 'displacement-step-accepted', step: accepted.step, controlValue: step.controlValue, lambda: step.lambda });
    if (typeof input.shouldTerminate === 'function') {
      const decision = input.shouldTerminate(accepted, { acceptedSteps, rejectedSteps, target, control });
      if (decision?.stop) {
        termination = decision;
        break;
      }
    }
    if (step.iterationCount <= fastIterations && !eventTypes.length) {
      increment = direction * Math.min(maxStep, Math.abs(increment) * growthFactor);
    }
  }
  const reason = termination?.reason || 'TARGET_REACHED';
  const ok = reason === 'TARGET_REACHED' || termination?.ok === true;
  return runResult(ok, reason, store, acceptedSteps, rejectedSteps, target, ok ? 'converged' : 'terminated', {
    termination,
    control,
  });
}

const NON_RETRYABLE = new Set([
  'PRODUCTION_BACKEND_UNAVAILABLE',
  'BACKEND_MATRIX_CLASS_UNSUPPORTED',
  'MDOF_ASSEMBLER_REQUIRED',
  'STATE_STORE_REQUIRED',
  'STATE_DOMAIN_MISMATCH',
  'STATE_REDUCED_DOF_SIZE_MISMATCH',
  'STATE_TRIAL_ALREADY_ACTIVE',
  'CONTROL_DOF_CONSTRAINED',
  'CONTROL_DOF_INACTIVE',
  'AUGMENTED_CONTROL_VECTOR_ZERO',
  'AUGMENTED_REFERENCE_VECTOR_ZERO',
  'REFERENCE_LOAD_DERIVATIVE_UNSUPPORTED',
  'CONTROL_GAUGE_MODE_EXCITATION',
  'REFERENCE_GAUGE_MODE_EXCITATION',
  'STRUCTURAL_MECHANISM_DETECTED',
  'INACTIVE_DOF_RESIDUAL',
  'INACTIVE_MODE_RESIDUAL',
]);

function trialPatch(evaluation, q, correction, lambda, lambdaCorrection, iteration, convergence, control, target) {
  return {
    lambda,
    iteration,
    q: Array.from(q),
    u: Array.from(evaluation.u),
    residual: Array.from(evaluation.residualReduced),
    elementStates: evaluation.elementStates,
    energies: evaluation.energies,
    norms: convergence ? { ...convergence.norms, ratios: convergence.ratios, control: convergence.control } : {},
    correction: Array.from(correction),
    lambdaCorrection,
    control: {
      coordinateHash: control.coordinateHash,
      nodeId: control.nodeId,
      component: control.component,
      target,
      value: evaluatePhysicalControlCoordinate(control, q),
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
  try { rolledBack = working ? rollbackStateStep(working) : originalStore; } catch (error) { rollbackError = serialize(error); }
  let rollbackEquivalent = false;
  try { rollbackEquivalent = stateStoreByteSnapshot(rolledBack) === snapshot; } catch (error) { rollbackError ||= serialize(error); }
  return {
    version: MDOF_DISPLACEMENT_CONTROL_VERSION,
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
    version: MDOF_DISPLACEMENT_CONTROL_VERSION,
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

function runResult(ok, reason, stateStore, acceptedSteps, rejectedSteps, target, status = 'failed', extra = {}) {
  return {
    version: MDOF_DISPLACEMENT_CONTROL_VERSION,
    ok,
    status,
    reason,
    targetDisplacement: target,
    finalDisplacement: extra.control ? evaluatePhysicalControlCoordinate(extra.control, stateStore?.committed?.q || []) : null,
    finalLambda: Number(stateStore?.committed?.lambda || 0),
    stateStore,
    acceptedSteps,
    rejectedSteps,
    acceptedStepCount: acceptedSteps.length,
    rejectedStepCount: rejectedSteps.length,
    cutbackCount: rejectedSteps.length,
    ...extra,
  };
}

async function safeEvaluate(assembler, q, lambda, committedElementStates, mode) {
  try {
    const evaluation = await assembler.evaluate({ q, lambda, committedElementStates, mode });
    return evaluation && typeof evaluation === 'object' ? evaluation : { ok: false, reason: 'ASSEMBLER_EVALUATION_INVALID' };
  } catch (error) {
    return { ok: false, reason: error.code || 'ASSEMBLER_EVALUATION_FAILED', message: error.message };
  }
}

function normalizedQ(values, count) {
  if (values == null || values.length === 0) return new Float64Array(count);
  if (values.length !== count) throw controlError('STATE_REDUCED_DOF_SIZE_MISMATCH', `Committed q must contain ${count} values.`);
  return finiteVector(values, count, 'state.q');
}

function reducedDofKinds(constraint) {
  return (constraint.reducedDofs || []).map((row) => /:(3|4|5|rx|ry|rz)$/.test(String(row.key || '')) ? 'rotation' : 'translation');
}

function select(values, indices) {
  return Float64Array.from(indices, (index) => Number(values[index]));
}

function expand(values, activeDofs, size) {
  const output = new Float64Array(size);
  activeDofs.forEach((dof, index) => { output[dof] = Number(values[index]); });
  return output;
}

function augmentedResidualNorm(residual, controlResidual, forceScale, controlScale) {
  return Math.hypot(maxAbs(residual) / Math.max(forceScale, Number.EPSILON), Math.abs(controlResidual) / Math.max(controlScale, Number.EPSILON));
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
    matrix: Object.freeze({ ...matrix, values, patternHash: matrix.patternHash }),
    rhs: Float64Array.from(rhs, (value, row) => Number(value) * rowScales[row]),
    rowScales,
    columnScales,
  };
}

function augmentedLinearResidual(matrix, deltaQ, reference, deltaLambda, residual, control, controlResidual) {
  const closure = Float64Array.from(residual, (value) => -Number(value));
  const tangentAction = new Float64Array(residual.length);
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      const row = matrix.rowIdx[offset];
      const value = matrix.values[offset] * deltaQ[column];
      tangentAction[row] += value;
      closure[row] += value;
    }
  }
  for (let row = 0; row < closure.length; row += 1) closure[row] -= reference[row] * deltaLambda;
  const controlClosure = dot(control, deltaQ) - controlResidual;
  const absolute = Math.max(maxAbs(closure), Math.abs(controlClosure));
  const scale = Math.max(
    1,
    maxAbs(residual),
    maxAbs(tangentAction),
    maxAbs(reference) * Math.abs(deltaLambda),
    Math.abs(controlResidual),
    Math.abs(dot(control, deltaQ)),
  );
  return { absolute, relative: absolute / scale, forceClosure: Array.from(closure), controlClosure };
}

function validateGaugeProjection(evaluation, control, reference, options) {
  const tolerance = positive(options.gaugeProjectionTolerance, 1e-10);
  for (const group of evaluation.inactiveModeGroupsReduced || []) {
    for (const mode of group || []) {
      const scale = Math.max(1, maxAbs(mode));
      if (Math.abs(dot(mode, control)) > tolerance * scale * Math.max(1, maxAbs(control))) {
        throw controlError('CONTROL_GAUGE_MODE_EXCITATION', 'Control coordinate projects onto an approved gauge mode.');
      }
      if (Math.abs(dot(mode, reference)) > tolerance * scale * Math.max(1, maxAbs(reference))) {
        throw controlError('REFERENCE_GAUGE_MODE_EXCITATION', 'Reference load projects onto an approved gauge mode.');
      }
    }
  }
}

function lineSearchAlphas(options) {
  if (options.lineSearch === false) return [1];
  const source = Array.isArray(options.lineSearchAlphas) ? options.lineSearchAlphas : [1, 0.5, 0.25, 0.125, 0.0625];
  const values = [...new Set(source.map(Number).filter((value) => Number.isFinite(value) && value > 0 && value <= 1))].sort((a, b) => b - a);
  return values.length ? values : [1];
}

function emit(input, payload) {
  if (typeof input.onProgress !== 'function') return;
  try { input.onProgress({ version: MDOF_DISPLACEMENT_CONTROL_VERSION, ...payload }); } catch { /* observational */ }
}

function cancelled(input) {
  return input.signal?.aborted === true || (typeof input.isCancelled === 'function' && input.isCancelled() === true);
}

function finiteVector(values, size, name) {
  if (values == null || values.length !== size) throw controlError('CONTROL_VECTOR_SIZE_INVALID', `${name} must contain ${size} values.`);
  return Float64Array.from(values, (value, index) => finite(value, null, `${name}[${index}]`));
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

function finite(value, fallback, name) {
  if (value == null && fallback != null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw controlError('CONTROL_VALUE_NONFINITE', `${name} must be finite.`);
  return number;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonnegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  return Math.max(1, Math.trunc(positive(value, fallback)));
}

function bounded(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function scalarTolerance(value) {
  return 1e-12 * Math.max(1, Math.abs(Number(value)));
}

function serialize(value) {
  if (!value) return value;
  if (value instanceof Error) return { name: value.name, code: value.code || null, message: value.message };
  try { return structuredClone(value); } catch { return { message: String(value) }; }
}

function controlError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}
