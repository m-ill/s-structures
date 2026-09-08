import { FIBER_MATERIAL_MODEL_VERSION } from '../../metadata/numericVersions.js';
export { FIBER_MATERIAL_MODEL_VERSION };
import { stableHash } from '../../core/stableHash.js';



const MATERIAL_UNITS = Object.freeze({
  stress: 'Pa',
  strain: '1',
  tangent: 'Pa',
  energyDensity: 'J/m3',
});

export function createSteelBilinearMaterial(options = {}) {
  validateUnits(options.units);
  const E = positive(options.E, 'E');
  const Fy = positive(options.Fy ?? options.fy, 'Fy');
  const hardeningRatio = bounded(options.hardeningRatio ?? options.b ?? 0.01, 'hardeningRatio', 0, 1, false);
  const postYieldTangent = hardeningRatio * E;
  const kinematicModulus = hardeningRatio === 0 ? 0 : postYieldTangent * E / (E - postYieldTangent);
  return finishMaterial({
    id: requiredId(options.id || 'steel-bilinear', 'material'),
    type: 'steel-bilinear-kinematic',
    units: MATERIAL_UNITS,
    parameters: {
      E,
      Fy,
      yieldStrain: Fy / E,
      hardeningRatio,
      postYieldTangent,
      kinematicModulus,
      yieldTolerance: nonNegative(options.yieldTolerance ?? Fy * 1e-12, 'yieldTolerance'),
    },
    sourceSnapshot: clone(options.sourceSnapshot || null),
    qualification: qualification(options.qualification || 'candidate'),
  });
}

export function createConcreteMaterial(options = {}) {
  validateUnits(options.units);
  const E = positive(options.E, 'E');
  const fc = positive(options.fc, 'fc');
  const ft = positive(options.ft, 'ft');
  const epsc0 = positive(options.epsc0 ?? (2 * fc) / E, 'epsc0');
  const epscu = positive(options.epscu ?? 1.75 * epsc0, 'epscu');
  if (!(epscu > epsc0)) throw materialError('FIBER_MATERIAL_PARAMETER_INVALID', 'epscu must exceed epsc0.');
  const tensionCrackStrain = ft / E;
  const tensionUltimateStrain = positive(options.tensionUltimateStrain ?? options.epsTu ?? 10 * tensionCrackStrain, 'tensionUltimateStrain');
  if (!(tensionUltimateStrain > tensionCrackStrain)) {
    throw materialError('FIBER_MATERIAL_PARAMETER_INVALID', 'Tension ultimate strain must exceed cracking strain.');
  }
  const confinement = normalizeConfinement(options.confinement, fc, epsc0, epscu);
  return finishMaterial({
    id: requiredId(options.id || (confinement.enabled ? 'concrete-core' : 'concrete-cover'), 'material'),
    type: 'concrete-compression-tension-damage',
    units: MATERIAL_UNITS,
    parameters: {
      E,
      unconfinedFc: fc,
      fc: confinement.fc,
      epsc0: confinement.epsc0,
      epscu: confinement.epscu,
      residualCompressionRatio: bounded(options.residualCompressionRatio ?? 0.2, 'residualCompressionRatio', 0, 1, true),
      ft,
      tensionCrackStrain,
      tensionUltimateStrain,
      compressionUnloadDamage: bounded(options.compressionUnloadDamage ?? 0.75, 'compressionUnloadDamage', 0, 1, true),
      tensionUnloadDamage: bounded(options.tensionUnloadDamage ?? 0.9, 'tensionUnloadDamage', 0, 1, true),
      minimumUnloadRatio: bounded(options.minimumUnloadRatio ?? 0.05, 'minimumUnloadRatio', 0, 1, false),
      confinement,
    },
    sourceSnapshot: clone(options.sourceSnapshot || null),
    qualification: qualification(options.qualification || (confinement.enabled ? 'candidate' : 'assumed')),
  });
}

export function createFiberMaterialState(material) {
  validateMaterial(material);
  const E = material.parameters.E;
  return stateWithHash({
    version: FIBER_MATERIAL_MODEL_VERSION,
    materialId: material.id,
    materialHash: material.contentHash,
    type: material.type,
    status: 'committed',
    step: 0,
    strain: 0,
    stress: 0,
    tangent: E,
    branch: 'origin',
    direction: 0,
    plasticStrain: 0,
    backStress: 0,
    history: {
      minStrain: 0,
      maxStrain: 0,
      reversalCount: 0,
      lastReversal: null,
      accumulatedPlasticStrain: 0,
      compressionDamage: 0,
      tensionDamage: 0,
    },
    energy: energyState(),
  });
}

