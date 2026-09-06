import { stableHash } from '../../core/stableHash.js';
import { createMonotonePchip } from '../math/monotonePchip.js';

export const PMM_HINGE_3D_VERSION = 'p18-pmm-hinge-3d-v1';

export function createPmmHinge3dProperty(input = {}) {
  const property = {
    id: String(input.id || 'PMM-HINGE-3D'),
    axialStiffness: positive(input.axialStiffness, 'axialStiffness'),
    rotationalStiffnessY: positive(input.rotationalStiffnessY ?? input.rotationalStiffness, 'rotationalStiffnessY'),
    rotationalStiffnessZ: positive(input.rotationalStiffnessZ ?? input.rotationalStiffness, 'rotationalStiffnessZ'),
    momentY: backbone(input.momentY || input),
    momentZ: backbone(input.momentZ || input),
    interactionExponent: positive(input.interactionExponent ?? 1.5, 'interactionExponent'),
    axialCapacityTableY: capacityTable(input.axialCapacityTableY || input.axialCapacityTable || null),
    axialCapacityTableZ: capacityTable(input.axialCapacityTableZ || input.axialCapacityTable || null),
    axialReference: Number(input.axialReference || 0),
    projectionCapacityMode: normalizeProjectionCapacityMode(input.projectionCapacityMode),
  };
  const core = { version: PMM_HINGE_3D_VERSION, ...property };
  return deepFreeze({ ...core, propertyHash: stableHash(core) });
}

/** FEMA/ASCE generalized backbone as a function of accumulated plastic rotation. */
export function evaluateFemaBackbonePlasticRotation(backboneInput, plasticRotation) {
  const data = backbone(backboneInput);
  const rotation = Number(plasticRotation);
  if (!Number.isFinite(rotation)) throw codedError('PMM_ROTATION_INVALID', 'Plastic rotation must be finite.');
  const sign = rotation < 0 ? -1 : 1;
  const value = Math.abs(rotation);
  let magnitude;
  let tangent;
  let branch;
  if (value <= data.thetaP) {
    magnitude = data.mu * (1 + (data.rc - 1) * value / data.thetaP);
    tangent = data.mu * (data.rc - 1) / data.thetaP;
    branch = value === data.thetaP ? 'cap' : 'hardening';
  } else if (value <= data.thetaP + data.thetaPC) {
    const ratio = (value - data.thetaP) / data.thetaPC;
    magnitude = data.mu * (data.rc + (data.rr - data.rc) * ratio);
    tangent = data.mu * (data.rr - data.rc) / data.thetaPC;
    branch = value === data.thetaP + data.thetaPC ? 'residual-boundary' : 'post-capping';
  } else {
    magnitude = data.mu * data.rr;
    tangent = 0;
    branch = 'residual';
  }
  return Object.freeze({ moment: sign * magnitude, tangent, branch, plasticRotation: rotation });
}

export function evaluatePmmHinge3d(propertyInput, deformation = {}, state = null, options = {}) {
  const property = propertyInput?.propertyHash ? propertyInput : createPmmHinge3dProperty(propertyInput);
  const axialDeformation = finite(deformation.axial ?? deformation.u ?? 0, 'axial');
  const thetaY = finite(deformation.thetaY ?? deformation.ry ?? 0, 'thetaY');
  const thetaZ = finite(deformation.thetaZ ?? deformation.rz ?? 0, 'thetaZ');
  const axialForce = property.axialReference + property.axialStiffness * axialDeformation;
  const capacityY = capacityAt(property, 'Y', axialForce);
  const capacityZ = capacityAt(property, 'Z', axialForce);
  const plasticInput = options.inputIsPlasticRotation === true;
  const rawY = evaluateUniaxialResponse(property.momentY, thetaY, capacityY.value, property.rotationalStiffnessY, plasticInput);
  const rawZ = evaluateUniaxialResponse(property.momentZ, thetaZ, capacityZ.value, property.rotationalStiffnessZ, plasticInput);
  const projectionMode = options.projectionCapacityMode || property.projectionCapacityMode;
  const projected = projectBiaxialMoments({
    momentY: rawY.moment,
    momentZ: rawZ.moment,
    capacityY: projectionMode === 'current-backbone-ordinate' ? Math.max(1e-30, Math.abs(rawY.moment)) : capacityY.value,
    capacityZ: projectionMode === 'current-backbone-ordinate' ? Math.max(1e-30, Math.abs(rawZ.moment)) : capacityZ.value,
    exponent: property.interactionExponent,
    activeY: Math.abs(thetaY) > 1e-16,
    activeZ: Math.abs(thetaZ) > 1e-16,
  });
  const response = {
    version: PMM_HINGE_3D_VERSION,
    propertyHash: property.propertyHash,
    deformation: { axial: axialDeformation, thetaY, thetaZ },
    force: { axial: axialForce, momentY: projected.momentY, momentZ: projected.momentZ },
    capacity: { y: capacityY, z: capacityZ },
    backbone: { y: rawY, z: rawZ },
    interaction: projected,
    state: {
      ...(state || {}),
      committedDeformation: { axial: axialDeformation, thetaY, thetaZ },
      plasticRotation: { y: rawY.plasticRotation, z: rawZ.plasticRotation },
      branch: { y: rawY.branch, z: rawZ.branch },
    },
  };
  response.tangent = finiteDifferenceTangent(property, response.deformation, response.force, options);
  return deepFreeze({ ...response, responseHash: stableHash(response) });
}

