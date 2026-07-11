export const RESULT_DIMENSION_CONTRACT_VERSION = 'p7-m0-result-dimensions-v1';

export const RESULT_DIMENSIONS = Object.freeze({
  displacement: 'length',
  rotation: 'rotation',
  reaction: 'force',
  baseShear: 'force',
  storyShear: 'force',
  axialForce: 'force',
  memberForce: 'force',
  moment: 'moment',
  overturningMoment: 'moment',
  mass: 'mass',
  acceleration: 'acceleration',
  period: 'time',
  frequency: 'frequency',
  ratio: 'dimensionless',
});

export const RESULT_DIMENSION_ENUM = Object.freeze([...new Set(Object.values(RESULT_DIMENSIONS))]);
export const RESULT_VALUE_RESERVED_FIELDS = Object.freeze(['value', 'dimension']);
const VALID_RESULT_DIMENSIONS = new Set(RESULT_DIMENSION_ENUM);

export function dimensionedValue(value, dimension, metadata = {}) {
  if (!Number.isFinite(Number(value))) throw new TypeError('Dimensioned result value must be finite.');
  if (!VALID_RESULT_DIMENSIONS.has(dimension)) throw invalidDimensionError(dimension, 'result');
  const safeMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  const { value: _reservedValue, dimension: _reservedDimension, ...rest } = safeMetadata;
  return { ...rest, value: Number(value), dimension };
}

export function assertResultDimension(result, expected, path = 'result') {
  const hasOwn = result != null && Object.prototype.hasOwnProperty.call(result, 'dimension');
  const actual = hasOwn ? result.dimension : null;
  if (!VALID_RESULT_DIMENSIONS.has(actual)) throw invalidDimensionError(actual, path);
  if (!VALID_RESULT_DIMENSIONS.has(expected)) throw invalidDimensionError(expected, `${path}.expected`);
  if (actual !== expected) {
    const error = new TypeError(`${path} must have dimension ${expected}; received ${actual || 'undeclared'}.`);
    error.code = 'RESULT_DIMENSION_MISMATCH';
    error.path = path;
    error.expected = expected;
    error.actual = actual || null;
    throw error;
  }
  if (!Number.isFinite(Number(result?.value))) {
    const error = new TypeError(`${path} must contain a finite value.`);
    error.code = 'RESULT_VALUE_INVALID';
    error.path = path;
    throw error;
  }
  return Number(result.value);
}

export function requireForceResult(result, path = 'result') {
  return assertResultDimension(result, 'force', path);
}

function invalidDimensionError(dimension, path) {
  const error = new TypeError(`${path} has unsupported result dimension ${dimension || 'undeclared'}.`);
  error.code = 'RESULT_DIMENSION_INVALID';
  error.path = path;
  error.actual = dimension || null;
  return error;
}
