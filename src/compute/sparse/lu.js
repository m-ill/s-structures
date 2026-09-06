import { cscToCsr, validateCommonSparseMatrix } from './matrix.js';

export const SPARSE_LU_VERSION = 'p9-m2-sparse-lu-v1';

export function factorSparseLu(input, options = {}) {
  const startedAt = now();
  try {
    validateCommonSparseMatrix(input);
  } catch (error) {
    return failed(error.code || 'INVALID_MATRIX', startedAt);
  }
  if (input.rowCount !== input.colCount) return failed('MATRIX_NOT_SQUARE', startedAt);
  const matrix = input.format === 'csr' ? input : cscToCsr(input);
  const n = matrix.rowCount;
  const rows = Array.from({ length: n }, () => new Map());
  for (let row = 0; row < n; row += 1) {
    for (let offset = matrix.rowPtr[row]; offset < matrix.rowPtr[row + 1]; offset += 1) {
      rows[row].set(matrix.colIdx[offset], Number(matrix.values[offset]));
    }
  }
  const permutation = Int32Array.from({ length: n }, (_item, index) => index);
  const pivotTolerance = positive(options.pivotTolerance, 1e-12);
  const dropTolerance = nonnegative(options.factorDropTolerance, 0);
  let pivotMin = Infinity;
  let pivotMinIndex = null;
  let pivotMax = 0;
  let fillInCount = 0;

  for (let column = 0; column < n; column += 1) {
    if (options.shouldCancel?.()) return failed('CANCELLED', startedAt, { pivotIndex: column });
    let pivotRow = column;
    let pivotAbs = Math.abs(Number(rows[column].get(column) || 0));
    for (let row = column + 1; row < n; row += 1) {
      const candidate = Math.abs(Number(rows[row].get(column) || 0));
      if (candidate > pivotAbs) {
        pivotAbs = candidate;
        pivotRow = row;
      }
    }
    pivotMax = Math.max(pivotMax, pivotAbs);
    if (pivotAbs < pivotMin) {
      pivotMin = pivotAbs;
      pivotMinIndex = column;
    }
    if (!Number.isFinite(pivotAbs) || pivotAbs <= Math.max(pivotTolerance, pivotMax * pivotTolerance)) {
      return failed('SINGULAR_PIVOT', startedAt, {
        pivotIndex: column,
        pivotOriginalIndex: permutation[pivotRow],
        pivot: rows[pivotRow].get(column) || 0,
        pivotMin: pivotMin === Infinity ? 0 : pivotMin,
        pivotMinIndex,
        pivotMinOriginalIndex: pivotMinIndex,
        pivotMax,
      });
    }
    if (pivotRow !== column) {
      [rows[column], rows[pivotRow]] = [rows[pivotRow], rows[column]];
      [permutation[column], permutation[pivotRow]] = [permutation[pivotRow], permutation[column]];
    }
    const pivot = rows[column].get(column);
    const upper = [...rows[column]].filter(([index]) => index > column);
    for (let row = column + 1; row < n; row += 1) {
      const current = rows[row].get(column);
      if (!current) continue;
      const multiplier = current / pivot;
      if (!Number.isFinite(multiplier)) return failed('NONFINITE_FACTOR', startedAt, { pivotIndex: column });
      rows[row].set(column, multiplier);
      for (const [index, value] of upper) {
        const existed = rows[row].has(index);
        const next = Number(rows[row].get(index) || 0) - multiplier * value;
        if (!Number.isFinite(next)) return failed('NONFINITE_FACTOR', startedAt, { pivotIndex: column });
        if (Math.abs(next) <= dropTolerance) rows[row].delete(index);
        else {
          rows[row].set(index, next);
          if (!existed) fillInCount += 1;
        }
      }
    }
  }

  const factorNonzeros = rows.reduce((sum, row) => sum + row.size, 0);
  return Object.freeze({
    ok: true,
    version: SPARSE_LU_VERSION,
    rows,
    permutation,
    dimension: n,
    pivotMin: pivotMin === Infinity ? 0 : pivotMin,
    pivotMinIndex,
    pivotMinOriginalIndex: pivotMinIndex,
    pivotMax,
    pivotRatio: pivotMax > 0 ? pivotMin / pivotMax : 0,
    factorNonzeros,
    fillInCount,
    factorStorage: 'sparse-row-map-lu',
    denseAllocation: false,
    denseConversionCount: 0,
    factorizationMs: elapsed(startedAt),
  });
}

export function solveSparseLu(factor, rhs, options = {}) {
  const startedAt = now();
  if (!factor?.ok) return solveFailed(factor?.reason || 'FACTORIZATION_NOT_AVAILABLE', startedAt);
  if (!arrayLike(rhs) || rhs.length !== factor.dimension) return solveFailed('INVALID_RHS', startedAt);
  const values = Float64Array.from(rhs, Number);
  if (values.some((value) => !Number.isFinite(value))) return solveFailed('INVALID_RHS', startedAt);
  if (options.shouldCancel?.()) return solveFailed('CANCELLED', startedAt);
  const n = factor.dimension;
  const y = new Float64Array(n);
  for (let row = 0; row < n; row += 1) {
    let sum = values[factor.permutation[row]];
    for (const [column, value] of factor.rows[row]) if (column < row) sum -= value * y[column];
    y[row] = sum;
  }
  const x = new Float64Array(n);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = y[row];
    let diagonal = 0;
    for (const [column, value] of factor.rows[row]) {
      if (column === row) diagonal = value;
      else if (column > row) sum -= value * x[column];
    }
    if (!Number.isFinite(diagonal) || diagonal === 0) return solveFailed('SINGULAR_PIVOT', startedAt);
    x[row] = sum / diagonal;
  }
  if (x.some((value) => !Number.isFinite(value))) return solveFailed('NONFINITE_SOLUTION', startedAt);
  return { ok: true, x, reason: null, solveMs: elapsed(startedAt) };
}

function failed(reason, startedAt, detail = {}) {
  return {
    ok: false,
    version: SPARSE_LU_VERSION,
    reason,
    factorStorage: 'sparse-row-map-lu',
    denseAllocation: false,
    denseConversionCount: 0,
    factorizationMs: elapsed(startedAt),
    ...detail,
  };
}

function solveFailed(reason, startedAt) {
  return { ok: false, x: null, reason, solveMs: elapsed(startedAt) };
}

function arrayLike(value) {
  return Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonnegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function elapsed(startedAt) {
  return Math.max(0, now() - startedAt);
}
