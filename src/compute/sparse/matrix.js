import { stableHash } from '../../core/stableHash.js';

export const DYNAMIC_SPARSE_MATRIX_VERSION = 'p8-m8-dynamic-sparse-matrix-v1';
export const COMMON_SPARSE_MATRIX_VERSION = 'p9-m2-common-sparse-matrix-v1';

export function denseToTriplets(matrix, tolerance = 0) {
  if (!Array.isArray(matrix)) throw sparseError('SPARSE_DENSE_MATRIX_INVALID', 'Dense matrix must be an array.');
  const rowCount = matrix.length;
  const colCount = rowCount ? matrix[0]?.length || 0 : 0;
  if (matrix.some((row) => !Array.isArray(row) || row.length !== colCount)) {
    throw sparseError('SPARSE_DENSE_MATRIX_INVALID', 'Dense matrix rows must have equal length.');
  }
  const triplets = [];
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < colCount; column += 1) {
      const value = finite(matrix[row][column], `matrix[${row}][${column}]`);
      if (Math.abs(value) > tolerance) triplets.push({ row, column, value });
    }
  }
  return triplets;
}

export function denseToCsc(matrix, tolerance = 0) {
  return createCscFromTriplets(
    matrix.length,
    matrix[0]?.length || 0,
    denseToTriplets(matrix, tolerance),
    { tolerance },
  );
}

export function tripletsToCsc(rowCount, colCount, triplets = [], options = {}) {
  return createCscFromTriplets(rowCount, colCount, triplets, options);
}

export function sparseStats(matrix) {
  validateCsc(matrix);
  const total = Math.max(1, matrix.rowCount * matrix.colCount);
  return Object.freeze({
    version: COMMON_SPARSE_MATRIX_VERSION,
    format: matrix.format,
    rowCount: matrix.rowCount,
    colCount: matrix.colCount,
    nnz: matrix.nnz,
    density: matrix.nnz / total,
    patternHash: matrix.patternHash || patternHashOf(matrix),
    valueHash: matrix.valueHash || valueHashOf(matrix),
  });
}

export function cscToCsr(matrix) {
  validateDynamicCsc(matrix);
  const rowPtr = new Int32Array(matrix.rowCount + 1);
  for (const row of matrix.rowIdx) rowPtr[row + 1] += 1;
  for (let row = 0; row < matrix.rowCount; row += 1) rowPtr[row + 1] += rowPtr[row];
  const cursor = Int32Array.from(rowPtr);
  const colIdx = new Int32Array(matrix.nnz);
  const values = new Float64Array(matrix.nnz);
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      const destination = cursor[matrix.rowIdx[offset]]++;
      colIdx[destination] = column;
      values[destination] = matrix.values[offset];
    }
  }
  return finalizeSparse('csr', matrix.rowCount, matrix.colCount, rowPtr, colIdx, values);
}

export function csrToCsc(matrix) {
  validateCsr(matrix);
  const colPtr = new Int32Array(matrix.colCount + 1);
  for (const column of matrix.colIdx) colPtr[column + 1] += 1;
  for (let column = 0; column < matrix.colCount; column += 1) colPtr[column + 1] += colPtr[column];
  const cursor = Int32Array.from(colPtr);
  const rowIdx = new Int32Array(matrix.nnz);
  const values = new Float64Array(matrix.nnz);
  for (let row = 0; row < matrix.rowCount; row += 1) {
    for (let offset = matrix.rowPtr[row]; offset < matrix.rowPtr[row + 1]; offset += 1) {
      const destination = cursor[matrix.colIdx[offset]]++;
      rowIdx[destination] = row;
      values[destination] = matrix.values[offset];
    }
  }
  return finalizeCsc(matrix.rowCount, matrix.colCount, colPtr, rowIdx, values);
}

export function validateCommonSparseMatrix(matrix) {
  if (matrix?.format === 'csc') return validateDynamicCsc(matrix, { checkValueHash: false });
  if (matrix?.format === 'csr') return validateCsr(matrix);
  throw sparseError('SPARSE_FORMAT_UNSUPPORTED', 'Sparse matrix format must be CSR or CSC.');
}

export function sparsePatternHash(matrix) {
  validateCommonSparseMatrix(matrix);
  return patternHashOf(matrix);
}

export function sparseValueHash(matrix) {
  validateCommonSparseMatrix(matrix);
  return valueHashOf(matrix);
}

