import { stableHash } from '../../core/stableHash.js';
import {
  cscMatVec,
  cscSymmetryError,
  csrToCsc,
  sparsePatternHash,
  sparseStats,
  sparseValueHash,
  validateCommonSparseMatrix,
} from './matrix.js';
import { factorLdlt, solveLdlt } from './ldlt.js';
import { factorSparseLu, solveSparseLu } from './lu.js';
import { symbolicFactor } from './symbolic.js';

export const SPARSE_FACTOR_RUNTIME_VERSION = 'p9-m2-factor-runtime-v1';

export function createSparseFactorRuntime(options = {}) {
  const maxBytes = positiveInteger(options.maxBytes, 512 * 1024 * 1024);
  const symbolicCacheLimit = positiveInteger(options.symbolicCacheLimit, 64);
  const symbolicCache = new Map();
  const numericCache = new Map();
  const handles = new Map();
  let sequence = 0;
  let symbolicAnalysisCount = 0;
  let numericFactorizationCount = 0;
  let allocatedBytes = 0;
  let peakBytes = 0;
  let disposed = false;

  return Object.freeze({
    version: SPARSE_FACTOR_RUNTIME_VERSION,
    prepare,
    solve,
    solveMultiple,
    release,
    snapshot,
    dispose,
  });

  function prepare(input, prepareOptions = {}) {
    if (disposed) return failure('RUNTIME_DISPOSED', 'prepare');
    if (cancelled(prepareOptions)) return failure('CANCELLED', 'preflight');
    let matrix;
    try {
      validateCommonSparseMatrix(input);
      matrix = input.format === 'csc' ? input : csrToCsc(input);
    } catch (error) {
      return failure(error.code || 'INVALID_MATRIX', 'input-validation');
    }
    if (matrix.rowCount !== matrix.colCount) return failure('MATRIX_NOT_SQUARE', 'input-validation');
    const matrixClass = normalizeMatrixClass(prepareOptions.matrixClass);
    if (!matrixClass) return failure('UNSUPPORTED_MATRIX_CLASS', 'input-validation');
    if (matrixClass === 'spd') {
      const symmetryError = cscSymmetryError(matrix);
      const symmetryTolerance = positive(prepareOptions.symmetryTolerance, 1e-10);
      if (!Number.isFinite(symmetryError) || symmetryError > symmetryTolerance) {
        return failure('MATRIX_NOT_SYMMETRIC', 'qualification', { symmetryError, symmetryTolerance });
      }
    }
    const patternHash = sparsePatternHash(matrix);
    const valueHash = sparseValueHash(matrix);
    const matrixBytes = matrix.colPtr.byteLength + matrix.rowIdx.byteLength + matrix.values.byteLength;
    const estimatedFactorBytes = Math.max(matrixBytes * 4, matrix.rowCount * 64);
    if (matrixBytes + estimatedFactorBytes > maxBytes) {
      return failure('MEMORY_BUDGET_EXCEEDED', 'memory-preflight', {
        requestedBytes: matrixBytes + estimatedFactorBytes,
        maxBytes,
      });
    }

    let symbolic = symbolicCache.get(patternHash);
    const symbolicReused = !!symbolic;
    if (!symbolic) {
      symbolic = Object.freeze({
        ...symbolicFactor(matrix, { ordering: prepareOptions.ordering || 'approximate-minimum-degree' }),
        patternHash,
        bytes: matrix.colPtr.byteLength + matrix.rowIdx.byteLength,
      });
      symbolicAnalysisCount += 1;
      if (symbolicCache.size >= symbolicCacheLimit) evictUnusedSymbolic();
      symbolicCache.set(patternHash, symbolic);
      allocate(symbolic.bytes);
    }

    const numericKey = `${matrixClass}:${patternHash}:${valueHash}`;
    let numeric = numericCache.get(numericKey);
    const numericReused = !!numeric;
    if (!numeric) {
      const factorOptions = {
        pivotTolerance: prepareOptions.pivotTolerance,
        factorDropTolerance: prepareOptions.factorDropTolerance,
        permutation: matrixClass === 'spd' ? symbolic.permutation : undefined,
        shouldCancel: () => cancelled(prepareOptions),
      };
      const factor = matrixClass === 'spd'
        ? factorLdlt(matrix, factorOptions)
        : factorSparseLu(matrix, factorOptions);
      if (!factor.ok) return failure(factor.reason, 'numeric-factorization', { factor });
      if (matrixClass === 'spd' && factor.D.some((value) => !(value > 0))) {
        return failure('MATRIX_NOT_POSITIVE_DEFINITE', 'numeric-factorization');
      }
      const bytes = factorBytes(factor);
      if (allocatedBytes + bytes > maxBytes) return failure('MEMORY_BUDGET_EXCEEDED', 'numeric-factorization');
      numeric = { key: numericKey, factor, bytes, refCount: 0 };
      numericCache.set(numericKey, numeric);
      numericFactorizationCount += 1;
      allocate(bytes);
    }
    numeric.refCount += 1;
    const id = `p9-factor-${++sequence}`;
    const handle = Object.freeze({
      version: SPARSE_FACTOR_RUNTIME_VERSION,
      id,
      matrix,
      matrixClass,
      patternHash,
      valueHash,
      numericKey,
      symbolicReused,
      numericReused,
      symbolicAnalysisCount,
      numericFactorizationCount,
      denseConversionCount: 0,
      denseFallbackAllocated: false,
      disposed: false,
    });
    handles.set(id, { handle, numeric });
    return { ok: true, handle, reason: null, diagnostics: handleDiagnostics(handle) };
  }

  function solve(handle, rhs, solveOptions = {}) {
    const row = activeHandle(handle);
    if (!row.ok) return row;
    if (cancelled(solveOptions)) return failure('CANCELLED', 'solve');
    let solved;
    try {
      solved = row.handle.matrixClass === 'spd'
        ? solveLdlt(row.numeric.factor, normalizeRhs(rhs, row.handle.matrix.rowCount))
        : solveSparseLu(row.numeric.factor, rhs, { shouldCancel: () => cancelled(solveOptions) });
    } catch (error) {
      return failure(error.code || 'INVALID_RHS', 'solve');
    }
    return finishSolve(row.handle, rhs, solved, 1, 0);
  }

  function solveMultiple(handle, rhsList = [], solveOptions = {}) {
    const row = activeHandle(handle);
    if (!row.ok) return { ok: false, results: [], reason: row.reason, diagnostics: row.diagnostics };
    if (!Array.isArray(rhsList) || rhsList.length < 1) return failureMultiple('INVALID_RHS_BATCH', row.handle);
    const results = [];
    for (let index = 0; index < rhsList.length; index += 1) {
      if (cancelled(solveOptions)) {
        results.push(failure('CANCELLED', 'solve', { rhsIndex: index }));
        return multipleResult(row.handle, results, rhsList.length, 'CANCELLED');
      }
      const rhs = rhsList[index];
      let solved;
      try {
        solved = row.handle.matrixClass === 'spd'
          ? solveLdlt(row.numeric.factor, normalizeRhs(rhs, row.handle.matrix.rowCount))
          : solveSparseLu(row.numeric.factor, rhs);
      } catch (error) {
        solved = { ok: false, x: null, reason: error.code || 'INVALID_RHS', solveMs: 0 };
      }
      results.push(finishSolve(row.handle, rhs, solved, rhsList.length, index));
      if (!solved.ok) return multipleResult(row.handle, results, rhsList.length, solved.reason);
    }
    return multipleResult(row.handle, results, rhsList.length, null);
  }

  function release(handle) {
    const id = typeof handle === 'string' ? handle : handle?.id;
    const row = handles.get(id);
    if (!row) return false;
    handles.delete(id);
    row.numeric.refCount -= 1;
    if (row.numeric.refCount === 0) {
      numericCache.delete(row.numeric.key);
      free(row.numeric.bytes);
    }
    return true;
  }

  function dispose() {
    for (const row of handles.values()) row.numeric.refCount -= 1;
    handles.clear();
    for (const row of numericCache.values()) free(row.bytes);
    numericCache.clear();
    for (const row of symbolicCache.values()) free(row.bytes);
    symbolicCache.clear();
    disposed = true;
    return snapshot();
  }

  function snapshot() {
    return Object.freeze({
      version: SPARSE_FACTOR_RUNTIME_VERSION,
      disposed,
      activeHandleCount: handles.size,
      symbolicCacheSize: symbolicCache.size,
      numericCacheSize: numericCache.size,
      symbolicAnalysisCount,
      numericFactorizationCount,
      allocatedBytes,
      peakBytes,
      maxBytes,
      allocationBalanced: disposed ? allocatedBytes === 0 : null,
    });
  }

  function activeHandle(handle) {
    if (disposed) return failure('RUNTIME_DISPOSED', 'solve');
    const id = typeof handle === 'string' ? handle : handle?.id;
    const row = handles.get(id);
    if (!row) return failure('FACTOR_HANDLE_INVALID', 'solve');
    let actualPatternHash;
    let actualValueHash;
    try {
      actualPatternHash = sparsePatternHash(row.handle.matrix);
      actualValueHash = sparseValueHash(row.handle.matrix);
    } catch (error) {
      return failure(error.code || 'FACTOR_MATRIX_INVALID', 'solve');
    }
    if (actualPatternHash !== row.handle.patternHash) {
      return failure('FACTOR_PATTERN_CHANGED', 'solve', {
        expectedPatternHash: row.handle.patternHash,
        actualPatternHash,
      });
    }
    if (actualValueHash !== row.handle.valueHash) {
      return failure('FACTOR_VALUES_CHANGED', 'solve', {
        expectedValueHash: row.handle.valueHash,
        actualValueHash,
      });
    }
    return { ok: true, ...row };
  }

  function allocate(bytes) {
    allocatedBytes += bytes;
    peakBytes = Math.max(peakBytes, allocatedBytes);
  }

  function free(bytes) {
    allocatedBytes = Math.max(0, allocatedBytes - bytes);
  }

  function evictUnusedSymbolic() {
    const activePatterns = new Set([...handles.values()].map((row) => row.handle.patternHash));
    for (const [key, value] of symbolicCache) {
      if (activePatterns.has(key)) continue;
      symbolicCache.delete(key);
      free(value.bytes);
      return;
    }
  }
}