export function evaluateFiberMaterialTrial(material, committedState, strain) {
  validateMaterial(material);
  const base = committedState || createFiberMaterialState(material);
  validateCommittedState(material, base);
  const target = finite(strain, 'strain');
  const evaluated = material.type === 'steel-bilinear-kinematic'
    ? evaluateSteel(material, base, target)
    : material.type === 'concrete-compression-tension-damage'
      ? evaluateConcrete(material, base, target)
      : unsupportedMaterial(material.type);
  const direction = Math.sign(target - base.strain);
  const reversal = direction !== 0 && base.direction !== 0 && direction !== base.direction;
  const history = {
    ...clone(base.history),
    ...clone(evaluated.history || {}),
    reversalCount: base.history.reversalCount + (reversal ? 1 : 0),
    lastReversal: reversal ? { strain: base.strain, stress: base.stress, from: base.direction, to: direction } : clone(base.history.lastReversal),
  };
  const workIncrement = evaluated.workIncrement
    ?? 0.5 * (base.stress + evaluated.stress) * (target - base.strain);
  const energy = {
    workIncrement,
    work: base.energy.work + workIncrement,
    recoverable: evaluated.recoverable,
    dissipated: Math.max(base.energy.dissipated, evaluated.dissipated),
    plasticIncrement: evaluated.plasticDissipationIncrement || 0,
  };
  energy.balanceResidual = energy.work - energy.recoverable - energy.dissipated;
  const trialState = stateWithHash({
    version: FIBER_MATERIAL_MODEL_VERSION,
    materialId: material.id,
    materialHash: material.contentHash,
    type: material.type,
    status: 'trial',
    step: base.step,
    strain: target,
    stress: evaluated.stress,
    tangent: evaluated.tangent,
    branch: evaluated.branch,
    direction: direction || base.direction,
    plasticStrain: evaluated.plasticStrain,
    backStress: evaluated.backStress,
    history,
    energy,
  });
  const core = {
    version: FIBER_MATERIAL_MODEL_VERSION,
    contract: 'fiber-material-trial-v1',
    materialId: material.id,
    materialHash: material.contentHash,
    baseState: clone(base),
    state: trialState,
    response: {
      strain: target,
      stress: evaluated.stress,
      tangent: evaluated.tangent,
      yielded: Boolean(evaluated.yielded),
      branch: evaluated.branch,
      energy: clone(energy),
      units: MATERIAL_UNITS,
    },
  };
  return deepFreeze({ ...core, contentHash: stableHash(core) });
}

/**
 * Compiles the monotonic material envelope used while generating a PMM surface.
 * It deliberately omits committed history, hashes, and energy bookkeeping; those
 * remain mandatory in evaluateFiberMaterialTrial during the actual analysis.
 */
export function createFiberMaterialEnvelopeEvaluator(material) {
  validateMaterial(material);
  if (material.type === 'steel-bilinear-kinematic') {
    const parameters = material.parameters;
    return (strain) => evaluateSteelEnvelopeUnchecked(parameters, finite(strain, 'strain'));
  }
  if (material.type === 'concrete-compression-tension-damage') {
    const parameters = material.parameters;
    return (strain) => evaluateConcreteEnvelopeUnchecked(parameters, finite(strain, 'strain'));
  }
  return unsupportedMaterial(material.type);
}

export function evaluateFiberMaterialEnvelope(material, strain) {
  return createFiberMaterialEnvelopeEvaluator(material)(strain);
}

export function commitFiberMaterialTrial(trial) {
  validateTrial(trial);
  return stateWithHash({
    ...clone(trial.state),
    status: 'committed',
    step: Number(trial.baseState.step) + 1,
  });
}

export function rollbackFiberMaterialTrial(trial) {
  validateTrial(trial);
  return deepFreeze(clone(trial.baseState));
}

export function concreteEnvelopeResponse(material, strain) {
  validateMaterial(material);
  if (material.type !== 'concrete-compression-tension-damage') {
    throw materialError('FIBER_MATERIAL_TYPE_INVALID', 'Concrete envelope evaluation requires a concrete material.');
  }
  return deepFreeze(evaluateConcreteEnvelopeUnchecked(material.parameters, finite(strain, 'strain')));
}

