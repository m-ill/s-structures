import { stableHash } from '../../core/stableHash.js';
import {
  evaluateHingeEnvelope,
  hingeBackboneInitialTangent,
  hingeBackbonePoint,
  validateHingeBackbone,
} from './hingeBackbone.js';

export const HINGE_CYCLIC_VERSION = 'p8-m4-hinge-cyclic-v1';
export const HINGE_CYCLIC_STATE_VERSION = 'p8-m4-hinge-cyclic-state-v1';
export const HINGE_HYSTERESIS_RULES = Object.freeze([
  'kinematic-masing',
  'isotropic-multilinear',
]);

const EVENT_TYPES = Object.freeze({
  B: 'yield',
  C: 'capping',
  D: 'residual',
  E: 'failure',
});

export function createHingeCyclicState(property, options = {}) {
  const config = normalizeHingeMaterial(property);
  const rotation = finite(options.rotation ?? 0, 'rotation');
  const envelope = evaluateHingeEnvelope(rotation, config.backbone, { direction: options.direction || 1 });
  const base = {
    version: HINGE_CYCLIC_STATE_VERSION,
    propertyHash: config.propertyHash,
    rotation,
    moment: envelope.moment,
    tangent: envelope.tangent,
    constitutiveTangent: envelope.tangent,
    direction: rotation === 0 ? 0 : Math.sign(rotation),
    branch: rotation === 0 ? 'origin' : 'envelope',
    state: envelope.state,
    point: envelope.point,
    segment: envelope.segment,
    positiveExtreme: rotation > 0 ? { rotation, moment: envelope.moment } : { rotation: 0, moment: 0 },
    negativeExtreme: rotation < 0 ? { rotation, moment: envelope.moment } : { rotation: 0, moment: 0 },
    reversal: null,
    reversalCount: 0,
    cycleCount: 0,
    strengthFactor: 1,
    stiffnessFactor: 1,
    cumulativeWork: 0,
    recoverableEnergy: recoverableEnergy(envelope.moment, config, 1),
    dissipatedEnergy: 0,
    zeroMomentRotation: 0,
    events: [],
    diagnostics: regularizationDiagnostics(envelope.tangent, envelope.tangent, config),
  };
  return finalizeState(base);
}

export function evaluateHingeTrial(rotation, property, committedState, context = {}) {
  const config = normalizeHingeMaterial(property);
  const target = finite(rotation, 'rotation');
  const committed = normalizeCommittedState(committedState, config);
  if (Math.abs(target - committed.rotation) <= config.rotationTolerance) {
    const response = responseAt(committed.rotation, committed, config);
    const regularized = regularizeTangent(response.tangent, committed, config);
    const trialState = finalizeState({
      ...clone(committed),
      moment: response.moment,
      tangent: regularized.tangent,
      constitutiveTangent: response.tangent,
      state: response.state,
      point: response.point,
      segment: response.segment,
      events: [],
      diagnostics: regularized.diagnostics,
    });
    return trialResult(trialState, config, context);
  }

  let state = clone(committed);
  state.events = [];
  const distance = Math.abs(target - committed.rotation);
  const substeps = Math.max(1, Math.ceil(distance / config.maxRotationIncrement));
  if (substeps > config.maxSubsteps) {
    throw hingeError(
      'HINGE_TRIAL_SUBSTEP_LIMIT',
      `Hinge trial requires ${substeps} constitutive substeps; limit is ${config.maxSubsteps}.`,
    );
  }
  for (let index = 1; index <= substeps; index += 1) {
    let nextRotation = committed.rotation + (target - committed.rotation) * index / substeps;
    const critical = state.reversal?.targetRotation;
    if (Number.isFinite(critical) && liesBetween(critical, state.rotation, nextRotation)) nextRotation = critical;
    state = advanceState(state, nextRotation, config, context);
    if (nextRotation !== committed.rotation + (target - committed.rotation) * index / substeps) {
      const remainder = target - nextRotation;
      if (Math.abs(remainder) > config.rotationTolerance) {
        const remainingSteps = Math.max(1, Math.ceil(Math.abs(remainder) / config.maxRotationIncrement));
        for (let extra = 1; extra <= remainingSteps; extra += 1) {
          state = advanceState(state, nextRotation + remainder * extra / remainingSteps, config, context);
        }
      }
      break;
    }
  }
  return trialResult(finalizeState(state), config, context);
}

