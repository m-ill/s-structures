export const SHELL_ELEMENT_MATH_VERSION = 'p10-m9-shell-element-math-v1';

const GAUSS = [-1 / Math.sqrt(3), 1 / Math.sqrt(3)];

export function buildShellLocalFrame(nodes = []) {
  if (nodes.length !== 4) return { ok: false, reason: 'SHELL_FOUR_NODES_REQUIRED' };
  const origin = average(nodes);
  const e1 = unit(sub(nodes[1], nodes[0]));
  const diagonal = sub(nodes[3], nodes[0]);
  const normal = unit(cross(e1, diagonal));
  const e2 = unit(cross(normal, e1));
  if (!finiteVector(e1) || !finiteVector(e2) || !finiteVector(normal)) return { ok: false, reason: 'SHELL_DEGENERATE_GEOMETRY' };
  const projected = nodes.map((node) => {
    const delta = sub(node, origin);
    return { x: dot(delta, e1), y: dot(delta, e2), d: dot(delta, normal) };
  });
  const lengths = [0, 1, 2, 3].map((i) => distance(nodes[i], nodes[(i + 1) % 4]));
  const characteristicLength = Math.max(1e-12, ...lengths);
  const maxWarpRatio = Math.max(...projected.map((point) => Math.abs(point.d))) / characteristicLength;
  return { ok: true, origin, e1, e2, normal, projected, characteristicLength, maxWarpRatio };
}

export function planeStressMatrix(E, nu) {
  const scale = E / (1 - nu * nu);
  return [
    [scale, scale * nu, 0],
    [scale * nu, scale, 0],
    [0, 0, scale * (1 - nu) / 2],
  ];
}

export function plateBendingMatrix(E, nu, thickness) {
  return scaleMatrix(planeStressMatrix(E, nu), thickness ** 3 / 12);
}

export function qm6MembraneLocal(projected, E, nu, thickness) {
  const D = planeStressMatrix(E, nu);
  const Kuu = zeros(8, 8);
  const Kua = zeros(8, 4);
  const Kaa = zeros(4, 4);
  for (const xi of GAUSS) for (const eta of GAUSS) {
    const shape = q4Shape(projected, xi, eta);
    if (!shape.ok) return shape;
    const B = membraneB(shape.dNdx, shape.dNdy);
    const Ba = incompatibleB(shape.inverseJacobian, xi, eta);
    addProduct(Kuu, B, D, B, thickness * shape.detJ);
    addMixedProduct(Kua, B, D, Ba, thickness * shape.detJ);
    addProduct(Kaa, Ba, D, Ba, thickness * shape.detJ);
  }
  const inverse = invert(Kaa);
  if (!inverse) return { ok: false, reason: 'SHELL_INTERNAL_MODE_CONDENSATION_FAILED' };
  const correction = multiply(multiply(Kua, inverse), transpose(Kua));
  return { ok: true, matrix: subtractMatrices(Kuu, correction), internalModeCount: 4, D };
}

export function dkqPlateLocal(projected, E, nu, thickness, shearFactor = 5 / 6) {
  const Db = plateBendingMatrix(E, nu, thickness);
  const K = zeros(12, 12);
  for (const xi of GAUSS) for (const eta of GAUSS) {
    const shape = q4Shape(projected, xi, eta);
    if (!shape.ok) return shape;
    const B = bendingB(shape.dNdx, shape.dNdy);
    addProduct(K, B, Db, B, shape.detJ);
  }
  const G = E / (2 * (1 + nu));
  const Ds = [[shearFactor * G * thickness, 0], [0, shearFactor * G * thickness]];
  const reducedShear = zeros(12, 12);
  const fullShear = zeros(12, 12);
  const center = q4Shape(projected, 0, 0);
  if (!center.ok) return center;
  addProduct(reducedShear, shearB(center.N, center.dNdx, center.dNdy), Ds, shearB(center.N, center.dNdx, center.dNdy), center.detJ * 4);
  for (const xi of GAUSS) for (const eta of GAUSS) {
    const shape = q4Shape(projected, xi, eta);
    if (!shape.ok) return shape;
    const Bs = shearB(shape.N, shape.dNdx, shape.dNdy);
    addProduct(fullShear, Bs, Ds, Bs, shape.detJ);
  }
  const stabilization = 0.415;
  for (let i = 0; i < 12; i += 1) for (let j = 0; j < 12; j += 1) {
    K[i][j] += reducedShear[i][j] + stabilization * (fullShear[i][j] - reducedShear[i][j]);
  }
  const bendingScale = Math.max(1, maxAbs(K));
  for (let node = 0; node < 4; node += 1) K[node * 3][node * 3] += bendingScale * 1e-10;
  return { ok: true, matrix: K, Db, integration: 'discrete-kirchhoff-compatible-assumed-shear', shearStabilization: stabilization };
}

