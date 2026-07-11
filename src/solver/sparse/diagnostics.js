import { resolveCriterion } from '../../core/analysisCriteria.js';
import { cscMatVec } from './cscMatrix.js';

export const SPARSE_DIAGNOSTICS_VERSION = 'p7-m10-sparse-diagnostics-v2';

export function matrixSymmetryError(A) {
  if (isCsc(A)) return cscSymmetryError(A);
  let diff = 0;
  let norm = 0;
  for (let i = 0; i < A.length; i += 1) {
    for (let j = 0; j < A.length; j += 1) {
      const a = Number(A[i][j]) || 0;
      const b = Number(A[j]?.[i]) || 0;
      diff += (a - b) ** 2;
      norm += a ** 2;
    }
  }
  return Math.sqrt(diff) / Math.max(Math.sqrt(norm), 1);
}

export function residualNorm(A, x, b) {
  const product = isCsc(A)
    ? cscMatVec(A, x)
    : A.map((row) => row.reduce((sum, value, j) => sum + value * (Number(x[j]) || 0), 0));
  const residual = product.map((value, i) => value - (Number(b[i]) || 0));
  const residualMax = maxAbs(residual);
  const loadNorm = Math.max(1, maxAbs(b));
  const kNorm = Math.max(1, maxRowSum(A));
  const xNorm = Math.max(1, maxAbs(x));
  return {
    residualMax,
    residualNorm: residualMax / Math.max(loadNorm, kNorm * xNorm, 1),
    loadNorm,
  };
}

export function estimateCondition(A) {
  const diagonal = matrixDiagonal(A).map((value) => Math.abs(value)).filter((value) => value > 0);
  if (!diagonal.length) return Infinity;
  return Math.max(...diagonal) / Math.max(Math.min(...diagonal), Number.EPSILON);
}

export function buildSolverWarningDiagnostics(A, x, b, solveDiagnostics = {}, criteriaModel = {}, labels = []) {
  const sym = matrixSymmetryError(A);
  const residual = x ? residualNorm(A, x, b) : { residualMax: null, residualNorm: Infinity, loadNorm: Math.max(1, maxAbs(b)) };
  const conditionEstimate = estimateCondition(A);
  const pivotRatio = Number(solveDiagnostics.pivotRatio ?? 1);
  const pivotSingular = positiveNumber(resolveCriterion(criteriaModel, 'solver.pivotSingular'), 1e-12);
  const warnings = [];
  pushLimitWarning(warnings, 'SOLVER_SYMMETRY', sym, resolveCriterion(criteriaModel, 'solver.symWarn'), resolveCriterion(criteriaModel, 'solver.symFail'), 'solver.symmetryError');
  pushLimitWarning(warnings, 'SOLVER_RESIDUAL', residual.residualNorm, resolveCriterion(criteriaModel, 'solver.resWarn'), resolveCriterion(criteriaModel, 'solver.resFail'), 'solver.residualNorm');
  pushLimitWarning(warnings, 'SOLVER_CONDITION', conditionEstimate, resolveCriterion(criteriaModel, 'solver.condWarn'), resolveCriterion(criteriaModel, 'solver.condSingular'), 'solver.conditionEstimate');
  if (pivotRatio > 0 && pivotRatio < pivotSingular) {
    warnings.push({
      code: 'SOLVER_PIVOT_NEAR_SINGULAR',
      message: `Solver pivot ratio ${format(pivotRatio)} is below ${format(pivotSingular)}.`,
      target: 'solver.pivotRatio',
      value: pivotRatio,
      limit: pivotSingular,
    });
  }

  return {
    version: SPARSE_DIAGNOSTICS_VERSION,
    matrixStorage: isCsc(A) ? 'csc' : 'dense',
    denseConversionCount: 0,
    symmetryError: sym,
    residualMax: residual.residualMax,
    residualNorm: residual.residualNorm,
    loadNorm: residual.loadNorm,
    conditionEstimate,
    pivotRatio,
    suspectedMechanismDofs: suspectedMechanismDofs(A, pivotSingular, labels),
    warnings,
  };
}

