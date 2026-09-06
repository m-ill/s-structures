export const SECOND_ORDER_JET_VERSION = 'p8-m3-second-order-jet-v1';

export function jetConstant(value, size) {
  return createJet(finite(value, 'constant'), size);
}

export function jetVariable(value, index, size) {
  if (!Number.isInteger(index) || index < 0 || index >= size) {
    throw jetError('JET_VARIABLE_INDEX_INVALID', `Variable index ${index} is outside 0..${size - 1}.`);
  }
  const out = createJet(finite(value, 'variable'), size);
  out.gradient[index] = 1;
  return finishJet(out);
}

export function jetAdd(left, right) {
  requirePair(left, right);
  const out = createJet(left.value + right.value, left.size);
  for (let i = 0; i < left.size; i += 1) out.gradient[i] = left.gradient[i] + right.gradient[i];
  for (let i = 0; i < left.hessian.length; i += 1) out.hessian[i] = left.hessian[i] + right.hessian[i];
  return finishJet(out);
}

export function jetSub(left, right) {
  return jetAdd(left, jetScale(right, -1));
}

export function jetScale(input, scalar) {
  requireJet(input);
  const factor = finite(scalar, 'scale');
  const out = createJet(input.value * factor, input.size);
  for (let i = 0; i < input.size; i += 1) out.gradient[i] = input.gradient[i] * factor;
  for (let i = 0; i < input.hessian.length; i += 1) out.hessian[i] = input.hessian[i] * factor;
  return finishJet(out);
}

export function jetMul(left, right) {
  requirePair(left, right);
  const n = left.size;
  const out = createJet(left.value * right.value, n);
  for (let i = 0; i < n; i += 1) {
    out.gradient[i] = left.gradient[i] * right.value + right.gradient[i] * left.value;
  }
  for (let row = 0; row < n; row += 1) {
    for (let column = 0; column < n; column += 1) {
      const index = row * n + column;
      out.hessian[index] = left.hessian[index] * right.value
        + right.hessian[index] * left.value
        + left.gradient[row] * right.gradient[column]
        + right.gradient[row] * left.gradient[column];
    }
  }
  return finishJet(out);
}

export function jetDiv(numerator, denominator) {
  return jetMul(numerator, jetReciprocal(denominator));
}

export function jetReciprocal(input) {
  requireJet(input);
  if (input.value === 0) throw jetError('JET_DIVISION_BY_ZERO', 'Jet denominator is zero.');
  const inverse = 1 / input.value;
  return jetUnary(input, inverse, -inverse * inverse, 2 * inverse * inverse * inverse);
}

export function jetSqrt(input) {
  requireJet(input);
  if (!(input.value > 0)) throw jetError('JET_SQRT_DOMAIN', `Jet square root requires a positive value; received ${input.value}.`);
  const root = Math.sqrt(input.value);
  return jetUnary(input, root, 1 / (2 * root), -1 / (4 * root ** 3));
}

export function jetSin(input) {
  requireJet(input);
  return jetUnary(input, Math.sin(input.value), Math.cos(input.value), -Math.sin(input.value));
}

export function jetCos(input) {
  requireJet(input);
  return jetUnary(input, Math.cos(input.value), -Math.sin(input.value), -Math.cos(input.value));
}

export function jetAtan2(y, x) {
  requirePair(y, x);
  const n = y.size;
  if (x.value === 0 && y.value === 0) throw jetError('JET_ATAN2_DOMAIN', 'Jet atan2 is undefined at the origin.');
  const scale = Math.max(Math.abs(x.value), Math.abs(y.value));
  const scaledX = x.value / scale;
  const scaledY = y.value / scale;
  const scaledRadius2 = scaledX * scaledX + scaledY * scaledY;
  const inverseScale = 1 / scale;
  const inverseScale2 = inverseScale * inverseScale;
  if (!Number.isFinite(inverseScale2)) {
    throw jetError('JET_DERIVATIVE_OVERFLOW', 'Jet atan2 derivatives exceed the finite numeric range.');
  }
  const scaledRadius4 = scaledRadius2 * scaledRadius2;
  const fy = scaledX * inverseScale / scaledRadius2;
  const fx = -scaledY * inverseScale / scaledRadius2;
  const fyy = -2 * scaledX * scaledY * inverseScale2 / scaledRadius4;
  const fxx = 2 * scaledX * scaledY * inverseScale2 / scaledRadius4;
  const fyx = (scaledY * scaledY - scaledX * scaledX) * inverseScale2 / scaledRadius4;
  const out = createJet(Math.atan2(y.value, x.value), n);
  for (let i = 0; i < n; i += 1) out.gradient[i] = fy * y.gradient[i] + fx * x.gradient[i];
  for (let row = 0; row < n; row += 1) {
    for (let column = 0; column < n; column += 1) {
      const index = row * n + column;
      out.hessian[index] = fy * y.hessian[index]
        + fx * x.hessian[index]
        + fyy * y.gradient[row] * y.gradient[column]
        + fxx * x.gradient[row] * x.gradient[column]
        + fyx * (
          y.gradient[row] * x.gradient[column]
          + x.gradient[row] * y.gradient[column]
        );
    }
  }
  return finishJet(out);
}

export function jetValue(input) {
  requireJet(input);
  return input.value;
}

export function isSecondOrderJet(input) {
  return input?.version === SECOND_ORDER_JET_VERSION
    && Number.isInteger(input.size)
    && input.size > 0
    && Number.isFinite(input.value)
    && input.gradient instanceof Float64Array
    && input.gradient.length === input.size
    && Array.from(input.gradient).every(Number.isFinite)
    && input.hessian instanceof Float64Array
    && input.hessian.length === input.size * input.size
    && Array.from(input.hessian).every(Number.isFinite);
}

function jetUnary(input, value, first, second) {
  const n = input.size;
  const out = createJet(value, n);
  for (let i = 0; i < n; i += 1) out.gradient[i] = first * input.gradient[i];
  for (let row = 0; row < n; row += 1) {
    for (let column = 0; column < n; column += 1) {
      const index = row * n + column;
      out.hessian[index] = first * input.hessian[index]
        + second * input.gradient[row] * input.gradient[column];
    }
  }
  return finishJet(out);
}

function finishJet(input) {
  if (
    !Number.isFinite(input.value)
    || !Array.from(input.gradient).every(Number.isFinite)
    || !Array.from(input.hessian).every(Number.isFinite)
  ) {
    throw jetError('JET_DERIVATIVE_NONFINITE', 'Jet operation produced a non-finite value or derivative.');
  }
  return input;
}

function createJet(value, size) {
  if (!Number.isInteger(size) || size < 1) throw jetError('JET_SIZE_INVALID', 'Jet size must be a positive integer.');
  return {
    version: SECOND_ORDER_JET_VERSION,
    size,
    value: finite(value, 'result'),
    gradient: new Float64Array(size),
    hessian: new Float64Array(size * size),
  };
}

function requireJet(input) {
  if (!isSecondOrderJet(input)) throw jetError('JET_CONTRACT_INVALID', 'A second-order jet is required.');
}

function requirePair(left, right) {
  requireJet(left);
  requireJet(right);
  if (left.size !== right.size) throw jetError('JET_SIZE_MISMATCH', 'Jet operands must have the same size.');
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw jetError('JET_VALUE_NONFINITE', `${name} must be finite.`);
  return number;
}

function jetError(code, message) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}