export function runHingeProtocol(rotations = [], property, options = {}) {
  let committed = createHingeCyclicState(property, options.initialState);
  const rows = [];
  for (let index = 0; index < rotations.length; index += 1) {
    const trial = evaluateHingeTrial(rotations[index], property, committed, { protocolStep: index });
    committed = trial.trialState;
    rows.push(Object.freeze({
      step: index,
      rotation: committed.rotation,
      moment: committed.moment,
      tangent: committed.tangent,
      branch: committed.branch,
      state: committed.state,
      dissipatedEnergy: committed.dissipatedEnergy,
      events: committed.events,
    }));
  }
  return deepFreeze({
    version: HINGE_CYCLIC_VERSION,
    propertyHash: committed.propertyHash,
    rows,
    finalState: committed,
  });
}

export function hingeStateSerializer() {
  return Object.freeze({
    type: 'concentrated-hinge',
    version: HINGE_CYCLIC_STATE_VERSION,
    serialize: (value) => normalizeStateShape(value),
    deserialize: (value) => finalizeState(normalizeStateShape(value)),
  });
}

export function normalizeHingeMaterial(property = {}) {
  const parameters = property.parameters || property;
  const backbone = parameters.backbone || property.backbone;
  const validation = validateHingeBackbone(backbone);
  if (!validation.ok) throw hingeError('HINGE_MATERIAL_BACKBONE_INVALID', validation.errors.join(', '));
  const hysteresis = normalizeHysteresis(parameters.hysteresis || {});
  const degradation = normalizeDegradation(parameters.degradation || {});
  const regularization = normalizeRegularization(parameters.regularization || {});
  const pointSpans = [backbone.positive, backbone.negative]
    .flatMap((side) => side.slice(1).map((point, index) => point.rotation - side[index].rotation))
    .filter((value) => value > 0);
  const yieldRotation = Math.min(backbone.positive[1].rotation, backbone.negative[1].rotation);
  const requestedIncrement = Number(parameters.integration?.maxRotationIncrement);
  const maxRotationIncrement = Number.isFinite(requestedIncrement) && requestedIncrement > 0
    ? requestedIncrement
    : Math.max(1e-12, Math.min(yieldRotation / 8, ...(pointSpans.length ? pointSpans.map((value) => value / 4) : [yieldRotation / 8])));
  const propertyHash = clean(property.contentHash) || stableHash({ backbone, hysteresis, degradation, regularization }).slice(0, 24);
  return deepFreeze({
    version: HINGE_CYCLIC_VERSION,
    propertyId: clean(property.id) || null,
    propertyHash,
    backbone,
    hysteresis,
    degradation,
    regularization,
    maxRotationIncrement,
    maxSubsteps: positiveInteger(parameters.integration?.maxSubsteps, 2048),
    rotationTolerance: positiveNumber(parameters.integration?.rotationTolerance, 1e-12),
    qualification: clean(property.qualification) || 'implemented',
  });
}