function finishSolve(handle, rhs, solved, rhsCount, rhsIndex) {
  if (!solved.ok) return failure(solved.reason, 'solve', { rhsCount, rhsIndex });
  const x = Float64Array.from(solved.x);
  const residual = residualDiagnostics(handle.matrix, x, rhs);
  return {
    ok: true,
    x,
    reason: null,
    diagnostics: {
      ...handleDiagnostics(handle),
      rhsCount,
      rhsIndex,
      solveMs: Number(solved.solveMs || 0),
      ...residual,
    },
  };
}

function multipleResult(handle, results, requestedCount, reason) {
  return {
    ok: reason === null && results.length === requestedCount && results.every((row) => row.ok),
    results,
    x: results.map((row) => row.x),
    reason,
    diagnostics: {
      ...handleDiagnostics(handle),
      rhsCount: requestedCount,
      solvedRhsCount: results.filter((row) => row.ok).length,
      factorizationCount: 1,
      factorReused: requestedCount > 1,
      eventOrder: results.map((_row, index) => index),
    },
  };
}

function failureMultiple(reason, handle) {
  return { ok: false, results: [], x: [], reason, diagnostics: { ...handleDiagnostics(handle), rhsCount: 0 } };
}

function handleDiagnostics(handle) {
  return {
    version: SPARSE_FACTOR_RUNTIME_VERSION,
    handleId: handle.id,
    matrixClass: handle.matrixClass,
    patternHash: handle.patternHash,
    valueHash: handle.valueHash,
    symbolicReused: handle.symbolicReused,
    numericReused: handle.numericReused,
    symbolicAnalysisCount: handle.symbolicAnalysisCount,
    numericFactorizationCount: handle.numericFactorizationCount,
    ...sparseStats(handle.matrix),
    denseMatrixAllocated: false,
    denseFallbackAllocated: false,
    denseConversionCount: 0,
  };
}

