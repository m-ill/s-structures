import { stableHash } from '../../core/stableHash.js';
import { createCpuSparseBackend } from '../backends/cpuSparseBackend.js';
import { factorIncompleteCholesky, solveIccg } from '../sparse/iccg.js';
import {
  createCscFromTriplets,
  cscDiagonal,
  cscMatVec,
  cscRowNorms,
  cscSymmetryError,
  sparsePatternHash,
  sparseValueHash,
  validateCommonSparseMatrix,
} from '../sparse/matrix.js';

export const SPD_SOLVE_POLICY_VERSION = 'p15-m2-spd-solve-policy-v1';

const FALLBACK_REASONS = Object.freeze(new Set([
  'ICCG_NON_POSITIVE_PIVOT',
  'ICCG_NONFINITE_FACTOR',
  'ICCG_NON_POSITIVE_CURVATURE',
  'ICCG_NOT_CONVERGED',
  'SPD_TRUE_RESIDUAL_EXCEEDED',
]));

/**
 * Shared fail-closed SPD policy. It operates entirely on CSC matrices, applies
 * symmetric diagonal equilibration, prefers IC(0)-PCG above the configured
 * threshold, and permits only an explicit sparse LDLT fallback.
 */
export function createSpdSolvePolicy(options = {}) {
  const backend = options.backend || createCpuSparseBackend({ maxBytes: options.maxBytes });
  const ownsBackend = !options.backend;
  const preparedRows = new Set();
  let prepareCount = 0;
  let solveCount = 0;
  let fallbackCount = 0;
  let fallbackSuccessCount = 0;
  let disposed = false;

  return Object.freeze({
    version: SPD_SOLVE_POLICY_VERSION,
    prepare,
    solvePrepared,
    release,
    snapshot,
    dispose,
  });

  function prepare(matrix, prepareOptions = {}) {
    if (disposed) return failure('SPD_POLICY_DISPOSED', 'prepare');
    const validation = validateSpdInput(matrix, prepareOptions);
    if (!validation.ok) return validation;
    const scalingMode = normalizeScaling(prepareOptions.scaling ?? options.scaling);
    const equilibration = scalingMode === 'diagonal'
      ? equilibrateSpdSystem(matrix)
      : identityEquilibration(matrix);
    if (!equilibration.ok) return equilibration;
    const threshold = positiveInteger(prepareOptions.iccgThreshold ?? options.iccgThreshold, 512);
    const iterativeRequested = matrix.rowCount >= threshold && prepareOptions.preferIterative !== false;
    const fallbackPolicy = normalizeFallback(prepareOptions.fallback ?? options.fallback);
    const row = {
      version: SPD_SOLVE_POLICY_VERSION,
      matrix,
      scaledMatrix: equilibration.matrix,
      scale: equilibration.scale,
      scaling: equilibration.diagnostics,
      symmetryError: validation.symmetryError,
      threshold,
      fallbackPolicy,
      mode: null,
      iccgFactor: null,
      directHandle: null,
      initialFailureReason: null,
      released: false,
      solveCount: 0,
      patternHash: sparsePatternHash(matrix),
      valueHash: sparseValueHash(matrix),
    };
    if (iterativeRequested) {
      const factor = factorIncompleteCholesky(row.scaledMatrix, {
        signal: prepareOptions.signal,
        symmetryTolerance: validation.symmetryTolerance,
        breakdownTolerance: prepareOptions.iccgBreakdownTolerance ?? options.iccgBreakdownTolerance,
      });
      if (factor.ok) {
        row.mode = 'iccg';
        row.iccgFactor = factor;
      } else if (canFallback(factor.reason, fallbackPolicy)) {
        row.initialFailureReason = factor.reason;
        const fallback = prepareDirect(row, prepareOptions, factor.reason);
        if (!fallback.ok) return fallback;
      } else {
        return policyFailure(factor.reason || 'ICCG_FACTORIZATION_FAILED', 'iterative-factorization', row, factor.diagnostics);
      }
    } else {
      const direct = prepareDirect(row, prepareOptions, null);
      if (!direct.ok) return direct;
    }
    prepareCount += 1;
    preparedRows.add(row);
    return {
      ok: true,
      prepared: row,
      reason: null,
      diagnostics: preparedDiagnostics(row),
    };
  }

  function solvePrepared(row, rhsInput, solveOptions = {}) {
    if (disposed) return failure('SPD_POLICY_DISPOSED', 'solve');
    if (!preparedRows.has(row) || row.released) return failure('SPD_POLICY_FACTOR_INVALID', 'solve');
    const rhs = normalizeRhs(rhsInput, row.matrix.rowCount);
    if (!rhs.ok) return rhs;
    const scaledRhs = scaleVector(rhs.values, row.scale);
    const tolerance = positive(solveOptions.tolerance ?? options.tolerance, 1e-9);
    const trueResidualTolerance = positive(
      solveOptions.trueResidualTolerance ?? options.trueResidualTolerance,
      Math.max(tolerance, 1e-10),
    );
    const priorMode = row.mode;
    let raw = solveCurrent(row, scaledRhs, { ...solveOptions, tolerance });
    let fallbackReason = null;
    let fallbackAttempted = row.initialFailureReason != null;
    let fallbackSucceeded = row.initialFailureReason != null && row.mode === 'direct-fallback';
    let solution = raw.ok ? unscaleSolution(raw.x, row.scale) : null;
    let trueResidual = solution ? computeSpdTrueResidual(row.matrix, solution, rhs.values) : null;
    if (raw.ok && trueResidual.trueRelativeResidual > trueResidualTolerance) {
      raw = { ...raw, ok: false, reason: 'SPD_TRUE_RESIDUAL_EXCEEDED' };
    }
    if (!raw.ok && priorMode === 'iccg' && canFallback(raw.reason, row.fallbackPolicy)) {
      fallbackReason = raw.reason;
      fallbackAttempted = true;
      const prepared = prepareDirect(row, solveOptions, fallbackReason);
      if (prepared.ok) {
        row.initialFailureReason = row.initialFailureReason || fallbackReason;
        raw = solveCurrent(row, scaledRhs, solveOptions);
        solution = raw.ok ? unscaleSolution(raw.x, row.scale) : null;
        trueResidual = solution ? computeSpdTrueResidual(row.matrix, solution, rhs.values) : null;
        fallbackSucceeded = raw.ok && trueResidual.trueRelativeResidual <= trueResidualTolerance;
        if (raw.ok && !fallbackSucceeded) raw = { ...raw, ok: false, reason: 'SPD_TRUE_RESIDUAL_EXCEEDED' };
      } else {
        raw = prepared;
      }
    }
    row.solveCount += 1;
    solveCount += 1;
    if (fallbackAttempted) fallbackCount += 1;
    if (fallbackSucceeded) fallbackSuccessCount += 1;
    const ok = raw.ok === true && solution != null && trueResidual?.trueRelativeResidual <= trueResidualTolerance;
    const reason = ok ? null : raw.reason || 'SPD_TRUE_RESIDUAL_EXCEEDED';
    return {
      ok,
      x: ok ? solution : null,
      reason,
      diagnostics: {
        ...preparedDiagnostics(row),
        ...(raw.diagnostics || {}),
        version: SPD_SOLVE_POLICY_VERSION,
        method: row.mode === 'iccg' ? 'scaled-ic0-pcg' : 'scaled-sparse-ldlt',
        selectedMethod: row.mode,
        preconditioner: priorMode === 'iccg' ? 'incomplete-cholesky-zero-fill' : null,
        iterations: Number(raw.diagnostics?.iterations ?? 0),
        requestedTolerance: tolerance,
        trueResidualTolerance,
        trueResidual: trueResidual || null,
        residualMax: trueResidual?.residualMax ?? raw.diagnostics?.residualMax ?? null,
        relativeResidual: trueResidual?.trueRelativeResidual ?? raw.diagnostics?.relativeResidual ?? null,
        backwardError: trueResidual?.backwardError ?? null,
        fallback: fallbackAttempted,
        fallbackReason: fallbackReason || row.initialFailureReason,
        fallbackSucceeded,
        denseMatrixAllocated: false,
        denseFallbackAllocated: false,
        denseConversionCount: 0,
      },
    };
  }

  function release(row) {
    if (!preparedRows.has(row) || row.released) return false;
    if (row.directHandle) backend.releaseFactor(row.directHandle);
    row.released = true;
    preparedRows.delete(row);
    return true;
  }

  function snapshot() {
    return Object.freeze({
      version: SPD_SOLVE_POLICY_VERSION,
      disposed,
      activePreparedCount: preparedRows.size,
      prepareCount,
      solveCount,
      fallbackCount,
      fallbackSuccessCount,
      backend: backend.snapshot(),
    });
  }

  function dispose() {
    if (disposed) return snapshot();
    for (const row of [...preparedRows]) release(row);
    if (ownsBackend) backend.dispose();
    disposed = true;
    return snapshot();
  }

  function prepareDirect(row, prepareOptions, fallbackReason) {
    if (row.directHandle) {
      row.mode = fallbackReason ? 'direct-fallback' : 'direct';
      return { ok: true };
    }
    const prepared = backend.createFactor(row.scaledMatrix, {
      matrixClass: 'spd',
      signal: prepareOptions.signal,
      symmetryTolerance: prepareOptions.symmetryTolerance ?? options.symmetryTolerance,
      pivotTolerance: prepareOptions.pivotTolerance ?? options.pivotTolerance,
      factorDropTolerance: 0,
    });
    if (!prepared.ok) {
      return policyFailure(
        prepared.reason || 'SPD_DIRECT_FACTORIZATION_FAILED',
        fallbackReason ? 'fallback-factorization' : 'direct-factorization',
        row,
        prepared.diagnostics,
      );
    }
    row.directHandle = prepared.handle;
    row.mode = fallbackReason ? 'direct-fallback' : 'direct';
    return { ok: true };
  }

  function solveCurrent(row, rhs, solveOptions) {
    if (row.mode === 'iccg') {
      return solveIccg(row.iccgFactor, rhs, {
        signal: solveOptions.signal,
        tolerance: solveOptions.tolerance ?? options.tolerance ?? 1e-9,
        maxIterations: solveOptions.maxIterations ?? options.maxIterations,
        curvatureTolerance: solveOptions.curvatureTolerance ?? options.curvatureTolerance,
      });
    }
    return backend.solveFactor(row.directHandle, rhs, { signal: solveOptions.signal });
  }
}