function evaluateSteelEnvelopeUnchecked(p, epsilon) {
  const elasticPredictor = p.E * epsilon;
  const yieldFunction = Math.abs(elasticPredictor) - p.Fy;
  if (yieldFunction <= p.yieldTolerance) {
    return { stress: elasticPredictor, tangent: p.E, branch: Math.abs(epsilon) <= 1e-18 ? 'origin' : 'elastic', yielded: false };
  }
  const sign = Math.sign(elasticPredictor) || 1;
  const plasticIncrement = yieldFunction / (p.E + p.kinematicModulus);
  return {
    stress: elasticPredictor - p.E * plasticIncrement * sign,
    tangent: p.kinematicModulus === 0 ? 0 : p.E * p.kinematicModulus / (p.E + p.kinematicModulus),
    branch: sign > 0 ? 'plastic-positive' : 'plastic-negative',
    yielded: true,
  };
}

function evaluateConcreteEnvelopeUnchecked(p, epsilon) {
  if (Math.abs(epsilon) <= 1e-18) return { stress: 0, tangent: p.E, branch: 'origin', yielded: false };
  if (epsilon > 0) {
    if (epsilon <= p.tensionCrackStrain) return { stress: p.E * epsilon, tangent: p.E, branch: 'tension-elastic', yielded: false };
    if (epsilon < p.tensionUltimateStrain) {
      const span = p.tensionUltimateStrain - p.tensionCrackStrain;
      const ratio = (epsilon - p.tensionCrackStrain) / span;
      return { stress: p.ft * (1 - ratio), tangent: -p.ft / span, branch: 'tension-softening', yielded: true };
    }
    return { stress: 0, tangent: 0, branch: 'tension-cracked', yielded: true };
  }
  const magnitude = -epsilon;
  if (magnitude <= p.epsc0) {
    const x = magnitude / p.epsc0;
    return {
      stress: -p.fc * (2 * x - x ** 2),
      tangent: (2 * p.fc / p.epsc0) * (1 - x),
      branch: 'compression-ascending',
      yielded: false,
    };
  }
  if (magnitude < p.epscu) {
    const span = p.epscu - p.epsc0;
    const ratio = (magnitude - p.epsc0) / span;
    return {
      stress: -p.fc * (1 - (1 - p.residualCompressionRatio) * ratio),
      tangent: -p.fc * (1 - p.residualCompressionRatio) / span,
      branch: 'compression-descending',
      yielded: true,
    };
  }
  return {
    stress: -p.fc * p.residualCompressionRatio,
    tangent: 0,
    branch: 'compression-residual',
    yielded: true,
  };
}

export const trialFiberMaterialState = evaluateFiberMaterialTrial;
export const commitFiberMaterialState = commitFiberMaterialTrial;
export const rollbackFiberMaterialState = rollbackFiberMaterialTrial;

function evaluateSteel(material, base, strain) {
  const { E, Fy, kinematicModulus: H, yieldTolerance } = material.parameters;
  const elasticPredictor = E * (strain - base.plasticStrain);
  const relativeStress = elasticPredictor - base.backStress;
  const yieldFunction = Math.abs(relativeStress) - Fy;
  let stress = elasticPredictor;
  let tangent = E;
  let plasticStrain = base.plasticStrain;
  let backStress = base.backStress;
  let plasticIncrement = 0;
  let branch = 'elastic';
  if (yieldFunction > yieldTolerance) {
    const sign = Math.sign(relativeStress) || 1;
    plasticIncrement = yieldFunction / (E + H);
    plasticStrain += plasticIncrement * sign;
    backStress += H * plasticIncrement * sign;
    stress = elasticPredictor - E * plasticIncrement * sign;
    tangent = H === 0 ? 0 : E * H / (E + H);
    branch = sign > 0 ? 'plastic-positive' : 'plastic-negative';
  }
  const recoverable = 0.5 * stress ** 2 / E + (H > 0 ? 0.5 * backStress ** 2 / H : 0);
  const plasticDissipationIncrement = Fy * plasticIncrement;
  return {
    stress,
    tangent,
    plasticStrain,
    backStress,
    branch,
    yielded: plasticIncrement > 0,
    recoverable,
    workIncrement: recoverable - base.energy.recoverable + plasticDissipationIncrement,
    plasticDissipationIncrement,
    dissipated: base.energy.dissipated + plasticDissipationIncrement,
    history: {
      minStrain: Math.min(base.history.minStrain, strain),
      maxStrain: Math.max(base.history.maxStrain, strain),
      accumulatedPlasticStrain: base.history.accumulatedPlasticStrain + plasticIncrement,
    },
  };
}

