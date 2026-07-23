import { solveLinear } from '../../src/solver/linear3dElement.js';
import { buildSlabPlateMitc4 } from '../../src/solver/shell/slabPlateMitc4.js';
import { buildWallMembraneQm6 } from '../../src/solver/shell/wallMembraneQm6.js';

export function wallCantileverBenchmark({ E = 30e9, nu = 0.2, t = 0.2, width = 2, height = 4, P = 1e6, divisions = 8 } = {}) {
  const dofCount = (divisions + 1) * 4;
  const K = matrix(dofCount); const F = new Array(dofCount).fill(0);
  for (let story = 0; story < divisions; story += 1) {
    const z0 = height * story / divisions; const z1 = height * (story + 1) / divisions;
    const element = buildWallMembraneQm6({
      nodes: [{ x: 0, y: 0, z: z0 }, { x: width, y: 0, z: z0 }, { x: width, y: 0, z: z1 }, { x: 0, y: 0, z: z1 }],
      material: { E, nu }, t,
    });
    const ids = [story * 2, story * 2 + 1, (story + 1) * 2 + 1, (story + 1) * 2];
    assemble(K, element.localMatrix, ids.flatMap((id) => [id * 2, id * 2 + 1]));
  }
  F[divisions * 4] = P / 2; F[divisions * 4 + 2] = P / 2;
  const displacement = solve(K, F, [0, 1, 2, 3]);
  const computed = (displacement[divisions * 4] + displacement[divisions * 4 + 2]) / 2;
  const I = t * width ** 3 / 12; const A = t * width; const G = E / (2 * (1 + nu));
  const reference = P * height ** 3 / (3 * E * I) + 1.2 * P * height / (G * A);
  return { computed, reference, relativeError: relativeError(computed, reference), divisions };
}

export function squarePlateBenchmark({ E = 30e9, nu = 0.3, t = 0.2, a = 4, q = 1e4, divisions = 6 } = {}) {
  return rectangularPlateBenchmark({
    E, nu, t, a, b: a, q, divisionsX: divisions, divisionsY: divisions,
    referenceTheory: 'mindlin',
  });
}

export function rectangularPlateBenchmark({
  E = 30e9, nu = 0.3, t = 0.2, a = 4, b = 4, q = 1e4,
  divisionsX = 6, divisionsY = 6, navierTerms = 81,
  referenceTheory = 'kirchhoff', shearFactor = 5 / 6,
} = {}) {
  if (divisionsX % 2 !== 0 || divisionsY % 2 !== 0) throw new RangeError('Plate benchmark divisions must be even so the center node exists.');
  const node = (i, j) => j * (divisionsX + 1) + i;
  const dofCount = (divisionsX + 1) * (divisionsY + 1) * 3;
  const K = matrix(dofCount); const F = new Array(dofCount).fill(0);
  const hx = a / divisionsX; const hy = b / divisionsY;
  for (let j = 0; j < divisionsY; j += 1) for (let i = 0; i < divisionsX; i += 1) {
    const element = buildSlabPlateMitc4({
      nodes: [{ x: i * hx, y: j * hy, z: 0 }, { x: (i + 1) * hx, y: j * hy, z: 0 }, { x: (i + 1) * hx, y: (j + 1) * hy, z: 0 }, { x: i * hx, y: (j + 1) * hy, z: 0 }],
      material: { E, nu }, t,
    });
    const ids = [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)];
    assemble(K, element.localMatrix, ids.flatMap((id) => [id * 3, id * 3 + 1, id * 3 + 2]));
    for (const id of ids) F[id * 3] += q * hx * hy / 4;
  }
  const fixed = [];
  for (let j = 0; j <= divisionsY; j += 1) for (let i = 0; i <= divisionsX; i += 1) {
    if (i === 0 || j === 0 || i === divisionsX || j === divisionsY) fixed.push(node(i, j) * 3);
  }
  const displacement = solve(K, F, fixed);
  const computed = displacement[node(divisionsX / 2, divisionsY / 2) * 3];
  const navier = referenceTheory === 'mindlin'
    ? rectangularMindlinPlateNavierReference({ E, nu, t, a, b, q, terms: navierTerms, shearFactor })
    : rectangularPlateNavierReference({ E, nu, t, a, b, q, terms: navierTerms });
  return {
    computed,
    reference: navier.wCenter,
    relativeError: relativeError(computed, navier.wCenter),
    divisions: divisionsX === divisionsY ? divisionsX : null,
    divisionsX,
    divisionsY,
    aspectRatio: Math.max(a, b) / Math.min(a, b),
    shortSideThicknessRatio: Math.min(a, b) / t,
    referenceKind: navier.referenceKind,
    navierTerms,
  };
}

