import { stableHash } from '../../core/stableHash.js';
import { combineGroundInfluence } from './massDomain.js';

export const MDOF_GROUND_MOTION_VERSION = 'p8-m8-mdof-ground-motion-v1';
export const GROUND_MOTION_ACCELERATION_UNITS = Object.freeze([
  'm/s2',
  'cm/s2',
  'mm/s2',
  'g',
]);

const STANDARD_GRAVITY = 9.80665;
const UNIT_FACTORS = Object.freeze({
  'm/s2': 1,
  'm/s^2': 1,
  'm/sec2': 1,
  'cm/s2': 0.01,
  'cm/s^2': 0.01,
  gal: 0.01,
  'mm/s2': 0.001,
  'mm/s^2': 0.001,
  g: STANDARD_GRAVITY,
});

export function parseMdofGroundMotionText(text = '', options = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    throw motionError('GROUND_MOTION_TEXT_REQUIRED', 'Ground-motion text is required.');
  }
  const dt = positive(options.dt, 'dt');
  const unit = normalizeUnit(options.unit);
  const tokens = tokenize(text);
  if (!tokens.length) throw motionError('GROUND_MOTION_POINTS_REQUIRED', 'Ground-motion text contains no acceleration points.');
  const values = tokens.map((token, index) => strictNumber(token, `token[${index}]`));
  return createMdofGroundMotionRecord({
    ...options,
    values,
    dt,
    unit,
    source: options.source || 'text',
  });
}

export function createMdofGroundMotionRecord(input = {}) {
  const id = clean(input.id) || `GM-${stableHash({ values: input.values, dt: input.dt }).slice(0, 12)}`;
  const dt = positive(input.dt, 'dt');
  const unit = normalizeUnit(input.unit);
  const raw = finiteVector(input.values ?? input.accelerations, 'values');
  if (raw.length < 2) throw motionError('GROUND_MOTION_POINT_COUNT_INVALID', 'Ground motion requires at least two points.');
  const unitFactor = UNIT_FACTORS[unit];
  const userScale = finiteOr(input.scale, 1, 'scale');
  if (userScale === 0) throw motionError('GROUND_MOTION_SCALE_ZERO', 'Ground-motion scale must be nonzero.');
  const sign = normalizeSign(input.sign);
  const baseline = normalizeBaseline(input.baseline ?? input.baselineCorrection ?? 'none');
  const converted = raw.map((value) => value * unitFactor * userScale * sign);
  const corrected = correctBaseline(converted, baseline);
  const originalPga = maxAbs(corrected);
  let pgaFactor = 1;
  const targetPga = optionalPositive(input.targetPga, 'targetPga');
  if (targetPga != null) {
    if (!(originalPga > 0)) throw motionError('GROUND_MOTION_PGA_ZERO', 'A zero record cannot be scaled to a target PGA.');
    pgaFactor = targetPga / originalPga;
  }
  const accelerations = Float64Array.from(corrected, (value) => value * pgaFactor);
  const pga = maxAbs(accelerations);
  if (!Number.isFinite(pga)) throw motionError('GROUND_MOTION_VALUE_NONFINITE', 'Ground-motion conversion produced a non-finite value.');
  const core = {
    version: MDOF_GROUND_MOTION_VERSION,
    id,
    dt,
    pointCount: accelerations.length,
    duration: dt * (accelerations.length - 1),
    inputUnit: unit,
    outputUnit: 'm/s2',
    standardGravity: STANDARD_GRAVITY,
    baseline,
    sign,
    userScale,
    pgaScale: pgaFactor,
    targetPga,
    pga,
    accelerations,
    direction: normalizeDirection(input.direction || 'x'),
    interpolation: 'linear',
    scaleMethod: targetPga == null ? 'explicit-factor' : 'target-pga',
    spectrumMatched: false,
    source: input.source || 'array',
  };
  return Object.freeze({
    ...core,
    recordHash: stableHash({
      id,
      dt,
      unit,
      baseline,
      sign,
      userScale,
      pgaFactor,
      direction: core.direction,
      accelerations: Array.from(accelerations),
    }).slice(0, 24),
  });
}

