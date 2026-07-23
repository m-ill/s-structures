export const SHELL_ELEMENT_MATH_VERSION = 'p10-m9-shell-element-math-v3-mitc4-qm6-eas';

export const MITC4_FORMULATION = Object.freeze({
  name: 'MITC4',
  dofOrder: Object.freeze(['w', 'rx', 'ry']),
  shearFactor: 5 / 6,
  reference: Object.freeze({
    authors: 'K.J. Bathe and E.N. Dvorkin',
    year: 1985,
    doi: '10.1002/nme.1620210213',
  }),
});

export const QM6_FORMULATION = Object.freeze({
  name: 'QM6-EAS',
  enhancedModeCount: 4,
  mapping: 'center-jacobian-determinant-scaled',
  reference: Object.freeze({
    authors: 'J.C. Simo and M.S. Rifai',
    year: 1990,
    doi: '10.1002/nme.1620290802',
  }),
});

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
  const center = q4Shape(projected, 0, 0);
  if (!center.ok) return center;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    .map(([xi, eta]) => q4Shape(projected, xi, eta));
  const invalidCorner = corners.find((shape) => !shape.ok);
  if (invalidCorner) return { ...invalidCorner, reason: 'SHELL_CORNER_JACOBIAN_NONPOSITIVE' };
  for (const xi of GAUSS) for (const eta of GAUSS) {
    const shape = q4Shape(projected, xi, eta);
    if (!shape.ok) return shape;
    const B = membraneB(shape.dNdx, shape.dNdy);
    // The enhanced modes are mapped with the element-center Jacobian and the
    // det(J0)/det(J) factor. This makes their weighted mean zero, preserving an
    // affine constant-strain field on distorted bilinear quadrilaterals.
    const Ba = incompatibleB(
      center.inverseJacobian,
      xi,
      eta,
      center.detJ / shape.detJ,
    );
    addProduct(Kuu, B, D, B, thickness * shape.detJ);
    addMixedProduct(Kua, B, D, Ba, thickness * shape.detJ);
    addProduct(Kaa, Ba, D, Ba, thickness * shape.detJ);
  }
  const inverse = invert(Kaa);
  if (!inverse) return { ok: false, reason: 'SHELL_INTERNAL_MODE_CONDENSATION_FAILED' };
  const correction = multiply(multiply(Kua, inverse), transpose(Kua));
  const internalDisplacementOperator = scaleMatrix(multiply(inverse, transpose(Kua)), -1);
  const cornerDeterminants = corners.map((shape) => shape.detJ);
  return {
    ok: true,
    matrix: subtractMatrices(Kuu, correction),
    internalModeCount: QM6_FORMULATION.enhancedModeCount,
    formulation: QM6_FORMULATION.name,
    enhancedStrainMapping: QM6_FORMULATION.mapping,
    internalDisplacementOperator,
    jacobianQuality: {
      minCornerDetJ: Math.min(...cornerDeterminants),
      maxCornerDetJ: Math.max(...cornerDeterminants),
      minMaxRatio: Math.min(...cornerDeterminants) / Math.max(...cornerDeterminants),
    },
    reference: QM6_FORMULATION.reference,
    D,
  };
}

// Four-node mixed-interpolation plate kernel following Bathe-Dvorkin (1985),
// DOI 10.1002/nme.1620210213. Rotations are physical local-frame rotations:
// [w, rx, ry], kappa=[ry,x, -rx,y, ry,y-rx,x],
// gamma=[w,x+ry, w,y-rx].
export function mitc4PlateLocal(projected, E, nu, thickness, shearFactor = MITC4_FORMULATION.shearFactor) {
  const Db = plateBendingMatrix(E, nu, thickness);
  const K = zeros(12, 12);
  const G = E / (2 * (1 + nu));
  const Ds = [[shearFactor * G * thickness, 0], [0, shearFactor * G * thickness]];

  for (const xi of GAUSS) for (const eta of GAUSS) {
    const shape = q4Shape(projected, xi, eta);
    if (!shape.ok) return shape;
    const Bb = mitc4BendingB(shape.dNdx, shape.dNdy);
    const Bs = mitc4ShearB(projected, shape, xi, eta);
    if (!Bs.ok) return Bs;
    addProduct(K, Bb, Db, Bb, shape.detJ);
    addProduct(K, Bs.matrix, Ds, Bs.matrix, shape.detJ);
  }

  return {
    ok: true,
    matrix: K,
    Db,
    Ds,
    formulation: MITC4_FORMULATION.name,
    integration: 'mitc4-mixed-covariant-shear-2x2',
    shearFactor,
    reference: MITC4_FORMULATION.reference,
  };
}

