import { vadd, vcross, vlen, vnorm, vscale, vsub } from '../core/vector.js';
import { resolveCriterion } from '../core/analysisCriteria.js';
import { buildFixedEndLoad } from '../loads/fixedEnd/index.js';
import { resolveLoadDirection } from '../loads/fixedEnd/common.js';
import { buildSolverWarningDiagnostics } from './sparse/diagnostics.js';
import { solveDenseGaussian, solveSparseLinear } from './sparse/solveSparse.js';
export { memberReleaseDofs } from '../core/memberReleaseContract.js';

export const AXIS = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
};

export function solveLinear(A, b, options = {}) {
  const result = solveLinearDetailed(A, b, options);
  return result.ok ? result.x : null;
}

export function solveLinearDetailed(A, b, options = {}) {
  const criteriaModel = options.criteriaModel || options.model || options.analysisCriteria || {};
  const sparseThreshold = Math.max(1, Number(options.sparseThreshold ?? 48));
  const forceSparse = options.solver === 'sparse' || options.sparse === true;
  const autoSparse = options.solver === 'auto-sparse' || options.sparse === 'auto';
  const useSparse = forceSparse || (autoSparse && b.length >= sparseThreshold);
  const pivotTolerance = positiveNumber(options.pivotTolerance, resolveCriterion(criteriaModel, 'solver.pivotSingular'), 1e-12);
  if (useSparse) return solveSparseLinear(A, b, { ...options, criteriaModel, pivotTolerance });

  const dense = solveDenseGaussian(A, b, { pivotTolerance });
  const diagnostics = {
    version: 'p6-m1-dense-solve-diagnostics-v1',
    method: 'dense-partial-pivot',
    sparseAttempted: false,
    fallback: false,
    rowCount: A.length,
    colCount: A[0]?.length || 0,
    nnz: A.reduce((sum, row) => sum + row.filter((value) => Math.abs(Number(value) || 0) > 0).length, 0),
    density: A.length && A[0]?.length ? diagnosticsNnz(A) / Math.max(1, A.length * A[0].length) : 0,
    solveMs: dense.solveMs || 0,
    totalMs: dense.solveMs || 0,
    pivotMin: dense.pivotMin || 0,
    pivotMinIndex: dense.pivotMinIndex ?? null,
    pivotMinOriginalIndex: dense.pivotMinOriginalIndex ?? dense.pivotMinIndex ?? null,
    pivotMax: dense.pivotMax || 0,
    pivotRatio: dense.pivotRatio || 0,
  };
  diagnostics.diagnostics = buildSolverWarningDiagnostics(A, dense.x, b, diagnostics, criteriaModel, options.labels || []);
  return {
    ok: dense.ok,
    x: dense.x,
    reason: dense.reason,
    diagnostics,
  };
}

function diagnosticsNnz(A) {
  return A.reduce((sum, row) => sum + row.filter((value) => Math.abs(Number(value) || 0) > 0).length, 0);
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 1;
}

export function memberAxes(a, b, localAxis) {
  const v = [b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)];
  const L = vlen(v);
  const x = vnorm(v);
  let aux = localAxis?.refVector && Array.isArray(localAxis.refVector) && vlen(localAxis.refVector) > 1e-9
    ? vnorm(localAxis.refVector)
    : Math.abs(x[2]) > 0.99 ? [1, 0, 0] : [0, 0, 1];
  let z = vcross(x, aux);
  if (vlen(z) < 1e-9) {
    aux = Math.abs(x[2]) > 0.99 ? [1, 0, 0] : [0, 0, 1];
    z = vcross(x, aux);
  }
  z = vnorm(z);
  let y = vcross(z, x);

  const roll = Number(localAxis?.roll || 0);
  if (roll) {
    const t = (roll * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const y2 = vadd(vscale(y, c), vscale(z, s));
    const z2 = vsub(vscale(z, c), vscale(y, s));
    y = y2;
    z = z2;
  }

  return { L, x, y, z };
}

export function localK12(E, G, A, Iy, Iz, J, L, phiY = 0, phiZ = 0) {
  const k = Array.from({ length: 12 }, () => new Array(12).fill(0));
  const set = (i, j, value) => {
    k[i][j] = value;
    k[j][i] = value;
  };

  const EA = (E * A) / L;
  const GJ = (G * J) / L;
  set(0, 0, EA);
  set(6, 6, EA);
  set(0, 6, -EA);
  set(3, 3, GJ);
  set(9, 9, GJ);
  set(3, 9, -GJ);

  const normalizedPhiZ = Number.isFinite(Number(phiZ)) && Number(phiZ) > 0 ? Number(phiZ) : 0;
  const denominatorZ = 1 + normalizedPhiZ;
  const az = (12 * E * Iz) / (denominatorZ * L ** 3);
  const bz = (6 * E * Iz) / (denominatorZ * L ** 2);
  const cz = ((4 + normalizedPhiZ) * E * Iz) / (denominatorZ * L);
  const dz = ((2 - normalizedPhiZ) * E * Iz) / (denominatorZ * L);
  set(1, 1, az);
  set(7, 7, az);
  set(1, 7, -az);
  set(1, 5, bz);
  set(1, 11, bz);
  set(5, 7, -bz);
  set(7, 11, -bz);
  set(5, 5, cz);
  set(11, 11, cz);
  set(5, 11, dz);

  const normalizedPhiY = Number.isFinite(Number(phiY)) && Number(phiY) > 0 ? Number(phiY) : 0;
  const denominatorY = 1 + normalizedPhiY;
  const ay = (12 * E * Iy) / (denominatorY * L ** 3);
  const by = (6 * E * Iy) / (denominatorY * L ** 2);
  const cy = ((4 + normalizedPhiY) * E * Iy) / (denominatorY * L);
  const dy = ((2 - normalizedPhiY) * E * Iy) / (denominatorY * L);
  set(2, 2, ay);
  set(8, 8, ay);
  set(2, 8, -ay);
  set(2, 4, -by);
  set(2, 10, -by);
  set(4, 8, by);
  set(8, 10, by);
  set(4, 4, cy);
  set(10, 10, cy);
  set(4, 10, dy);

  return k;
}