export function buildMdofGroundMotionSet(recordsInput, massDomain, options = {}) {
  const source = Array.isArray(recordsInput) ? recordsInput : [recordsInput];
  if (!source.length || source.some((row) => row == null)) {
    throw motionError('GROUND_MOTION_COMPONENT_REQUIRED', 'At least one ground-motion component is required.');
  }
  const records = source.map((row) => row?.version === MDOF_GROUND_MOTION_VERSION
    ? snapshotGroundMotionRecord(row)
    : typeof row === 'string'
      ? parseMdofGroundMotionText(row, options)
      : createMdofGroundMotionRecord(row));
  const dt = records[0].dt;
  const pointCount = records[0].pointCount;
  for (const record of records) {
    if (Math.abs(record.dt - dt) > 1e-12 * Math.max(1, dt)) {
      throw motionError('GROUND_MOTION_DT_MISMATCH', 'All simultaneous components must use the same time interval.');
    }
    if (record.pointCount !== pointCount) {
      throw motionError('GROUND_MOTION_POINT_COUNT_MISMATCH', 'All simultaneous components must contain the same point count.');
    }
  }
  const influence = records.map((record) => combineGroundInfluence(massDomain, record.direction));
  const exposedRecords = records.map((record) => Object.freeze({
    ...record,
    accelerations: Float64Array.from(record.accelerations),
  }));
  const duration = dt * (pointCount - 1);
  const sample = (timeInput) => {
    const time = finiteOr(timeInput, 0, 'time');
    return Float64Array.from(records, (record) => interpolate(record, time));
  };
  const core = {
    version: MDOF_GROUND_MOTION_VERSION,
    ok: true,
    records: Object.freeze(exposedRecords),
    componentCount: records.length,
    dt,
    pointCount,
    duration,
    influence: Object.freeze(influence),
    sample,
    vectorAt(timeInput) {
      const components = sample(timeInput);
      const vector = new Float64Array(3);
      records.forEach((record, index) => {
        const acceleration = components[index];
        const direction = record.direction;
        for (let axis = 0; axis < 3; axis += 1) vector[axis] += direction[axis] * acceleration;
      });
      return vector;
    },
    effectiveLoadAt(timeInput) {
      const components = sample(timeInput);
      const load = new Float64Array(massDomain.reducedDofCount);
      influence.forEach((entry, index) => {
        const acceleration = components[index];
        for (let dof = 0; dof < load.length; dof += 1) load[dof] -= Number(entry.vector[dof]) * acceleration;
      });
      return load;
    },
  };
  return Object.freeze({
    ...core,
    setHash: stableHash({
      records: records.map((row) => row.recordHash),
      massHash: massDomain.massHash,
      signConvention: 'M*qdd+C*qd+Rint=Pstatic-M*l*ag',
    }).slice(0, 24),
    signConvention: 'relative-coordinate-effective-load-negative-M-influence-ag',
  });
}

function snapshotGroundMotionRecord(record) {
  const id = clean(record.id);
  const dt = positive(record.dt, 'dt');
  const unit = normalizeUnit(record.inputUnit);
  const accelerations = Float64Array.from(finiteVector(record.accelerations, 'accelerations'));
  if (accelerations.length < 2) throw motionError('GROUND_MOTION_POINT_COUNT_INVALID', 'Ground motion requires at least two points.');
  const direction = normalizeDirection(record.direction);
  const baseline = normalizeBaseline(record.baseline);
  const sign = normalizeSign(record.sign);
  const userScale = finiteOr(record.userScale, 1, 'userScale');
  const pgaFactor = finiteOr(record.pgaScale, 1, 'pgaScale');
  const recordHash = stableHash({
    id,
    dt,
    unit,
    baseline,
    sign,
    userScale,
    pgaFactor,
    direction,
    accelerations: Array.from(accelerations),
  }).slice(0, 24);
  if (record.recordHash && record.recordHash !== recordHash) {
    throw motionError('GROUND_MOTION_RECORD_HASH_MISMATCH', `Ground-motion record ${id || '(missing)'} changed after it was created.`, {
      expected: record.recordHash,
      actual: recordHash,
    });
  }
  const pga = maxAbs(accelerations);
  return Object.freeze({
    ...record,
    id,
    dt,
    pointCount: accelerations.length,
    duration: dt * (accelerations.length - 1),
    inputUnit: unit,
    outputUnit: 'm/s2',
    baseline,
    sign,
    userScale,
    pgaScale: pgaFactor,
    pga,
    accelerations,
    direction,
    recordHash,
  });
}