function evaluateConcrete(material, base, strain) {
  const p = material.parameters;
  const envelope = concreteEnvelopeResponse(material, strain);
  let response = envelope;
  let compressionDamage = base.history.compressionDamage;
  let tensionDamage = base.history.tensionDamage;
  const minStrain = Math.min(base.history.minStrain, strain);
  const maxStrain = Math.max(base.history.maxStrain, strain);
  if (strain < 0 && strain > base.history.minStrain && base.history.minStrain < 0) {
    const peak = concreteEnvelopeResponse(material, base.history.minStrain);
    compressionDamage = compressionDamageAt(p, -base.history.minStrain);
    response = unloadingResponse(
      strain,
      base.history.minStrain,
      peak.stress,
      p.E,
      compressionDamage,
      p.minimumUnloadRatio,
      envelope,
      'compression-unloading-reloading',
      -1,
    );
  } else if (strain > 0 && strain < base.history.maxStrain && base.history.maxStrain > 0) {
    const peak = concreteEnvelopeResponse(material, base.history.maxStrain);
    tensionDamage = tensionDamageAt(p, base.history.maxStrain);
    response = unloadingResponse(
      strain,
      base.history.maxStrain,
      peak.stress,
      p.E,
      tensionDamage,
      p.minimumUnloadRatio,
      envelope,
      'tension-unloading-reloading',
      1,
    );
  }
  if (strain <= base.history.minStrain) compressionDamage = compressionDamageAt(p, -strain);
  if (strain >= base.history.maxStrain) tensionDamage = tensionDamageAt(p, strain);
  const recoverable = response.tangent > 0 ? 0.5 * response.stress ** 2 / Math.max(response.tangent, p.E * p.minimumUnloadRatio) : 0;
  const workIncrement = 0.5 * (base.stress + response.stress) * (strain - base.strain);
  const trialWork = base.energy.work + workIncrement;
  return {
    stress: response.stress,
    tangent: response.tangent,
    plasticStrain: 0,
    backStress: 0,
    branch: response.branch,
    yielded: response.branch.includes('softening') || response.branch.includes('descending') || response.branch.includes('residual'),
    recoverable,
    plasticDissipationIncrement: 0,
    dissipated: Math.max(base.energy.dissipated, trialWork - recoverable, 0),
    history: { minStrain, maxStrain, compressionDamage, tensionDamage },
  };
}

function unloadingResponse(strain, extremeStrain, extremeStress, E, damage, minimumRatio, envelope, branch, sign) {
  const slope = E * Math.max(minimumRatio, 1 - damage);
  const zeroStrain = extremeStrain - extremeStress / slope;
  const lineStress = slope * (strain - zeroStrain);
  if ((sign < 0 && lineStress >= 0) || (sign > 0 && lineStress <= 0)) {
    return { stress: 0, tangent: 0, branch: `${branch}-open` };
  }
  const lineIsInside = sign < 0 ? lineStress > envelope.stress : lineStress < envelope.stress;
  return lineIsInside
    ? { stress: lineStress, tangent: slope, branch }
    : envelope;
}

function compressionDamageAt(p, strainMagnitude) {
  if (strainMagnitude <= p.epsc0) return 0;
  const ratio = Math.min(1, (strainMagnitude - p.epsc0) / (p.epscu - p.epsc0));
  return p.compressionUnloadDamage * ratio;
}

function tensionDamageAt(p, strain) {
  if (strain <= p.tensionCrackStrain) return 0;
  const ratio = Math.min(1, (strain - p.tensionCrackStrain) / (p.tensionUltimateStrain - p.tensionCrackStrain));
  return p.tensionUnloadDamage * ratio;
}

function normalizeConfinement(input, fc, epsc0, epscu) {
  if (!input || input.enabled === false) return deepFreeze({ enabled: false, model: 'none', fc, epsc0, epscu, strengthFactor: 1, strainFactor: 1 });
  const lateralPressure = input.lateralPressure == null ? null : nonNegative(input.lateralPressure, 'confinement.lateralPressure');
  const coefficient = positive(input.strengthCoefficient ?? 4.1, 'confinement.strengthCoefficient');
  const inferredStrength = lateralPressure == null ? 1 : 1 + coefficient * lateralPressure / fc;
  const strengthFactor = positive(input.strengthFactor ?? inferredStrength, 'confinement.strengthFactor');
  if (strengthFactor < 1) throw materialError('FIBER_MATERIAL_PARAMETER_INVALID', 'Confinement strengthFactor must be at least one.');
  const strainFactor = positive(input.strainFactor ?? (1 + 5 * (strengthFactor - 1)), 'confinement.strainFactor');
  const ultimateStrainFactor = positive(input.ultimateStrainFactor ?? (1 + 10 * (strengthFactor - 1)), 'confinement.ultimateStrainFactor');
  return deepFreeze({
    enabled: true,
    model: clean(input.model) || 'effective-lateral-pressure-factors',
    lateralPressure,
    strengthCoefficient: coefficient,
    strengthFactor,
    strainFactor,
    ultimateStrainFactor,
    fc: fc * strengthFactor,
    epsc0: epsc0 * strainFactor,
    epscu: epscu * ultimateStrainFactor,
    source: clone(input.source || null),
  });
}