function advanceState(previous, rotation, config, context) {
  const delta = rotation - previous.rotation;
  if (Math.abs(delta) <= config.rotationTolerance) return previous;
  const direction = Math.sign(delta);
  let state = clone(previous);
  const events = [...(state.events || [])];
  if (state.direction !== 0 && direction !== state.direction) {
    const reversalCount = state.reversalCount + 1;
    const cycleCount = Math.floor(reversalCount / 2);
    const factors = degradationFactors(config.degradation, cycleCount, state.dissipatedEnergy);
    const targetExtreme = direction > 0 ? state.positiveExtreme : state.negativeExtreme;
    const hasTarget = direction > 0
      ? targetExtreme.rotation > config.rotationTolerance
      : targetExtreme.rotation < -config.rotationTolerance;
    const targetRotation = hasTarget ? targetExtreme.rotation : null;
    const targetMoment = hasTarget
      ? evaluateHingeEnvelope(targetRotation, config.backbone, {
        direction,
        strengthFactor: factors.strengthFactor,
        stiffnessFactor: factors.stiffnessFactor,
      }).moment
      : null;
    const reversal = {
      rotation: state.rotation,
      moment: state.moment,
      direction,
      targetRotation,
      targetMoment,
      strengthFactor: factors.strengthFactor,
      stiffnessFactor: factors.stiffnessFactor,
    };
    if (config.hysteresis.rule === 'isotropic-multilinear') {
      Object.assign(reversal, isotropicBranchData(reversal, config));
    }
    state = {
      ...state,
      direction,
      branch: config.hysteresis.rule,
      reversal,
      reversalCount,
      cycleCount,
      strengthFactor: factors.strengthFactor,
      stiffnessFactor: factors.stiffnessFactor,
    };
    events.push(event('reversal', state, context, { direction, reversalCount, cycleCount }));
  } else if (state.direction === 0) {
    state.direction = direction;
    state.branch = 'envelope';
  }

  const response = responseAt(rotation, state, config);
  const regularized = regularizeTangent(response.tangent, state, config);
  const workIncrement = 0.5 * (state.moment + response.moment) * delta;
  const cumulativeWork = state.cumulativeWork + workIncrement;
  const recoverable = recoverableEnergy(response.moment, config, state.stiffnessFactor);
  const dissipated = Math.max(state.dissipatedEnergy, cumulativeWork - recoverable, 0);
  const previousPoint = state.point;
  const previousState = state.state;
  const next = {
    ...state,
    rotation,
    moment: response.moment,
    tangent: regularized.tangent,
    constitutiveTangent: response.tangent,
    branch: response.branch,
    state: response.state,
    point: response.point,
    segment: response.segment,
    cumulativeWork,
    recoverableEnergy: recoverable,
    dissipatedEnergy: dissipated,
    zeroMomentRotation: response.zeroMomentRotation,
    diagnostics: regularized.diagnostics,
  };
  if (rotation > next.positiveExtreme.rotation) next.positiveExtreme = { rotation, moment: response.moment };
  if (rotation < next.negativeExtreme.rotation) next.negativeExtreme = { rotation, moment: response.moment };
  if (response.point !== previousPoint || response.state !== previousState) {
    const type = EVENT_TYPES[response.point];
    if (type) events.push(event(type, next, context, { direction, point: response.point }));
  }
  if (response.branch === 'envelope' && state.branch !== 'envelope') {
    events.push(event('envelope-rejoin', next, context, { direction }));
    next.reversal = null;
  }
  next.events = events;
  return next;
}

function responseAt(rotation, state, config) {
  if (!state.reversal || state.branch === 'origin' || state.branch === 'envelope') {
    return { ...evaluateEnvelope(rotation, state, config), branch: 'envelope', zeroMomentRotation: 0 };
  }
  if (config.hysteresis.rule === 'isotropic-multilinear') {
    return evaluateIsotropicBranch(rotation, state, config);
  }
  return evaluateMasingBranch(rotation, state, config);
}

function evaluateEnvelope(rotation, state, config) {
  return evaluateHingeEnvelope(rotation, config.backbone, {
    direction: state.direction || 1,
    strengthFactor: state.strengthFactor,
    stiffnessFactor: state.stiffnessFactor,
  });
}