export function createCscFromTriplets(rowCountInput, colCountInput, triplets = [], options = {}) {
  const rowCount = nonnegativeInteger(rowCountInput, 'rowCount');
  const colCount = nonnegativeInteger(colCountInput, 'colCount');
  const tolerance = nonnegative(options.tolerance, 0);
  const columns = Array.from({ length: colCount }, () => new Map());
  for (const [index, entry] of triplets.entries()) {
    const row = integer(entry?.row ?? entry?.[0], `triplets[${index}].row`, rowCount);
    const column = integer(entry?.column ?? entry?.col ?? entry?.[1], `triplets[${index}].column`, colCount);
    const value = finite(entry?.value ?? entry?.[2], `triplets[${index}].value`);
    if (Math.abs(value) <= tolerance) continue;
    columns[column].set(row, Number(columns[column].get(row) || 0) + value);
  }
  const colPtr = new Int32Array(colCount + 1);
  const rowIdx = [];
  const values = [];
  for (let column = 0; column < colCount; column += 1) {
    colPtr[column] = values.length;
    const entries = [...columns[column].entries()]
      .filter(([, value]) => Math.abs(value) > tolerance)
      .sort(([left], [right]) => left - right);
    for (const [row, value] of entries) {
      rowIdx.push(row);
      values.push(value);
    }
  }
  colPtr[colCount] = values.length;
  return finalizeCsc(rowCount, colCount, colPtr, Int32Array.from(rowIdx), Float64Array.from(values));
}

export function combineCscMatrices(terms = [], options = {}) {
  const active = terms
    .map((term, index) => ({
      matrix: term?.matrix || term?.[0],
      factor: finite(term?.factor ?? term?.[1] ?? 1, `terms[${index}].factor`),
    }))
    .filter((term) => term.factor !== 0);
  if (!active.length) {
    const size = nonnegativeInteger(options.size, 'size');
    return createCscFromTriplets(size, size, []);
  }
  const rowCount = active[0].matrix?.rowCount;
  const colCount = active[0].matrix?.colCount;
  active.forEach((term, index) => {
    validateCsc(term.matrix);
    if (term.matrix.rowCount !== rowCount || term.matrix.colCount !== colCount) {
      throw sparseError('DYNAMIC_MATRIX_SIZE_MISMATCH', `terms[${index}] has incompatible dimensions.`);
    }
  });
  const triplets = [];
  for (const { matrix, factor } of active) {
    for (let column = 0; column < matrix.colCount; column += 1) {
      for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
        triplets.push({ row: matrix.rowIdx[offset], column, value: factor * matrix.values[offset] });
      }
    }
  }
  return createCscFromTriplets(rowCount, colCount, triplets, options);
}

export function extractCscSubmatrix(matrix, indicesInput = []) {
  validateCsc(matrix);
  const indices = Array.from(indicesInput, (value, index) => integer(value, `indices[${index}]`, matrix.rowCount));
  if (matrix.rowCount !== matrix.colCount) throw sparseError('DYNAMIC_MATRIX_NOT_SQUARE', 'Submatrix extraction requires a square matrix.');
  if (new Set(indices).size !== indices.length) throw sparseError('DYNAMIC_MATRIX_INDEX_DUPLICATE', 'Submatrix indices must be unique.');
  const local = new Map(indices.map((value, index) => [value, index]));
  const triplets = [];
  indices.forEach((globalColumn, column) => {
    for (let offset = matrix.colPtr[globalColumn]; offset < matrix.colPtr[globalColumn + 1]; offset += 1) {
      const row = local.get(matrix.rowIdx[offset]);
      if (row != null) triplets.push({ row, column, value: matrix.values[offset] });
    }
  });
  return createCscFromTriplets(indices.length, indices.length, triplets);
}

export function cscMatVec(matrix, vectorInput = []) {
  validateCsc(matrix);
  const vector = finiteVector(vectorInput, matrix.colCount, 'vector');
  const output = new Float64Array(matrix.rowCount);
  for (let column = 0; column < matrix.colCount; column += 1) {
    const value = vector[column];
    if (value === 0) continue;
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      output[matrix.rowIdx[offset]] += matrix.values[offset] * value;
    }
  }
  return output;
}

export function cscQuadratic(matrix, vectorInput = []) {
  const vector = finiteVector(vectorInput, matrix.colCount, 'vector');
  const product = cscMatVec(matrix, vector);
  if (product.length !== vector.length) throw sparseError('DYNAMIC_MATRIX_NOT_SQUARE', 'Quadratic form requires a square matrix.');
  return dot(vector, product);
}

