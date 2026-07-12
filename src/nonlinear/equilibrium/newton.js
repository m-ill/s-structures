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

export const MDOF_NEWTON_VERSION = 'p8-m3-full-newton-v2';

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
  const matrixClass = assembler.requiredMatrixClass === 'general'
    ? 'general'
    : (input.matrixClass || assembler.requiredMatrixClass || 'spd');
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
    positive(options.characteristicLength, positive(assembler.characteristicLength, 1)),
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
    let linearSystem;
    try {
      const stabilized = stabilizeApprovedNullModes(
        evaluation.tangentReduced,
        evaluation.residualReduced,
        evaluation.inactiveModeGroupsReduced
          || (evaluation.inactiveModesReduced || []).map((mode) => [mode]),
        options,
      );
      linearSystem = eliminateInactiveDofs(
        stabilized.matrix,
        evaluation.residualReduced,
        options,
        assembler.allowedInactiveReducedDofs,
      );
      linearSystem.gaugeModeCount = stabilized.modeCount;
    } catch (error) {
      return failureResult(originalStore, working, originalSnapshot, error.code || 'INACTIVE_DOF_ELIMINATION_FAILED', iterations, error);
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
        forceScale: lineSearchScales.force,
        momentScale: lineSearchScales.moment,
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
      if (linearSystem.activeDofCount === 0) {
        solved = { ok: true, x: new Float64Array(0), diagnostics: { method: 'inactive-dof-elimination' } };
      } else {
        solved = await backend.solve(linearSystem.matrix, linearSystem.rhs, {
          matrixClass,
          pivotTolerance: options.pivotTolerance,
          relativeTolerance: options.linearRelativeTolerance,
          maxIterations: options.linearMaxIterations,
        });
      }
    } catch (error) {
      return failureResult(originalStore, working, originalSnapshot, error.code || 'LINEAR_SOLVE_FAILED', iterations, error);
    }
    solveCount += 1;
    if (!solved?.ok || !finiteSolution(solved.x, linearSystem.activeDofCount)) {
      return failureResult(originalStore, working, originalSnapshot, solved?.reason || 'LINEAR_SOLVE_FAILED', iterations, solved);
    }

    const deltaQ = expandActiveSolution(solved.x, linearSystem.activeDofs, reducedDofCount);
    solved = {
      ...solved,
      diagnostics: {
        ...(solved.diagnostics || {}),
        inactiveDofCount: linearSystem.inactiveDofs.length,
        inactiveDofs: Array.from(linearSystem.inactiveDofs),
        activeDofCount: linearSystem.activeDofCount,
        gaugeModeCount: linearSystem.gaugeModeCount,
      },
    };
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

function eliminateInactiveDofs(matrix, rhs, options, allowedInactiveDofs = []) {
  if (matrix?.format !== 'csc' || matrix.rowCount !== matrix.colCount || rhs?.length !== matrix.rowCount) {
    const error = new TypeError('Inactive-DOF elimination requires a square CSC matrix and matching residual vector.');
    error.code = 'INACTIVE_DOF_SYSTEM_INVALID';
    throw error;
  }
  const size = matrix.rowCount;
  const rowNorms = new Float64Array(size);
  const columnNorms = new Float64Array(size);
  let matrixScale = 0;
  for (let column = 0; column < size; column += 1) {
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      const value = Math.abs(Number(matrix.values[offset]));
      rowNorms[matrix.rowIdx[offset]] = Math.max(rowNorms[matrix.rowIdx[offset]], value);
      columnNorms[column] = Math.max(columnNorms[column], value);
      matrixScale = Math.max(matrixScale, value);
    }
  }
  const tangentTolerance = Math.max(
    nonnegative(options.inactiveTangentAbsolute, 0),
    nonnegative(options.inactiveTangentRelative, 0) * matrixScale,
  );
  let residualScale = 1;
  for (const value of rhs) residualScale = Math.max(residualScale, Math.abs(Number(value)));
  const residualTolerance = Math.max(
    positive(options.inactiveResidualAbsolute, 1e-10),
    positive(options.inactiveResidualRelative, 1e-10) * residualScale,
  );
  const activeDofs = [];
  const inactiveDofs = [];
  const allowed = new Set(Array.from(allowedInactiveDofs || [], Number));
  for (let dof = 0; dof < size; dof += 1) {
    if (Math.max(rowNorms[dof], columnNorms[dof]) > tangentTolerance) activeDofs.push(dof);
    else {
      if (!allowed.has(dof)) {
        const error = new Error(`Unapproved zero-stiffness DOF ${dof} indicates a structural mechanism.`);
        error.code = 'STRUCTURAL_MECHANISM_DETECTED';
        throw error;
      }
      if (Math.abs(Number(rhs[dof])) > residualTolerance) {
        const error = new Error(`Inactive DOF ${dof} carries residual ${rhs[dof]}.`);
        error.code = 'INACTIVE_DOF_RESIDUAL';
        throw error;
      }
      inactiveDofs.push(dof);
    }
  }
  if (!inactiveDofs.length) {
    return {
      matrix,
      rhs,
      activeDofs: Int32Array.from(activeDofs),
      inactiveDofs: new Int32Array(0),
      activeDofCount: size,
    };
  }
  const inverse = new Int32Array(size).fill(-1);
  activeDofs.forEach((dof, index) => { inverse[dof] = index; });
  const colPtr = new Int32Array(activeDofs.length + 1);
  const rowIdx = [];
  const values = [];
  activeDofs.forEach((fullColumn, reducedColumn) => {
    for (let offset = matrix.colPtr[fullColumn]; offset < matrix.colPtr[fullColumn + 1]; offset += 1) {
      const reducedRow = inverse[matrix.rowIdx[offset]];
      if (reducedRow < 0) continue;
      rowIdx.push(reducedRow);
      values.push(Number(matrix.values[offset]));
    }
    colPtr[reducedColumn + 1] = rowIdx.length;
  });
  return {
    matrix: {
      format: 'csc',
      rowCount: activeDofs.length,
      colCount: activeDofs.length,
      nnz: values.length,
      colPtr,
      rowIdx: Int32Array.from(rowIdx),
      values: Float64Array.from(values),
      parentPatternHash: matrix.patternHash || null,
    },
    rhs: Float64Array.from(activeDofs, (dof) => Number(rhs[dof])),
    activeDofs: Int32Array.from(activeDofs),
    inactiveDofs: Int32Array.from(inactiveDofs),
    activeDofCount: activeDofs.length,
  };
}