function evaluateMasingBranch(rotation, state, config) {
  const reversal = state.reversal;
  const relative = 0.5 * (rotation - reversal.rotation);
  const increment = evaluateHingeEnvelope(relative, config.backbone, {
    direction: reversal.direction,
    strengthFactor: reversal.strengthFactor,
    stiffnessFactor: reversal.stiffnessFactor,
  });
  let moment = reversal.moment + 2 * increment.moment;
  let tangent = increment.tangent;
  let correction = 0;
  let correctionTangent = 0;
  const targetRotation = reversal.targetRotation;
  if (Number.isFinite(targetRotation)) {
    const span = targetRotation - reversal.rotation;
    const targetRelative = 0.5 * span;
    const targetIncrement = evaluateHingeEnvelope(targetRelative, config.backbone, {
      direction: reversal.direction,
      strengthFactor: reversal.strengthFactor,
      stiffnessFactor: reversal.stiffnessFactor,
    });
    const targetCandidate = reversal.moment + 2 * targetIncrement.moment;
    const difference = reversal.targetMoment - targetCandidate;
    const x = clamp((rotation - reversal.rotation) / span, 0, 1);
    correction = difference * smoothStep(x);
    correctionTangent = difference * smoothStepDerivative(x) / span;
    moment += correction;
    tangent += correctionTangent;
    if (reversal.direction * (rotation - targetRotation) >= -config.rotationTolerance) {
      return { ...evaluateEnvelope(rotation, state, config), branch: 'envelope', zeroMomentRotation: 0 };
    }
  } else if (rejoinsEnvelope(rotation, moment, reversal.direction, state, config)) {
    return { ...evaluateEnvelope(rotation, state, config), branch: 'envelope', zeroMomentRotation: 0 };
  }
  const zeroMomentRotation = Math.abs(tangent) > config.rotationTolerance
    ? rotation - moment / tangent
    : state.zeroMomentRotation;
  return {
    moment,
    tangent,
    branch: 'kinematic-masing',
    state: increment.state,
    point: increment.point,
    segment: `masing:${increment.segment}`,
    zeroMomentRotation,
    correction,
    correctionTangent,
  };
}

function isotropicBranchData(reversal, config) {
  const direction = reversal.direction;
  const yieldPoint = hingeBackbonePoint(config.backbone, 'B', direction, {
    strengthFactor: reversal.strengthFactor,
    stiffnessFactor: reversal.stiffnessFactor,
  });
  const initialTangent = hingeBackboneInitialTangent(config.backbone, direction) * reversal.stiffnessFactor;
  const yieldRotation = reversal.rotation + (direction * yieldPoint.moment - reversal.moment) / initialTangent;
  return {
    unloadingTangent: initialTangent,
    yieldRotation,
    plasticOffset: yieldRotation - direction * yieldPoint.rotation,
  };
}

function evaluateIsotropicBranch(rotation, state, config) {
  const reversal = state.reversal;
  if (reversal.direction * (rotation - reversal.yieldRotation) < 0) {
    const moment = reversal.moment + reversal.unloadingTangent * (rotation - reversal.rotation);
    return {
      moment,
      tangent: reversal.unloadingTangent,
      branch: 'isotropic-multilinear',
      state: 'elastic-unloading',
      point: state.point,
      segment: 'isotropic-unloading',
      zeroMomentRotation: reversal.rotation - reversal.moment / reversal.unloadingTangent,
    };
  }
  const relative = rotation - reversal.plasticOffset;
  const response = evaluateHingeEnvelope(relative, config.backbone, {
    direction: reversal.direction,
    strengthFactor: reversal.strengthFactor,
    stiffnessFactor: reversal.stiffnessFactor,
  });
  return {
    ...response,
    branch: 'isotropic-multilinear',
    segment: `isotropic:${response.segment}`,
    zeroMomentRotation: reversal.plasticOffset,
  };
}

function rejoinsEnvelope(rotation, candidateMoment, direction, state, config) {
  if (direction * rotation <= config.rotationTolerance) return false;
  const envelope = evaluateEnvelope(rotation, state, config);
  const tolerance = 1e-8 * Math.max(1, Math.abs(candidateMoment), Math.abs(envelope.moment));
  return direction > 0
    ? candidateMoment <= envelope.moment + tolerance
    : candidateMoment >= envelope.moment - tolerance;
}

function regularizeTangent(rawTangent, state, config) {
  const initial = Math.max(
    Math.abs(hingeBackboneInitialTangent(config.backbone, 1)),
    Math.abs(hingeBackboneInitialTangent(config.backbone, -1)),
  );
  const threshold = Math.max(config.regularization.minimumAbsolute, initial * config.regularization.minimumRatio);
  let tangent = rawTangent;
  let applied = false;
  if (Math.abs(rawTangent) < threshold && config.regularization.strategy !== 'diagnostic-only') {
    if (config.regularization.strategy === 'positive-floor') tangent = threshold;
    else if (config.regularization.strategy === 'signed-floor') {
      const sign = rawTangent < 0 ? -1 : state.constitutiveTangent < 0 ? -1 : 1;
      tangent = sign * threshold;
    }
    applied = tangent !== rawTangent;
  }
  return {
    tangent,
    diagnostics: regularizationDiagnostics(rawTangent, tangent, config, applied, threshold),
  };
}

