import { stableHash } from '../../core/stableHash.js';

export const TYPED_REDUCED_SPARSE_VERSION = 'p9-m2-typed-reduced-sparse-v1';
const CANONICAL_CONSTRAINT_VERSION = 'p8-m1-canonical-constraint-v1';

const MAX_INT32 = 0x7fffffff;
const PATTERN_CACHE_LIMIT = 64;
const patternCache = new Map();

export function buildReducedSparsePattern(constraint, elementDofLists = []) {
  const rows = canonicalConstraintRows(constraint);
  if (!Array.isArray(elementDofLists)) {
    throw sparseError('SPARSE_ELEMENT_DOF_LISTS_INVALID', 'Element DOF lists must be an array.');
  }
  const elements = elementDofLists.map((entry, index) => normalizeElementDofs(entry, index, constraint.fullDofCount));
  const identity = {
    version: TYPED_REDUCED_SPARSE_VERSION,
    constraintVersion: constraint.version,
    fullDofCount: constraint.fullDofCount,
    reducedDofCount: constraint.reducedDofCount,
    rows,
    elements: elements.map((entry) => ({ id: entry.id, dofs: entry.dofs })),
  };
  const cacheKey = stableHash(identity);
  const cached = patternCache.get(cacheKey);
  if (cached) return cached;

  const columnRows = Array.from({ length: constraint.reducedDofCount }, () => new Set());
  for (const element of elements) {
    for (const rowDof of element.dofs) {
      for (const columnDof of element.dofs) {
        for (const [reducedRow] of rows[rowDof]) {
          for (const [reducedColumn] of rows[columnDof]) columnRows[reducedColumn].add(reducedRow);
        }
      }
    }
  }

  const sortedColumnRows = columnRows.map((entries) => [...entries].sort((a, b) => a - b));
  const nnz = sortedColumnRows.reduce((sum, entries) => sum + entries.length, 0);
  assertInt32Capacity(nnz, 'SPARSE_PATTERN_TOO_LARGE');
  const colPtr = new Int32Array(constraint.reducedDofCount + 1);
  const rowIdx = new Int32Array(nnz);
  const valueIndexByColumn = Array.from({ length: constraint.reducedDofCount }, () => new Map());
  let cursor = 0;
  for (let column = 0; column < sortedColumnRows.length; column += 1) {
    colPtr[column] = cursor;
    for (const row of sortedColumnRows[column]) {
      rowIdx[cursor] = row;
      valueIndexByColumn[column].set(row, cursor);
      cursor += 1;
    }
  }
  colPtr[constraint.reducedDofCount] = cursor;

  const elementScatters = elements.map((element, elementIndex) => {
    const matrixIndices = [];
    const valueIndices = [];
    const coefficients = [];
    const dofCount = element.dofs.length;
    for (let localRow = 0; localRow < dofCount; localRow += 1) {
      const transformRows = rows[element.dofs[localRow]];
      for (let localColumn = 0; localColumn < dofCount; localColumn += 1) {
        const transformColumns = rows[element.dofs[localColumn]];
        const matrixIndex = localRow * dofCount + localColumn;
        for (const [reducedRow, rowCoefficient] of transformRows) {
          for (const [reducedColumn, columnCoefficient] of transformColumns) {
            const valueIndex = valueIndexByColumn[reducedColumn].get(reducedRow);
            if (valueIndex == null) {
              throw sparseError('SPARSE_SCATTER_PATTERN_MISSING', 'A reduced scatter term is absent from the symbolic pattern.');
            }
            matrixIndices.push(matrixIndex);
            valueIndices.push(valueIndex);
            coefficients.push(rowCoefficient * columnCoefficient);
          }
        }
      }
    }
    assertInt32Capacity(matrixIndices.length, 'SPARSE_SCATTER_TOO_LARGE');
    const typedMatrixIndices = Int32Array.from(matrixIndices);
    const typedValueIndices = Int32Array.from(valueIndices);
    const typedCoefficients = Float64Array.from(coefficients);
    return Object.freeze({
      elementIndex,
      elementId: element.id,
      dofCount,
      fullDofs: Int32Array.from(element.dofs),
      termCount: typedValueIndices.length,
      matrixIndices: typedMatrixIndices,
      localIndices: typedMatrixIndices,
      valueIndices: typedValueIndices,
      scatterIndices: typedValueIndices,
      termIndices: typedValueIndices,
      coefficients: typedCoefficients,
      termCoefficients: typedCoefficients,
    });
  });

  const patternHash = stableHash({
    ...identity,
    colPtr: Array.from(colPtr),
    rowIdx: Array.from(rowIdx),
  }).slice(0, 24);
  const pattern = Object.freeze({
    version: TYPED_REDUCED_SPARSE_VERSION,
    format: 'csc',
    rowCount: constraint.reducedDofCount,
    colCount: constraint.reducedDofCount,
    nrows: constraint.reducedDofCount,
    ncols: constraint.reducedDofCount,
    nnz,
    colPtr,
    rowIdx,
    values: new Float64Array(nnz),
    elementCount: elementScatters.length,
    elementScatters,
    scatters: elementScatters,
    constraintHash: constraint.hash || null,
    patternHash,
    cacheKey,
  });
  rememberPattern(cacheKey, pattern);
  return pattern;
}

