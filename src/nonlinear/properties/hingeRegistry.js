import { stableHash } from '../../core/stableHash.js';
import {
  createHingeBackbone,
  HINGE_BACKBONE_VERSION,
  validateHingeBackbone,
} from '../materials/hingeBackbone.js';
import { normalizeHingeMaterial } from '../materials/hingeCyclic.js';

export const HINGE_PROPERTY_REGISTRY_VERSION = 'p8-m4-hinge-property-registry-v1';
export const HINGE_PROPERTY_MODEL_ID = 'concentrated-rotational-hinge-v1';
export const HINGE_PROPERTY_QUALIFICATIONS = Object.freeze([
  'legacy-preliminary',
  'assumed',
  'implemented',
  'candidate',
  'verified',
  'blocked',
  'unsupported',
]);

export function createHingeProperty(input = {}) {
  const id = requiredId(input.id, 'hinge property');
  const parametersInput = input.parameters || input;
  const units = normalizeUnits(input.units || parametersInput.units || {});
  const backbone = parametersInput.backbone?.version === HINGE_BACKBONE_VERSION
    ? clone(parametersInput.backbone)
    : createHingeBackbone({
      ...(parametersInput.backbone || parametersInput),
      units: {
        rotation: units.rotation,
        moment: units.moment,
      },
      rotationDefinition: parametersInput.rotationDefinition,
    });
  const parameters = {
    backbone,
    hysteresis: normalizeHysteresis(parametersInput.hysteresis || {}),
    degradation: normalizeDegradation(parametersInput.degradation || {}),
    regularization: normalizeRegularization(parametersInput.regularization || {}),
    integration: normalizeIntegration(parametersInput.integration || {}),
    hingeLength: requiredPositive(parametersInput.hingeLength, 'parameters.hingeLength'),
    rotationDefinition: clean(parametersInput.rotationDefinition) || backbone.rotationDefinition,
    acceptance: normalizeAcceptance(parametersInput.acceptance || []),
    pmm: normalizePmmHook(parametersInput.pmm || null),
  };
  const qualification = normalizeQualification(input.qualification);
  const source = normalizeSource(input.source || {});
  const calibration = normalizeCalibration(input.calibration || {});
  enforceQualification(qualification, source, calibration);
  const core = {
    id,
    modelId: HINGE_PROPERTY_MODEL_ID,
    parameters,
    units,
    qualification,
    source,
    calibration,
  };
  const contentHash = stableHash(core).slice(0, 24);
  const record = { ...core, contentHash };
  normalizeHingeMaterial(record);
  return deepFreeze(record);
}

export function validateHingeProperty(record = {}) {
  const errors = [];
  if (!clean(record.id)) errors.push('HINGE_PROPERTY_ID_REQUIRED');
  if (record.modelId !== HINGE_PROPERTY_MODEL_ID) errors.push('HINGE_PROPERTY_MODEL_ID_INVALID');
  if (!HINGE_PROPERTY_QUALIFICATIONS.includes(record.qualification)) errors.push('HINGE_PROPERTY_QUALIFICATION_INVALID');
  const backbone = record.parameters?.backbone;
  const backboneValidation = validateHingeBackbone(backbone);
  errors.push(...backboneValidation.errors);
  if (clean(record.units?.rotation) !== 'rad') errors.push('HINGE_PROPERTY_ROTATION_UNIT_INVALID');
  if (!clean(record.units?.moment) || !clean(record.units?.length) || !clean(record.units?.energy)) {
    errors.push('HINGE_PROPERTY_UNITS_INCOMPLETE');
  }
  if (!(Number(record.parameters?.hingeLength) > 0)) errors.push('HINGE_PROPERTY_LENGTH_INVALID');
  try {
    normalizeHingeMaterial(record);
    normalizePmmHook(record.parameters?.pmm || null);
    enforceQualification(record.qualification, record.source || {}, record.calibration || {});
  } catch (error) {
    errors.push(error.code || 'HINGE_PROPERTY_INVALID');
  }
  if (clean(record.contentHash)) {
    const core = clone(record);
    delete core.contentHash;
    if (record.contentHash !== stableHash(core).slice(0, 24)) errors.push('HINGE_PROPERTY_CONTENT_HASH_MISMATCH');
  } else errors.push('HINGE_PROPERTY_CONTENT_HASH_REQUIRED');
  return { ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]) };
}