// Compatibility alias retained while callers migrate from the former DKQ label.
export function dkqPlateLocal(projected, E, nu, thickness, shearFactor = MITC4_FORMULATION.shearFactor) {
  return mitc4PlateLocal(projected, E, nu, thickness, shearFactor);
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
  return {
    ok: true,
    N,
    dNdx,
    dNdy,
    dNdxi: dXi,
    dNdeta: dEta,
    jacobian: J,
    detJ,
    inverseJacobian,
  };
}

export function recoverMembraneStress(projected, localDisplacements, E, nu, xi = 0, eta = 0, options = {}) {
  const shape = q4Shape(projected, xi, eta);
  if (!shape.ok) return shape;
  const strain = multiplyVector(membraneB(shape.dNdx, shape.dNdy), localDisplacements);
  let enhancedParameters = null;
  if (options.internalDisplacementOperator) {
    const center = q4Shape(projected, 0, 0);
    if (!center.ok) return center;
    enhancedParameters = multiplyVector(options.internalDisplacementOperator, localDisplacements);
    const enhanced = multiplyVector(incompatibleB(
      center.inverseJacobian,
      xi,
      eta,
      center.detJ / shape.detJ,
    ), enhancedParameters);
    for (let component = 0; component < strain.length; component += 1) strain[component] += enhanced[component];
  }
  const stress = multiplyVector(planeStressMatrix(E, nu), strain);
  return {
    ok: true,
    strain: { ex: strain[0], ey: strain[1], gxy: strain[2] },
    stress: { sx: stress[0], sy: stress[1], txy: stress[2] },
    enhancedParameters,
  };
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
function incompatibleB(invJ, xi, eta, scale = 1) {
  const gradients = [[-2 * xi, 0], [0, -2 * eta]].map(([a, b]) => [invJ[0][0] * a + invJ[0][1] * b, invJ[1][0] * a + invJ[1][1] * b]);
  const B = zeros(3, 4);
  for (let i = 0; i < 2; i += 1) { B[0][i] = gradients[i][0]; B[2][i] = gradients[i][1]; B[1][i + 2] = gradients[i][1]; B[2][i + 2] = gradients[i][0]; }
  for (let row = 0; row < B.length; row += 1) for (let column = 0; column < B[row].length; column += 1) B[row][column] *= scale;
  return B;
}
function mitc4BendingB(dx, dy) {
  const B = zeros(3, 12);
  for (let i = 0; i < 4; i += 1) {
    B[0][i * 3 + 2] = dx[i];
    B[1][i * 3 + 1] = -dy[i];
    B[2][i * 3 + 1] = -dx[i];
    B[2][i * 3 + 2] = dy[i];
  }
  return B;
}

function mitc4ShearB(projected, shape, xi, eta) {
  const xiBottom = q4Shape(projected, 0, -1);
  if (!xiBottom.ok) return xiBottom;
  const xiTop = q4Shape(projected, 0, 1);
  if (!xiTop.ok) return xiTop;
  const etaLeft = q4Shape(projected, -1, 0);
  if (!etaLeft.ok) return etaLeft;
  const etaRight = q4Shape(projected, 1, 0);
  if (!etaRight.ok) return etaRight;

  const covariant = zeros(2, 12);
  const bottom = covariantShearRow(xiBottom, projected, 'xi');
  const top = covariantShearRow(xiTop, projected, 'xi');
  const left = covariantShearRow(etaLeft, projected, 'eta');
  const right = covariantShearRow(etaRight, projected, 'eta');
  for (let column = 0; column < 12; column += 1) {
    covariant[0][column] = (1 - eta) * bottom[column] / 2 + (1 + eta) * top[column] / 2;
    covariant[1][column] = (1 - xi) * left[column] / 2 + (1 + xi) * right[column] / 2;
  }

  return { ok: true, matrix: multiply(shape.inverseJacobian, covariant) };
}

function covariantShearRow(shape, projected, direction) {
  const row = new Array(12).fill(0);
  const naturalDerivative = direction === 'xi' ? shape.dNdxi : shape.dNdeta;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < 4; i += 1) {
    dx += naturalDerivative[i] * projected[i].x;
    dy += naturalDerivative[i] * projected[i].y;
  }
  for (let i = 0; i < 4; i += 1) {
    row[i * 3] = naturalDerivative[i];
    row[i * 3 + 1] = -dy * shape.N[i];
    row[i * 3 + 2] = dx * shape.N[i];
  }
  return row;
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
