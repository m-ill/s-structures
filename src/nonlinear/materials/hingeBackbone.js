import { stableHash } from '../../core/stableHash.js';

export const HINGE_BACKBONE_VERSION = 'p8-m4-hinge-backbone-v1';
export const HINGE_BACKBONE_POINT_IDS = Object.freeze(['A', 'B', 'C', 'D', 'E']);

const POINT_STATES = Object.freeze({
  A: 'elastic',
  B: 'yielded',
  C: 'capping',
  D: 'residual',
  E: 'failure',
});

export function createHingeBackbone(input = {}) {
  const positive = normalizeSide(input.positive || input.points, 'positive');
  const negative = input.negative
    ? normalizeSide(input.negative, 'negative')
    : positive.map((point) => ({ ...point }));
  const core = {
    version: HINGE_BACKBONE_VERSION,
    positive,
    negative,
    rotationDefinition: clean(input.rotationDefinition) || 'joint-relative-to-member-face-local-axis',
    units: Object.freeze({
      rotation: clean(input.units?.rotation) || 'rad',
      moment: requiredUnit(input.units?.moment, 'moment'),
    }),
  };
  return deepFreeze({ ...core, contentHash: stableHash(core).slice(0, 24) });
}

export function validateHingeBackbone(backbone) {
  const errors = [];
  if (backbone?.version !== HINGE_BACKBONE_VERSION) errors.push('HINGE_BACKBONE_VERSION_INVALID');
  for (const direction of ['positive', 'negative']) {
    const points = backbone?.[direction];
    if (!Array.isArray(points) || points.length !== HINGE_BACKBONE_POINT_IDS.length) {
      errors.push(`HINGE_BACKBONE_${direction.toUpperCase()}_POINTS_INVALID`);
      continue;
    }
    points.forEach((point, index) => {
      if (point?.id !== HINGE_BACKBONE_POINT_IDS[index]) errors.push(`HINGE_BACKBONE_${direction.toUpperCase()}_ID_INVALID`);
      if (!Number.isFinite(Number(point?.rotation)) || Number(point.rotation) < 0) errors.push(`HINGE_BACKBONE_${direction.toUpperCase()}_ROTATION_INVALID`);
      if (!Number.isFinite(Number(point?.moment)) || Number(point.moment) < 0) errors.push(`HINGE_BACKBONE_${direction.toUpperCase()}_MOMENT_INVALID`);
      if (index > 0 && !(Number(point.rotation) > Number(points[index - 1]?.rotation))) {
        errors.push(`HINGE_BACKBONE_${direction.toUpperCase()}_ROTATION_ORDER_INVALID`);
      }
    });
  }
  if (clean(backbone?.units?.rotation) !== 'rad') errors.push('HINGE_BACKBONE_ROTATION_UNIT_INVALID');
  if (!clean(backbone?.units?.moment)) errors.push('HINGE_BACKBONE_MOMENT_UNIT_REQUIRED');
  return { ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]) };
}

export function evaluateHingeEnvelope(rotation, backbone, options = {}) {
  requireBackbone(backbone);
  const theta = finite(rotation, 'rotation');
  const direction = theta === 0 ? normalizeDirection(options.direction, 1) : Math.sign(theta);
  const strengthFactor = positive(options.strengthFactor ?? 1, 'strengthFactor');
  const stiffnessFactor = positive(options.stiffnessFactor ?? 1, 'stiffnessFactor');
  const scaledRotation = Math.abs(theta) * stiffnessFactor / strengthFactor;
  const side = direction > 0 ? backbone.positive : backbone.negative;
  const response = evaluateSide(scaledRotation, side);
  return Object.freeze({
    version: HINGE_BACKBONE_VERSION,
    rotation: theta,
    moment: direction * strengthFactor * response.moment,
    tangent: stiffnessFactor * response.tangent,
    direction,
    segment: response.segment,
    point: response.point,
    state: response.state,
    atPoint: response.atPoint,
    beyondFailure: response.beyondFailure,
    strengthFactor,
    stiffnessFactor,
    sourceRotation: scaledRotation,
  });
}

export function integrateHingeEnvelope(rotation, backbone, options = {}) {
  requireBackbone(backbone);
  const theta = finite(rotation, 'rotation');
  if (theta === 0) return 0;
  const direction = Math.sign(theta);
  const strengthFactor = positive(options.strengthFactor ?? 1, 'strengthFactor');
  const stiffnessFactor = positive(options.stiffnessFactor ?? 1, 'stiffnessFactor');
  const scaledRotation = Math.abs(theta) * stiffnessFactor / strengthFactor;
  const side = direction > 0 ? backbone.positive : backbone.negative;
  const baseArea = integrateSide(scaledRotation, side);
  return baseArea * strengthFactor * strengthFactor / stiffnessFactor;
}

export function hingeBackboneInitialTangent(backbone, direction = 1) {
  requireBackbone(backbone);
  return evaluateSide(0, normalizeDirection(direction, 1) > 0 ? backbone.positive : backbone.negative).tangent;
}

