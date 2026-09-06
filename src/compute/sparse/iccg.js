import { cscMatVec, cscSymmetryError, sparseStats } from './matrix.js';

export const SPARSE_ICCG_VERSION = 'p9-m3-sparse-iccg-v1';

export function factorIncompleteCholesky(matrix, options = {}) {
  const startedAt = now();
  const n = Number(matrix?.rowCount || 0);
  if (matrix?.format !== 'csc' || n !== matrix?.colCount) return failure('INVALID_MATRIX', startedAt);
  const symmetryTolerance = positive(options.symmetryTolerance, 1e-10);
  const symmetryError = cscSymmetryError(matrix);
  if (!Number.isFinite(symmetryError) || symmetryError > symmetryTolerance) {
    return failure('MATRIX_NOT_SYMMETRIC', startedAt, { symmetryError, symmetryTolerance });
  }
  const lowerA = lowerRows(matrix);
  const rows = Array.from({ length: n }, () => new Map());
  const columns = Array.from({ length: n }, () => []);
  const diagonal = new Float64Array(n);
  const breakdownTolerance = positive(options.breakdownTolerance, 1e-14);
  let nonzeros = n;

  for (let row = 0; row < n; row += 1) {
    if (cancelled(options)) return failure('CANCELLED', startedAt, { row });
    const source = lowerA[row];
    const lowerColumns = [...source.keys()].filter((column) => column < row).sort((a, b) => a - b);
    for (const column of lowerColumns) {
      let value = source.get(column);
      for (const [prior, rowValue] of rows[row]) {
        if (prior >= column) break;
        const columnValue = rows[column].get(prior);
        if (columnValue !== undefined) value -= rowValue * columnValue;
      }
      value /= diagonal[column];
      if (!Number.isFinite(value)) return failure('ICCG_NONFINITE_FACTOR', startedAt, { row, column });
      rows[row].set(column, value);
      columns[column].push({ row, value });
      nonzeros += 1;
    }
    let pivot = Number(source.get(row) || 0);
    for (const value of rows[row].values()) pivot -= value * value;
    const scale = Math.max(1, Math.abs(Number(source.get(row) || 0)));
    if (!Number.isFinite(pivot) || pivot <= breakdownTolerance * scale) {
      return failure('ICCG_NON_POSITIVE_PIVOT', startedAt, { row, pivot, scale, breakdownTolerance });
    }
    diagonal[row] = Math.sqrt(pivot);
  }

  return {
    ok: true,
    version: SPARSE_ICCG_VERSION,
    method: 'incomplete-cholesky-zero-fill-pcg',
    matrix,
    rows,
    columns,
    diagonal,
    nonzeros,
    factorStorage: 'incomplete-cholesky-zero-fill',
    factorizationMs: elapsed(startedAt),
    estimatedBytes: diagonal.byteLength + nonzeros * 16,
    symmetryError,
    denseConversionCount: 0,
  };
}

export function solveIccg(factor, rhs, options = {}) {
  const startedAt = now();
  const n = factor?.diagonal?.length || 0;
  if (!factor?.ok) return failure('FACTORIZATION_NOT_AVAILABLE', startedAt);
  if ((!Array.isArray(rhs) && !ArrayBuffer.isView(rhs)) || rhs.length !== n) return failure('INVALID_RHS', startedAt);
  const b = Float64Array.from(rhs, Number);
  if (b.some((value) => !Number.isFinite(value))) return failure('INVALID_RHS', startedAt);
  const x = new Float64Array(n);
  const r = Float64Array.from(b);
  let z = applyPreconditioner(factor, r);
  let p = Float64Array.from(z);
  let rz = dot(r, z);
  const loadNorm = Math.max(1, normInf(b));
  const tolerance = positive(options.tolerance, 1e-9);
  const maxIterations = positiveInteger(options.maxIterations, Math.max(500, n * 2));
  const curvatureTolerance = positive(options.curvatureTolerance, 1e-14);
  let relativeResidual = normInf(r) / loadNorm;
  let iterations = 0;
  let reason = null;

  while (relativeResidual > tolerance && iterations < maxIterations) {
    if (cancelled(options)) return failure('CANCELLED', startedAt, { iterations, relativeResidual });
    const product = cscMatVec(factor.matrix, p);
    const denominator = dot(p, product);
    const scale = absoluteDot(p, product);
    if (!Number.isFinite(denominator) || denominator <= curvatureTolerance * Math.max(Number.EPSILON, scale)) {
      reason = 'ICCG_NON_POSITIVE_CURVATURE';
      break;
    }
    const alpha = rz / denominator;
    for (let index = 0; index < n; index += 1) {
      x[index] += alpha * p[index];
      r[index] -= alpha * product[index];
    }
    iterations += 1;
    relativeResidual = normInf(r) / loadNorm;
    if (relativeResidual <= tolerance) break;
    z = applyPreconditioner(factor, r);
    const nextRz = dot(r, z);
    const beta = rz ? nextRz / rz : 0;
    for (let index = 0; index < n; index += 1) p[index] = z[index] + beta * p[index];
    rz = nextRz;
  }
  if (!reason && relativeResidual > tolerance) reason = 'ICCG_NOT_CONVERGED';
  const ok = !reason;
  return {
    ok,
    x: ok ? x : null,
    reason,
    diagnostics: {
      version: SPARSE_ICCG_VERSION,
      method: factor.method,
      factorStorage: factor.factorStorage,
      factorizationMs: factor.factorizationMs,
      solveMs: elapsed(startedAt),
      iterations,
      tolerance,
      maxIterations,
      residualMax: normInf(r),
      relativeResidual,
      denseConversionCount: 0,
      fallback: false,
      ...sparseStats(factor.matrix),
    },
  };
}

function applyPreconditioner(factor, rhs) {
  const n = factor.diagonal.length;
  const y = new Float64Array(n);
  for (let row = 0; row < n; row += 1) {
    let value = rhs[row];
    for (const [column, coefficient] of factor.rows[row]) value -= coefficient * y[column];
    y[row] = value / factor.diagonal[row];
  }
  const x = Float64Array.from(y);
  for (let column = n - 1; column >= 0; column -= 1) {
    let value = x[column];
    for (const item of factor.columns[column]) value -= item.value * x[item.row];
    x[column] = value / factor.diagonal[column];
  }
  return x;
}

function lowerRows(matrix) {
  const rows = Array.from({ length: matrix.rowCount }, () => new Map());
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let pointer = matrix.colPtr[column]; pointer < matrix.colPtr[column + 1]; pointer += 1) {
      const row = matrix.rowIdx[pointer];
      if (row < column) continue;
      const value = Number(matrix.values[pointer]);
      if (value) rows[row].set(column, (rows[row].get(column) || 0) + value);
    }
  }
  return rows;
}

function dot(left, right) {
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value += left[index] * right[index];
  return value;
}

function absoluteDot(left, right) {
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value += Math.abs(left[index] * right[index]);
  return value;
}

function normInf(values) {
  let value = 0;
  for (const item of values) value = Math.max(value, Math.abs(item));
  return value;
}

function failure(reason, startedAt, detail = {}) {
  return { ok: false, x: null, reason, diagnostics: { version: SPARSE_ICCG_VERSION, reason, elapsedMs: elapsed(startedAt), ...detail } };
}

function cancelled(options) {
  return options.signal?.aborted === true || options.shouldCancel?.() === true;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function elapsed(startedAt) {
  return Math.max(0, now() - startedAt);
}