export function localTrussK12(E, A, L) {
  const k = Array.from({ length: 12 }, () => new Array(12).fill(0));
  const EA = (E * A) / L;
  k[0][0] = EA;
  k[6][6] = EA;
  k[0][6] = -EA;
  k[6][0] = -EA;
  return k;
}

export function dirVec(load, ax = null) {
  const resolved = resolveLoadDirection(load, ax);
  return resolved.ok ? resolved.global : undefined;
}

export function transform12(ax) {
  const T = Array.from({ length: 12 }, () => new Array(12).fill(0));
  const R = [ax.x, ax.y, ax.z];
  for (let block = 0; block < 12; block += 3) {
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) T[block + i][block + j] = R[i][j];
    }
  }
  return T;
}

export function fixedEndForces3D(load, ax, md = {}) {
  return buildFixedEndLoad(load, ax, md)?.q0 || new Array(12).fill(0);
}

export function fixedEndUniformCoefficients(shape, L) {
  if (shape === 'asc') return { a1: L / 6, a2: L / 3, sh1: (3 * L) / 20, sh2: (7 * L) / 20, m1: L ** 2 / 30, m2: L ** 2 / 20 };
  if (shape === 'desc') return { a1: L / 3, a2: L / 6, sh1: (7 * L) / 20, sh2: (3 * L) / 20, m1: L ** 2 / 20, m2: L ** 2 / 30 };
  return { a1: L / 2, a2: L / 2, sh1: L / 2, sh2: L / 2, m1: L ** 2 / 12, m2: L ** 2 / 12 };
}

export function condenseReleasedDofs(kl, f0, rel) {
  const retained = [...Array(12).keys()].filter((i) => !rel.includes(i));
  const kcc = rel.map((i) => rel.map((j) => kl[i][j]));
  const aug = rel.map((ri) => retained.map((j) => kl[ri][j]).concat([f0[ri]]));
  const X = [];
  for (let col = 0; col <= retained.length; col += 1) {
    const x = solveLinear(kcc.map((row) => row.slice()), aug.map((row) => row[col]));
    if (!x) return null;
    X.push(x);
  }

  const klC = Array.from({ length: 12 }, () => new Array(12).fill(0));
  const f0C = new Array(12).fill(0);
  for (let i = 0; i < retained.length; i += 1) {
    for (let j = 0; j < retained.length; j += 1) {
      let sum = kl[retained[i]][retained[j]];
      for (let k = 0; k < rel.length; k += 1) sum -= kl[retained[i]][rel[k]] * X[j][k];
      klC[retained[i]][retained[j]] = sum;
    }
    let sf = f0[retained[i]];
    for (let k = 0; k < rel.length; k += 1) sf -= kl[retained[i]][rel[k]] * X[retained.length][k];
    f0C[retained[i]] = sf;
  }
  return { klC, f0C };
}

export function integratedUniformLoad(shape, x, L) {
  if (shape === 'asc') return { fI: x ** 2 / (2 * L), mI: x ** 3 / (6 * L) };
  if (shape === 'desc') return { fI: x - x ** 2 / (2 * L), mI: x ** 2 / 2 - x ** 3 / (6 * L) };
  return { fI: x, mI: x ** 2 / 2 };
}

export function fixedFixedDeflectionFunction(shape, x, L) {
  if (shape === 'asc') return x ** 5 / (120 * L) - (L * x ** 3) / 40 + (L ** 2 * x ** 2) / 60;
  if (shape === 'desc') {
    const xm = L - x;
    return xm ** 5 / (120 * L) - (L * xm ** 3) / 40 + (L ** 2 * xm ** 2) / 60;
  }
  return (x ** 2 * (L - x) ** 2) / 24;
}

export function fixedFixedPointDeflectionFunction(a, x, L) {
  const b = L - a;
  if (x <= a) return (b ** 2 * x ** 2 * (3 * a * L - (3 * a + b) * x)) / (6 * L ** 3);
  const x2 = L - x;
  return (a ** 2 * x2 ** 2 * (3 * b * L - (3 * b + a) * x2)) / (6 * L ** 3);
}

export function matMul(A, B) {
  const n = A.length;
  const m = B[0].length;
  const K = B.length;
  const R = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let p = 0; p < K; p += 1) {
      const a = A[i][p];
      if (!a) continue;
      for (let j = 0; j < m; j += 1) R[i][j] += a * B[p][j];
    }
  }
  return R;
}

export function matTrans(A) {
  return A[0].map((_, j) => A.map((row) => row[j]));
}

export function matVec(A, v) {
  return A.map((row) => row.reduce((sum, x, i) => sum + x * v[i], 0));
}

export function maxAbs(values) {
  return Math.max(...values.map((value) => Math.abs(value)));
}