export function createHingePropertyRegistry(records = []) {
  const byId = {};
  const errors = [];
  for (const record of records || []) {
    const validation = validateHingeProperty(record);
    const id = clean(record?.id);
    if (!validation.ok) errors.push(...validation.errors.map((code) => ({ code, propertyId: id || null })));
    if (id && byId[id]) errors.push({ code: 'HINGE_PROPERTY_ID_DUPLICATE', propertyId: id });
    else if (id) byId[id] = clone(record);
  }
  if (errors.length) {
    const error = hingePropertyError('HINGE_PROPERTY_REGISTRY_INVALID', 'Hinge property registry validation failed.');
    error.errors = errors;
    throw error;
  }
  const sortedIds = Object.keys(byId).sort();
  const normalized = Object.fromEntries(sortedIds.map((id) => [id, deepFreeze(byId[id])]));
  const core = {
    version: HINGE_PROPERTY_REGISTRY_VERSION,
    ids: sortedIds,
    byId: normalized,
  };
  return deepFreeze({ ...core, contentHash: stableHash(core).slice(0, 24) });
}

export function resolveHingeProperty(registry, propertyId, options = {}) {
  if (registry?.version !== HINGE_PROPERTY_REGISTRY_VERSION) {
    throw hingePropertyError('HINGE_PROPERTY_REGISTRY_REQUIRED', 'A valid hinge property registry is required.');
  }
  const id = requiredId(propertyId, 'property reference');
  const property = registry.byId?.[id];
  if (!property) throw hingePropertyError('HINGE_PROPERTY_NOT_FOUND', `Hinge property ${id} was not found.`);
  if (['blocked', 'unsupported'].includes(property.qualification)) {
    throw hingePropertyError('HINGE_PROPERTY_NOT_ADMISSIBLE', `Hinge property ${id} is ${property.qualification}.`);
  }
  if (options.minimumQualification === 'candidate' && ['legacy-preliminary', 'assumed', 'implemented'].includes(property.qualification)) {
    throw hingePropertyError('HINGE_PROPERTY_QUALIFICATION_INSUFFICIENT', `Hinge property ${id} is not candidate-qualified.`);
  }
  return property;
}

export function evaluateHingePropertyAtAxialRatio(property, axialRatio, options = {}) {
  const hook = property?.parameters?.pmm;
  if (!hook) {
    return deepFreeze({
      property,
      requestedAxialRatio: axialRatio == null ? null : finite(axialRatio, 'axialRatio'),
      axialRatioApplied: null,
      source: null,
      interpolation: null,
    });
  }
  const ratio = finite(axialRatio, 'axialRatio');
  const levels = hook.levels;
  if (ratio < levels[0].axialRatio || ratio > levels.at(-1).axialRatio) {
    throw hingePropertyError(
      'HINGE_PMM_AXIAL_RATIO_OUT_OF_RANGE',
      `Axial ratio ${ratio} is outside ${levels[0].axialRatio}..${levels.at(-1).axialRatio}.`,
    );
  }
  let lower = levels[0];
  let upper = levels.at(-1);
  for (let index = 0; index < levels.length - 1; index += 1) {
    if (ratio <= levels[index + 1].axialRatio) {
      lower = levels[index];
      upper = levels[index + 1];
      break;
    }
  }
  const span = upper.axialRatio - lower.axialRatio;
  const t = span > 0 ? (ratio - lower.axialRatio) / span : 0;
  const momentFactor = mix(lower.momentFactor, upper.momentFactor, t);
  const rotationFactor = mix(lower.rotationFactor, upper.rotationFactor, t);
  const backbone = scaleBackbone(property.parameters.backbone, momentFactor, rotationFactor);
  const derived = createHingeProperty({
    ...clone(property),
    id: property.id,
    qualification: options.qualification || property.qualification,
    parameters: {
      ...clone(property.parameters),
      backbone,
      pmm: null,
    },
    source: {
      ...clone(property.source),
      derivedFromPropertyId: property.id,
      pmmSourceId: hook.sourceId,
      axialRatio: ratio,
    },
  });
  return deepFreeze({
    property: derived,
    requestedAxialRatio: ratio,
    axialRatioApplied: ratio,
    source: hook.sourceId,
    interpolation: {
      lower: lower.axialRatio,
      upper: upper.axialRatio,
      fraction: t,
      momentFactor,
      rotationFactor,
    },
  });
}

