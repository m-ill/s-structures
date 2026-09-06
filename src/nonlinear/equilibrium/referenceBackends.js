import { stableHash } from '../../core/stableHash.js';
import { solveSparseLinear } from '../../solver/sparse/solveSparse.js';
import {
  assertComputeBackendPolicy,
  computeBackendSupportsMatrixClass,
  describeComputeBackend,
} from '../../compute/backends/contract.js';

export const MDOF_LINEAR_BACKEND_VERSION = 'p8-m2-linear-backend-v1';
export const NONLINEAR_COMPUTE_BACKEND_POLICY_VERSION = 'p8-m7-compute-backend-policy-v1';
export const NONLINEAR_COMPUTE_TARGETS = Object.freeze(['auto', 'cpu', 'wasm', 'gpu']);

export function createDenseReferenceBackend(options = {}) {
  const limit = positiveInteger(options.limit, 300);
  return Object.freeze({
    version: MDOF_LINEAR_BACKEND_VERSION,
    id: 'dense-pivoted-reference',
    production: false,
    executionTarget: 'cpu-js',
    numericPrecision: 'f64',
    deterministic: true,
    matrixClasses: Object.freeze(['spd', 'symmetric-indefinite', 'general']),
    preflight({ dofCount = 0 } = {}) {
      const ok = Number(dofCount) <= limit;
      return { ok, backendId: this.id, limit, reason: ok ? null : 'DENSE_REFERENCE_DOF_LIMIT' };
    },
    solve(matrix, rhs, solveOptions = {}) {
      const n = Number(matrix?.colCount ?? matrix?.length ?? 0);
      if (n > limit) return failed('DENSE_REFERENCE_DOF_LIMIT', this.id, n);
      const dense = toDense(matrix);
      return solveDensePivoted(dense, rhs, { ...solveOptions, backendId: this.id });
    },
  });
}

export function createJsSparseReferenceBackend(options = {}) {
  const limit = positiveInteger(options.limit, 2000);
  return Object.freeze({
    version: MDOF_LINEAR_BACKEND_VERSION,
    id: 'js-sparse-spd-reference',
    production: false,
    executionTarget: 'cpu-js',
    numericPrecision: 'f64',
    deterministic: true,
    matrixClasses: Object.freeze(['spd']),
    preflight({ dofCount = 0, matrixClass = 'spd' } = {}) {
      const reason = matrixClass !== 'spd'
        ? 'JS_SPARSE_MATRIX_CLASS_UNSUPPORTED'
        : Number(dofCount) > limit ? 'JS_SPARSE_REFERENCE_DOF_LIMIT' : null;
      return { ok: !reason, backendId: this.id, limit, reason };
    },
    solve(matrix, rhs, solveOptions = {}) {
      if (solveOptions.matrixClass && solveOptions.matrixClass !== 'spd') {
        return failed('JS_SPARSE_MATRIX_CLASS_UNSUPPORTED', this.id, Number(matrix?.colCount || 0));
      }
      const n = Number(matrix?.colCount || 0);
      if (n > limit) return failed('JS_SPARSE_REFERENCE_DOF_LIMIT', this.id, n);
      const csc = regularCsc(matrix);
      const result = solveSparseLinear(csc, Array.from(rhs, Number), {
        allowDenseFallback: false,
        directLimit: limit,
        pivotTolerance: solveOptions.pivotTolerance,
        criteriaModel: solveOptions.criteriaModel,
      });
      return {
        ok: result.ok,
        x: result.x ? Float64Array.from(result.x) : null,
        reason: result.reason,
        diagnostics: {
          version: MDOF_LINEAR_BACKEND_VERSION,
          backendId: this.id,
          matrixClass: 'spd',
          denseAllocated: false,
          ...result.diagnostics,
        },
      };
    },
  });
}

export function requireEquilibriumBackend(backend, options = {}) {
  const matrixClass = options.matrixClass || 'spd';
  const dofCount = Number(options.dofCount || 0);
  if (!backend || typeof backend.solve !== 'function') {
    const error = new Error('A nonlinear equilibrium linear-system backend is required.');
    error.code = options.production ? 'PRODUCTION_BACKEND_UNAVAILABLE' : 'EQUILIBRIUM_BACKEND_REQUIRED';
    throw error;
  }
  if (options.production && backend.production !== true) {
    const error = new Error('Production nonlinear execution requires a production backend.');
    error.code = 'PRODUCTION_BACKEND_UNAVAILABLE';
    throw error;
  }
  assertComputeBackendPolicy(backend, options);
  if (!computeBackendSupportsMatrixClass(backend.matrixClasses, matrixClass)) {
    const error = new Error(`Backend ${backend.id || '(unknown)'} does not support ${matrixClass}.`);
    error.code = 'BACKEND_MATRIX_CLASS_UNSUPPORTED';
    throw error;
  }
  const preflight = backend.preflight?.({ dofCount, matrixClass, ...options }) || { ok: true };
  if (!preflight.ok) {
    const error = new Error(`Backend preflight failed: ${preflight.reason || 'BACKEND_PREFLIGHT_FAILED'}.`);
    error.code = preflight.reason || 'BACKEND_PREFLIGHT_FAILED';
    error.preflight = preflight;
    throw error;
  }
  return backend;
}