export function projectBiaxialMoments(input = {}) {
  const my = finite(input.momentY ?? 0, 'momentY');
  const mz = finite(input.momentZ ?? 0, 'momentZ');
  const cy = positive(input.capacityY ?? (Math.abs(my) || 1), 'capacityY');
  const cz = positive(input.capacityZ ?? (Math.abs(mz) || 1), 'capacityZ');
  const exponent = positive(input.exponent ?? 1.5, 'interactionExponent');
  const activeY = input.activeY ?? Math.abs(my) > 0;
  const activeZ = input.activeZ ?? Math.abs(mz) > 0;
  const phiPower = (activeY ? Math.abs(my / cy) ** exponent : 0) + (activeZ ? Math.abs(mz / cz) ** exponent : 0);
  const phi = phiPower ** (1 / exponent);
  const beta = phi > 1 ? 1 / phi : 1;
  return Object.freeze({ momentY: beta * my, momentZ: beta * mz, phi, beta, exponent, activeY, activeZ });
}

export function createPmmHinge3dState(initial = {}) {
  let committed = clone(initial);
  let trial = clone(initial);
  return Object.freeze({
    get committed() { return clone(committed); },
    get trial() { return clone(trial); },
    setTrial(value) { trial = clone(value); return clone(trial); },
    commit() { committed = clone(trial); return clone(committed); },
    revert() { trial = clone(committed); return clone(trial); },
    reset() { committed = {}; trial = {}; return {}; },
  });
}

export function evaluatePmmHingeElasticUnload(input = {}) {
  const committedRotation = finite(input.committedRotation, 'committedRotation');
  const committedMoment = finite(input.committedMoment, 'committedMoment');
  const trialRotation = finite(input.trialRotation, 'trialRotation');
  const elasticStiffness = positive(input.elasticStiffness, 'elasticStiffness');
  const moment = committedMoment + elasticStiffness * (trialRotation - committedRotation);
  const core = {
    version: PMM_HINGE_3D_VERSION,
    committedRotation,
    committedMoment,
    trialRotation,
    elasticStiffness,
    moment,
    tangent: elasticStiffness,
    branch: 'elastic-unload-reload',
  };
  return Object.freeze({ ...core, responseHash: stableHash(core) });
}

function capacityAt(property, axis, axialForce) {
  const table = axis === 'Y' ? property.axialCapacityTableY : property.axialCapacityTableZ;
  const base = axis === 'Y' ? property.momentY.mu : property.momentZ.mu;
  if (!table) return Object.freeze({ value: base, derivative: 0, source: 'constant' });
  const evaluated = table.evaluate(axialForce);
  return Object.freeze({ ...evaluated, source: 'monotone-pchip', tableHash: table.tableHash });
}

function capacityTable(value) {
  if (!value) return null;
  const x = value.axialForces || value.x || value.N;
  const y = value.moments || value.y || value.M;
  return createMonotonePchip(x, y);
}

function backbone(value) {
  return Object.freeze({
    mu: positive(value.mu ?? value.Mu ?? 1e8, 'mu'),
    thetaP: positive(value.thetaP ?? 0.02, 'thetaP'),
    thetaPC: positive(value.thetaPC ?? 0.04, 'thetaPC'),
    rc: positive(value.rc ?? value.Rc ?? 1.25, 'rc'),
    rr: nonnegative(value.rr ?? value.Rr ?? 0.2, 'rr'),
  });
}