function interpolate(record, timeInput) {
  const time = Math.min(record.duration, Math.max(0, Number(timeInput)));
  const position = time / record.dt;
  const left = Math.min(record.pointCount - 1, Math.floor(position));
  const right = Math.min(record.pointCount - 1, left + 1);
  const fraction = right === left ? 0 : position - left;
  return Number(record.accelerations[left]) * (1 - fraction) + Number(record.accelerations[right]) * fraction;
}

function correctBaseline(values, policy) {
  if (policy === 'none') return values.slice();
  if (policy === 'mean') {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return values.map((value) => value - mean);
  }
  const first = values[0];
  const slope = (values.at(-1) - first) / Math.max(1, values.length - 1);
  return values.map((value, index) => value - (first + slope * index));
}

function tokenize(text) {
  return text
    .split(/\r?\n/)
    .flatMap((line) => line.replace(/[#;].*$/, '').trim().split(/[\s,]+/))
    .filter(Boolean);
}

function normalizeUnit(value) {
  const unit = clean(value || '').toLowerCase().replace(/\s+/g, '');
  if (!unit) throw motionError('GROUND_MOTION_UNIT_REQUIRED', 'Acceleration unit must be declared explicitly.');
  if (!Object.prototype.hasOwnProperty.call(UNIT_FACTORS, unit)) {
    throw motionError('GROUND_MOTION_UNIT_INVALID', `Unsupported acceleration unit: ${value}.`);
  }
  return unit;
}

function normalizeBaseline(value) {
  const policy = clean(value || 'none').toLowerCase();
  if (!['none', 'mean', 'linear'].includes(policy)) {
    throw motionError('GROUND_MOTION_BASELINE_INVALID', `Unsupported baseline correction: ${value}.`);
  }
  return policy;
}

function normalizeSign(value) {
  if (value == null || value === '') return 1;
  const sign = Number(value);
  if (![1, -1].includes(sign)) throw motionError('GROUND_MOTION_SIGN_INVALID', 'Ground-motion sign must be +1 or -1.');
  return sign;
}

function normalizeDirection(value) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    if (value.length !== 3) throw motionError('GROUND_MOTION_DIRECTION_INVALID', 'Direction requires three components.');
    const direction = Array.from(value, (item, index) => finiteOr(item, 0, `direction[${index}]`));
    const norm = Math.hypot(...direction);
    if (!(norm > 0)) throw motionError('GROUND_MOTION_DIRECTION_INVALID', 'Direction must be nonzero.');
    return Object.freeze(direction.map((item) => item / norm));
  }
  const text = clean(value || 'x').toLowerCase().replace(/^\+/, '');
  const sign = text.startsWith('-') ? -1 : 1;
  const axis = ['x', 'y', 'z'].indexOf(text.replace(/^-/, ''));
  if (axis < 0) throw motionError('GROUND_MOTION_DIRECTION_INVALID', `Unsupported direction: ${value}.`);
  const direction = [0, 0, 0];
  direction[axis] = sign;
  return Object.freeze(direction);
}

function finiteVector(values, name) {
  if (values == null || typeof values.length !== 'number') throw motionError('GROUND_MOTION_VALUES_INVALID', `${name} must be a vector.`);
  return Array.from(values, (value, index) => finiteOr(value, 0, `${name}[${index}]`));
}

function strictNumber(value, name) {
  const text = String(value).trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
    throw motionError('GROUND_MOTION_TOKEN_INVALID', `${name} is not a valid number: ${text}.`);
  }
  return finiteOr(text, 0, name);
}

function maxAbs(values) {
  return Array.from(values).reduce((maximum, value) => Math.max(maximum, Math.abs(Number(value))), 0);
}

function optionalPositive(value, name) {
  if (value == null || value === '') return null;
  return positive(value, name);
}

function positive(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || !(number > 0)) throw motionError('GROUND_MOTION_VALUE_INVALID', `${name} must be positive.`);
  return number;
}

function finiteOr(value, fallback, name) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw motionError('GROUND_MOTION_VALUE_NONFINITE', `${name} must be finite.`);
  return number;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function motionError(code, message, details = null) {
  const error = new Error(message);
  error.name = 'MdofGroundMotionError';
  error.code = code;
  error.details = details;
  return error;
}
