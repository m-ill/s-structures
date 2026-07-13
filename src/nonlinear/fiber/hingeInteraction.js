import { evaluateHingeTrial } from '../materials/hingeCyclic.js';
import { scaleHingePropertyForInteraction } from '../properties/hingeRegistry.js';
import { createPmmSurfaceEvaluator } from './pmmSurface.js';

export const FIBER_HINGE_INTERACTION_VERSION = 'p8-m6-fiber-hinge-interaction-v1';

const evaluatorCache = new Map();

export function evaluateFiberCoupledHingeTrial(rotation, assignment, committedState, forceState = {}, context = {}) {
  if (!assignment?.pmmInteraction) {
    return {
      response: evaluateHingeTrial(rotation, assignment.property, committedState, context),
      property: assignment.property,
      interaction: null,
      sensitivities: { axialForce: 0, momentY: 0, momentZ: 0 },
    };
  }
  const current = evaluateInteractionProperty(assignment, forceState, { ...context, rotation });
  const response = evaluateHingeTrial(rotation, current.property, committedState, {
    ...context,
    pmmInteraction: current.trace,
  });
  const sensitivities = interactionSensitivities(
    rotation,
    assignment,
    committedState,
    normalizeForceState(forceState),
    response.moment,
    context,
  );
  return {
    response,
    property: current.property,
    interaction: current.trace,
    sensitivities,
  };
}

export function evaluateInteractionProperty(assignment, forceState = {}, context = {}) {
  const interaction = assignment?.pmmInteraction;
  if (!interaction?.surface) return { property: assignment.property, trace: null };
  const baseProperty = assignment.baseProperty || assignment.property;
  const state = normalizeForceState(forceState);
  const forceScale = positive(interaction.units?.analysisForceScale ?? 1000, 'analysisForceScale');
  const momentScale = positive(interaction.units?.analysisMomentScale ?? 1000, 'analysisMomentScale');
  const demandMagnitude = Math.hypot(state.momentY, state.momentZ);
  const negativeBranch = Number(context.rotation || 0) < 0;
  const angle = demandMagnitude > 1e-12
    ? Math.atan2(state.momentZ, state.momentY)
    : assignment.axis === 'z'
      ? negativeBranch ? 3 * Math.PI / 2 : Math.PI / 2
      : negativeBranch ? Math.PI : 0;
  const evaluator = evaluatorFor(interaction);
  const evaluated = evaluator.evaluate({
    axialForce: state.axialForce * forceScale,
    My: state.momentY * momentScale,
    Mz: state.momentZ * momentScale,
    angle,
    iterationId: context.iterationId || context.assignmentId || null,
  });
  if (!evaluated.ok) {
    throw interactionError(
      evaluated.reason || 'PMM_INTERACTION_BLOCKED',
      `Fiber PMM interaction blocked for ${assignment.memberId}:${assignment.end}:${assignment.axis}.`,
      { evaluated, forceState: state },
    );
  }
  if (!(evaluated.tangentScale > 1e-10)) {
    throw interactionError(
      'PMM_MOMENT_CAPACITY_EXHAUSTED',
      `Fiber PMM moment capacity is exhausted for ${assignment.memberId}:${assignment.end}:${assignment.axis}.`,
      { evaluated, forceState: state },
    );
  }
  const baseYieldMoment = yieldMomentForDemand(baseProperty, assignment, state, context);
  const absoluteMomentCapacity = evaluated.momentCapacity / momentScale;
  const absoluteMomentFactor = absoluteMomentCapacity / baseYieldMoment;
  if (!(absoluteMomentFactor > 1e-10) || !Number.isFinite(absoluteMomentFactor)) {
    throw interactionError(
      'PMM_ABSOLUTE_MOMENT_CAPACITY_INVALID',
      `Fiber PMM absolute moment capacity is invalid for ${assignment.memberId}:${assignment.end}:${assignment.axis}.`,
      { evaluated, baseYieldMoment, forceState: state },
    );
  }
  const trace = {
    version: FIBER_HINGE_INTERACTION_VERSION,
    sourceId: interaction.id,
    sourceHash: interaction.contentHash || interaction.surface.surfaceHash,
    surfaceHash: interaction.surface.surfaceHash,
    axialForce: state.axialForce,
    momentY: state.momentY,
    momentZ: state.momentZ,
    sectionAxialForce: evaluated.axialForce,
    momentCapacity: absoluteMomentCapacity,
    referenceMomentCapacity: evaluated.referenceMomentCapacity / momentScale,
    utilization: evaluated.utilization,
    insideSurface: evaluated.insideSurface,
    baseYieldMoment,
    momentFactor: absoluteMomentFactor,
    relativeAxialFactor: evaluated.tangentScale,
    rotationFactor: 1,
    tangentDerivatives: evaluated.tangentDerivatives,
    interpolation: evaluated.interpolation,
    iterationCoupled: true,
    yieldSurfaceExceeded: evaluated.insideSurface === false,
    clamped: false,
  };
  const property = scaleHingePropertyForInteraction(baseProperty, {
    momentFactor: trace.momentFactor,
    rotationFactor: trace.rotationFactor,
  }, trace);
  return { property, trace };
}

