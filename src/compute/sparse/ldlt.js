import { denseToCsc } from './matrix.js';
import { applyPermutationVector, invertPermutation, unpermuteVector } from './symbolic.js';

export const SPARSE_LDLT_VERSION = 'p9-m2-sparse-ldlt-v1';

export function factorLdlt(input, options = {}) {
  const startedAt = now();
  const matrix = Array.isArray(input) ? denseToCsc(input) : input;
  const n = Number(matrix?.colCount || 0);
  if (!isSquareCsc(matrix)) {
    return factorFailure('INVALID_MATRIX', startedAt, { pivotIndex: null, pivot: null });
  }

  const permutation = options.permutation || Array.from({ length: n }, (_row, index) => index);
  if (!validPermutation(permutation, n)) {
    return factorFailure('INVALID_PERMUTATION', startedAt, { pivotIndex: null, pivot: null });
  }

  const inversePermutation = invertPermutation(permutation);
  const A = permutedLowerRows(matrix, inversePermutation);
  const LRows = Array.from({ length: n }, () => new Map());
  const LColumns = Array.from({ length: n }, () => []);
  const D = new Array(n).fill(0);
  const pivotTolerance = positiveNumber(options.pivotTolerance, 1e-12);
  const dropTolerance = nonnegativeNumber(options.factorDropTolerance, 0);
  let minPivot = Infinity;
  let maxPivot = 0;

  for (let i = 0; i < n; i += 1) {
    if (options.shouldCancel?.()) {
      return factorFailure('CANCELLED', startedAt, { pivotIndex: i, pivot: null });
    }
    let d = Number(A[i].get(i) || 0);
    for (const [k, lik] of LRows[i]) d -= lik * lik * D[k];
    const absD = Math.abs(d);
    maxPivot = Math.max(maxPivot, absD);
    minPivot = Math.min(minPivot, absD);
    if (!Number.isFinite(d) || absD <= Math.max(pivotTolerance, maxPivot * pivotTolerance)) {
      return factorFailure('SINGULAR_PIVOT', startedAt, {
        pivotIndex: i,
        pivotOriginalIndex: permutation[i],
        pivot: d,
        pivotTolerance,
        pivotMin: minPivot === Infinity ? 0 : minPivot,
        pivotMax: maxPivot,
      });
    }
    D[i] = d;

    for (let j = i + 1; j < n; j += 1) {
      let value = Number(A[j].get(i) || 0);
      for (const [k, lik] of LRows[i]) {
        const ljk = LRows[j].get(k);
        if (ljk !== undefined) value -= ljk * lik * D[k];
      }
      value /= d;
      if (!Number.isFinite(value)) {
        return factorFailure('NONFINITE_FACTOR', startedAt, {
          pivotIndex: i,
          pivotOriginalIndex: permutation[i],
          pivot: d,
          pivotTolerance,
          pivotMin: minPivot === Infinity ? 0 : minPivot,
          pivotMax: maxPivot,
        });
      }
      if (Math.abs(value) <= dropTolerance) continue;
      LRows[j].set(i, value);
      LColumns[i].push({ row: j, value });
    }
  }

  const nonzerosL = n + LRows.reduce((sum, row) => sum + row.size, 0);
  return {
    ok: true,
    version: SPARSE_LDLT_VERSION,
    L: LRows,
    LRows,
    LColumns,
    D,
    permutation,
    inversePermutation,
    nonzerosL,
    pivotMin: minPivot === Infinity ? 0 : minPivot,
    pivotMax: maxPivot,
    pivotRatio: maxPivot > 0 && minPivot !== Infinity ? minPivot / maxPivot : 0,
    factorizationMs: elapsed(startedAt),
    matrixStorage: 'csc',
    factorStorage: 'sparse-row-column-maps',
    denseAllocation: false,
    denseConversionCount: 0,
  };
}

export function solveLdlt(factor, rhs) {
  const startedAt = now();
  const n = factor?.D?.length || 0;
  if (!factor?.ok) return solveFailure('FACTORIZATION_NOT_AVAILABLE', startedAt);
  if (!arrayLike(rhs) || rhs.length !== n || Array.from(rhs).some((value) => !Number.isFinite(Number(value)))) {
    return solveFailure('INVALID_RHS', startedAt);
  }

  const b = applyPermutationVector(rhs.map(Number), factor.permutation);
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    let sum = b[i];
    for (const [k, value] of factor.LRows[i]) sum -= value * y[k];
    y[i] = sum;
  }

  const z = y.map((value, i) => value / factor.D[i]);
  const xPermuted = z.slice();
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = xPermuted[i];
    for (const item of factor.LColumns[i]) sum -= item.value * xPermuted[item.row];
    xPermuted[i] = sum;
  }
  if (xPermuted.some((value) => !Number.isFinite(value))) return solveFailure('NONFINITE_SOLUTION', startedAt);
  return {
    ok: true,
    x: unpermuteVector(xPermuted, factor.permutation),
    solveMs: elapsed(startedAt),
  };
}

function permutedLowerRows(matrix, inversePermutation) {
  const pairs = Array.from({ length: matrix.rowCount }, () => new Map());
  for (let col = 0; col < matrix.colCount; col += 1) {
    for (let p = matrix.colPtr[col]; p < matrix.colPtr[col + 1]; p += 1) {
      const row = matrix.rowIdx[p];
      const value = Number(matrix.values[p]);
      if (!Number.isFinite(value) || !value) continue;
      const permutedRow = inversePermutation[row];
      const permutedCol = inversePermutation[col];
      const high = Math.max(permutedRow, permutedCol);
      const low = Math.min(permutedRow, permutedCol);
      const entry = pairs[high].get(low) || {
        lower: 0,
        upper: 0,
        hasLower: false,
        hasUpper: false,
      };
      if (permutedRow >= permutedCol) {
        entry.lower += value;
        entry.hasLower = true;
      } else {
        entry.upper += value;
        entry.hasUpper = true;
      }
      pairs[high].set(low, entry);
    }
  }

  return pairs.map((row) => {
    const values = new Map();
    for (const [col, entry] of row) {
      const value = entry.hasLower ? entry.lower : entry.upper;
      if (value) values.set(col, value);
    }
    return values;
  });
}

function isSquareCsc(matrix) {
  return matrix?.format === 'csc'
    && Number.isInteger(matrix.rowCount)
    && matrix.rowCount === matrix.colCount
    && arrayLike(matrix.colPtr)
    && matrix.colPtr.length === matrix.colCount + 1
    && arrayLike(matrix.rowIdx)
    && arrayLike(matrix.values)
    && matrix.rowIdx.length === matrix.values.length;
}

function arrayLike(value) {
  return Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
}

function validPermutation(permutation, n) {
  return Array.isArray(permutation)
    && permutation.length === n
    && new Set(permutation).size === n
    && permutation.every((value) => Number.isInteger(value) && value >= 0 && value < n);
}

function factorFailure(reason, startedAt, detail) {
  return {
    ok: false,
    version: SPARSE_LDLT_VERSION,
    reason,
    ...detail,
    factorizationMs: elapsed(startedAt),
    matrixStorage: 'csc',
    factorStorage: 'sparse-row-column-maps',
    denseAllocation: false,
    denseConversionCount: 0,
  };
}

function solveFailure(reason, startedAt) {
  return { ok: false, x: null, reason, solveMs: elapsed(startedAt) };
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 1;
}

function nonnegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function elapsed(startedAt) {
  return Math.max(0, now() - startedAt);
}