function stabilizeApprovedNullModes(matrix, rhs, inputModeGroups = [], options = {}) {
  const groups = normalizeModeGroups(inputModeGroups, matrix.rowCount);
  if (!groups.length) return { matrix, modeCount: 0 };
  const originalValues = matrix.values;
  const values = Float64Array.from(originalValues);
  let accepted = 0;
  for (const inputModes of groups) {
    const basis = orthonormalModes(inputModes, matrix.rowCount);
    if (!basis.length) continue;
    const products = basis.map((mode) => multiplyCscVector(matrix, mode));
    const productScale = products.reduce(
      (scale, product) => product.reduce((max, value) => Math.max(max, Math.abs(value)), scale),
      0,
    );
    const scaledProducts = productScale > 0
      ? products.map((product) => Float64Array.from(product, (value) => value / productScale))
      : products;
    const gram = basis.map((_mode, row) => basis.map((_other, column) => dotVectors(
      scaledProducts[row],
      scaledProducts[column],
    )));
    for (const eigen of symmetricEigenpairs(gram)) {
      const mode = combineVectors(basis, eigen.vector);
      const product = combineVectors(products, eigen.vector);
      let stiffnessScale = 0;
      for (let column = 0; column < matrix.colCount; column += 1) {
        if (Math.abs(mode[column]) <= 1e-14) continue;
        for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
          stiffnessScale = Math.max(stiffnessScale, Math.abs(Number(originalValues[offset])));
        }
      }
      const nullResidual = product.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
      const nullTolerance = nonnegative(options.inactiveModeAbsolute, 1e-8)
        + nonnegative(options.inactiveModeRelative, 0) * stiffnessScale;
      if (nullResidual > nullTolerance) continue;
      let residualProjection = 0;
      let residualScale = 0;
      for (let index = 0; index < rhs.length; index += 1) {
        residualProjection += mode[index] * Number(rhs[index]);
        if (Math.abs(mode[index]) > 1e-14) residualScale = Math.max(residualScale, Math.abs(Number(rhs[index])));
      }
      const residualTolerance = Math.max(
        nonnegative(options.inactiveModeResidualAbsolute, 1e-10),
        nonnegative(options.convergence?.forceAbsolute, 0),
        nonnegative(options.convergence?.momentAbsolute, 0),
      )
        + nonnegative(options.inactiveModeResidualRelative, 1e-8) * residualScale;
      if (Math.abs(residualProjection) > residualTolerance) {
        const error = new Error(`Approved inactive mode carries residual ${residualProjection}.`);
        error.code = 'INACTIVE_MODE_RESIDUAL';
        throw error;
      }
      const gauge = Math.max(1, stiffnessScale);
      const support = [];
      mode.forEach((value, index) => { if (Math.abs(value) > 1e-14) support.push(index); });
      for (const column of support) {
        for (const row of support) {
          const offset = cscOffset(matrix, row, column);
          if (offset < 0) {
            const error = new Error('Inactive-mode gauge term is absent from the sparse pattern.');
            error.code = 'INACTIVE_MODE_PATTERN_MISSING';
            throw error;
          }
          values[offset] += gauge * mode[row] * mode[column];
        }
      }
      accepted += 1;
    }
  }
  if (!accepted) return { matrix, modeCount: 0 };
  return { matrix: { ...matrix, values }, modeCount: accepted };
}

function normalizeModeGroups(input, size) {
  if (!Array.isArray(input) || input.length === 0) return [];
  const first = input[0];
  const flat = first?.length === size && typeof first[0] === 'number';
  return (flat ? input.map((mode) => [mode]) : input)
    .filter((group) => Array.isArray(group) && group.length > 0);
}