export function scaleHingePropertyForInteraction(property, factors = {}, trace = {}) {
  if (!property?.parameters?.backbone || !clean(property.contentHash)) {
    throw hingePropertyError('HINGE_INTERACTION_PROPERTY_INVALID', 'A hashed hinge property is required for interaction scaling.');
  }
  const momentFactor = requiredPositive(factors.momentFactor, 'interaction.momentFactor');
  const rotationFactor = requiredPositive(factors.rotationFactor ?? 1, 'interaction.rotationFactor');
  const backbone = scaleBackbone(property.parameters.backbone, momentFactor, rotationFactor);
  return deepFreeze({
    ...clone(property),
    parameters: {
      ...clone(property.parameters),
      backbone,
      pmm: null,
    },
    contentHash: property.contentHash,
    interactionTrace: {
      sourceId: clean(trace.sourceId) || null,
      sourceHash: clean(trace.sourceHash) || null,
      axialForce: trace.axialForce == null ? null : finite(trace.axialForce, 'interaction.axialForce'),
      momentY: trace.momentY == null ? null : finite(trace.momentY, 'interaction.momentY'),
      momentZ: trace.momentZ == null ? null : finite(trace.momentZ, 'interaction.momentZ'),
      momentFactor,
      rotationFactor,
      iterationCoupled: trace.iterationCoupled === true,
    },
  });
}

export function hingePropertyRequiresGeneralMatrix(property) {
  const backbone = property?.parameters?.backbone;
  if (!backbone) return false;
  return [backbone.positive, backbone.negative].some((side) => side.slice(0, -1).some((point, index) => {
    const right = side[index + 1];
    return (right.moment - point.moment) / (right.rotation - point.rotation) <= 0;
  }));
}

function scaleBackbone(backbone, momentFactor, rotationFactor) {
  const scaleSide = (side) => side.map((point) => ({
    ...point,
    rotation: point.rotation * rotationFactor,
    moment: point.moment * momentFactor,
  }));
  return createHingeBackbone({
    positive: scaleSide(backbone.positive),
    negative: scaleSide(backbone.negative),
    rotationDefinition: backbone.rotationDefinition,
    units: backbone.units,
  });
}

function normalizeUnits(input) {
  const rotation = clean(input.rotation) || 'rad';
  if (rotation !== 'rad') throw hingePropertyError('HINGE_PROPERTY_ROTATION_UNIT_INVALID', 'Hinge rotation unit must be rad.');
  const moment = requiredUnit(input.moment, 'moment');
  const length = requiredUnit(input.length, 'length');
  const energy = clean(input.energy) || `${moment}-rad`;
  return Object.freeze({ rotation, moment, length, energy });
}

function normalizeHysteresis(input) {
  return Object.freeze({ rule: clean(input.rule) || 'kinematic-masing' });
}

function normalizeDegradation(input) {
  const normalizeRule = (rule = {}) => Object.freeze({
    perCycle: nonnegative(rule.perCycle, 0, 'degradation.perCycle'),
    perEnergy: nonnegative(rule.perEnergy, 0, 'degradation.perEnergy'),
    minimumFactor: fraction(rule.minimumFactor, 0.05, 'degradation.minimumFactor'),
  });
  return Object.freeze({
    strength: normalizeRule(input.strength),
    stiffness: normalizeRule(input.stiffness),
    referenceEnergy: requiredPositive(input.referenceEnergy ?? 1, 'degradation.referenceEnergy'),
  });
}

function normalizeRegularization(input) {
  return Object.freeze({
    strategy: clean(input.strategy) || 'diagnostic-only',
    minimumRatio: nonnegative(input.minimumRatio, 1e-8, 'regularization.minimumRatio'),
    minimumAbsolute: nonnegative(input.minimumAbsolute, 0, 'regularization.minimumAbsolute'),
  });
}

function normalizeIntegration(input) {
  const out = {
    maxSubsteps: positiveInteger(input.maxSubsteps, 2048),
    rotationTolerance: requiredPositive(input.rotationTolerance ?? 1e-12, 'integration.rotationTolerance'),
  };
  if (input.maxRotationIncrement != null) {
    out.maxRotationIncrement = requiredPositive(input.maxRotationIncrement, 'integration.maxRotationIncrement');
  }
  return Object.freeze(out);
}

function normalizeAcceptance(input) {
  const seen = new Set();
  return Object.freeze((input || []).map((row, index) => {
    const id = requiredId(row?.id, `acceptance[${index}]`);
    if (seen.has(id)) throw hingePropertyError('HINGE_ACCEPTANCE_ID_DUPLICATE', `Duplicate acceptance ID ${id}.`);
    seen.add(id);
    const rotation = requiredPositive(row.rotation, `acceptance.${id}.rotation`);
    return Object.freeze({ id, rotation, direction: clean(row.direction) || 'both', source: clone(row.source || null) });
  }).sort((a, b) => a.rotation - b.rotation || a.id.localeCompare(b.id)));
}