export function assembleReducedTangent(pattern, elementMatrices = []) {
  validatePattern(pattern);
  if (!Array.isArray(elementMatrices) || elementMatrices.length !== pattern.elementScatters.length) {
    throw sparseError(
      'SPARSE_ELEMENT_MATRIX_COUNT',
      `Expected ${pattern.elementScatters.length} element matrices; received ${elementMatrices?.length ?? 0}.`,
    );
  }
  const values = new Float64Array(pattern.nnz);
  for (let elementIndex = 0; elementIndex < pattern.elementScatters.length; elementIndex += 1) {
    const scatter = pattern.elementScatters[elementIndex];
    const matrix = flattenElementMatrix(elementMatrices[elementIndex], scatter.dofCount, elementIndex);
    for (let term = 0; term < scatter.termCount; term += 1) {
      values[scatter.valueIndices[term]] += scatter.coefficients[term] * matrix[scatter.matrixIndices[term]];
    }
  }
  if (!allFinite(values)) {
    throw sparseError('SPARSE_ASSEMBLY_NONFINITE', 'Reduced tangent assembly produced a non-finite value.');
  }
  return Object.freeze({
    version: TYPED_REDUCED_SPARSE_VERSION,
    format: 'csc',
    rowCount: pattern.rowCount,
    colCount: pattern.colCount,
    nrows: pattern.rowCount,
    ncols: pattern.colCount,
    nnz: pattern.nnz,
    colPtr: pattern.colPtr,
    rowIdx: pattern.rowIdx,
    values,
    patternHash: pattern.patternHash,
  });
}

export function typedCscMatVec(matrix, vector) {
  validateTypedCsc(matrix);
  if (vector == null || vector.length !== matrix.colCount) {
    throw sparseError('SPARSE_VECTOR_SIZE', `CSC vector length must be ${matrix.colCount}.`);
  }
  const input = Float64Array.from(vector, (value, index) => finiteNumber(value, `vector[${index}]`));
  const output = new Float64Array(matrix.rowCount);
  for (let column = 0; column < matrix.colCount; column += 1) {
    const x = input[column];
    if (x === 0) continue;
    for (let index = matrix.colPtr[column]; index < matrix.colPtr[column + 1]; index += 1) {
      output[matrix.rowIdx[index]] += matrix.values[index] * x;
    }
  }
  if (!allFinite(output)) throw sparseError('SPARSE_MATVEC_NONFINITE', 'CSC matrix-vector multiplication produced a non-finite value.');
  return output;
}