export function equilibrateSpdSystem(matrix) {
  try {
    validateCommonSparseMatrix(matrix);
  } catch (error) {
    return failure(error.code || 'SPD_MATRIX_INVALID', 'equilibration');
  }
  if (matrix.format !== 'csc' || matrix.rowCount !== matrix.colCount) {
    return failure('SPD_MATRIX_INVALID', 'equilibration');
  }
  const diagonal = cscDiagonal(matrix);
  const invalidIndex = diagonal.findIndex((value) => !(value > 0) || !Number.isFinite(value));
  if (invalidIndex >= 0) {
    return failure('SPD_DIAGONAL_NOT_POSITIVE', 'equilibration', { invalidIndex, value: diagonal[invalidIndex] });
  }
  const scale = Float64Array.from(diagonal, (value) => 1 / Math.sqrt(value));
  if (scale.some((value) => !Number.isFinite(value) || !(value > 0))) {
    return failure('SPD_SCALING_NONFINITE', 'equilibration');
  }
  const triplets = [];
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let pointer = matrix.colPtr[column]; pointer < matrix.colPtr[column + 1]; pointer += 1) {
      const row = matrix.rowIdx[pointer];
      triplets.push({ row, column, value: matrix.values[pointer] * scale[row] * scale[column] });
    }
  }
  const scaled = createCscFromTriplets(matrix.rowCount, matrix.colCount, triplets);
  const diagonalRange = finiteRange(diagonal);
  const scaleRange = finiteRange(scale);
  return {
    ok: true,
    matrix: scaled,
    scale,
    diagnostics: Object.freeze({
      mode: 'symmetric-diagonal',
      minimumDiagonal: diagonalRange.minimum,
      maximumDiagonal: diagonalRange.maximum,
      minimumScale: scaleRange.minimum,
      maximumScale: scaleRange.maximum,
      scaleRatio: scaleRange.minimum > 0 ? scaleRange.maximum / scaleRange.minimum : 1,
      scaledSymmetryError: cscSymmetryError(scaled),
      scaledPatternHash: sparsePatternHash(scaled),
      scaledValueHash: sparseValueHash(scaled),
    }),
  };
}

