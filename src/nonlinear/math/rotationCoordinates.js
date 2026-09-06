import {
  jetAdd,
  jetConstant,
  jetCos,
  jetDiv,
  jetMul,
  jetScale,
  jetSin,
  jetSqrt,
  jetSub,
  jetVariable,
} from './secondOrderJet.js';

export const ROTATION_COORDINATE_VERSION = 'p8-m3-rotation-coordinate-v1';
export const ROTATION_VECTOR_LIMIT = Math.PI - 1e-4;

export function requirePrincipalRotationVector(values, name = 'rotationVector') {
  const vector = finiteVector(values, name);
  const angle = Math.hypot(...vector);
  if (!(angle < ROTATION_VECTOR_LIMIT)) {
    const error = new RangeError(`${name} magnitude ${angle} reached the principal rotation-vector limit.`);
    error.code = 'ROTATION_VECTOR_BRANCH_LIMIT';
    throw error;
  }
  return vector;
}

export function pullBackSpatialMoment(rotationVector, spatialMoment) {
  const rotation = requirePrincipalRotationVector(rotationVector);
  const moment = finiteVector(spatialMoment, 'spatialMoment');
  const variables = rotation.map((value, index) => jetVariable(value, index, 3));
  const transposeJacobian = leftJacobianTransposeJets(variables);
  const generalizedJets = transposeJacobian.map((row) => row.reduce(
    (sum, value, index) => jetAdd(sum, jetScale(value, moment[index])),
    jetConstant(0, 3),
  ));
  return {
    version: ROTATION_COORDINATE_VERSION,
    generalized: generalizedJets.map((value) => value.value),
    tangent: generalizedJets.map((value) => Array.from(value.gradient)),
    spatial: moment,
    rotation,
  };
}

export function pushForwardGeneralizedMoment(rotationVector, generalizedMoment) {
  const rotation = requirePrincipalRotationVector(rotationVector);
  const generalized = finiteVector(generalizedMoment, 'generalizedMoment');
  const transposeJacobian = leftJacobianTransposeNumeric(rotation);
  const spatial = solve3x3(transposeJacobian, generalized);
  if (!spatial) {
    const error = new Error('Rotation-coordinate moment transform is singular.');
    error.code = 'ROTATION_MOMENT_TRANSFORM_SINGULAR';
    throw error;
  }
  return spatial;
}

export function spatialRotationIncrementToCoordinates(rotationVector, spatialIncrement) {
  const rotation = requirePrincipalRotationVector(rotationVector);
  const increment = finiteVector(spatialIncrement, 'spatialIncrement');
  const transposeJacobian = leftJacobianTransposeNumeric(rotation);
  const leftJacobian = transposeJacobian[0].map((_value, column) => transposeJacobian.map((row) => row[column]));
  const coordinates = solve3x3(leftJacobian, increment);
  if (!coordinates) {
    const error = new Error('Spatial rotation increment cannot be mapped to rotation coordinates.');
    error.code = 'ROTATION_INCREMENT_TRANSFORM_SINGULAR';
    throw error;
  }
  return coordinates;
}

export function rotationCoordinateIncrementToSpatial(rotationVector, coordinateIncrement) {
  const rotation = requirePrincipalRotationVector(rotationVector);
  const increment = finiteVector(coordinateIncrement, 'coordinateIncrement');
  const transposeJacobian = leftJacobianTransposeNumeric(rotation);
  const leftJacobian = transposeJacobian[0].map((_value, column) => transposeJacobian.map((row) => row[column]));
  const spatial = leftJacobian.map((row) => row.reduce(
    (sum, value, index) => sum + value * increment[index],
    0,
  ));
  if (spatial.some((value) => !Number.isFinite(value))) {
    const error = new Error('Rotation-coordinate increment cannot be mapped to a spatial rotation.');
    error.code = 'ROTATION_COORDINATE_INCREMENT_NONFINITE';
    throw error;
  }
  return spatial;
}