export function embedMembrane24(local, frame, drillingAlpha = 1e-5) {
  const T = zeros(8, 24);
  for (let node = 0; node < 4; node += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      T[node * 2][node * 6 + axis] = frame.e1[axis];
      T[node * 2 + 1][node * 6 + axis] = frame.e2[axis];
    }
  }
  const global = multiply(transpose(T), multiply(local, T));
  const kref = Math.max(1, maxAbs(local));
  for (let node = 0; node < 4; node += 1) {
    for (let a = 0; a < 3; a += 1) for (let b = 0; b < 3; b += 1) {
      global[node * 6 + 3 + a][node * 6 + 3 + b] += drillingAlpha * kref * frame.normal[a] * frame.normal[b];
    }
  }
  return { matrix: global, transform: T, drillingStiffness: drillingAlpha * kref };
}

export function embedPlate24(local, frame) {
  const T = zeros(12, 24);
  for (let node = 0; node < 4; node += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      T[node * 3][node * 6 + axis] = frame.normal[axis];
      T[node * 3 + 1][node * 6 + 3 + axis] = frame.e1[axis];
      T[node * 3 + 2][node * 6 + 3 + axis] = frame.e2[axis];
    }
  }
  return { matrix: multiply(transpose(T), multiply(local, T)), transform: T };
}

export function q4Shape(projected, xi, eta) {
  const N = [
    (1 - xi) * (1 - eta) / 4,
    (1 + xi) * (1 - eta) / 4,
    (1 + xi) * (1 + eta) / 4,
    (1 - xi) * (1 + eta) / 4,
  ];
  const dXi = [-(1 - eta) / 4, (1 - eta) / 4, (1 + eta) / 4, -(1 + eta) / 4];
  const dEta = [-(1 - xi) / 4, -(1 + xi) / 4, (1 + xi) / 4, (1 - xi) / 4];
  const J = [[0, 0], [0, 0]];
  for (let i = 0; i < 4; i += 1) {
    J[0][0] += dXi[i] * projected[i].x; J[0][1] += dXi[i] * projected[i].y;
    J[1][0] += dEta[i] * projected[i].x; J[1][1] += dEta[i] * projected[i].y;
  }
  const detJ = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  if (!(detJ > 1e-14)) return { ok: false, reason: 'SHELL_JACOBIAN_NONPOSITIVE', detJ };
  const inverseJacobian = [[J[1][1] / detJ, -J[0][1] / detJ], [-J[1][0] / detJ, J[0][0] / detJ]];
  const dNdx = []; const dNdy = [];
  for (let i = 0; i < 4; i += 1) {
    dNdx[i] = inverseJacobian[0][0] * dXi[i] + inverseJacobian[0][1] * dEta[i];
    dNdy[i] = inverseJacobian[1][0] * dXi[i] + inverseJacobian[1][1] * dEta[i];
  }
  return { ok: true, N, dNdx, dNdy, detJ, inverseJacobian };
}

export function recoverMembraneStress(projected, localDisplacements, E, nu, xi = 0, eta = 0) {
  const shape = q4Shape(projected, xi, eta);
  if (!shape.ok) return shape;
  const strain = multiplyVector(membraneB(shape.dNdx, shape.dNdy), localDisplacements);
  const stress = multiplyVector(planeStressMatrix(E, nu), strain);
  return { ok: true, strain: { ex: strain[0], ey: strain[1], gxy: strain[2] }, stress: { sx: stress[0], sy: stress[1], txy: stress[2] } };
}

export function pressureLoad24(frame, area, pressure) {
  const load = new Array(24).fill(0);
  for (let node = 0; node < 4; node += 1) for (let axis = 0; axis < 3; axis += 1) {
    load[node * 6 + axis] = frame.normal[axis] * pressure * area / 4;
  }
  return load;
}

export function removeRigidBodyEnergy24(matrix, nodes = []) {
  if (nodes.length !== 4) return matrix;
  const origin = average(nodes);
  const R = zeros(24, 6);
  for (let node = 0; node < 4; node += 1) {
    const position = sub(nodes[node], origin);
    for (let axis = 0; axis < 3; axis += 1) R[node * 6 + axis][axis] = 1;
    const rotationalTranslations = [cross([1, 0, 0], position), cross([0, 1, 0], position), cross([0, 0, 1], position)];
    for (let rotation = 0; rotation < 3; rotation += 1) {
      for (let axis = 0; axis < 3; axis += 1) R[node * 6 + axis][3 + rotation] = rotationalTranslations[rotation][axis];
      R[node * 6 + 3 + rotation][3 + rotation] = 1;
    }
  }
  const gramInverse = invert(multiply(transpose(R), R));
  if (!gramInverse) return matrix;
  const projectionPart = multiply(multiply(R, gramInverse), transpose(R));
  const P = zeros(24, 24);
  for (let i = 0; i < 24; i += 1) for (let j = 0; j < 24; j += 1) P[i][j] = (i === j ? 1 : 0) - projectionPart[i][j];
  return multiply(transpose(P), multiply(matrix, P));
}