function multiplyCscVector(matrix, vector) {
  const output = new Float64Array(matrix.rowCount);
  for (let column = 0; column < matrix.colCount; column += 1) {
    if (vector[column] === 0) continue;
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      output[matrix.rowIdx[offset]] += Number(matrix.values[offset]) * vector[column];
    }
  }
  if (Array.from(output).some((value) => !Number.isFinite(value))) {
    const error = new Error('Inactive-mode tangent product is non-finite.');
    error.code = 'INACTIVE_MODE_PRODUCT_NONFINITE';
    throw error;
  }
  return output;
}

function combineVectors(vectors, coefficients) {
  const output = new Float64Array(vectors[0].length);
  vectors.forEach((vector, column) => {
    for (let row = 0; row < output.length; row += 1) output[row] += coefficients[column] * vector[row];
  });
  return output;
}

function dotVectors(left, right) {
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value += left[index] * right[index];
  return value;
}

function symmetricEigenpairs(input) {
  const size = input.length;
  if (size === 1) return [{ value: Number(input[0][0]), vector: new Float64Array([1]) }];
  const matrix = input.map((row) => row.map(Number));
  const vectors = Array.from({ length: size }, (_row, row) => (
    Array.from({ length: size }, (_column, column) => row === column ? 1 : 0)
  ));
  for (let sweep = 0; sweep < 64 * size * size; sweep += 1) {
    let p = 0;
    let q = 1;
    let maximum = 0;
    let diagonalScale = 0;
    for (let row = 0; row < size; row += 1) {
      diagonalScale = Math.max(diagonalScale, Math.abs(matrix[row][row]));
      for (let column = row + 1; column < size; column += 1) {
        if (Math.abs(matrix[row][column]) > maximum) {
          maximum = Math.abs(matrix[row][column]);
          p = row;
          q = column;
        }
      }
    }
    if (maximum <= 32 * Number.EPSILON * Math.max(1, diagonalScale)) break;
    const angle = 0.5 * Math.atan2(2 * matrix[p][q], matrix[q][q] - matrix[p][p]);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    for (let index = 0; index < size; index += 1) {
      if (index === p || index === q) continue;
      const aip = matrix[index][p];
      const aiq = matrix[index][q];
      matrix[index][p] = matrix[p][index] = cosine * aip - sine * aiq;
      matrix[index][q] = matrix[q][index] = sine * aip + cosine * aiq;
    }
    const app = matrix[p][p];
    const aqq = matrix[q][q];
    const apq = matrix[p][q];
    matrix[p][p] = cosine * cosine * app - 2 * sine * cosine * apq + sine * sine * aqq;
    matrix[q][q] = sine * sine * app + 2 * sine * cosine * apq + cosine * cosine * aqq;
    matrix[p][q] = matrix[q][p] = 0;
    for (let row = 0; row < size; row += 1) {
      const vip = vectors[row][p];
      const viq = vectors[row][q];
      vectors[row][p] = cosine * vip - sine * viq;
      vectors[row][q] = sine * vip + cosine * viq;
    }
  }
  return Array.from({ length: size }, (_value, column) => ({
    value: matrix[column][column],
    vector: Float64Array.from(vectors, (row) => row[column]),
  })).sort((left, right) => left.value - right.value);
}

function orthonormalModes(inputModes, size) {
  const output = [];
  for (const input of Array.isArray(inputModes) ? inputModes : []) {
    if (input?.length !== size) continue;
    const vector = Float64Array.from(input, Number);
    if (Array.from(vector).some((value) => !Number.isFinite(value))) continue;
    for (const basis of output) {
      let projection = 0;
      for (let index = 0; index < size; index += 1) projection += vector[index] * basis[index];
      for (let index = 0; index < size; index += 1) vector[index] -= projection * basis[index];
    }
    let squaredNorm = 0;
    for (const value of vector) squaredNorm += value * value;
    const norm = Math.sqrt(squaredNorm);
    if (!(norm > 1e-10)) continue;
    for (let index = 0; index < size; index += 1) vector[index] /= norm;
    output.push(vector);
  }
  return output;
}

function cscOffset(matrix, row, column) {
  for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
    if (matrix.rowIdx[offset] === row) return offset;
  }
  return -1;
}

function expandActiveSolution(values, activeDofs, fullSize) {
  const output = new Float64Array(fullSize);
  activeDofs.forEach((fullDof, index) => { output[fullDof] = Number(values[index]); });
  return output;
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

function residualLineSearchScales(initial, external, kinds, criteria = {}, characteristicLength = 1) {
  const externalNorms = residualNormsByKind(external, kinds);
  const force = Math.max(initial.force, externalNorms.force, positive(criteria.forceScaleFloor, 1));
  return {
    force,
    moment: Math.max(
      initial.moment,
      externalNorms.moment,
      force * characteristicLength,
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

function nonnegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  return Math.max(1, Math.trunc(positive(value, fallback)));
}

function serializableError(value) {
  if (!value) return value;
  if (value instanceof Error) return { name: value.name, code: value.code || null, message: value.message };
  try { return structuredClone(value); } catch { return { message: String(value) }; }
}