function normalizePmmHook(input) {
  if (input == null) return null;
  const sourceId = requiredId(input.sourceId, 'PMM source');
  if (!Array.isArray(input.levels) || input.levels.length < 2) {
    throw hingePropertyError('HINGE_PMM_LEVELS_REQUIRED', 'PMM hook requires at least two axial-ratio levels.');
  }
  const levels = input.levels.map((level, index) => Object.freeze({
    axialRatio: nonnegative(level.axialRatio, null, `pmm.levels[${index}].axialRatio`),
    momentFactor: requiredPositive(level.momentFactor, `pmm.levels[${index}].momentFactor`),
    rotationFactor: requiredPositive(level.rotationFactor ?? 1, `pmm.levels[${index}].rotationFactor`),
  })).sort((a, b) => a.axialRatio - b.axialRatio);
  for (let index = 1; index < levels.length; index += 1) {
    if (!(levels[index].axialRatio > levels[index - 1].axialRatio)) {
      throw hingePropertyError('HINGE_PMM_LEVEL_ORDER_INVALID', 'PMM axial-ratio levels must strictly increase.');
    }
  }
  return Object.freeze({ sourceId, levels: Object.freeze(levels) });
}

function normalizeSource(input) {
  const extra = clone(input.extra || {});
  return deepFreeze({
    ...extra,
    type: clean(input.type) || 'user-defined',
    reference: clean(input.reference) || null,
    edition: clean(input.edition) || null,
    clause: clean(input.clause) || null,
    assumption: clean(input.assumption) || null,
    materialSnapshot: clone(input.materialSnapshot || null),
    sectionSnapshot: clone(input.sectionSnapshot || null),
    reinforcementSnapshot: clone(input.reinforcementSnapshot || null),
    generatedAt: clean(input.generatedAt) || null,
    generatedBy: clean(input.generatedBy) || null,
    derivedFromPropertyId: clean(input.derivedFromPropertyId) || null,
    pmmSourceId: clean(input.pmmSourceId) || null,
    axialRatio: input.axialRatio == null ? null : finite(input.axialRatio, 'source.axialRatio'),
  });
}

function normalizeCalibration(input) {
  return deepFreeze({
    status: clean(input.status) || 'not-calibrated',
    referenceId: clean(input.referenceId) || null,
    reviewedBy: clean(input.reviewedBy) || null,
    reviewedAt: clean(input.reviewedAt) || null,
    notes: clean(input.notes) || null,
  });
}

function enforceQualification(qualification, source, calibration) {
  if (qualification !== 'verified') return;
  if (!clean(source.reference) || calibration.status !== 'accepted' || !clean(calibration.referenceId)) {
    throw hingePropertyError(
      'HINGE_PROPERTY_VERIFICATION_EVIDENCE_REQUIRED',
      'Verified hinge property requires a source reference and accepted calibration evidence.',
    );
  }
}

function normalizeQualification(value) {
  const qualification = clean(value) || 'assumed';
  if (!HINGE_PROPERTY_QUALIFICATIONS.includes(qualification)) {
    throw hingePropertyError('HINGE_PROPERTY_QUALIFICATION_INVALID', `Unsupported qualification ${qualification}.`);
  }
  return qualification;
}

function requiredId(value, label) {
  const id = clean(value);
  if (!id) throw hingePropertyError('HINGE_PROPERTY_ID_REQUIRED', `${label} ID is required.`);
  return id;
}

function requiredUnit(value, name) {
  const unit = clean(value);
  if (!unit) throw hingePropertyError('HINGE_PROPERTY_UNIT_REQUIRED', `${name} unit is required.`);
  return unit;
}

function requiredPositive(value, path) {
  const number = finite(value, path);
  if (!(number > 0)) throw hingePropertyError('HINGE_PROPERTY_VALUE_INVALID', `${path} must be positive.`);
  return number;
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonnegative(value, fallback, path) {
  if (value == null && fallback != null) return fallback;
  const number = finite(value, path);
  if (number < 0) throw hingePropertyError('HINGE_PROPERTY_VALUE_INVALID', `${path} must be nonnegative.`);
  return number;
}

function fraction(value, fallback, path) {
  const number = value == null ? fallback : finite(value, path);
  if (number < 0 || number > 1) throw hingePropertyError('HINGE_PROPERTY_VALUE_INVALID', `${path} must be between zero and one.`);
  return number;
}

function finite(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw hingePropertyError('HINGE_PROPERTY_VALUE_INVALID', `${path} must be finite.`);
  return number;
}

function mix(a, b, t) {
  return Number(a) * (1 - t) + Number(b) * t;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hingePropertyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