export function typedCscToCsr(matrix) {
  validateTypedCsc(matrix);
  const rowPtr = new Int32Array(matrix.rowCount + 1);
  for (let index = 0; index < matrix.nnz; index += 1) rowPtr[matrix.rowIdx[index] + 1] += 1;
  for (let row = 0; row < matrix.rowCount; row += 1) rowPtr[row + 1] += rowPtr[row];
  const next = Int32Array.from(rowPtr);
  const colIdx = new Int32Array(matrix.nnz);
  const values = new Float64Array(matrix.nnz);
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let index = matrix.colPtr[column]; index < matrix.colPtr[column + 1]; index += 1) {
      const destination = next[matrix.rowIdx[index]]++;
      colIdx[destination] = column;
      values[destination] = matrix.values[index];
    }
  }
  return Object.freeze({
    version: TYPED_REDUCED_SPARSE_VERSION,
    format: 'csr',
    rowCount: matrix.rowCount,
    colCount: matrix.colCount,
    nrows: matrix.rowCount,
    ncols: matrix.colCount,
    nnz: matrix.nnz,
    rowPtr,
    colIdx,
    values,
    patternHash: matrix.patternHash || null,
  });
}

function canonicalConstraintRows(constraint) {
  if (
    !constraint?.ok
    || constraint.version !== CANONICAL_CONSTRAINT_VERSION
    || !Number.isInteger(constraint.fullDofCount)
    || constraint.fullDofCount < 0
    || !Number.isInteger(constraint.reducedDofCount)
    || constraint.reducedDofCount < 0
    || !Array.isArray(constraint.rows)
    || constraint.rows.length !== constraint.fullDofCount
  ) {
    throw sparseError('SPARSE_CONSTRAINT_CONTRACT_INVALID', 'A valid M1 canonical constraint contract is required.');
  }
  assertInt32Capacity(constraint.fullDofCount, 'SPARSE_FULL_DOF_COUNT_TOO_LARGE');
  assertInt32Capacity(constraint.reducedDofCount, 'SPARSE_REDUCED_DOF_COUNT_TOO_LARGE');
  return constraint.rows.map((row, fullDof) => {
    if (!Array.isArray(row)) throw sparseError('SPARSE_CONSTRAINT_ROW_INVALID', `Constraint row ${fullDof} must be an array.`);
    const seen = new Set();
    const normalized = row.map((entry) => {
      if (!Array.isArray(entry) || entry.length !== 2) {
        throw sparseError('SPARSE_CONSTRAINT_TERM_INVALID', `Constraint row ${fullDof} contains an invalid term.`);
      }
      const column = Number(entry[0]);
      const coefficient = Number(entry[1]);
      if (!Number.isInteger(column) || column < 0 || column >= constraint.reducedDofCount || seen.has(column)) {
        throw sparseError('SPARSE_CONSTRAINT_COLUMN_INVALID', `Constraint row ${fullDof} contains an invalid reduced column.`);
      }
      if (!Number.isFinite(coefficient) || coefficient === 0) {
        throw sparseError('SPARSE_CONSTRAINT_COEFFICIENT_INVALID', `Constraint row ${fullDof} contains an invalid coefficient.`);
      }
      seen.add(column);
      return [column, coefficient];
    });
    normalized.sort((a, b) => a[0] - b[0]);
    return normalized;
  });
}

function normalizeElementDofs(entry, index, fullDofCount) {
  const source = Array.isArray(entry) || ArrayBuffer.isView(entry)
    ? entry
    : entry?.dofs ?? entry?.fullDofs ?? entry?.elementDofs;
  if (source == null || typeof source.length !== 'number' || source.length < 1) {
    throw sparseError('SPARSE_ELEMENT_DOFS_INVALID', `Element ${index} must provide at least one full DOF.`);
  }
  const dofs = Array.from(source, Number);
  const seen = new Set();
  for (const dof of dofs) {
    if (!Number.isInteger(dof) || dof < 0 || dof >= fullDofCount || seen.has(dof)) {
      throw sparseError('SPARSE_ELEMENT_DOF_INVALID', `Element ${index} contains an invalid or duplicate full DOF.`);
    }
    seen.add(dof);
  }
  return { id: entry?.id == null ? null : String(entry.id), dofs };
}

