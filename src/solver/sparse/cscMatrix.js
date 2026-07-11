export const SPARSE_MATRIX_VERSION = 'p6-m1-csc-matrix-v1';

export function denseToTriplets(A, tolerance = 0) {
  const rows = [];
  const rowCount = Array.isArray(A) ? A.length : 0;
  const colCount = rowCount ? A[0].length : 0;
  for (let i = 0; i < rowCount; i += 1) {
    for (let j = 0; j < colCount; j += 1) {
      const value = Number(A[i][j]);
      if (Number.isFinite(value) && Math.abs(value) > tolerance) rows.push({ row: i, col: j, value });
    }
  }
  return rows;
}

export function tripletsToCsc(rowCount, colCount, triplets = []) {
  const columns = Array.from({ length: colCount }, () => new Map());
  for (const item of triplets) {
    const row = Number(item.row);
    const col = Number(item.col);
    const value = Number(item.value);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= rowCount || col >= colCount || !Number.isFinite(value)) continue;
    columns[col].set(row, (columns[col].get(row) || 0) + value);
  }

  const colPtr = [0];
  const rowIdx = [];
  const values = [];
  for (const column of columns) {
    for (const [row, value] of [...column.entries()].sort((a, b) => a[0] - b[0])) {
      if (!value) continue;
      rowIdx.push(row);
      values.push(value);
    }
    colPtr.push(rowIdx.length);
  }
  return { version: SPARSE_MATRIX_VERSION, format: 'csc', rowCount, colCount, colPtr, rowIdx, values, nnz: values.length };
}

export function denseToCsc(A, tolerance = 0) {
  return tripletsToCsc(A.length, A[0]?.length || 0, denseToTriplets(A, tolerance));
}

export function cscToDense(matrix) {
  const out = Array.from({ length: matrix.rowCount }, () => new Array(matrix.colCount).fill(0));
  for (let col = 0; col < matrix.colCount; col += 1) {
    for (let p = matrix.colPtr[col]; p < matrix.colPtr[col + 1]; p += 1) {
      out[matrix.rowIdx[p]][col] = matrix.values[p];
    }
  }
  return out;
}

export function cscMatVec(matrix, x) {
  const out = new Array(matrix.rowCount).fill(0);
  for (let col = 0; col < matrix.colCount; col += 1) {
    const scale = Number(x[col]) || 0;
    if (!scale) continue;
    for (let p = matrix.colPtr[col]; p < matrix.colPtr[col + 1]; p += 1) {
      out[matrix.rowIdx[p]] += matrix.values[p] * scale;
    }
  }
  return out;
}

export function sparseStats(matrix) {
  const total = Math.max(1, matrix.rowCount * matrix.colCount);
  return {
    version: SPARSE_MATRIX_VERSION,
    format: matrix.format || 'csc',
    rowCount: matrix.rowCount,
    colCount: matrix.colCount,
    nnz: matrix.nnz,
    density: matrix.nnz / total,
  };
}