function regularizationDiagnostics(rawTangent, tangent, config, applied = false, threshold = 0) {
  return Object.freeze({
    strategy: config.regularization.strategy,
    constitutiveTangent: rawTangent,
    solverTangent: tangent,
    threshold,
    applied,
    zeroTangent: rawTangent === 0,
    negativeTangent: rawTangent < 0,
    requiresGeneralMatrix: rawTangent <= 0 || tangent <= 0,
  });
}

function degradationFactors(config, cycleCount, dissipatedEnergy) {
  const normalizedEnergy = dissipatedEnergy / config.referenceEnergy;
  return {
    strengthFactor: Math.max(
      config.strength.minimumFactor,
      1 - config.strength.perCycle * cycleCount - config.strength.perEnergy * normalizedEnergy,
    ),
    stiffnessFactor: Math.max(
      config.stiffness.minimumFactor,
      1 - config.stiffness.perCycle * cycleCount - config.stiffness.perEnergy * normalizedEnergy,
    ),
  };
}

function recoverableEnergy(moment, config, stiffnessFactor) {
  const initial = Math.max(
    Math.abs(hingeBackboneInitialTangent(config.backbone, 1)),
    Math.abs(hingeBackboneInitialTangent(config.backbone, -1)),
  ) * stiffnessFactor;
  return initial > 0 ? 0.5 * moment * moment / initial : 0;
}

function trialResult(trialState, config, context) {
  return deepFreeze({
    version: HINGE_CYCLIC_VERSION,
    propertyId: config.propertyId,
    propertyHash: config.propertyHash,
    rotation: trialState.rotation,
    moment: trialState.moment,
    tangent: trialState.tangent,
    constitutiveTangent: trialState.constitutiveTangent,
    state: trialState.state,
    point: trialState.point,
    branch: trialState.branch,
    events: trialState.events,
    energies: {
      work: trialState.cumulativeWork,
      recoverable: trialState.recoverableEnergy,
      dissipated: trialState.dissipatedEnergy,
    },
    trialState,
    diagnostics: trialState.diagnostics,
    context: clone(context),
  });
}

function normalizeCommittedState(state, config) {
  if (state == null || Object.keys(state).length === 0) return createHingeCyclicState({
    id: config.propertyId,
    contentHash: config.propertyHash,
    qualification: config.qualification,
    parameters: {
      backbone: config.backbone,
      hysteresis: config.hysteresis,
      degradation: config.degradation,
      regularization: config.regularization,
      integration: {
        maxRotationIncrement: config.maxRotationIncrement,
        maxSubsteps: config.maxSubsteps,
        rotationTolerance: config.rotationTolerance,
      },
    },
  });
  if (state.version !== HINGE_CYCLIC_STATE_VERSION) {
    throw hingeError('HINGE_STATE_VERSION_INVALID', `Unsupported hinge state version ${state.version || '(missing)'}.`);
  }
  if (state.propertyHash !== config.propertyHash) {
    throw hingeError('HINGE_STATE_PROPERTY_MISMATCH', 'Committed hinge state belongs to a different property snapshot.');
  }
  assertFiniteState(state);
  return finalizeState(normalizeStateShape(state));
}

function normalizeStateShape(state = {}) {
  return {
    ...clone(state),
    version: HINGE_CYCLIC_STATE_VERSION,
    propertyHash: clean(state.propertyHash),
    rotation: finite(state.rotation ?? 0, 'state.rotation'),
    moment: finite(state.moment ?? 0, 'state.moment'),
    tangent: finite(state.tangent ?? 0, 'state.tangent'),
    constitutiveTangent: finite(state.constitutiveTangent ?? state.tangent ?? 0, 'state.constitutiveTangent'),
    direction: normalizeDirection(state.direction),
    branch: clean(state.branch) || 'origin',
    state: clean(state.state) || 'elastic',
    point: clean(state.point) || 'A',
    segment: clean(state.segment) || 'A-B',
    positiveExtreme: normalizeExtreme(state.positiveExtreme, 0),
    negativeExtreme: normalizeExtreme(state.negativeExtreme, 0),
    reversal: state.reversal ? clone(state.reversal) : null,
    reversalCount: nonnegativeInteger(state.reversalCount),
    cycleCount: nonnegativeInteger(state.cycleCount),
    strengthFactor: positiveNumber(state.strengthFactor, 1),
    stiffnessFactor: positiveNumber(state.stiffnessFactor, 1),
    cumulativeWork: finite(state.cumulativeWork ?? 0, 'state.cumulativeWork'),
    recoverableEnergy: nonnegativeNumber(state.recoverableEnergy, 0),
    dissipatedEnergy: nonnegativeNumber(state.dissipatedEnergy, 0),
    zeroMomentRotation: finite(state.zeroMomentRotation ?? 0, 'state.zeroMomentRotation'),
    events: Array.isArray(state.events) ? clone(state.events) : [],
    diagnostics: clone(state.diagnostics || {}),
  };
}