function residualDiagnostics(matrix, x, rhsInput) {
  const rhs = normalizeRhs(rhsInput, matrix.rowCount);
  const product = cscMatVec(matrix, x);
  let residualMax = 0;
  let rhsMax = 0;
  for (let index = 0; index < rhs.length; index += 1) {
    residualMax = Math.max(residualMax, Math.abs(product[index] - rhs[index]));
    rhsMax = Math.max(rhsMax, Math.abs(rhs[index]));
  }
  return { residualMax, relativeResidual: residualMax / Math.max(1, rhsMax) };
}

function normalizeRhs(rhs, dimension) {
  if ((!Array.isArray(rhs) && !ArrayBuffer.isView(rhs)) || rhs.length !== dimension) {
    throw Object.assign(new Error('Right-hand side dimension mismatch.'), { code: 'INVALID_RHS' });
  }
  const values = Float64Array.from(rhs, Number);
  if (values.some((value) => !Number.isFinite(value))) {
    throw Object.assign(new Error('Right-hand side must be finite.'), { code: 'INVALID_RHS' });
  }
  return values;
}

function factorBytes(factor) {
  if (factor.D) return factor.D.length * 8 + Number(factor.nonzerosL || 0) * 16;
  return Number(factor.factorNonzeros || 0) * 24 + Number(factor.dimension || 0) * 8;
}

function normalizeMatrixClass(value) {
  const normalized = String(value || 'general').toLowerCase();
  if (normalized === 'spd') return 'spd';
  if (['general', 'indefinite', 'symmetric-indefinite'].includes(normalized)) return 'general';
  return null;
}

function cancelled(options) {
  return options.signal?.aborted === true || options.shouldCancel?.() === true;
}

function failure(reason, stage, detail = {}) {
  return {
    ok: false,
    x: null,
    reason,
    diagnostics: {
      version: SPARSE_FACTOR_RUNTIME_VERSION,
      stage,
      reason,
      denseMatrixAllocated: false,
      denseFallbackAllocated: false,
      denseConversionCount: 0,
      failureHash: stableHash({ reason, stage, detail }),
      ...detail,
    },
  };
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
