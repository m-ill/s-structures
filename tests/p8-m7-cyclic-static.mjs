import assert from 'node:assert/strict';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { createNonlinearStateStore, stateStoreByteSnapshot } from '../src/nonlinear/core/stateStore.js';
import { createNonlinearElementContract } from '../src/nonlinear/core/elementContract.js';
import { createEquilibriumAssembler } from '../src/nonlinear/equilibrium/assembler.js';
import {
  buildCyclicTargetHistory,
  runMdofCyclicStatic,
} from '../src/nonlinear/equilibrium/cyclicStatic.js';
import { createDenseReferenceBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';
import { createHingeBackbone } from '../src/nonlinear/materials/hingeBackbone.js';
import {
  createHingeCyclicState,
  evaluateHingeTrial,
} from '../src/nonlinear/materials/hingeCyclic.js';
import { createHingeProperty } from '../src/nonlinear/properties/hingeRegistry.js';

const backend = createDenseReferenceBackend();
const property = degradingProperty();
const protocol = [
  0.02, -0.02,
  0.02, -0.02,
  0.02, -0.02,
  { type: 'load', target: 0 },
];
const system = hingeSpringSystem(property);
const result = await runMdofCyclicStatic({
  ...system,
  backend,
  control: { nodeId: 'N1', component: 'ux' },
  protocol,
  options: cyclicOptions(),
});
assert.equal(result.ok, true, JSON.stringify(result.details));
assert.equal(result.reason, 'CYCLIC_PROTOCOL_COMPLETED');

const targetHistory = verifyTargetHistory(result);
const reversal = verifyReversalEvents(result);
const residual = verifyResidualDeformation(result, property);
const energy = await verifyEnergyBalance(property);
const degradation = verifyDegradationHistory(result);
const restart = await verifyDeterministicRestart(property, protocol);
const malformedEvaluation = await verifyMalformedEvaluationRollback(property);
const generatedHistory = buildCyclicTargetHistory({ amplitudes: [0.01, 0.02], cycles: 2 });
assert.deepEqual(generatedHistory, [0.01, -0.01, 0.01, -0.01, 0.02, -0.02, 0.02, -0.02, 0]);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-CYC-01', 'NL-CYC-02', 'NL-CYC-03', 'NL-CYC-04', 'NL-CYC-05', 'NL-CYC-06'],
  targetHistory,
  reversal,
  residual,
  energy,
  degradation,
  restart,
  malformedEvaluation,
  generatedTargetCount: generatedHistory.length,
}, null, 2));

function verifyTargetHistory(run) {
  const displacementSegments = run.segments.filter((row) => row.type === 'displacement');
  assert.equal(displacementSegments.length, 6);
  const errors = displacementSegments.map((row) => Math.abs(row.actual - row.target));
  assert.ok(Math.max(...errors) < 1e-10);
  return { segmentCount: displacementSegments.length, maximumTargetError: Math.max(...errors) };
}

function verifyReversalEvents(run) {
  assert.equal(run.reversals.length, 6, 'five displacement reversals plus load-to-zero reversal are required');
  const protocolReversals = new Set(run.reversals.map((event) => event.protocolPoint));
  const materialReversals = run.materialEvents.filter((event) => event.type === 'reversal');
  assert.ok(materialReversals.length >= 5, 'hinge reversal events must accompany displacement reversals');
  for (const protocolPoint of [1, 2, 3, 4, 5]) {
    assert.ok(protocolReversals.has(protocolPoint));
    assert.ok(materialReversals.some((event) => event.protocolPoint === protocolPoint));
  }
  return {
    protocolReversalCount: run.reversals.length,
    materialReversalCount: materialReversals.length,
  };
}

