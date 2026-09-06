import { stableHash } from '../../core/stableHash.js';
import { TYPED_REDUCED_SPARSE_VERSION } from '../sparse/reducedAssembly.js';

export const DETERMINISTIC_NONLINEAR_ASSEMBLY_VERSION = 'p9-m7-deterministic-nonlinear-assembly-v1';

export function assembleNonlinearBatchTangent(pattern, batch, tangentValues, extraMatrices = []) {
  validateInputs(pattern, batch, tangentValues, extraMatrices);
  const values = new Float64Array(pattern.nnz);
  let blockIndex = 0;
  for (; blockIndex < batch.elementCount; blockIndex += 1) {
    scatterFlat(values, pattern.elementScatters[blockIndex], tangentValues, batch.matrixOffsets[blockIndex]);
  }
  for (const matrix of extraMatrices) {
    const scatter = pattern.elementScatters[blockIndex];
    const flat = flattenMatrix(matrix, scatter.dofCount, blockIndex);
    scatterFlat(values, scatter, flat, 0);
    blockIndex += 1;
  }
  if (values.some((value) => !Number.isFinite(value))) throw assemblyError('NONLINEAR_ASSEMBLY_NONFINITE', 'Batch tangent assembly produced a non-finite value.');
  const reductionHash = stableHash(Array.from(values));
  return Object.freeze({
    version: TYPED_REDUCED_SPARSE_VERSION,
    assemblyVersion: DETERMINISTIC_NONLINEAR_ASSEMBLY_VERSION,
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
    reductionHash,
    reductionPolicy: 'element-index-then-local-row-major-fixed-order',
  });
}

function scatterFlat(values, scatter, matrix, offset) {
  for (let term = 0; term < scatter.termCount; term += 1) {
    values[scatter.valueIndices[term]] += scatter.coefficients[term] * matrix[offset + scatter.matrixIndices[term]];
  }
}

function validateInputs(pattern, batch, tangentValues, extraMatrices) {
  if (pattern?.version !== TYPED_REDUCED_SPARSE_VERSION
    || !Array.isArray(pattern.elementScatters)
    || !Number.isInteger(pattern.nnz)
    || !(pattern.colPtr instanceof Int32Array)
    || !(pattern.rowIdx instanceof Int32Array)
    || pattern.rowIdx.length !== pattern.nnz) {
    throw assemblyError('NONLINEAR_ASSEMBLY_PATTERN_INVALID', 'A typed reduced sparse pattern is required.');
  }
  if (!(tangentValues instanceof Float64Array) || tangentValues.length !== batch?.totalMatrixValues) {
    throw assemblyError('NONLINEAR_ASSEMBLY_TANGENT_INVALID', 'Batch tangent values do not match the batch layout.');
  }
  if (!Array.isArray(extraMatrices) || batch.elementCount + extraMatrices.length !== pattern.elementScatters.length) {
    throw assemblyError('NONLINEAR_ASSEMBLY_BLOCK_COUNT', 'Batch and extra tangent blocks do not match the sparse pattern.');
  }
  for (const scatter of pattern.elementScatters) {
    if (!(scatter.matrixIndices instanceof Int32Array)
      || !(scatter.valueIndices instanceof Int32Array)
      || !(scatter.coefficients instanceof Float64Array)
      || scatter.termCount !== scatter.valueIndices.length
      || scatter.matrixIndices.length !== scatter.termCount
      || scatter.coefficients.length !== scatter.termCount) {
      throw assemblyError('NONLINEAR_ASSEMBLY_SCATTER_INVALID', 'Sparse pattern contains invalid scatter metadata.');
    }
  }
  if (tangentValues.some((value) => !Number.isFinite(value))) {
    throw assemblyError('NONLINEAR_ASSEMBLY_TANGENT_NONFINITE', 'Batch tangent values must be finite.');
  }
}

function flattenMatrix(matrix, size, index) {
  if (ArrayBuffer.isView(matrix) && matrix.length === size * size) return matrix;
  if (!Array.isArray(matrix) || matrix.length !== size || matrix.some((row) => row?.length !== size)) {
    throw assemblyError('NONLINEAR_ASSEMBLY_MATRIX_SIZE', `Extra matrix ${index} must be ${size} by ${size}.`);
  }
  const output = new Float64Array(size * size);
  for (let row = 0; row < size; row += 1) for (let column = 0; column < size; column += 1) output[row * size + column] = Number(matrix[row][column]);
  return output;
}

function assemblyError(code, message) { return Object.assign(new TypeError(message), { code }); }
