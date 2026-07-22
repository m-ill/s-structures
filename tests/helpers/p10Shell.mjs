import { solveLinear } from '../../src/solver/linear3dElement.js';
import { buildSlabPlateDkq } from '../../src/solver/shell/slabPlateDkq.js';
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
  const node = (i, j) => j * (divisions + 1) + i;
  const dofCount = (divisions + 1) ** 2 * 3;
  const K = matrix(dofCount); const F = new Array(dofCount).fill(0); const h = a / divisions;
  for (let j = 0; j < divisions; j += 1) for (let i = 0; i < divisions; i += 1) {
    const element = buildSlabPlateDkq({
      nodes: [{ x: i * h, y: j * h, z: 0 }, { x: (i + 1) * h, y: j * h, z: 0 }, { x: (i + 1) * h, y: (j + 1) * h, z: 0 }, { x: i * h, y: (j + 1) * h, z: 0 }],
      material: { E, nu }, t,
    });
    const ids = [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)];
    assemble(K, element.localMatrix, ids.flatMap((id) => [id * 3, id * 3 + 1, id * 3 + 2]));
    for (const id of ids) F[id * 3] += q * h * h / 4;
  }
  const fixed = [];
  for (let j = 0; j <= divisions; j += 1) for (let i = 0; i <= divisions; i += 1) {
    if (i === 0 || j === 0 || i === divisions || j === divisions) fixed.push(node(i, j) * 3);
  }
  const displacement = solve(K, F, fixed);
  const computed = displacement[node(divisions / 2, divisions / 2) * 3];
  const D = E * t ** 3 / (12 * (1 - nu ** 2)); const reference = 0.00406 * q * a ** 4 / D;
  return { computed, reference, relativeError: relativeError(computed, reference), divisions };
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
