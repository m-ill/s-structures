import { stableHash } from '../../core/stableHash.js';
import {
  createCscFromTriplets,
  cscDiagonal,
  cscMatVec,
  cscQuadratic,
  cscRowNorms,
  cscSymmetryError,
  sparseStats,
  validateCommonSparseMatrix,
} from '../sparse/matrix.js';

export const SYMMETRIC_SPARSE_OPERATOR_VERSION = 'p9-m6-symmetric-sparse-operator-v1';

export function createSymmetricSparseOperator(matrix, options = {}) {
  validateCommonSparseMatrix(matrix);
  if (matrix.format !== 'csc') throw operatorError('EIGEN_OPERATOR_REQUIRES_CSC', 'Eigen operators require CSC storage.');
  if (matrix.rowCount !== matrix.colCount) throw operatorError('EIGEN_OPERATOR_NOT_SQUARE', 'Eigen operators must be square.');
  const symmetryTolerance = positive(options.symmetryTolerance, 1e-10);
  const symmetryError = cscSymmetryError(matrix);
  if (!Number.isFinite(symmetryError) || symmetryError > symmetryTolerance) {
    throw operatorError('EIGEN_OPERATOR_NOT_SYMMETRIC', 'Eigen operator exceeds the symmetry tolerance.', {
      symmetryError,
      symmetryTolerance,
    });
  }
  const stats = sparseStats(matrix);
  const id = String(options.id || 'symmetric-operator');
  const matrixClass = String(options.matrixClass || 'symmetric');
  const descriptor = Object.freeze({
    version: SYMMETRIC_SPARSE_OPERATOR_VERSION,
    id,
    matrixClass,
    dimension: matrix.rowCount,
    symmetryError,
    symmetryTolerance,
    ...stats,
    operatorHash: stableHash({ id, matrixClass, stats, symmetryError }),
  });
  return Object.freeze({
    version: SYMMETRIC_SPARSE_OPERATOR_VERSION,
    id,
    matrixClass,
    dimension: matrix.rowCount,
    matrix,
    descriptor,
    matvec(vector) {
      return cscMatVec(matrix, vector);
    },
    quadratic(vector) {
      return cscQuadratic(matrix, vector);
    },
    diagonal() {
      return cscDiagonal(matrix);
    },
    rowNorms() {
      return cscRowNorms(matrix);
    },
  });
}

export function createSymmetricSparseOperatorFromDense(dense, options = {}) {
  if (!Array.isArray(dense) || !dense.length || dense.some((row) => !Array.isArray(row) || row.length !== dense.length)) {
    throw operatorError('EIGEN_DENSE_MATRIX_INVALID', 'Dense eigen source must be a nonempty square matrix.');
  }
  const indices = options.indices == null
    ? Array.from({ length: dense.length }, (_item, index) => index)
    : Array.from(options.indices, Number);
  if (!indices.length || new Set(indices).size !== indices.length || indices.some((index) => (
    !Number.isInteger(index) || index < 0 || index >= dense.length
  ))) throw operatorError('EIGEN_DENSE_INDEX_INVALID', 'Dense eigen source indices must be unique and in range.');
  const tolerance = nonnegative(options.dropTolerance, 0);
  const triplets = [];
  for (let column = 0; column < indices.length; column += 1) {
    for (let row = 0; row < indices.length; row += 1) {
      const value = Number(dense[indices[row]]?.[indices[column]]);
      if (!Number.isFinite(value)) throw operatorError('EIGEN_DENSE_VALUE_NONFINITE', 'Dense eigen source contains a non-finite value.');
      if (Math.abs(value) > tolerance) triplets.push({ row, column, value });
    }
  }
  return createSymmetricSparseOperator(
    createCscFromTriplets(indices.length, indices.length, triplets, { tolerance }),
    options,
  );
}

export function sparseOperatorMatvecParity(operator, dense, vectors = [], tolerance = 1e-12) {
  if (!operator || !Array.isArray(dense) || dense.length !== operator.dimension) {
    return Object.freeze({ ok: false, reason: 'EIGEN_OPERATOR_PARITY_INPUT_INVALID', maxAbsoluteError: Infinity });
  }
  let maxAbsoluteError = 0;
  for (const vector of vectors) {
    const actual = operator.matvec(vector);
    const expected = dense.map((row) => row.reduce((sum, value, index) => sum + Number(value) * Number(vector[index]), 0));
    for (let index = 0; index < expected.length; index += 1) {
      maxAbsoluteError = Math.max(maxAbsoluteError, Math.abs(actual[index] - expected[index]));
    }
  }
  return Object.freeze({
    ok: maxAbsoluteError <= tolerance,
    reason: maxAbsoluteError <= tolerance ? null : 'EIGEN_OPERATOR_MATVEC_PARITY_FAILED',
    maxAbsoluteError,
    tolerance,
    vectorCount: vectors.length,
  });
}

function operatorError(code, message, details = null) {
  return Object.assign(new Error(message), { code, details });
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonnegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