function evaluateUniaxialResponse(data, rotation, capacity, stiffness, plasticInput) {
  if (plasticInput) {
    if (Math.abs(rotation) <= 1e-16) return Object.freeze({ moment: 0, tangent: stiffness, branch: 'origin', plasticRotation: 0 });
    return evaluateFemaBackbonePlasticRotation({ ...data, mu: capacity }, rotation);
  }
  const yieldRotation = capacity / stiffness;
  if (Math.abs(rotation) <= yieldRotation) return Object.freeze({
    moment: stiffness * rotation,
    tangent: stiffness,
    branch: 'elastic',
    plasticRotation: 0,
  });
  const plasticRotation = Math.sign(rotation) * (Math.abs(rotation) - yieldRotation);
  return evaluateFemaBackbonePlasticRotation({ ...data, mu: capacity }, plasticRotation);
}

function finiteDifferenceTangent(property, deformation, baseForce, options) {
  const components = ['axial', 'thetaY', 'thetaZ'];
  const forceKeys = ['axial', 'momentY', 'momentZ'];
  const tangent = Array.from({ length: 3 }, () => new Array(3).fill(0));
  for (let column = 0; column < components.length; column += 1) {
    const key = components[column];
    const scale = Math.max(1, Math.abs(deformation[key]));
    const step = Math.max(1e-10, Number(options.tangentStep || 1e-7) * scale);
    const shifted = { ...deformation, [key]: deformation[key] + step };
    const force = evaluateWithoutTangent(property, shifted, options);
    for (let row = 0; row < forceKeys.length; row += 1) tangent[row][column] = (force[forceKeys[row]] - baseForce[forceKeys[row]]) / step;
  }
  return Object.freeze({ method: 'one-sided-numerical-algorithmic-difference', matrix: deepFreeze(tangent), inputOrder: components, outputOrder: forceKeys });
}

function evaluateWithoutTangent(property, deformation, options) {
  const axial = property.axialReference + property.axialStiffness * deformation.axial;
  const cy = capacityAt(property, 'Y', axial);
  const cz = capacityAt(property, 'Z', axial);
  const plasticInput = options.inputIsPlasticRotation === true;
  const y = evaluateUniaxialResponse(property.momentY, deformation.thetaY, cy.value, property.rotationalStiffnessY, plasticInput);
  const z = evaluateUniaxialResponse(property.momentZ, deformation.thetaZ, cz.value, property.rotationalStiffnessZ, plasticInput);
  const projectionMode = options.projectionCapacityMode || property.projectionCapacityMode;
  const projected = projectBiaxialMoments({
    momentY: y.moment,
    momentZ: z.moment,
    capacityY: projectionMode === 'current-backbone-ordinate' ? Math.max(1e-30, Math.abs(y.moment)) : cy.value,
    capacityZ: projectionMode === 'current-backbone-ordinate' ? Math.max(1e-30, Math.abs(z.moment)) : cz.value,
    exponent: property.interactionExponent,
    activeY: Math.abs(deformation.thetaY) > 1e-16,
    activeZ: Math.abs(deformation.thetaZ) > 1e-16,
  });
  return { axial, momentY: projected.momentY, momentZ: projected.momentZ };
}

function normalizeProjectionCapacityMode(value) {
  const mode = value || 'yield-capacity';
  if (!['yield-capacity', 'current-backbone-ordinate'].includes(mode)) {
    throw codedError('PMM_PROPERTY_INVALID', 'projectionCapacityMode must be yield-capacity or current-backbone-ordinate.');
  }
  return mode;
}

function positive(value, label) { const number = Number(value); if (!Number.isFinite(number) || number <= 0) throw codedError('PMM_PROPERTY_INVALID', `${label} must be positive.`); return number; }
function nonnegative(value, label) { const number = Number(value); if (!Number.isFinite(number) || number < 0) throw codedError('PMM_PROPERTY_INVALID', `${label} must be nonnegative.`); return number; }
function finite(value, label) { const number = Number(value); if (!Number.isFinite(number)) throw codedError('PMM_DEFORMATION_INVALID', `${label} must be finite.`); return number; }
function codedError(code, message) { return Object.assign(new Error(message), { code }); }
function clone(value) { return value == null ? {} : typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
