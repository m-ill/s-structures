export const SPARSE_SYMBOLIC_VERSION = 'p9-m2-symbolic-factor-v1';

export function symbolicFactor(matrix, options = {}) {
  const ordering = options.ordering || 'approximate-minimum-degree';
  const adjacency = symmetricAdjacency(matrix);
  const permutation = ordering === 'natural'
    ? naturalOrdering(matrix.colCount)
    : approximateMinimumDegreeOrdering(adjacency);
  const pattern = countSymmetricPattern(matrix, adjacency);
  return {
    version: SPARSE_SYMBOLIC_VERSION,
    ordering,
    permutation,
    inversePermutation: invertPermutation(permutation),
    inputNonzeros: matrix.nnz,
    adjacencyNonzeros: pattern.adjacencyNonzeros,
    diagonalNonzeros: pattern.diagonalNonzeros,
    lowerTriangleNonzeros: pattern.lowerTriangleNonzeros,
    estimatedFillIn: pattern.estimatedFillIn,
    storageFormat: 'csc-pattern',
    denseConversionCount: 0,
  };
}

export function naturalOrdering(n) {
  return Array.from({ length: n }, (_item, index) => index);
}

export function invertPermutation(permutation) {
  const inverse = new Array(permutation.length);
  permutation.forEach((value, index) => {
    inverse[value] = index;
  });
  return inverse;
}

export function applyPermutationVector(vector, permutation) {
  return permutation.map((index) => vector[index]);
}

export function unpermuteVector(vector, permutation) {
  const out = new Array(vector.length);
  permutation.forEach((originalIndex, permutedIndex) => {
    out[originalIndex] = vector[permutedIndex];
  });
  return out;
}

export function permuteDense(A, permutation) {
  return permutation.map((row) => permutation.map((col) => A[row][col]));
}

function approximateMinimumDegreeOrdering(inputAdjacency) {
  const adjacency = inputAdjacency.map((neighbors) => new Set(neighbors));
  const n = adjacency.length;
  const remaining = new Set(naturalOrdering(n));
  const order = [];
  while (remaining.size) {
    let best = null;
    let bestDegree = Infinity;
    for (const candidate of remaining) {
      const degree = [...adjacency[candidate]].filter((other) => remaining.has(other)).length;
      if (degree < bestDegree || (degree === bestDegree && candidate < best)) {
        best = candidate;
        bestDegree = degree;
      }
    }
    const neighbors = [...adjacency[best]].filter((other) => remaining.has(other));
    for (let i = 0; i < neighbors.length; i += 1) {
      for (let j = i + 1; j < neighbors.length; j += 1) {
        adjacency[neighbors[i]].add(neighbors[j]);
        adjacency[neighbors[j]].add(neighbors[i]);
      }
    }
    order.push(best);
    remaining.delete(best);
  }
  return order;
}

function symmetricAdjacency(matrix) {
  const adjacency = Array.from({ length: matrix.colCount }, () => new Set());
  for (let col = 0; col < matrix.colCount; col += 1) {
    for (let p = matrix.colPtr[col]; p < matrix.colPtr[col + 1]; p += 1) {
      const row = matrix.rowIdx[p];
      if (row === col || row < 0 || row >= adjacency.length || !matrix.values[p]) continue;
      adjacency[col].add(row);
      adjacency[row].add(col);
    }
  }
  return adjacency;
}

function countSymmetricPattern(matrix, adjacency) {
  const diagonal = new Set();
  for (let col = 0; col < matrix.colCount; col += 1) {
    for (let p = matrix.colPtr[col]; p < matrix.colPtr[col + 1]; p += 1) {
      if (matrix.rowIdx[p] === col && matrix.values[p]) diagonal.add(col);
    }
  }
  const adjacencyNonzeros = diagonal.size + adjacency.reduce((sum, neighbors) => sum + neighbors.size, 0);
  const simulated = adjacency.map((neighbors) => new Set(neighbors));
  const remaining = new Set(naturalOrdering(adjacency.length));
  let fillEdges = 0;
  while (remaining.size) {
    let best = null;
    let bestDegree = Infinity;
    for (const candidate of remaining) {
      const degree = [...simulated[candidate]].filter((other) => remaining.has(other)).length;
      if (degree < bestDegree || (degree === bestDegree && candidate < best)) {
        best = candidate;
        bestDegree = degree;
      }
    }
    const neighbors = [...simulated[best]].filter((other) => remaining.has(other));
    for (let i = 0; i < neighbors.length; i += 1) {
      for (let j = i + 1; j < neighbors.length; j += 1) {
        if (!simulated[neighbors[i]].has(neighbors[j])) fillEdges += 1;
        simulated[neighbors[i]].add(neighbors[j]);
        simulated[neighbors[j]].add(neighbors[i]);
      }
    }
    remaining.delete(best);
  }
  return {
    adjacencyNonzeros,
    diagonalNonzeros: diagonal.size,
    lowerTriangleNonzeros: diagonal.size + (adjacencyNonzeros - diagonal.size) / 2,
    estimatedFillIn: fillEdges * 2,
  };
}