export function computeSpdTrueResidual(matrix, xInput, rhsInput) {
  validateCommonSparseMatrix(matrix);
  if (matrix.format !== 'csc' || matrix.rowCount !== matrix.colCount) {
    throw policyError('SPD_MATRIX_INVALID', 'True residual requires a square CSC matrix.');
  }
  const x = finiteVector(xInput, matrix.colCount, 'x');
  const rhs = finiteVector(rhsInput, matrix.rowCount, 'rhs');
  const product = cscMatVec(matrix, x);
  let residualMax = 0;
  let rhsNorm = 0;
  let xNorm = 0;
  for (let index = 0; index < rhs.length; index += 1) {
    residualMax = Math.max(residualMax, Math.abs(product[index] - rhs[index]));
    rhsNorm = Math.max(rhsNorm, Math.abs(rhs[index]));
    xNorm = Math.max(xNorm, Math.abs(x[index]));
  }
  let matrixNorm = 0;
  for (const value of cscRowNorms(matrix)) matrixNorm = Math.max(matrixNorm, value);
  const denominator = matrixNorm * xNorm + rhsNorm;
  return Object.freeze({
    residualMax,
    rhsNorm,
    matrixNorm,
    solutionNorm: xNorm,
    trueRelativeResidual: residualMax / Math.max(1, rhsNorm),
    backwardError: denominator > 0 ? residualMax / denominator : residualMax === 0 ? 0 : Infinity,
  });
}