function yieldMomentForDemand(property, assignment, state, context) {
  const backbone = property?.parameters?.backbone;
  const component = assignment?.axis === 'y' ? state.momentY : state.momentZ;
  const side = (Math.abs(component) > 1e-12 ? component : Number(context.rotation || 0)) < 0
    ? backbone?.negative
    : backbone?.positive;
  const pointB = side?.find((point) => point?.id === 'B') || side?.[1];
  const moment = Math.abs(Number(pointB?.moment));
  if (!Number.isFinite(moment) || moment <= 1e-10) {
    throw interactionError('PMM_BASE_YIELD_MOMENT_INVALID', 'The base hinge B-point moment must be positive and finite.');
  }
  return moment;
}

function interactionSensitivities(rotation, assignment, committedState, state, baseMoment, context) {
  const interaction = assignment.pmmInteraction;
  const surface = interaction.surface;
  const forceScale = positive(interaction.units?.analysisForceScale ?? 1000, 'analysisForceScale');
  const momentScale = positive(interaction.units?.analysisMomentScale ?? 1000, 'analysisMomentScale');
  const ranges = {
    axialForce: Math.max(1e-6, (surface.axialBounds.tension - surface.axialBounds.compression) / forceScale * 1e-6),
    momentY: Math.max(1e-6, Math.abs(surface.intercepts.pureBending.myPositive) / momentScale * 1e-6),
    momentZ: Math.max(1e-6, Math.abs(surface.intercepts.pureBending.mzPositive) / momentScale * 1e-6),
  };
  return Object.fromEntries(Object.entries(ranges).map(([key, step]) => [
    key,
    finiteDifferenceMoment(key, step, rotation, assignment, committedState, state, baseMoment, context),
  ]));
}

function finiteDifferenceMoment(key, step, rotation, assignment, committedState, state, baseMoment, context) {
  const plus = { ...state, [key]: state[key] + step };
  const minus = { ...state, [key]: state[key] - step };
  const evaluate = (candidate) => {
    try {
      const property = evaluateInteractionProperty(assignment, candidate, context).property;
      return evaluateHingeTrial(rotation, property, committedState, context).moment;
    } catch (error) {
      if (['PMM_AXIAL_FORCE_OUT_OF_RANGE', 'PMM_MOMENT_CAPACITY_EXHAUSTED'].includes(error?.code)) return null;
      throw error;
    }
  };
  const upper = evaluate(plus);
  const lower = evaluate(minus);
  if (Number.isFinite(upper) && Number.isFinite(lower)) return (upper - lower) / (2 * step);
  if (Number.isFinite(upper)) return (upper - baseMoment) / step;
  if (Number.isFinite(lower)) return (baseMoment - lower) / step;
  throw interactionError('PMM_INTERACTION_DERIVATIVE_BLOCKED', `PMM derivative ${key} could not be evaluated.`);
}

function evaluatorFor(interaction) {
  const key = interaction.surface.surfaceHash;
  if (!evaluatorCache.has(key)) evaluatorCache.set(key, createPmmSurfaceEvaluator(interaction.surface));
  return evaluatorCache.get(key);
}

function normalizeForceState(value) {
  return {
    axialForce: finite(value.axialForce ?? value.N ?? 0, 'axialForce'),
    momentY: finite(value.momentY ?? value.My ?? 0, 'momentY'),
    momentZ: finite(value.momentZ ?? value.Mz ?? 0, 'momentZ'),
  };
}

function positive(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw interactionError('PMM_INTERACTION_UNIT_SCALE_INVALID', `${path} must be positive.`);
  return number;
}

function finite(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw interactionError('PMM_INTERACTION_FORCE_NONFINITE', `${path} must be finite.`);
  return number;
}

function interactionError(code, message, details = {}) {
  const error = new Error(message);
  error.name = 'FiberPmmInteractionError';
  error.code = code;
  Object.assign(error, details);
  return error;
}