export function hingeBackbonePoint(backbone, pointId, direction = 1, options = {}) {
  requireBackbone(backbone);
  const id = clean(pointId).toUpperCase();
  const side = normalizeDirection(direction, 1) > 0 ? backbone.positive : backbone.negative;
  const point = side.find((item) => item.id === id);
  if (!point) throw backboneError('HINGE_BACKBONE_POINT_NOT_FOUND', `Backbone point ${id || '(missing)'} was not found.`);
  const strengthFactor = positive(options.strengthFactor ?? 1, 'strengthFactor');
  const stiffnessFactor = positive(options.stiffnessFactor ?? 1, 'stiffnessFactor');
  return Object.freeze({
    ...point,
    rotation: point.rotation * strengthFactor / stiffnessFactor,
    moment: point.moment * strengthFactor,
  });
}

function normalizeSide(input, direction) {
  const rows = Array.isArray(input)
    ? input
    : HINGE_BACKBONE_POINT_IDS.map((id) => input?.[id] || input?.[id.toLowerCase()]);
  if (rows.length !== HINGE_BACKBONE_POINT_IDS.length || rows.some((row) => !row)) {
    throw backboneError('HINGE_BACKBONE_POINTS_REQUIRED', `${direction} A-B-C-D-E points are required.`);
  }
  const points = rows.map((row, index) => {
    const id = HINGE_BACKBONE_POINT_IDS[index];
    const rotation = magnitude(row.rotation ?? row.theta, `${direction}.${id}.rotation`);
    const moment = magnitude(row.moment ?? row.M, `${direction}.${id}.moment`);
    return Object.freeze({
      id,
      rotation,
      moment,
      state: clean(row.state) || POINT_STATES[id],
      acceptance: clean(row.acceptance) || null,
    });
  });
  if (points[0].rotation !== 0 || points[0].moment !== 0) {
    throw backboneError('HINGE_BACKBONE_POINT_A_ORIGIN_REQUIRED', `${direction} point A must be the origin.`);
  }
  for (let index = 1; index < points.length; index += 1) {
    if (!(points[index].rotation > points[index - 1].rotation)) {
      throw backboneError('HINGE_BACKBONE_ROTATION_ORDER_INVALID', `${direction} rotations must increase from A through E.`);
    }
  }
  return Object.freeze(points);
}

function evaluateSide(rotation, points) {
  if (rotation <= 0) {
    const tangent = (points[1].moment - points[0].moment) / (points[1].rotation - points[0].rotation);
    return Object.freeze({
      moment: 0,
      tangent,
      segment: 'A-B',
      point: 'A',
      state: points[0].state,
      atPoint: true,
      beyondFailure: false,
    });
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (rotation <= right.rotation) {
      const tolerance = 1e-12 * Math.max(1, right.rotation);
      const atRight = Math.abs(rotation - right.rotation) <= tolerance;
      return segmentResponse(
        rotation,
        left,
        right,
        `${left.id}-${right.id}`,
        atRight ? right.id : left.id,
        atRight,
        false,
      );
    }
  }
  const last = points.at(-1);
  return Object.freeze({
    moment: last.moment,
    tangent: 0,
    segment: 'E+',
    point: last.id,
    state: last.state,
    atPoint: true,
    beyondFailure: rotation > last.rotation,
  });
}

function segmentResponse(rotation, left, right, segment, point, atPoint, beyondFailure) {
  const span = right.rotation - left.rotation;
  const tangent = (right.moment - left.moment) / span;
  const t = Math.max(0, Math.min(1, (rotation - left.rotation) / span));
  return Object.freeze({
    moment: left.moment + t * (right.moment - left.moment),
    tangent,
    segment,
    point,
    state: atPoint ? right.state : left.state,
    atPoint,
    beyondFailure,
  });
}

function integrateSide(rotation, points) {
  let area = 0;
  let cursor = 0;
  for (let index = 0; index < points.length - 1 && cursor < rotation; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    const end = Math.min(rotation, right.rotation);
    if (end <= left.rotation) continue;
    const endMoment = left.moment + (end - left.rotation) * (right.moment - left.moment) / (right.rotation - left.rotation);
    area += 0.5 * (left.moment + endMoment) * (end - left.rotation);
    cursor = end;
  }
  if (rotation > points.at(-1).rotation) {
    area += points.at(-1).moment * (rotation - points.at(-1).rotation);
  }
  return area;
}

function requireBackbone(backbone) {
  const validation = validateHingeBackbone(backbone);
  if (!validation.ok) throw backboneError('HINGE_BACKBONE_INVALID', validation.errors.join(', '));
}

function normalizeDirection(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number < 0 ? -1 : Number.isFinite(number) && number > 0 ? 1 : fallback;
}

function requiredUnit(value, name) {
  const unit = clean(value);
  if (!unit) throw backboneError('HINGE_BACKBONE_UNIT_REQUIRED', `${name} unit is required.`);
  return unit;
}

function magnitude(value, path) {
  return Math.abs(finite(value, path));
}

function positive(value, path) {
  const number = finite(value, path);
  if (!(number > 0)) throw backboneError('HINGE_BACKBONE_VALUE_INVALID', `${path} must be positive.`);
  return number;
}

function finite(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw backboneError('HINGE_BACKBONE_VALUE_INVALID', `${path} must be finite.`);
  return number;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function backboneError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