export function describeEquilibriumBackend(backend = {}) {
  const common = describeComputeBackend({
    ...backend,
    id: backend.id || 'unknown-equilibrium-backend',
    executionTarget: backend.executionTarget || 'unknown',
  });
  return Object.freeze({
    version: NONLINEAR_COMPUTE_BACKEND_POLICY_VERSION,
    id: backend.id || null,
    executionTarget: common.executionTarget,
    targetFamily: common.targetFamily,
    numericPrecision: common.numericPrecision,
    deterministic: common.deterministic,
    production: common.production,
    matrixClasses: common.matrixClasses,
  });
}

export function solveDensePivoted(input, rhs, options = {}) {
  const startedAt = now();
  const n = Array.isArray(input) ? input.length : 0;
  if (!n || input.some((row) => !Array.isArray(row) || row.length !== n)) return failed('INVALID_MATRIX', options.backendId, n);
  if (!isFiniteVector(rhs, n)) return failed('INVALID_RHS', options.backendId, n);
  const A = input.map((row) => row.map(Number));
  const b = Array.from(rhs, Number);
  const scale = Math.max(1, ...A.flatMap((row) => row.map((value) => Math.abs(value))));
  const tolerance = positive(options.pivotTolerance, 1e-12) * scale;
  let pivotMin = Infinity;
  let pivotMax = 0;
  for (let column = 0; column < n; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(A[row][column]) > Math.abs(A[pivotRow][column])) pivotRow = row;
    }
    const pivot = Math.abs(A[pivotRow][column]);
    if (!Number.isFinite(pivot) || pivot <= tolerance) {
      return failed('SINGULAR_TANGENT', options.backendId, n, { pivotIndex: column, pivot, pivotTolerance: tolerance });
    }
    if (pivotRow !== column) {
      [A[column], A[pivotRow]] = [A[pivotRow], A[column]];
      [b[column], b[pivotRow]] = [b[pivotRow], b[column]];
    }
    pivotMin = Math.min(pivotMin, pivot);
    pivotMax = Math.max(pivotMax, pivot);
    for (let row = column + 1; row < n; row += 1) {
      const factor = A[row][column] / A[column][column];
      A[row][column] = 0;
      for (let j = column + 1; j < n; j += 1) A[row][j] -= factor * A[column][j];
      b[row] -= factor * b[column];
    }
  }
  const x = new Float64Array(n);
  for (let row = n - 1; row >= 0; row -= 1) {
    let value = b[row];
    for (let column = row + 1; column < n; column += 1) value -= A[row][column] * x[column];
    x[row] = value / A[row][row];
  }
  if (![...x].every(Number.isFinite)) return failed('NONFINITE_SOLUTION', options.backendId, n);
  const residual = relativeResidual(input, x, rhs);
  return {
    ok: true,
    x,
    reason: null,
    diagnostics: {
      version: MDOF_LINEAR_BACKEND_VERSION,
      backendId: options.backendId || 'dense-pivoted-reference',
      matrixClass: options.matrixClass || 'general',
      denseAllocated: true,
      pivotMin,
      pivotMax,
      pivotRatio: pivotMax > 0 ? pivotMin / pivotMax : 0,
      residualNorm: residual,
      matrixHash: stableHash(input).slice(0, 24),
      solveMs: Math.max(0, now() - startedAt),
    },
  };
}

function toDense(matrix) {
  if (Array.isArray(matrix)) return matrix.map((row) => row.map(Number));
  const n = Number(matrix?.rowCount || 0);
  const out = Array.from({ length: n }, () => new Array(Number(matrix?.colCount || 0)).fill(0));
  if (matrix?.format !== 'csc') return out;
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let p = matrix.colPtr[column]; p < matrix.colPtr[column + 1]; p += 1) {
      out[matrix.rowIdx[p]][column] += Number(matrix.values[p]);
    }
  }
  return out;
}

function regularCsc(matrix) {
  return {
    ...matrix,
    colPtr: Array.from(matrix.colPtr, Number),
    rowIdx: Array.from(matrix.rowIdx, Number),
    values: Array.from(matrix.values, Number),
  };
}

function relativeResidual(A, x, b) {
  const product = A.map((row) => row.reduce((sum, value, index) => sum + Number(value) * x[index], 0));
  const residual = product.reduce((max, value, index) => Math.max(max, Math.abs(value - Number(b[index]))), 0);
  const scale = Math.max(1, ...Array.from(b, (value) => Math.abs(Number(value))));
  return residual / scale;
}

function failed(reason, backendId, dofCount, detail = {}) {
  return {
    ok: false,
    x: null,
    reason,
    diagnostics: { version: MDOF_LINEAR_BACKEND_VERSION, backendId: backendId || null, dofCount, ...detail },
  };
}

function isFiniteVector(values, length) {
  return values != null && values.length === length && Array.from(values).every((value) => Number.isFinite(Number(value)));
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}