function normalizeHysteresis(input) {
  const aliases = { kinematic: 'kinematic-masing', isotropic: 'isotropic-multilinear' };
  const rule = aliases[clean(input.rule)] || clean(input.rule) || 'kinematic-masing';
  if (!HINGE_HYSTERESIS_RULES.includes(rule)) {
    throw hingeError('HINGE_HYSTERESIS_RULE_UNSUPPORTED', `Unsupported hinge hysteresis rule: ${rule}.`);
  }
  return Object.freeze({ rule });
}

function normalizeDegradation(input) {
  const strength = degradationRule(input.strength || {});
  const stiffness = degradationRule(input.stiffness || {});
  return Object.freeze({
    strength,
    stiffness,
    referenceEnergy: positiveNumber(input.referenceEnergy, 1),
  });
}

function degradationRule(input) {
  return Object.freeze({
    perCycle: nonnegativeNumber(input.perCycle, 0),
    perEnergy: nonnegativeNumber(input.perEnergy, 0),
    minimumFactor: clamp(nonnegativeNumber(input.minimumFactor, 0.05), 0, 1),
  });
}

function normalizeRegularization(input) {
  const strategy = clean(input.strategy) || 'diagnostic-only';
  if (!['diagnostic-only', 'signed-floor', 'positive-floor'].includes(strategy)) {
    throw hingeError('HINGE_REGULARIZATION_STRATEGY_UNSUPPORTED', `Unsupported regularization strategy: ${strategy}.`);
  }
  return Object.freeze({
    strategy,
    minimumRatio: nonnegativeNumber(input.minimumRatio, 1e-8),
    minimumAbsolute: nonnegativeNumber(input.minimumAbsolute, 0),
  });
}

function event(type, state, context, extra = {}) {
  return Object.freeze({
    type,
    rotation: state.rotation,
    moment: state.moment,
    direction: state.direction,
    cycleCount: state.cycleCount,
    protocolStep: context.protocolStep ?? null,
    ...extra,
  });
}

function assertFiniteState(value, path = 'state') {
  if (typeof value === 'number' && !Number.isFinite(value)) throw hingeError('HINGE_STATE_NONFINITE', `${path} is nonfinite.`);
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) value.forEach((item, index) => assertFiniteState(item, `${path}[${index}]`));
  else Object.entries(value).forEach(([key, item]) => assertFiniteState(item, `${path}.${key}`));
}

function normalizeExtreme(value, fallbackRotation) {
  return {
    rotation: finite(value?.rotation ?? fallbackRotation, 'state.extreme.rotation'),
    moment: finite(value?.moment ?? 0, 'state.extreme.moment'),
  };
}

function liesBetween(value, start, end) {
  return (value - start) * (value - end) <= 0 && value !== start && value !== end;
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function smoothStepDerivative(value) {
  return 6 * value * (1 - value);
}

function normalizeDirection(value) {
  const number = Number(value);
  return number < 0 ? -1 : number > 0 ? 1 : 0;
}

function nonnegativeInteger(value) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonnegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finite(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw hingeError('HINGE_VALUE_NONFINITE', `${path} must be finite.`);
  return number;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hingeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function finalizeState(state) {
  const normalized = normalizeStateShape(state);
  normalized.stateHash = stableHash({ ...normalized, stateHash: undefined }).slice(0, 24);
  return deepFreeze(normalized);
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