export function cscDiagonal(matrix) {
  validateCsc(matrix);
  const diagonal = new Float64Array(Math.min(matrix.rowCount, matrix.colCount));
  for (let column = 0; column < diagonal.length; column += 1) {
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      if (matrix.rowIdx[offset] === column) diagonal[column] += matrix.values[offset];
    }
  }
  return diagonal;
}

export function cscRowNorms(matrix) {
  validateCsc(matrix);
  const norms = new Float64Array(matrix.rowCount);
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      norms[matrix.rowIdx[offset]] += Math.abs(matrix.values[offset]);
    }
  }
  return norms;
}

export function cscSymmetryError(matrix) {
  validateCsc(matrix);
  if (matrix.rowCount !== matrix.colCount) return Infinity;
  const entries = new Map();
  let scale = 0;
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      const value = matrix.values[offset];
      entries.set(`${matrix.rowIdx[offset]}:${column}`, value);
      scale = Math.max(scale, Math.abs(value));
    }
  }
  let error = 0;
  for (const [key, value] of entries) {
    const [row, column] = key.split(':').map(Number);
    error = Math.max(error, Math.abs(value - Number(entries.get(`${column}:${row}`) || 0)));
  }
  return error / Math.max(1, scale);
}

export function cscToDense(matrix) {
  validateCsc(matrix);
  const dense = Array.from({ length: matrix.rowCount }, () => new Array(matrix.colCount).fill(0));
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      dense[matrix.rowIdx[offset]][column] += matrix.values[offset];
    }
  }
  return dense;
}

export function validateDynamicCsc(matrix, options = {}) {
  validateCsc(matrix);
  if (!(matrix.colPtr instanceof Int32Array || matrix.colPtr instanceof Uint32Array)
    || !(matrix.rowIdx instanceof Int32Array || matrix.rowIdx instanceof Uint32Array)
    || !(matrix.values instanceof Float64Array)) {
    throw sparseError('DYNAMIC_CSC_INVALID', 'A valid typed CSC matrix is required.');
  }
  let previousPointer = 0;
  for (let column = 0; column < matrix.colCount; column += 1) {
    const start = matrix.colPtr[column];
    const end = matrix.colPtr[column + 1];
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < previousPointer || end < start || end > matrix.values.length) {
      throw sparseError('DYNAMIC_CSC_POINTER_INVALID', `CSC column ${column} contains invalid pointers.`);
    }
    let previousRow = -1;
    for (let offset = start; offset < end; offset += 1) {
      const row = matrix.rowIdx[offset];
      const value = matrix.values[offset];
      if (!Number.isInteger(row) || row < 0 || row >= matrix.rowCount || row <= previousRow) {
        throw sparseError('DYNAMIC_CSC_ROW_INVALID', `CSC column ${column} contains an invalid or unsorted row index.`);
      }
      if (!Number.isFinite(value)) {
        throw sparseError('DYNAMIC_CSC_VALUE_NONFINITE', `CSC value ${offset} must be finite.`);
      }
      previousRow = row;
    }
    previousPointer = end;
  }
  if (options.checkValueHash !== false && matrix.valueHash) {
    const actualValueHash = stableHash(Array.from(matrix.values)).slice(0, 24);
    if (matrix.valueHash !== actualValueHash) {
      throw sparseError('DYNAMIC_CSC_VALUE_HASH_MISMATCH', 'CSC values changed after the matrix was created.', {
        expected: matrix.valueHash,
        actual: actualValueHash,
      });
    }
  }
  return true;
}

function finalizeCsc(rowCount, colCount, colPtr, rowIdx, values) {
  const core = {
    version: COMMON_SPARSE_MATRIX_VERSION,
    format: 'csc',
    rowCount,
    colCount,
    nrows: rowCount,
    ncols: colCount,
    nnz: values.length,
    colPtr,
    rowIdx,
    values,
  };
  const patternHash = patternHashOf(core);
  const valueHash = valueHashOf(core);
  return Object.freeze({ ...core, patternHash, valueHash });
}

function finalizeSparse(format, rowCount, colCount, pointers, indices, values) {
  const core = {
    version: COMMON_SPARSE_MATRIX_VERSION,
    format,
    rowCount,
    colCount,
    nrows: rowCount,
    ncols: colCount,
    nnz: values.length,
    rowPtr: pointers,
    colIdx: indices,
    values,
  };
  return Object.freeze({ ...core, patternHash: patternHashOf(core), valueHash: valueHashOf(core) });
}