function flattenElementMatrix(input, size, elementIndex) {
  const source = input?.tangentGlobal ?? input?.Kt ?? input?.matrix ?? input;
  const expected = size * size;
  let values;
  if (Array.isArray(source) && source.length === size && source.every((row) => Array.isArray(row) || ArrayBuffer.isView(row))) {
    if (source.some((row) => row.length !== size)) {
      throw sparseError('SPARSE_ELEMENT_MATRIX_SIZE', `Element matrix ${elementIndex} must be ${size} by ${size}.`);
    }
    values = Float64Array.from(source.flatMap((row) => Array.from(row, Number)));
  } else if (source != null && typeof source.length === 'number' && source.length === expected) {
    values = Float64Array.from(source, Number);
  } else {
    throw sparseError('SPARSE_ELEMENT_MATRIX_SIZE', `Element matrix ${elementIndex} must contain ${expected} values.`);
  }
  if (!allFinite(values)) {
    throw sparseError('SPARSE_ELEMENT_MATRIX_NONFINITE', `Element matrix ${elementIndex} contains a non-finite value.`);
  }
  return values;
}

function validatePattern(pattern) {
  if (
    pattern?.version !== TYPED_REDUCED_SPARSE_VERSION
    || !Array.isArray(pattern.elementScatters)
    || typeof pattern.patternHash !== 'string'
  ) {
    throw sparseError('SPARSE_PATTERN_INVALID', 'A typed reduced sparse pattern is required.');
  }
  validateTypedCsc(pattern);
  for (const scatter of pattern.elementScatters) {
    if (
      !(scatter.matrixIndices instanceof Int32Array)
      || !(scatter.valueIndices instanceof Int32Array)
      || !(scatter.coefficients instanceof Float64Array)
      || scatter.matrixIndices.length !== scatter.valueIndices.length
      || scatter.valueIndices.length !== scatter.coefficients.length
      || scatter.termCount !== scatter.valueIndices.length
    ) {
      throw sparseError('SPARSE_SCATTER_INVALID', 'Pattern contains invalid typed scatter metadata.');
    }
  }
}

function validateTypedCsc(matrix) {
  const rowCount = Number(matrix?.rowCount);
  const colCount = Number(matrix?.colCount);
  const nnz = Number(matrix?.nnz ?? matrix?.values?.length);
  if (
    matrix?.format !== 'csc'
    || !Number.isInteger(rowCount)
    || rowCount < 0
    || !Number.isInteger(colCount)
    || colCount < 0
    || !Number.isInteger(nnz)
    || nnz < 0
    || !(matrix.colPtr instanceof Int32Array)
    || !(matrix.rowIdx instanceof Int32Array)
    || !(matrix.values instanceof Float64Array)
    || matrix.colPtr.length !== colCount + 1
    || matrix.rowIdx.length !== nnz
    || matrix.values.length !== nnz
    || matrix.colPtr[0] !== 0
    || matrix.colPtr[colCount] !== nnz
  ) {
    throw sparseError('TYPED_CSC_INVALID', 'A canonical typed CSC matrix is required.');
  }
  let previousPointer = 0;
  for (let column = 0; column < colCount; column += 1) {
    const start = matrix.colPtr[column];
    const end = matrix.colPtr[column + 1];
    if (start < previousPointer || end < start || end > nnz) throw sparseError('TYPED_CSC_POINTER_INVALID', 'CSC column pointers are invalid.');
    let previousRow = -1;
    for (let index = start; index < end; index += 1) {
      const row = matrix.rowIdx[index];
      if (row < 0 || row >= rowCount || row <= previousRow) {
        throw sparseError('TYPED_CSC_ROW_INDEX_INVALID', 'CSC row indices must be in-range and strictly increasing per column.');
      }
      previousRow = row;
    }
    previousPointer = end;
  }
  if (!allFinite(matrix.values)) throw sparseError('TYPED_CSC_VALUE_NONFINITE', 'CSC values must be finite.');
}

function rememberPattern(key, pattern) {
  if (patternCache.size >= PATTERN_CACHE_LIMIT) patternCache.delete(patternCache.keys().next().value);
  patternCache.set(key, pattern);
}

function assertInt32Capacity(value, code) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_INT32) {
    throw sparseError(code, 'Sparse structure exceeds Int32 indexing capacity.');
  }
}

function finiteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw sparseError('SPARSE_VALUE_NONFINITE', `${name} must be finite.`);
  return number;
}

function allFinite(values) {
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(Number(values[index]))) return false;
  }
  return true;
}

function sparseError(code, message) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}