function verifyResidualDeformation(run, hingeProperty) {
  let state = createHingeCyclicState(hingeProperty);
  for (const target of protocol.filter((point) => typeof point === 'number')) {
    state = evaluateHingeTrial(target, hingeProperty, state).trialState;
  }
  let lower = -0.02;
  let upper = 0.02;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const midpoint = 0.5 * (lower + upper);
    const moment = evaluateHingeTrial(midpoint, hingeProperty, state).moment;
    if (moment > 0) upper = midpoint;
    else lower = midpoint;
  }
  const reference = 0.5 * (lower + upper);
  close(run.residualDeformation, reference, 2e-9, 'residual deformation');
  assert.ok(Math.abs(run.finalLambda) < 1e-10);
  return {
    actual: run.residualDeformation,
    independentReference: reference,
    absoluteError: Math.abs(run.residualDeformation - reference),
  };
}

async function verifyEnergyBalance(hingeProperty) {
  const system = hingeSpringSystem(hingeProperty);
  const run = await runMdofCyclicStatic({
    ...system,
    backend,
    control: { nodeId: 'N1', component: 'ux' },
    protocol: [0.02, -0.02, 0.02],
    options: {
      ...cyclicOptions(),
      displacement: {
        ...cyclicOptions().displacement,
        steps: 80,
        initialIncrement: 0.00025,
        minIncrement: 0.000125,
        maxIncrement: 0.00025,
      },
    },
  });
  assert.equal(run.ok, true, JSON.stringify(run.details));
  assert.ok(run.energyBalance.dissipatedChange > 0, 'cyclic loop must dissipate energy');
  assert.ok(run.energyBalance.relativeResidual < 2e-5, JSON.stringify(run.energyBalance));
  return {
    externalWork: run.energyBalance.externalWork,
    recoverableChange: run.energyBalance.recoverableChange,
    dissipatedChange: run.energyBalance.dissipatedChange,
    relativeResidual: run.energyBalance.relativeResidual,
  };
}

function verifyDegradationHistory(run) {
  const positivePeaks = run.segments
    .filter((row) => row.type === 'displacement' && row.target > 0)
    .map((row) => row.peakAbsForce);
  assert.equal(positivePeaks.length, 3);
  assert.ok(positivePeaks[1] < positivePeaks[0]);
  assert.ok(positivePeaks[2] < positivePeaks[1]);
  const finalState = run.stateStore.committed.elementStates.H1;
  assert.equal(finalState.cycleCount, 3);
  close(finalState.strengthFactor, 0.76, 1e-12, 'strength degradation');
  close(finalState.stiffnessFactor, 0.85, 1e-12, 'stiffness degradation');
  return {
    positivePeaks,
    cycleCount: finalState.cycleCount,
    strengthFactor: finalState.strengthFactor,
    stiffnessFactor: finalState.stiffnessFactor,
  };
}

async function verifyDeterministicRestart(hingeProperty, targetProtocol) {
  const continuousSystem = hingeSpringSystem(hingeProperty);
  const continuous = await runMdofCyclicStatic({
    ...continuousSystem,
    backend,
    control: { nodeId: 'N1', component: 'ux' },
    protocol: targetProtocol,
    options: cyclicOptions(),
  });
  assert.equal(continuous.ok, true);

  const splitSystem = hingeSpringSystem(hingeProperty);
  const first = await runMdofCyclicStatic({
    ...splitSystem,
    backend,
    control: { nodeId: 'N1', component: 'ux' },
    protocol: targetProtocol,
    options: { ...cyclicOptions(), maxSegments: 3 },
  });
  assert.equal(first.ok, true);
  assert.equal(first.status, 'partial');
  assert.equal(first.nextPointIndex, 3);
  const checkpointSnapshot = stateStoreByteSnapshot(first.stateStore);
  const failingBackend = {
    ...backend,
    id: 'p8-m7-cyclic-failure-injection',
    solve() {
      return { ok: false, reason: 'SINGULAR_TANGENT', x: null };
    },
  };
  const failedSegment = await runMdofCyclicStatic({
    assembler: splitSystem.assembler,
    stateStore: first.stateStore,
    backend: failingBackend,
    control: { nodeId: 'N1', component: 'ux' },
    protocol: targetProtocol,
    options: {
      ...cyclicOptions(),
      displacement: {
        ...cyclicOptions().displacement,
        minIncrement: 0.00125,
      },
    },
  });
  assert.equal(failedSegment.ok, false);
  assert.equal(stateStoreByteSnapshot(failedSegment.stateStore), checkpointSnapshot, 'failed cyclic segment must roll back all accepted substeps');
  const second = await runMdofCyclicStatic({
    assembler: splitSystem.assembler,
    stateStore: first.stateStore,
    backend,
    control: { nodeId: 'N1', component: 'ux' },
    protocol: targetProtocol,
    options: cyclicOptions(),
  });
  assert.equal(second.ok, true, JSON.stringify(second.details));
  assert.equal(second.reason, 'CYCLIC_PROTOCOL_COMPLETED');
  assert.equal(second.stateStore.committedHash, continuous.stateStore.committedHash);
  assert.equal(stateStoreByteSnapshot(second.stateStore), stateStoreByteSnapshot(continuous.stateStore));
  assert.equal(stateStoreByteSnapshot(first.stateStore), checkpointSnapshot, 'restart source state must remain immutable');
  return {
    splitPoint: first.nextPointIndex,
    failedSegmentReason: failedSegment.reason,
    failedSegmentRolledBack: true,
    committedHash: second.stateStore.committedHash,
    byteEquivalent: true,
  };
}

async function verifyMalformedEvaluationRollback(hingeProperty) {
  const system = hingeSpringSystem(hingeProperty);
  const sourceAssembler = system.assembler;
  const initialSnapshot = stateStoreByteSnapshot(system.stateStore);
  let evaluationCount = 0;
  const malformedAssembler = {
    ...sourceAssembler,
    async evaluate(input) {
      const evaluation = await sourceAssembler.evaluate(input);
      evaluationCount += 1;
      return evaluationCount > 1 && evaluation.ok
        ? { ...evaluation, pExternalReduced: new Float64Array(0) }
        : evaluation;
    },
  };
  const run = await runMdofCyclicStatic({
    assembler: malformedAssembler,
    stateStore: system.stateStore,
    backend,
    control: { nodeId: 'N1', component: 'ux' },
    protocol: [0.01],
    options: cyclicOptions(),
  });
  assert.equal(run.ok, false);
  assert.equal(run.reason, 'CYCLIC_EXTERNAL_WORK_VECTOR_MISMATCH');
  assert.equal(stateStoreByteSnapshot(run.stateStore), initialSnapshot);
  assert.equal(run.details.rollbackEquivalent, true);
  return {
    reason: run.reason,
    rollbackEquivalent: true,
  };
}