function cscSymmetryError(matrix) {
  const pairs = new Map();
  let diagonalNorm = 0;
  for (let col = 0; col < matrix.colCount; col += 1) {
    for (let p = matrix.colPtr[col]; p < matrix.colPtr[col + 1]; p += 1) {
      const row = matrix.rowIdx[p];
      const value = Number(matrix.values[p]) || 0;
      if (row === col) {
        diagonalNorm += value ** 2;
        continue;
      }
      const high = Math.max(row, col);
      const low = Math.min(row, col);
      const key = `${high}:${low}`;
      const pair = pairs.get(key) || { lower: 0, upper: 0 };
      if (row > col) pair.lower += value;
      else pair.upper += value;
      pairs.set(key, pair);
    }
  }
  let diff = 0;
  let norm = diagonalNorm;
  for (const pair of pairs.values()) {
    diff += 2 * (pair.lower - pair.upper) ** 2;
    norm += pair.lower ** 2 + pair.upper ** 2;
  }
  return Math.sqrt(diff) / Math.max(Math.sqrt(norm), 1);
}

function suspectedMechanismDofs(A, pivotSingular, labels) {
  const diagonal = matrixDiagonal(A).map((value, index) => ({ index, value: Math.abs(value) }));
  const max = Math.max(0, ...diagonal.map((item) => item.value));
  if (!(max > 0)) return diagonal.slice(0, 20).map((item) => labels[item.index] || `dof:${item.index}`);
  return diagonal
    .filter((item) => item.value / max <= pivotSingular * 10)
    .slice(0, 20)
    .map((item) => labels[item.index] || `dof:${item.index}`);
}

function matrixDiagonal(A) {
  if (!isCsc(A)) return A.map((row, index) => Number(row[index]) || 0);
  const diagonal = new Array(A.colCount).fill(0);
  for (let col = 0; col < A.colCount; col += 1) {
    for (let p = A.colPtr[col]; p < A.colPtr[col + 1]; p += 1) {
      if (A.rowIdx[p] === col) diagonal[col] += Number(A.values[p]) || 0;
    }
  }
  return diagonal;
}

function pushLimitWarning(warnings, prefix, value, warnLimit, failLimit, target) {
  const warnValue = Number(warnLimit);
  const failValue = Number(failLimit);
  const warn = Number.isFinite(warnValue) && warnValue > 0 ? warnValue : Number.NaN;
  const fail = Number.isFinite(failValue) && failValue > 0 ? failValue : Number.NaN;
  if (Number.isFinite(fail) && value > fail) {
    warnings.push({
      code: `${prefix}_FAIL`,
      message: `${target} ${format(value)} exceeds fail limit ${format(fail)}.`,
      target,
      value,
      limit: fail,
    });
  } else if (Number.isFinite(warn) && value > warn) {
    warnings.push({
      code: `${prefix}_WARN`,
      message: `${target} ${format(value)} exceeds warning limit ${format(warn)}.`,
      target,
      value,
      limit: warn,
    });
  }
}

function maxAbs(values = []) {
  return values.reduce((max, value) => Math.max(max, Math.abs(Number(value) || 0)), 0);
}

function maxRowSum(A) {
  if (!isCsc(A)) {
    return A.reduce((max, row) => Math.max(max, row.reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0)), 0);
  }
  const sums = new Array(A.rowCount).fill(0);
  for (let col = 0; col < A.colCount; col += 1) {
    for (let p = A.colPtr[col]; p < A.colPtr[col + 1]; p += 1) {
      sums[A.rowIdx[p]] += Math.abs(Number(A.values[p]) || 0);
    }
  }
  return Math.max(0, ...sums);
}

function isCsc(value) {
  return value?.format === 'csc'
    && Array.isArray(value.colPtr)
    && Array.isArray(value.rowIdx)
    && Array.isArray(value.values);
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 1;
}

function format(value) {
  return Number(value).toExponential(3);
}