function validateSpdInput(matrix, options) {
  try {
    validateCommonSparseMatrix(matrix);
  } catch (error) {
    return failure(error.code || 'SPD_MATRIX_INVALID', 'input-validation');
  }
  if (matrix.format !== 'csc' || matrix.rowCount !== matrix.colCount) {
    return failure('SPD_MATRIX_INVALID', 'input-validation');
  }
  const symmetryTolerance = positive(options.symmetryTolerance, 1e-12);
  const symmetryError = cscSymmetryError(matrix);
  if (!Number.isFinite(symmetryError) || symmetryError > symmetryTolerance) {
    return failure('SPD_MATRIX_NOT_SYMMETRIC', 'qualification', { symmetryError, symmetryTolerance });
  }
  return { ok: true, symmetryError, symmetryTolerance };
}

function identityEquilibration(matrix) {
  return {
    ok: true,
    matrix,
    scale: new Float64Array(matrix.rowCount).fill(1),
    diagnostics: Object.freeze({
      mode: 'none',
      minimumDiagonal: null,
      maximumDiagonal: null,
      minimumScale: 1,
      maximumScale: 1,
      scaleRatio: 1,
      scaledSymmetryError: cscSymmetryError(matrix),
      scaledPatternHash: sparsePatternHash(matrix),
      scaledValueHash: sparseValueHash(matrix),
    }),
  };
}

function preparedDiagnostics(row) {
  return {
    version: SPD_SOLVE_POLICY_VERSION,
    matrixClass: 'spd',
    originalPatternHash: row.patternHash,
    originalValueHash: row.valueHash,
    symmetryError: row.symmetryError,
    scaling: row.scaling,
    selectedMethod: row.mode,
    iterativeThreshold: row.threshold,
    fallbackPolicy: row.fallbackPolicy,
    policyHash: stableHash({
      version: SPD_SOLVE_POLICY_VERSION,
      scaling: row.scaling.mode,
      threshold: row.threshold,
      fallbackPolicy: row.fallbackPolicy,
    }),
    denseMatrixAllocated: false,
    denseFallbackAllocated: false,
    denseConversionCount: 0,
  };
}

function policyFailure(reason, stage, row, detail = {}) {
  return failure(reason, stage, {
    originalPatternHash: row.patternHash,
    originalValueHash: row.valueHash,
    scaling: row.scaling,
    selectedMethod: row.mode,
    ...detail,
  });
}

function canFallback(reason, policy) {
  return policy === 'sparse-direct' && FALLBACK_REASONS.has(reason);
}

function normalizeFallback(value) {
  const normalized = String(value ?? 'sparse-direct').trim().toLowerCase();
  if (normalized === 'sparse-direct' || normalized === 'none') return normalized;
  throw policyError('SPD_FALLBACK_POLICY_INVALID', 'fallback must be sparse-direct or none.');
}

function normalizeScaling(value) {
  const normalized = String(value ?? 'diagonal').trim().toLowerCase();
  if (normalized === 'diagonal' || normalized === 'none') return normalized;
  throw policyError('SPD_SCALING_POLICY_INVALID', 'scaling must be diagonal or none.');
}

function normalizeRhs(values, dimension) {
  try {
    return { ok: true, values: finiteVector(values, dimension, 'rhs') };
  } catch (error) {
    return failure(error.code || 'SPD_RHS_INVALID', 'rhs-validation');
  }
}

function finiteVector(values, dimension, name) {
  if ((!Array.isArray(values) && !ArrayBuffer.isView(values)) || values.length !== dimension) {
    throw policyError('SPD_VECTOR_SIZE_INVALID', `${name} must contain ${dimension} values.`);
  }
  const output = Float64Array.from(values, Number);
  if (output.some((value) => !Number.isFinite(value))) {
    throw policyError('SPD_VECTOR_NONFINITE', `${name} must contain only finite values.`);
  }
  return output;
}

function finiteRange(values) {
  if (values.length === 0) return { minimum: 0, maximum: 0 };
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of values) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  return { minimum, maximum };
}

function scaleVector(values, scale) {
  return Float64Array.from(values, (value, index) => value * scale[index]);
}

function unscaleSolution(values, scale) {
  return Float64Array.from(values, (value, index) => value * scale[index]);
}

function failure(reason, stage, detail = {}) {
  return {
    ok: false,
    x: null,
    reason,
    diagnostics: {
      version: SPD_SOLVE_POLICY_VERSION,
      stage,
      reason,
      denseMatrixAllocated: false,
      denseFallbackAllocated: false,
      denseConversionCount: 0,
      ...detail,
    },
  };
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function policyError(code, message) {
  const error = new TypeError(message);
  error.name = 'SpdSolvePolicyError';
  error.code = code;
  return error;
}