function validateCsr(matrix) {
  if (
    matrix?.format !== 'csr'
    || !Number.isInteger(matrix.rowCount)
    || !Number.isInteger(matrix.colCount)
    || !(matrix.rowPtr instanceof Int32Array || matrix.rowPtr instanceof Uint32Array)
    || !(matrix.colIdx instanceof Int32Array || matrix.colIdx instanceof Uint32Array)
    || !(matrix.values instanceof Float64Array)
    || matrix.rowPtr.length !== matrix.rowCount + 1
    || matrix.colIdx.length !== matrix.values.length
    || Number(matrix.nnz ?? matrix.values.length) !== matrix.values.length
    || matrix.rowPtr[0] !== 0
    || matrix.rowPtr[matrix.rowCount] !== matrix.values.length
  ) throw sparseError('COMMON_CSR_INVALID', 'A valid typed CSR matrix is required.');
  for (let row = 0; row < matrix.rowCount; row += 1) {
    if (matrix.rowPtr[row] > matrix.rowPtr[row + 1]) throw sparseError('COMMON_CSR_POINTER_INVALID', 'CSR pointers must be monotonic.');
    let previousColumn = -1;
    for (let offset = matrix.rowPtr[row]; offset < matrix.rowPtr[row + 1]; offset += 1) {
      const column = matrix.colIdx[offset];
      if (column <= previousColumn || column < 0 || column >= matrix.colCount) {
        throw sparseError('COMMON_CSR_COLUMN_INVALID', 'CSR columns must be sorted, unique, and in range.');
      }
      if (!Number.isFinite(matrix.values[offset])) throw sparseError('COMMON_CSR_VALUE_NONFINITE', 'CSR values must be finite.');
      previousColumn = column;
    }
  }
  return true;
}

function patternHashOf(matrix) {
  const pointers = matrix.format === 'csr' ? matrix.rowPtr : matrix.colPtr;
  const indices = matrix.format === 'csr' ? matrix.colIdx : matrix.rowIdx;
  return stableHash({
    format: matrix.format,
    rowCount: matrix.rowCount,
    colCount: matrix.colCount,
    pointers: Array.from(pointers),
    indices: Array.from(indices),
  }).slice(0, 24);
}

function valueHashOf(matrix) {
  return stableHash(Array.from(matrix.values)).slice(0, 24);
}

function validateCsc(matrix) {
  if (
    matrix?.format !== 'csc'
    || !Number.isInteger(matrix.rowCount)
    || !Number.isInteger(matrix.colCount)
    || !arrayLike(matrix.colPtr)
    || !arrayLike(matrix.rowIdx)
    || !arrayLike(matrix.values)
    || matrix.colPtr.length !== matrix.colCount + 1
    || matrix.rowIdx.length !== matrix.values.length
    || Number(matrix.nnz ?? matrix.values.length) !== matrix.values.length
    || matrix.colPtr[0] !== 0
    || matrix.colPtr[matrix.colCount] !== matrix.values.length
  ) throw sparseError('DYNAMIC_CSC_INVALID', 'A valid typed CSC matrix is required.');
}

function finiteVector(values, length, name) {
  if (values == null || values.length !== length) throw sparseError('DYNAMIC_VECTOR_SIZE', `${name} must contain ${length} values.`);
  return Float64Array.from(values, (value, index) => finite(value, `${name}[${index}]`));
}

function arrayLike(value) {
  return Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
}

function dot(left, right) {
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value += Number(left[index]) * Number(right[index]);
  return value;
}

function integer(value, name, upperBound) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number >= upperBound) {
    throw sparseError('DYNAMIC_MATRIX_INDEX_INVALID', `${name} must be an integer in [0, ${upperBound}).`);
  }
  return number;
}

function nonnegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw sparseError('DYNAMIC_MATRIX_SIZE_INVALID', `${name} must be a nonnegative integer.`);
  return number;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw sparseError('DYNAMIC_MATRIX_VALUE_NONFINITE', `${name} must be finite.`);
  return number;
}

function nonnegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function sparseError(code, message, details = null) {
  const error = new Error(message);
  error.name = 'DynamicSparseMatrixError';
  error.code = code;
  error.details = details;
  return error;
}
