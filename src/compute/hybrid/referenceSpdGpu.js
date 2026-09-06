export const REFERENCE_SPD_GPU_VERSION = 'p9-m5-reference-spd-gpu-v1';

export function solveReferenceSpdPcgF32(matrix, rhsInput, options = {}) {
  const n = Number(matrix?.rowCount || 0);
  if (matrix?.format !== 'csr-f32' || n !== matrix?.colCount || matrix.rowPtr?.length !== n + 1) return failure('REFERENCE_SPD_MATRIX_INVALID');
  const rhs = Float32Array.from(rhsInput || [], Number);
  if (rhs.length !== n || rhs.some((value) => !Number.isFinite(value))) return failure('REFERENCE_SPD_RHS_INVALID');
  const diagonal = Float32Array.from(matrix.diagonal || []);
  if (diagonal.length !== n || diagonal.some((value) => !(value > 0))) return failure('REFERENCE_SPD_DIAGONAL_INVALID');
  const x = new Float32Array(n);
  const r = Float32Array.from(rhs);
  const z = new Float32Array(n);
  const p = new Float32Array(n);
  const product = new Float32Array(n);
  for (let index = 0; index < n; index += 1) {
    z[index] = Math.fround(r[index] / diagonal[index]);
    p[index] = z[index];
  }
  let rz = dotF32(r, z);
  const loadNorm = Math.max(1e-30, normInf(rhs));
  const tolerance = positive(options.tolerance, 1e-5);
  const maxIterations = positiveInteger(options.maxIterations, Math.min(2048, Math.max(64, n * 2)));
  const curvatureTolerance = positive(options.curvatureTolerance, 1e-12);
  let relativeResidual = normInf(r) / loadNorm;
  let iterations = 0;
  let reason = null;

  while (relativeResidual > tolerance && iterations < maxIterations) {
    csrMatVecF32(matrix, p, product);
    const denominator = dotF32(p, product);
    const scale = absoluteDotF32(p, product);
    if (!Number.isFinite(denominator) || denominator <= curvatureTolerance * Math.max(Number.EPSILON, scale)) {
      reason = 'REFERENCE_SPD_NON_POSITIVE_CURVATURE';
      break;
    }
    const alpha = Math.fround(rz / denominator);
    for (let index = 0; index < n; index += 1) {
      x[index] = Math.fround(x[index] + Math.fround(alpha * p[index]));
      r[index] = Math.fround(r[index] - Math.fround(alpha * product[index]));
    }
    iterations += 1;
    relativeResidual = normInf(r) / loadNorm;
    if (relativeResidual <= tolerance) break;
    for (let index = 0; index < n; index += 1) z[index] = Math.fround(r[index] / diagonal[index]);
    const nextRz = dotF32(r, z);
    const beta = Math.fround(nextRz / rz);
    for (let index = 0; index < n; index += 1) p[index] = Math.fround(z[index] + Math.fround(beta * p[index]));
    rz = nextRz;
  }
  if (!reason && relativeResidual > tolerance) reason = 'REFERENCE_SPD_NOT_CONVERGED';
  return {
    ok: !reason,
    x: reason ? null : x,
    reason,
    diagnostics: {
      version: REFERENCE_SPD_GPU_VERSION,
      method: 'reference-f32-jacobi-pcg',
      precision: 'f32-emulated',
      iterations,
      tolerance,
      maxIterations,
      relativeResidual,
      residualMax: normInf(r),
      fallback: false,
    },
  };
}

export function createReferenceSpdGpuSession(matrix, defaults = {}) {
  let solveCount = 0;
  let disposed = false;
  return Object.freeze({
    version: REFERENCE_SPD_GPU_VERSION,
    async solve(rhs, options = {}) {
      if (disposed) return failure('REFERENCE_SPD_SESSION_DISPOSED');
      solveCount += 1;
      return solveReferenceSpdPcgF32(matrix, rhs, { ...defaults, ...options });
    },
    snapshot() { return Object.freeze({ version: REFERENCE_SPD_GPU_VERSION, disposed, solveCount, resourceBalanced: disposed }); },
    async dispose() { disposed = true; return this.snapshot(); },
  });
}

function csrMatVecF32(matrix, vector, output) {
  for (let row = 0; row < matrix.rowCount; row += 1) {
    let sum = Math.fround(0);
    for (let pointer = matrix.rowPtr[row]; pointer < matrix.rowPtr[row + 1]; pointer += 1) {
      sum = Math.fround(sum + Math.fround(matrix.values[pointer] * vector[matrix.colIdx[pointer]]));
    }
    output[row] = sum;
  }
}

function dotF32(left, right) {
  let sum = Math.fround(0);
  for (let index = 0; index < left.length; index += 1) sum = Math.fround(sum + Math.fround(left[index] * right[index]));
  return sum;
}

function absoluteDotF32(left, right) {
  let sum = Math.fround(0);
  for (let index = 0; index < left.length; index += 1) sum = Math.fround(sum + Math.abs(Math.fround(left[index] * right[index])));
  return sum;
}

function normInf(values) {
  let result = 0;
  for (const value of values) result = Math.max(result, Math.abs(value));
  return result;
}

function failure(reason) { return { ok: false, x: null, reason, diagnostics: { version: REFERENCE_SPD_GPU_VERSION, reason } }; }
function positive(value, fallback) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }
function positiveInteger(value, fallback) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }
