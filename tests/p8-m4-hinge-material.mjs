import assert from 'node:assert/strict';
import { stableHash } from '../src/core/stableHash.js';
import {
  createHingeBackbone,
  evaluateHingeEnvelope,
} from '../src/nonlinear/materials/hingeBackbone.js';
import {
  createHingeCyclicState,
  evaluateHingeTrial,
} from '../src/nonlinear/materials/hingeCyclic.js';
import { createHingeProperty } from '../src/nonlinear/properties/hingeRegistry.js';

const property = asymmetricProperty();
const backbone = property.parameters.backbone;

for (const [direction, side] of [[1, backbone.positive], [-1, backbone.negative]]) {
  for (const point of side) {
    const response = evaluateHingeEnvelope(direction * point.rotation, backbone, { direction });
    close(response.moment, direction * point.moment, 1e-12, `${direction}:${point.id} moment`);
  }
}

const smoothProbes = [0.005, 0.02, 0.06, -0.006, -0.025, -0.07];
let maxTangentError = 0;
for (const rotation of smoothProbes) {
  const response = evaluateHingeEnvelope(rotation, backbone);
  const step = 1e-7;
  const numerical = (
    evaluateHingeEnvelope(rotation + step, backbone).moment
    - evaluateHingeEnvelope(rotation - step, backbone).moment
  ) / (2 * step);
  const error = Math.abs(response.tangent - numerical) / Math.max(1, Math.abs(response.tangent), Math.abs(numerical));
  maxTangentError = Math.max(maxTangentError, error);
  assert.ok(error < 2e-10, `${rotation} tangent error ${error}`);
}

const origin = createHingeCyclicState(property);
const originHash = stableHash(origin);
const positiveYield = evaluateHingeTrial(0.011, property, origin);
assert.equal(stableHash(origin), originHash, 'trial evaluation must not mutate committed state');
assert.ok(positiveYield.events.some((event) => event.type === 'yield' && event.direction === 1));
const negativeYield = evaluateHingeTrial(-0.013, property, origin);
assert.ok(negativeYield.events.some((event) => event.type === 'yield' && event.direction === -1));
assert.notEqual(
  Math.abs(positiveYield.moment),
  Math.abs(negativeYield.moment),
  'positive and negative envelope capacities must remain independent',
);

const symmetric = symmetricProperty();
const positivePeak = evaluateHingeTrial(0.02, symmetric, createHingeCyclicState(symmetric)).trialState;
close(positivePeak.moment, 110, 1e-10, 'positive peak');
const residual = evaluateHingeTrial(0.009, symmetric, positivePeak);
close(residual.moment, 0, 2e-9, 'Masing residual rotation');
close(residual.trialState.zeroMomentRotation, 0.009, 2e-9, 'reported residual rotation');
const oppositePeak = evaluateHingeTrial(-0.02, symmetric, positivePeak).trialState;
close(oppositePeak.moment, -110, 2e-8, 'opposite Masing intersection');

const cycle = cyclicLoop(symmetric, positivePeak, 0.02, 0.00025);
const loopWork = cycle.integratedWork;
const stateWork = cycle.finalState.cumulativeWork - positivePeak.cumulativeWork;
const stateDissipation = cycle.finalState.dissipatedEnergy - positivePeak.dissipatedEnergy;
close(stateWork, loopWork, 2e-8, 'state work versus independent loop integral');
close(stateDissipation, loopWork, 2e-8, 'dissipated energy versus loop area');
assert.ok(loopWork > 0, 'closed hysteresis loop must dissipate positive energy');

const degrading = symmetricProperty({
  degradation: {
    referenceEnergy: 1000,
    strength: { perCycle: 0.1, perEnergy: 0, minimumFactor: 0.5 },
    stiffness: { perCycle: 0.05, perEnergy: 0, minimumFactor: 0.5 },
  },
});
let degradingState = createHingeCyclicState(degrading);
for (const rotation of [0.02, -0.02, 0.02]) {
  degradingState = evaluateHingeTrial(rotation, degrading, degradingState).trialState;
}
assert.equal(degradingState.cycleCount, 1);
close(degradingState.strengthFactor, 0.9, 1e-12, 'cycle strength factor');
close(degradingState.stiffnessFactor, 0.95, 1e-12, 'cycle stiffness factor');
assert.ok(degradingState.moment < positivePeak.moment, 'degraded positive peak must lose strength');

const isotropic = symmetricProperty({ hysteresis: { rule: 'isotropic' } });
let isotropicState = createHingeCyclicState(isotropic);
isotropicState = evaluateHingeTrial(0.02, isotropic, isotropicState).trialState;
const isotropicUnload = evaluateHingeTrial(-0.005, isotropic, isotropicState);
assert.equal(isotropicUnload.branch, 'isotropic-multilinear');
assert.notEqual(isotropicUnload.moment, evaluateHingeTrial(-0.005, symmetric, positivePeak).moment);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-HNG-01', 'NL-HNG-02', 'NL-HNG-03', 'NL-HNG-04', 'NL-HNG-05', 'NL-HNG-06'],
  maxTangentError,
  residualRotation: residual.rotation,
  loopEnergy: loopWork,
  degradedStrengthFactor: degradingState.strengthFactor,
  degradedStiffnessFactor: degradingState.stiffnessFactor,
}, null, 2));

function asymmetricProperty() {
  return propertyFromSides(
    points([0.01, 0.04, 0.08, 0.12], [100, 130, 30, 30]),
    points([0.012, 0.045, 0.09, 0.14], [90, 110, 25, 25]),
  );
}

function symmetricProperty(overrides = {}) {
  const side = points([0.01, 0.04, 0.08, 0.12], [100, 130, 30, 30]);
  return propertyFromSides(side, side, overrides);
}

function propertyFromSides(positive, negative, overrides = {}) {
  const backbone = createHingeBackbone({
    positive,
    negative,
    units: { rotation: 'rad', moment: 'kN-m' },
  });
  return createHingeProperty({
    id: overrides.id || 'HP-MATERIAL',
    qualification: 'candidate',
    units: { rotation: 'rad', moment: 'kN-m', length: 'm' },
    parameters: {
      backbone,
      hingeLength: 0.25,
      hysteresis: overrides.hysteresis || { rule: 'kinematic-masing' },
      degradation: overrides.degradation || {},
      regularization: overrides.regularization || {},
      integration: { maxRotationIncrement: 0.00025, maxSubsteps: 4096 },
    },
    source: { type: 'test-reference', reference: 'P8-M4-closed-form-Masing' },
  });
}

function points(rotations, moments) {
  return [
    { id: 'A', rotation: 0, moment: 0 },
    ...['B', 'C', 'D', 'E'].map((id, index) => ({ id, rotation: rotations[index], moment: moments[index] })),
  ];
}

function cyclicLoop(material, initialState, amplitude, increment) {
  const rotations = [];
  for (let value = amplitude - increment; value >= -amplitude - 1e-12; value -= increment) rotations.push(Math.max(-amplitude, value));
  for (let value = -amplitude + increment; value <= amplitude + 1e-12; value += increment) rotations.push(Math.min(amplitude, value));
  let state = initialState;
  let integratedWork = 0;
  let previousRotation = state.rotation;
  let previousMoment = state.moment;
  for (const rotation of rotations) {
    const trial = evaluateHingeTrial(rotation, material, state);
    integratedWork += 0.5 * (previousMoment + trial.moment) * (rotation - previousRotation);
    state = trial.trialState;
    previousRotation = rotation;
    previousMoment = trial.moment;
  }
  return { finalState: state, integratedWork };
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} +/- ${tolerance}, got ${actual}`);
}
