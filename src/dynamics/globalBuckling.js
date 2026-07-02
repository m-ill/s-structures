import { assembleStiffness3D } from '../solver/linear3dAssembly.js';
import { matMul, matTrans, solveLinear } from '../solver/linear3dElement.js';

export const GLOBAL_BUCKLING_TRACE_VERSION = 'p3-m13-global-buckling-trace';

export function estimateGlobalBucklingTrace(model = {}, options = {}) {
  const assembly = assembleStiffness3D(model.nodes || [], model.members || [], {
    mat: options.mat,
    sec: options.sec,
  });
  if (!assembly.ok) return baseTrace('not-available', assembly.reason || 'ASSEMBLY_FAILED');
  const KG = buildGlobalGeometricStiffness(model, assembly, options);
  const free = assembly.free || [];
  const Kf = submatrix(assembly.K, free);
  const Gf = submatrix(KG, free);
  const eigen = inverseIteration(Kf, Gf, options);
  return {
    version: GLOBAL_BUCKLING_TRACE_VERSION,
    method: 'global-frame-geometric-stiffness-inverse-iteration',
    status: eigen.ok ? 'available' : 'not-available',
    criticalLoadFactor: eigen.lambda || null,
    iterations: eigen.iterations || 0,
    residual: eigen.residual || null,
    reason: eigen.reason || null,
    freeDofCount: free.length,
    referenceCompression: compressionRows(model, options),
    limitations: [
      'Uses elastic small-displacement frame stiffness and member axial reference forces.',
      'Shells, follower loads, construction sequence, and material nonlinearity are not included.',
    ],
  };
}

function baseTrace(status, reason) {
  return {
    version: GLOBAL_BUCKLING_TRACE_VERSION,
    method: 'global-frame-geometric-stiffness-inverse-iteration',
    status,
    criticalLoadFactor: null,
    iterations: 0,
    residual: null,
    reason,
    freeDofCount: 0,
    referenceCompression: [],
    limitations: [],
  };
}

function buildGlobalGeometricStiffness(model, assembly, options) {
  const ndof = assembly.ndof || assembly.K.length;
  const KG = Array.from({ length: ndof }, () => new Array(ndof).fill(0));
  for (const member of model.members || []) {
    const md = assembly.memData?.[member.id];
    const P = referenceCompression(member, options);
    if (!md || !(P > 0)) continue;
    const kg = matMul(matTrans(md.T), matMul(localGeometricKg(P, md.ax.L), md.T));
    for (let i = 0; i < 12; i += 1) for (let j = 0; j < 12; j += 1) KG[md.dof[i]][md.dof[j]] += kg[i][j];
  }
  return KG;
}

function localGeometricKg(P, L) {
  const k = Array.from({ length: 12 }, () => new Array(12).fill(0));
  const c = P / (30 * L);
  addBlock(k, [1, 5, 7, 11], [
    [36, 3 * L, -36, 3 * L],
    [3 * L, 4 * L ** 2, -3 * L, -(L ** 2)],
    [-36, -3 * L, 36, -3 * L],
    [3 * L, -(L ** 2), -3 * L, 4 * L ** 2],
  ], c);
  addBlock(k, [2, 4, 8, 10], [
    [36, -3 * L, -36, -3 * L],
    [-3 * L, 4 * L ** 2, 3 * L, -(L ** 2)],
    [-36, 3 * L, 36, 3 * L],
    [-3 * L, -(L ** 2), 3 * L, 4 * L ** 2],
  ], c);
  return k;
}

function addBlock(k, dofs, values, scale) {
  dofs.forEach((r, i) => dofs.forEach((c, j) => { k[r][c] += values[i][j] * scale; }));
}

function inverseIteration(K, G, options) {
  if (!K.length) return { ok: false, reason: 'NO_FREE_DOF' };
  let x = normalize(new Array(K.length).fill(1).map((_, i) => (i % 2 ? -0.5 : 1)));
  let lambda = null;
  const maxIterations = Math.max(3, options.maxIterations || 30);
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const gx = matVec(G, x);
    if (norm(gx) < 1e-12) return { ok: false, reason: 'NO_GEOMETRIC_STIFFNESS' };
    const y = solveLinear(K, gx);
    if (!y) return { ok: false, reason: 'SINGULAR_STIFFNESS' };
    x = normalize(y);
    const den = dot(x, matVec(G, x));
    if (!(den > 1e-12)) return { ok: false, reason: 'ZERO_GEOMETRIC_ENERGY' };
    const next = dot(x, matVec(K, x)) / den;
    if (lambda && Math.abs(next - lambda) / Math.max(1, Math.abs(next)) < 1e-6) {
      return { ok: true, lambda: next, iterations: iteration, residual: Math.abs(next - lambda) };
    }
    lambda = next;
  }
  return { ok: !!lambda, lambda, iterations: maxIterations, residual: null, reason: 'MAX_ITERATIONS' };
}

function compressionRows(model, options) {
  return (model.members || []).map((member) => ({ memberId: member.id, compression: referenceCompression(member, options) })).filter((row) => row.compression > 0);
}

function referenceCompression(member, options) {
  const explicit = options.referenceAxialForces?.[member.id] ?? member.buckling?.referenceCompression;
  if (Number(explicit) > 0) return Number(explicit);
  const values = options.results?.[member.id]?.N || [];
  if (!values.length) return 0;
  return Math.max(0, -values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length);
}

function submatrix(A, ids) {
  return ids.map((i) => ids.map((j) => A[i][j]));
}

function matVec(A, x) {
  return A.map((row) => row.reduce((sum, value, i) => sum + value * x[i], 0));
}

function dot(a, b) {
  return a.reduce((sum, value, i) => sum + value * b[i], 0);
}

function norm(v) {
  return Math.sqrt(dot(v, v));
}

function normalize(v) {
  const n = norm(v) || 1;
  return v.map((value) => value / n);
}
