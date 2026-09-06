export const LANCZOS_EIGEN_VERSION = 'p6-m4-lanczos-eigen-trace-v1';

export function buildLanczosEigenTrace(input = {}) {
  const matrix = input.matrix || input.K || [];
  const n = matrix.length;
  const modeCount = Math.max(1, Math.min(Number(input.modeCount) || 3, n || 1));
  const maxIterations = Math.max(modeCount + 2, Math.min(Number(input.maxIterations) || Math.max(12, modeCount * 4), n || 1));
  const mass = normalizeMass(input.mass || input.M, n);
  if (!n || !matrix.every((row) => Array.isArray(row) && row.length === n)) {
    return baseTrace('not-available', 'BAD_MATRIX', modeCount, maxIterations);
  }

  const operator = (v) => massNormalizeMatVec(matrix, mass, v);
  const basis = [];
  const alpha = [];
  const beta = [];
  let q = normalize(new Array(n).fill(0).map((_item, index) => (index === 0 ? 1 : 0.37 / (index + 1))));
  let qPrev = new Array(n).fill(0);

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    basis.push(q);
    let z = operator(q);
    const a = dot(q, z);
    alpha.push(a);
    z = z.map((value, i) => value - a * q[i] - (iteration ? beta[iteration - 1] * qPrev[i] : 0));
    reorthogonalize(z, basis);
    const b = norm(z);
    if (b <= 1e-12) break;
    beta.push(b);
    qPrev = q;
    q = z.map((value) => value / b);
  }

  const T = tridiagonal(alpha, beta);
  const eig = jacobiEigen(T);
  const modes = eig.values
    .map((value, index) => ({
      eigenvalue: value,
      vector: combineBasis(basis, eig.vectors.map((row) => row[index])),
    }))
    .filter((mode) => Number.isFinite(mode.eigenvalue))
    .sort((a, b) => a.eigenvalue - b.eigenvalue)
    .slice(0, modeCount)
    .map((mode, index) => {
      const residual = eigenResidual(operator, mode.vector, mode.eigenvalue);
      return {
        id: `EIG${index + 1}`,
        index: index + 1,
        eigenvalue: mode.eigenvalue,
        omega: mode.eigenvalue > 0 ? Math.sqrt(mode.eigenvalue) : null,
        period: mode.eigenvalue > 0 ? (2 * Math.PI) / Math.sqrt(mode.eigenvalue) : null,
        residual,
      };
    });

  return {
    version: LANCZOS_EIGEN_VERSION,
    method: 'symmetric-lanczos-diagonal-mass-normalized',
    status: modes.length ? 'available' : 'not-available',
    requestedModeCount: modeCount,
    iterationCount: basis.length,
    matrixSize: n,
    massType: Array.isArray(input.mass || input.M) ? 'diagonal' : 'identity',
    modes,
    maxResidual: Math.max(0, ...modes.map((mode) => mode.residual)),
    limitations: [
      'Trace accepts dense matrices or diagonal mass arrays; production sparse storage can reuse the same matvec contract.',
      'Degenerate or tightly clustered modes should be reviewed with the residual field.',
    ],
  };
}

function baseTrace(status, reason, requestedModeCount, maxIterations) {
  return {
    version: LANCZOS_EIGEN_VERSION,
    method: 'symmetric-lanczos-diagonal-mass-normalized',
    status,
    reason,
    requestedModeCount,
    iterationCount: 0,
    matrixSize: 0,
    modes: [],
    maxResidual: null,
    limitations: [],
  };
}

function normalizeMass(mass, n) {
  if (!Array.isArray(mass)) return new Array(n).fill(1);
  return Array.from({ length: n }, (_item, index) => Math.max(1e-12, Number(mass[index]) || 1));
}

function massNormalizeMatVec(matrix, mass, vector) {
  const scaled = vector.map((value, index) => value / Math.sqrt(mass[index]));
  const product = matrix.map((row) => row.reduce((sum, value, index) => sum + (Number(value) || 0) * scaled[index], 0));
  return product.map((value, index) => value / Math.sqrt(mass[index]));
}

function tridiagonal(alpha, beta) {
  return alpha.map((value, i) => alpha.map((_item, j) => {
    if (i === j) return value;
    if (Math.abs(i - j) === 1) return beta[Math.min(i, j)] || 0;
    return 0;
  }));
}

function combineBasis(basis, coefficients) {
  const out = new Array(basis[0]?.length || 0).fill(0);
  for (let j = 0; j < coefficients.length; j += 1) {
    for (let i = 0; i < out.length; i += 1) out[i] += basis[j][i] * coefficients[j];
  }
  return normalize(out);
}

function eigenResidual(operator, vector, eigenvalue) {
  const av = operator(vector);
  return norm(av.map((value, index) => value - eigenvalue * vector[index])) / Math.max(1, Math.abs(eigenvalue));
}

function reorthogonalize(vector, basis) {
  for (const q of basis) {
    const projection = dot(vector, q);
    for (let i = 0; i < vector.length; i += 1) vector[i] -= projection * q[i];
  }
}

function jacobiEigen(A) {
  const n = A.length;
  const a = A.map((row) => row.slice());
  const vectors = Array.from({ length: n }, (_item, i) => Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)));
  for (let iteration = 0; iteration < Math.max(50, n * n * 30); iteration += 1) {
    let p = 0;
    let q = 1;
    let max = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        if (Math.abs(a[i][j]) > max) {
          max = Math.abs(a[i][j]);
          p = i;
          q = j;
        }
      }
    }
    if (max < 1e-12) break;
    const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;
    rotate(a, vectors, p, q, c, s);
  }
  return { values: a.map((row, i) => row[i]), vectors };
}

function rotate(a, vectors, p, q, c, s) {
  const n = a.length;
  const app = a[p][p];
  const aqq = a[q][q];
  const apq = a[p][q];
  a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
  a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
  a[p][q] = 0;
  a[q][p] = 0;
  for (let k = 0; k < n; k += 1) {
    if (k === p || k === q) continue;
    const akp = a[k][p];
    const akq = a[k][q];
    a[k][p] = c * akp - s * akq;
    a[p][k] = a[k][p];
    a[k][q] = s * akp + c * akq;
    a[q][k] = a[k][q];
  }
  for (let k = 0; k < n; k += 1) {
    const vkp = vectors[k][p];
    const vkq = vectors[k][q];
    vectors[k][p] = c * vkp - s * vkq;
    vectors[k][q] = s * vkp + c * vkq;
  }
}

function normalize(v) {
  const n = norm(v) || 1;
  return v.map((value) => value / n);
}

function norm(v) {
  return Math.sqrt(dot(v, v));
}

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}