export function rectangularMindlinPlateNavierReference({
  E = 30e9, nu = 0.3, t = 0.2, a = 4, b = 4, q = 1e4, terms = 81, shearFactor = 5 / 6,
} = {}) {
  if (![E, t, a, b, shearFactor].every((value) => Number.isFinite(Number(value)) && Number(value) > 0)) throw new RangeError('Mindlin plate reference requires positive E, t, a, b, and shearFactor.');
  const maximumTerm = Math.max(1, Math.floor(Number(terms)));
  const D = E * t ** 3 / (12 * (1 - nu ** 2));
  const G = E / (2 * (1 + nu));
  let bendingSeries = 0;
  let shearSeries = 0;
  for (let m = 1; m <= maximumTerm; m += 2) for (let n = 1; n <= maximumTerm; n += 2) {
    const centerSign = Math.sin(m * Math.PI / 2) * Math.sin(n * Math.PI / 2);
    const loadCoefficient = 16 * q / (Math.PI ** 2 * m * n);
    const lambda = Math.PI ** 2 * ((m / a) ** 2 + (n / b) ** 2);
    bendingSeries += centerSign * loadCoefficient / (D * lambda ** 2);
    shearSeries += centerSign * loadCoefficient / (shearFactor * G * t * lambda);
  }
  return {
    D,
    G,
    shearFactor,
    bendingCenter: bendingSeries,
    shearCenter: shearSeries,
    wCenter: bendingSeries + shearSeries,
    terms: maximumTerm,
    referenceKind: 'reissner-mindlin-navier-simply-supported-udl',
  };
}

export function rectangularPlateNavierReference({ E = 30e9, nu = 0.3, t = 0.2, a = 4, b = 4, q = 1e4, terms = 81 } = {}) {
  if (![E, t, a, b].every((value) => Number.isFinite(Number(value)) && Number(value) > 0)) throw new RangeError('Navier plate reference requires positive E, t, a, and b.');
  const maximumTerm = Math.max(1, Math.floor(Number(terms)));
  const D = E * t ** 3 / (12 * (1 - nu ** 2));
  let series = 0;
  for (let m = 1; m <= maximumTerm; m += 2) for (let n = 1; n <= maximumTerm; n += 2) {
    const centerSign = Math.sin(m * Math.PI / 2) * Math.sin(n * Math.PI / 2);
    const waveNumber = (m / a) ** 2 + (n / b) ** 2;
    series += centerSign / (m * n * waveNumber ** 2);
  }
  return {
    D,
    wCenter: 16 * q * series / (Math.PI ** 6 * D),
    terms: maximumTerm,
    referenceKind: 'kirchhoff-navier-simply-supported-udl',
  };
}

export function quadraticEnergy(K, vector) {
  let value = 0;
  for (let i = 0; i < K.length; i += 1) for (let j = 0; j < K.length; j += 1) value += vector[i] * K[i][j] * vector[j];
  return value / 2;
}

export function rigidModes(nodes) {
  const origin = ['x', 'y', 'z'].map((key) => nodes.reduce((sum, node) => sum + Number(node[key] || 0), 0) / 4);
  const modes = [];
  for (let axis = 0; axis < 3; axis += 1) {
    const vector = new Array(24).fill(0); for (let node = 0; node < 4; node += 1) vector[node * 6 + axis] = 1; modes.push(vector);
  }
  for (let axis = 0; axis < 3; axis += 1) {
    const omega = [0, 0, 0]; omega[axis] = 1; const vector = new Array(24).fill(0);
    for (let node = 0; node < 4; node += 1) {
      const r = [nodes[node].x - origin[0], nodes[node].y - origin[1], (nodes[node].z || 0) - origin[2]];
      const u = [omega[1] * r[2] - omega[2] * r[1], omega[2] * r[0] - omega[0] * r[2], omega[0] * r[1] - omega[1] * r[0]];
      for (let i = 0; i < 3; i += 1) { vector[node * 6 + i] = u[i]; vector[node * 6 + 3 + i] = omega[i]; }
    }
    modes.push(vector);
  }
  return modes;
}

function matrix(size) { return Array.from({ length: size }, () => new Array(size).fill(0)); }
function assemble(K, ke, dofs) { for (let i = 0; i < dofs.length; i += 1) for (let j = 0; j < dofs.length; j += 1) K[dofs[i]][dofs[j]] += ke[i][j]; }
function solve(K, F, fixedList) {
  const fixed = new Set(fixedList); const free = Array.from({ length: F.length }, (_, index) => index).filter((index) => !fixed.has(index));
  const solved = solveLinear(free.map((i) => free.map((j) => K[i][j])), free.map((i) => F[i]));
  const full = new Array(F.length).fill(0); free.forEach((global, index) => { full[global] = solved[index]; }); return full;
}
function relativeError(actual, expected) { return Math.abs(actual - expected) / Math.max(1e-30, Math.abs(expected)); }