function leftJacobianTransposeJets(rotation) {
  const size = rotation[0].size;
  const zero = () => jetConstant(0, size);
  const one = () => jetConstant(1, size);
  const skew = [
    [zero(), jetScale(rotation[2], -1), rotation[1]],
    [rotation[2], zero(), jetScale(rotation[0], -1)],
    [jetScale(rotation[1], -1), rotation[0], zero()],
  ];
  const angle2 = rotation.reduce((sum, value) => jetAdd(sum, jetMul(value, value)), zero());
  let a;
  let b;
  if (angle2.value < 1e-8) {
    const angle4 = jetMul(angle2, angle2);
    const angle6 = jetMul(angle4, angle2);
    a = jetAdd(
      jetAdd(jetConstant(0.5, size), jetScale(angle2, -1 / 24)),
      jetAdd(jetScale(angle4, 1 / 720), jetScale(angle6, -1 / 40320)),
    );
    b = jetAdd(
      jetAdd(jetConstant(1 / 6, size), jetScale(angle2, -1 / 120)),
      jetAdd(jetScale(angle4, 1 / 5040), jetScale(angle6, -1 / 362880)),
    );
  } else {
    const angle = jetSqrt(angle2);
    a = jetDiv(jetSub(one(), jetCos(angle)), angle2);
    b = jetDiv(jetSub(angle, jetSin(angle)), jetMul(angle2, angle));
  }
  const skew2 = multiplyJetMatrices(skew, skew);
  return skew.map((row, i) => row.map((value, j) => jetAdd(
    jetConstant(i === j ? 1 : 0, size),
    jetAdd(jetScale(jetMul(a, value), -1), jetMul(b, skew2[i][j])),
  )));
}

function leftJacobianTransposeNumeric(rotation) {
  const [x, y, z] = rotation;
  const angle2 = x * x + y * y + z * z;
  let a;
  let b;
  if (angle2 < 1e-8) {
    const angle4 = angle2 * angle2;
    const angle6 = angle4 * angle2;
    a = 0.5 - angle2 / 24 + angle4 / 720 - angle6 / 40320;
    b = 1 / 6 - angle2 / 120 + angle4 / 5040 - angle6 / 362880;
  } else {
    const angle = Math.sqrt(angle2);
    a = (1 - Math.cos(angle)) / angle2;
    b = (angle - Math.sin(angle)) / (angle2 * angle);
  }
  const skew = [[0, -z, y], [z, 0, -x], [-y, x, 0]];
  const skew2 = multiplyNumericMatrices(skew, skew);
  return skew.map((row, i) => row.map((value, j) => (i === j ? 1 : 0) - a * value + b * skew2[i][j]));
}

function multiplyJetMatrices(left, right) {
  return left.map((row, i) => right[0].map((_value, j) => row.reduce(
    (sum, value, k) => jetAdd(sum, jetMul(value, right[k][j])),
    jetConstant(0, left[0][0].size),
  )));
}

function multiplyNumericMatrices(left, right) {
  return left.map((row) => right[0].map((_value, column) => row.reduce(
    (sum, value, index) => sum + value * right[index][column],
    0,
  )));
}

function solve3x3(matrix, rhs) {
  const augmented = matrix.map((row, index) => [...row, rhs[index]]);
  for (let pivot = 0; pivot < 3; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row;
    }
    if (!(Math.abs(augmented[best][pivot]) > 1e-14)) return null;
    [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];
    for (let row = pivot + 1; row < 3; row += 1) {
      const factor = augmented[row][pivot] / augmented[pivot][pivot];
      for (let column = pivot; column <= 3; column += 1) augmented[row][column] -= factor * augmented[pivot][column];
    }
  }
  const output = new Array(3).fill(0);
  for (let row = 2; row >= 0; row -= 1) {
    let value = augmented[row][3];
    for (let column = row + 1; column < 3; column += 1) value -= augmented[row][column] * output[column];
    output[row] = value / augmented[row][row];
  }
  return output.every(Number.isFinite) ? output : null;
}

function finiteVector(values, name) {
  if (values == null || values.length !== 3) {
    const error = new RangeError(`${name} must contain three values.`);
    error.code = 'ROTATION_VECTOR_SIZE_INVALID';
    throw error;
  }
  return Array.from(values, (value, index) => {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      const error = new TypeError(`${name}[${index}] must be finite.`);
      error.code = 'ROTATION_VECTOR_NONFINITE';
      throw error;
    }
    return number;
  });
}
