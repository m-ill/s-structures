export const SMALL_SYMMETRIC_EIGEN_VERSION = 'p9-m6-small-symmetric-eigen-v1';
export const SMALL_DENSE_REFERENCE_LIMIT = 32;

export function solveSmallSymmetricEigen(input, options = {}) {
  if (!squareFinite(input)) return failure('SMALL_EIGEN_MATRIX_INVALID');
  const dimension = input.length;
  if (dimension > positiveInteger(options.maxDimension, SMALL_DENSE_REFERENCE_LIMIT)) {
    return failure('SMALL_EIGEN_DIMENSION_EXCEEDED', { dimension });
  }
  const matrix = symmetrize(input);
  const vectors = identity(dimension);
  const tolerance = positive(options.tolerance, 1e-13);
  const maxSweeps = positiveInteger(options.maxSweeps, Math.max(30, dimension * 8));
  let rotations = 0;
  let sweeps = 0;
  let converged = dimension <= 1;
  let threshold = 0;
  for (let sweep = 1; sweep <= maxSweeps && !converged; sweep += 1) {
    sweeps = sweep;
    const scale = Math.max(Number.EPSILON, ...matrix.map((row, index) => Math.abs(row[index])));
    threshold = tolerance * scale;
    for (let p = 0; p < dimension - 1; p += 1) {
      for (let q = p + 1; q < dimension; q += 1) {
        const apq = matrix[p][q];
        if (Math.abs(apq) <= threshold) continue;
        const tau = (matrix[q][q] - matrix[p][p]) / (2 * apq);
        const tangent = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        const cosine = 1 / Math.sqrt(1 + tangent * tangent);
        const sine = tangent * cosine;
        const app = matrix[p][p];
        const aqq = matrix[q][q];
        matrix[p][p] = app - tangent * apq;
        matrix[q][q] = aqq + tangent * apq;
        matrix[p][q] = 0;
        matrix[q][p] = 0;
        for (let k = 0; k < dimension; k += 1) {
          if (k !== p && k !== q) {
            const akp = matrix[k][p];
            const akq = matrix[k][q];
            matrix[k][p] = cosine * akp - sine * akq;
            matrix[p][k] = matrix[k][p];
            matrix[k][q] = sine * akp + cosine * akq;
            matrix[q][k] = matrix[k][q];
          }
          const vkp = vectors[k][p];
          const vkq = vectors[k][q];
          vectors[k][p] = cosine * vkp - sine * vkq;
          vectors[k][q] = sine * vkp + cosine * vkq;
        }
        rotations += 1;
      }
    }
    converged = maxOffDiagonal(matrix) <= threshold;
  }
  const values = matrix.map((row, index) => row[index]);
  const ordering = values.map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value || left.index - right.index);
  return Object.freeze({
    version: SMALL_SYMMETRIC_EIGEN_VERSION,
    ok: converged,
    reason: converged ? null : 'SMALL_EIGENSOLVER_NOT_CONVERGED',
    converged,
    values: ordering.map((item) => item.value),
    vectors: vectors.map((row) => ordering.map((item) => row[item.index])),
    sweeps,
    rotations,
    maxOffDiagonal: maxOffDiagonal(matrix),
    threshold,
  });
}

export function modalAssuranceCriterion(leftInput, rightInput, metric = null) {
  const left = Float64Array.from(leftInput || [], Number);
  const right = Float64Array.from(rightInput || [], Number);
  if (!left.length || left.length !== right.length) return 0;
  const apply = typeof metric === 'function' ? metric : (vector) => vector;
  const metricLeft = apply(left);
  const metricRight = apply(right);
  const numerator = dot(left, metricRight);
  const leftNorm = dot(left, metricLeft);
  const rightNorm = dot(right, metricRight);
  return leftNorm > 0 && rightNorm > 0 ? (numerator * numerator) / (leftNorm * rightNorm) : 0;
}

function symmetrize(matrix) {
  return matrix.map((row, i) => row.map((value, j) => 0.5 * (Number(value) + Number(matrix[j][i]))));
}

function identity(dimension) {
  return Array.from({ length: dimension }, (_row, i) => (
    Array.from({ length: dimension }, (_column, j) => (i === j ? 1 : 0))
  ));
}

function maxOffDiagonal(matrix) {
  let maximum = 0;
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = row + 1; column < matrix.length; column += 1) {
      maximum = Math.max(maximum, Math.abs(matrix[row][column]));
    }
  }
  return maximum;
}

function dot(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += left[index] * right[index];
  return sum;
}

function squareFinite(matrix) {
  return Array.isArray(matrix)
    && matrix.length > 0
    && matrix.every((row) => Array.isArray(row) && row.length === matrix.length && row.every(Number.isFinite));
}

function failure(reason, detail = {}) {
  return Object.freeze({
    version: SMALL_SYMMETRIC_EIGEN_VERSION,
    ok: false,
    converged: false,
    reason,
    values: [],
    vectors: [],
    sweeps: 0,
    rotations: 0,
    ...detail,
  });
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}
