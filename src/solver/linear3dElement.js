import { vadd, vcross, vdot, vlen, vnorm, vscale, vsub } from '../core/vector.js';
export { memberReleaseDofs } from '../core/memberReleaseContract.js';

export const AXIS = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
};

export function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => row.concat([b[i]]));
  for (let c = 0; c < n; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < n; r += 1) {
      if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    }
    if (Math.abs(M[pivot][c]) < 1e-10) return null;
    [M[c], M[pivot]] = [M[pivot], M[c]];
    for (let r = c + 1; r < n; r += 1) {
      const factor = M[r][c] / M[c][c];
      if (!factor) continue;
      for (let k = c; k <= n; k += 1) M[r][k] -= factor * M[c][k];
    }
  }

  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let sum = M[r][n];
    for (let k = r + 1; k < n; k += 1) sum -= M[r][k] * x[k];
    x[r] = sum / M[r][r];
  }
  return x;
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

export function localK12(E, G, A, Iy, Iz, J, L) {
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

  const az = (12 * E * Iz) / L ** 3;
  const bz = (6 * E * Iz) / L ** 2;
  const cz = (4 * E * Iz) / L;
  const dz = (2 * E * Iz) / L;
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

  const ay = (12 * E * Iy) / L ** 3;
  const by = (6 * E * Iy) / L ** 2;
  const cy = (4 * E * Iy) / L;
  const dy = (2 * E * Iy) / L;
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

export function dirVec(load) {
  if (Array.isArray(load.direction) && load.direction.length === 3) {
    const l = Math.hypot(load.direction[0], load.direction[1], load.direction[2]) || 1;
    return [load.direction[0] / l, load.direction[1] / l, load.direction[2] / l];
  }
  return AXIS[load.dir || '-z'];
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

export function fixedEndForces3D(load, ax) {
  const { L } = ax;
  const f0 = new Array(12).fill(0);
  const direction = dirVec(load);
  const magnitude = load.type === 'udl' ? load.w : load.P;
  const q = [vdot(ax.x, direction) * magnitude, vdot(ax.y, direction) * magnitude, vdot(ax.z, direction) * magnitude];

  if (load.type === 'point') {
    const a = load.t * L;
    const b = L - a;
    f0[0] -= (q[0] * b) / L;
    f0[6] -= (q[0] * a) / L;
    f0[1] -= (q[1] * b * b * (3 * a + b)) / L ** 3;
    f0[7] -= (q[1] * a * a * (a + 3 * b)) / L ** 3;
    f0[5] -= (q[1] * a * b * b) / L ** 2;
    f0[11] += (q[1] * a * a * b) / L ** 2;
    f0[2] -= (q[2] * b * b * (3 * a + b)) / L ** 3;
    f0[8] -= (q[2] * a * a * (a + 3 * b)) / L ** 3;
    f0[4] += (q[2] * a * b * b) / L ** 2;
    f0[10] -= (q[2] * a * a * b) / L ** 2;
  } else if (load.type === 'udl') {
    const coeffs = fixedEndUniformCoefficients(load.shape || 'uniform', L);
    f0[0] -= q[0] * coeffs.a1;
    f0[6] -= q[0] * coeffs.a2;
    f0[1] -= q[1] * coeffs.sh1;
    f0[7] -= q[1] * coeffs.sh2;
    f0[5] -= q[1] * coeffs.m1;
    f0[11] += q[1] * coeffs.m2;
    f0[2] -= q[2] * coeffs.sh1;
    f0[8] -= q[2] * coeffs.sh2;
    f0[4] += q[2] * coeffs.m1;
    f0[10] -= q[2] * coeffs.m2;
  }

  return f0;
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