export function quadAreaInPlane(projected) {
  let twice = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = projected[i]; const b = projected[(i + 1) % 4];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

export function zeros(rows, columns) { return Array.from({ length: rows }, () => new Array(columns).fill(0)); }
export function transpose(A) { return A[0].map((_, j) => A.map((row) => row[j])); }
export function multiply(A, B) {
  const out = zeros(A.length, B[0].length);
  for (let i = 0; i < A.length; i += 1) for (let k = 0; k < B.length; k += 1) {
    const value = A[i][k]; if (value === 0) continue;
    for (let j = 0; j < B[0].length; j += 1) out[i][j] += value * B[k][j];
  }
  return out;
}
export function multiplyVector(A, vector) { return A.map((row) => row.reduce((sum, value, index) => sum + value * (vector[index] || 0), 0)); }
export function addMatrices(A, B) { return A.map((row, i) => row.map((value, j) => value + B[i][j])); }
export function maxAbs(A) { return Math.max(0, ...A.flat().map((value) => Math.abs(value))); }
export function symmetryError(A) {
  let error = 0; for (let i = 0; i < A.length; i += 1) for (let j = 0; j < A.length; j += 1) error = Math.max(error, Math.abs(A[i][j] - A[j][i]));
  return error / Math.max(1, maxAbs(A));
}

function membraneB(dx, dy) {
  const B = zeros(3, 8);
  for (let i = 0; i < 4; i += 1) { B[0][i * 2] = dx[i]; B[1][i * 2 + 1] = dy[i]; B[2][i * 2] = dy[i]; B[2][i * 2 + 1] = dx[i]; }
  return B;
}
function incompatibleB(invJ, xi, eta) {
  const gradients = [[-2 * xi, 0], [0, -2 * eta]].map(([a, b]) => [invJ[0][0] * a + invJ[0][1] * b, invJ[1][0] * a + invJ[1][1] * b]);
  const B = zeros(3, 4);
  for (let i = 0; i < 2; i += 1) { B[0][i] = gradients[i][0]; B[2][i] = gradients[i][1]; B[1][i + 2] = gradients[i][1]; B[2][i + 2] = gradients[i][0]; }
  return B;
}
function bendingB(dx, dy) {
  const B = zeros(3, 12);
  for (let i = 0; i < 4; i += 1) { B[0][i * 3 + 1] = dx[i]; B[1][i * 3 + 2] = dy[i]; B[2][i * 3 + 1] = dy[i]; B[2][i * 3 + 2] = dx[i]; }
  return B;
}
function shearB(N, dx, dy) {
  const B = zeros(2, 12);
  for (let i = 0; i < 4; i += 1) { B[0][i * 3] = dx[i]; B[0][i * 3 + 2] = -N[i]; B[1][i * 3] = dy[i]; B[1][i * 3 + 1] = N[i]; }
  return B;
}
function addProduct(target, B, D, right, scale) {
  const value = multiply(transpose(B), multiply(D, right));
  for (let i = 0; i < target.length; i += 1) for (let j = 0; j < target[0].length; j += 1) target[i][j] += value[i][j] * scale;
}
function addMixedProduct(target, left, D, right, scale) { addProduct(target, left, D, right, scale); }
function subtractMatrices(A, B) { return A.map((row, i) => row.map((value, j) => value - B[i][j])); }
function scaleMatrix(A, scale) { return A.map((row) => row.map((value) => value * scale)); }
function invert(A) {
  const n = A.length; const augmented = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col; for (let row = col + 1; row < n; row += 1) if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row;
    if (Math.abs(augmented[pivot][col]) < 1e-14) return null;
    [augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]];
    const divisor = augmented[col][col]; for (let j = 0; j < 2 * n; j += 1) augmented[col][j] /= divisor;
    for (let row = 0; row < n; row += 1) if (row !== col) { const factor = augmented[row][col]; for (let j = 0; j < 2 * n; j += 1) augmented[row][j] -= factor * augmented[col][j]; }
  }
  return augmented.map((row) => row.slice(n));
}
function average(nodes) { return [0, 1, 2].map((axis) => nodes.reduce((sum, node) => sum + coordinate(node, axis), 0) / nodes.length); }
function coordinate(node, axis) { return Number((Array.isArray(node) ? node[axis] : node[['x', 'y', 'z'][axis]]) || 0); }
function sub(a, b) { return [0, 1, 2].map((axis) => coordinate(a, axis) - coordinate(b, axis)); }
function dot(a, b) { return a.reduce((sum, value, index) => sum + value * b[index], 0); }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function unit(vector) { const length = Math.hypot(...vector); return length > 1e-14 ? vector.map((value) => value / length) : [NaN, NaN, NaN]; }
function finiteVector(vector) { return vector.every(Number.isFinite); }
function distance(a, b) { return Math.hypot(...sub(a, b)); }