function finishMaterial(input) {
  const core = {
    version: FIBER_MATERIAL_MODEL_VERSION,
    contract: 'serializable-uniaxial-fiber-material-v1',
    id: input.id,
    type: input.type,
    units: input.units,
    signConvention: 'tension-positive, compression-negative',
    parameters: input.parameters,
    sourceSnapshot: input.sourceSnapshot,
    sourceSnapshotHash: input.sourceSnapshot == null ? null : stableHash(input.sourceSnapshot),
    qualification: input.qualification,
  };
  return deepFreeze({ ...core, contentHash: stableHash(core) });
}

function stateWithHash(value) {
  const core = clone(value);
  delete core.stateHash;
  return deepFreeze({ ...core, stateHash: stableHash(core) });
}

function validateMaterial(material) {
  if (!material || material.version !== FIBER_MATERIAL_MODEL_VERSION || !material.contentHash) {
    throw materialError('FIBER_MATERIAL_CONTRACT_INVALID', 'A valid P8-M6 material contract is required.');
  }
  const { contentHash, ...core } = material;
  if (stableHash(core) !== contentHash) throw materialError('FIBER_MATERIAL_HASH_MISMATCH', 'Material content hash does not match.');
}

function validateCommittedState(material, state) {
  if (!state || state.status !== 'committed' || state.materialHash !== material.contentHash || state.materialId !== material.id) {
    throw materialError('FIBER_MATERIAL_STATE_INVALID', 'Committed state does not match the material.');
  }
  const { stateHash, ...core } = state;
  if (stableHash(core) !== stateHash) throw materialError('FIBER_MATERIAL_STATE_HASH_MISMATCH', 'Material state hash does not match.');
}

function validateTrial(trial) {
  if (!trial || trial.version !== FIBER_MATERIAL_MODEL_VERSION || trial.contract !== 'fiber-material-trial-v1') {
    throw materialError('FIBER_MATERIAL_TRIAL_INVALID', 'A valid material trial is required.');
  }
  const { contentHash, ...core } = trial;
  if (!contentHash || stableHash(core) !== contentHash) throw materialError('FIBER_MATERIAL_TRIAL_HASH_MISMATCH', 'Material trial hash does not match.');
}

function validateUnits(units) {
  if (!units) return;
  if ((units.stress && units.stress !== 'Pa') || (units.strain && !['1', 'dimensionless'].includes(units.strain))) {
    throw materialError('FIBER_MATERIAL_UNIT_UNSUPPORTED', 'Fiber materials require Pa stress and dimensionless strain.');
  }
}

function energyState() {
  return { workIncrement: 0, work: 0, recoverable: 0, dissipated: 0, plasticIncrement: 0, balanceResidual: 0 };
}

function unsupportedMaterial(type) {
  throw materialError('FIBER_MATERIAL_TYPE_UNSUPPORTED', `Unsupported fiber material type ${type}.`);
}

function positive(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number) || !(number > 0)) throw materialError('FIBER_MATERIAL_PARAMETER_INVALID', `${path} must be positive.`);
  return number;
}

function nonNegative(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw materialError('FIBER_MATERIAL_PARAMETER_INVALID', `${path} must be nonnegative.`);
  return number;
}

function bounded(value, path, minimum, maximum, includeMaximum) {
  const number = Number(value);
  const upperOk = includeMaximum ? number <= maximum : number < maximum;
  if (!Number.isFinite(number) || number < minimum || !upperOk) {
    throw materialError('FIBER_MATERIAL_PARAMETER_INVALID', `${path} must be in [${minimum}, ${maximum}${includeMaximum ? ']' : ')'}.`);
  }
  return number;
}

function finite(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw materialError('FIBER_MATERIAL_PARAMETER_INVALID', `${path} must be finite.`);
  return number;
}

function qualification(value) {
  const normalized = clean(value).toLowerCase();
  if (!['assumed', 'preliminary', 'candidate', 'verified'].includes(normalized)) {
    throw materialError('FIBER_MATERIAL_QUALIFICATION_INVALID', `Unsupported qualification ${value}.`);
  }
  return normalized;
}

function requiredId(value, label) {
  const id = clean(value);
  if (!id) throw materialError('FIBER_MATERIAL_ID_REQUIRED', `${label} ID is required.`);
  return id;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function materialError(code, message) {
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