function hingeSpringSystem(hingeProperty) {
  const model = baseModel([
    { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N1', x: 1, y: 0, z: 0, support: 'custom', fix: [false, true, true, true, true, true] },
  ]);
  const domain = buildCanonicalAnalysisDomain(model);
  assert.equal(domain.ok, true, domain.reason);
  assert.equal(domain.constraint.reducedDofCount, 1);
  const kernel = createNonlinearElementContract({
    type: 'p8-m7-cyclic-hinge-spring',
    dofCount: 1,
    evaluate({ trialKinematics, committedState }) {
      const rotation = Number(trialKinematics.uGlobal[0]);
      const response = evaluateHingeTrial(rotation, hingeProperty, committedState, { source: 'p8-m7-cyclic-static' });
      return {
        resistingForceGlobal: [response.moment],
        tangentGlobal: [[response.tangent]],
        trialState: response.trialState,
        energies: {
          recoverable: response.energies.recoverable,
          dissipated: response.energies.dissipated,
        },
        localResponse: {
          hinges: [{
            id: 'H1',
            propertyId: hingeProperty.id,
            end: 'i',
            axis: 'z',
            rotation,
            moment: response.moment,
            tangent: response.tangent,
            state: response.state,
            point: response.point,
            branch: response.branch,
            events: response.events,
            energies: response.energies,
          }],
        },
      };
    },
  });
  const referenceFull = new Float64Array(domain.constraint.fullDofCount);
  referenceFull[6] = 1;
  const assembler = createEquilibriumAssembler({
    domain,
    elements: [{ id: 'H1', dofs: [6], kernel, descriptor: { id: 'H1' } }],
    loadPattern: {
      ok: true,
      constantFull: new Float64Array(referenceFull.length),
      referenceFull,
    },
  });
  const stateStore = createNonlinearStateStore({
    domainHash: domain.identity.domainHash,
    initialState: { q: [0], elementStates: {}, energies: {} },
  });
  return { domain, assembler, stateStore };
}

function degradingProperty() {
  const points = [
    { id: 'A', rotation: 0, moment: 0 },
    { id: 'B', rotation: 0.01, moment: 100 },
    { id: 'C', rotation: 0.04, moment: 130 },
    { id: 'D', rotation: 0.08, moment: 30 },
    { id: 'E', rotation: 0.12, moment: 30 },
  ];
  const backbone = createHingeBackbone({
    positive: points,
    negative: points,
    units: { rotation: 'rad', moment: 'kN-m' },
  });
  return createHingeProperty({
    id: 'HP-M7-CYCLIC',
    qualification: 'candidate',
    units: { rotation: 'rad', moment: 'kN-m', length: 'm' },
    parameters: {
      backbone,
      hingeLength: 0.25,
      hysteresis: { rule: 'kinematic-masing' },
      degradation: {
        referenceEnergy: 1000,
        strength: { perCycle: 0.08, perEnergy: 0, minimumFactor: 0.4 },
        stiffness: { perCycle: 0.05, perEnergy: 0, minimumFactor: 0.4 },
      },
      regularization: { strategy: 'signed-floor', minimumRatio: 1e-8 },
      integration: { maxRotationIncrement: 0.00025, maxSubsteps: 4096 },
    },
    source: { type: 'test-reference', reference: 'P8-M7-cyclic-static' },
  });
}

function cyclicOptions() {
  return {
    targetAbsolute: 1e-10,
    targetRelative: 1e-9,
    displacement: {
      steps: 8,
      initialIncrement: 0.0025,
      minIncrement: 0.00025,
      maxIncrement: 0.0025,
      eventAware: false,
      newton: newtonOptions(),
    },
    load: {
      initialStep: 10,
      minStep: 0.001,
      maxStep: 10,
      newton: newtonOptions(),
    },
  };
}

function newtonOptions() {
  return {
    maxIterations: 40,
    lineSearch: true,
    pivotTolerance: 1e-14,
    convergence: {
      forceAbsolute: 1e-9,
      forceRelative: 1e-9,
      momentAbsolute: 1e-9,
      momentRelative: 1e-9,
      displacementAbsolute: 1e-12,
      displacementRelative: 1e-9,
      rotationAbsolute: 1e-12,
      rotationRelative: 1e-9,
      energyAbsolute: 1e-10,
      energyRelative: 1e-9,
    },
    controlAbsolute: 1e-11,
    controlRelative: 1e-9,
  };
}

function baseModel(nodes) {
  return {
    schemaVersion: 5,
    nodes,
    members: [],
    materials: [],
    sections: [],
    loads: [],
    loadCases: [],
    loadCombinations: [],
    hingeProperties: [],
    nonlinearMaterials: [],
    nonlinearSections: [],
    linkProperties: [],
    timeHistoryFunctions: [],
    analysisStates: [],
    analysisSettings: { includeSelfWeight: false },
  };
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} +/- ${tolerance}, got ${actual}`);
}
