import assert from 'node:assert/strict';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import {
  createNonlinearStateStore,
  createStateCheckpoint,
  stateStoreByteSnapshot,
} from '../src/nonlinear/core/stateStore.js';
import { createNonlinearElementContract } from '../src/nonlinear/core/elementContract.js';
import { createEquilibriumAssembler } from '../src/nonlinear/equilibrium/assembler.js';
import {
  adaptArcLengthRadius,
  buildArcLengthScaling,
  buildCrisfieldPredictor,
  evaluateSphericalArcConstraint,
  runMdofArcLength,
  selectCrisfieldBranch,
  solveMdofArcLengthStep,
} from '../src/nonlinear/equilibrium/arcLength.js';
import { runMdofDisplacementControl } from '../src/nonlinear/equilibrium/displacementControl.js';
import { createDenseReferenceBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';
import { buildCorotationalFrame3dEntries } from '../src/nonlinear/elements/corotationalFrame3d.js';

const backend = createDenseReferenceBackend();
const predictor = verifyPredictor();
const corrector = await verifyCorrector();
const branch = verifyBranchSelection();
const limitPoint = await verifyLimitPoint();
const snapThrough = await verifySnapThroughReference();
const snapBack = await verifySnapBack();
const radius = verifyRadiusAdaptation();
const indefinite = verifyIndefiniteTrace(limitPoint);
const rollbackRestart = await verifyRollbackAndRestart();
const handoff = await verifyDisplacementHandoff();
const gpuPolicy = await verifyGpuPolicyBoundary();

console.log(JSON.stringify({
  ok: true,
  verificationIds: [
    'NL-ARC-01', 'NL-ARC-02', 'NL-ARC-03', 'NL-ARC-04', 'NL-ARC-05',
    'NL-ARC-06', 'NL-ARC-07', 'NL-ARC-08', 'NL-ARC-09', 'NL-ARC-10',
  ],
  predictor,
  corrector,
  branch,
  limitPoint: {
    peakLambda: limitPoint.peakLambda,
    peakQ: limitPoint.peakQ,
    firstNegativeIncrementStep: limitPoint.firstNegativeIncrementStep,
    acceptedSteps: limitPoint.acceptedSteps,
    rejectedSteps: limitPoint.rejectedSteps,
  },
  snapThrough,
  snapBack,
  radius,
  indefinite,
  rollbackRestart,
  handoff,
  gpuPolicy,
}, null, 2));

function verifyPredictor() {
  const { domain } = nonlinearSystem(1, linearResponse([[100]]), [10]);
  const scaling = buildArcLengthScaling(domain, { alpha: 0.1, weights: [1] });
  const result = buildCrisfieldPredictor({
    tangentDirection: [0.1],
    radius: 0.2,
    scaling,
    direction: 1,
  });
  assert.equal(result.selected.sign, 1);
  close(result.selected.constraint.measure, 0.2 ** 2, 1e-14, 'predictor radius');
  close(result.selected.deltaQ[0] / result.selected.deltaLambda, 0.1, 1e-14, 'predictor tangent direction');
  return {
    radiusResidual: result.selected.constraint.absoluteResidual,
    selectedSign: result.selected.sign,
  };
}

async function verifyCorrector() {
  const { assembler, stateStore } = nonlinearSystem(1, cubicSpringResponse(), [1]);
  const step = await solveMdofArcLengthStep({
    assembler,
    stateStore,
    backend,
    radius: 0.18,
    options: arcOptions(0.18),
  });
  assert.equal(step.ok, true, JSON.stringify(step.details));
  const constraint = evaluateSphericalArcConstraint({
    deltaQ: step.increment.deltaQ,
    deltaLambda: step.increment.deltaLambda,
    radius: step.radius,
    scaling: step.scaling,
  });
  assert.ok(maxAbs(step.evaluation.residualReduced) < 1e-9, 'corrector equilibrium residual');
  assert.ok(constraint.absoluteResidual < 1e-10, 'corrector arc residual');
  return {
    equilibriumResidual: maxAbs(step.evaluation.residualReduced),
    arcResidual: constraint.absoluteResidual,
    iterationCount: step.iterationCount,
  };
}

function verifyBranchSelection() {
  const { domain } = nonlinearSystem(1, linearResponse([[1]]), [1]);
  const scaling = buildArcLengthScaling(domain, { alpha: 1, weights: [1] });
  const candidates = [
    { sign: 1, deltaQ: [0.1], deltaLambda: 0.1 },
    { sign: -1, deltaQ: [-0.1], deltaLambda: -0.1 },
  ];
  const selected = selectCrisfieldBranch(candidates, {
    scaling,
    previousIncrement: { deltaQ: [-0.2], deltaLambda: -0.2 },
    direction: 1,
  });
  assert.equal(selected.sign, -1, 'previous increment must govern root selection');
  assert.ok(selected.continuation > 0);
  return { selectedSign: selected.sign, continuation: selected.continuation };
}

async function verifyLimitPoint() {
  const { assembler, stateStore } = nonlinearSystem(1, cubicSpringResponse(), [1]);
  const result = await runMdofArcLength({
    assembler,
    stateStore,
    backend,
    options: { ...arcOptions(0.055), steps: 18 },
  });
  assert.equal(result.ok, true, JSON.stringify(result.details));
  const increments = result.acceptedSteps.map((row) => row.increment.deltaLambda);
  const firstNegative = increments.findIndex((value) => value < -1e-8);
  assert.ok(firstNegative > 0, `limit point was not crossed: ${increments.join(', ')}`);
  const lambdas = result.acceptedSteps.map((row) => row.lambda);
  const peak = Math.max(...lambdas);
  const peakQ = result.acceptedSteps[lambdas.indexOf(peak)].q[0];
  close(peak, 2 / (3 * Math.sqrt(3)), 0.012, 'cubic peak load');
  close(peakQ, 1 / Math.sqrt(3), 0.08, 'cubic peak displacement');
  return {
    peakLambda: peak,
    peakQ,
    firstNegativeIncrementStep: firstNegative + 1,
    acceptedSteps: result.acceptedStepCount,
    rejectedSteps: result.rejectedStepCount,
    result,
  };
}

async function verifySnapThroughReference() {
  const halfSpan = 1;
  const rise = 0.2;
  const elasticModulus = 2e8;
  const area = 0.001;
  const model = {
    ...baseModel([
      { id: 'A', x: -halfSpan, y: 0, z: 0, support: 'fixed' },
      { id: 'B', x: halfSpan, y: 0, z: 0, support: 'fixed' },
      { id: 'C', x: 0, y: 0, z: rise, support: 'custom', fix: [true, true, false, true, true, true] },
    ]),
    members: [
      { id: 'T1', type: 'truss', behavior: 'truss', n1: 'A', n2: 'C', matId: 'MAT', secId: 'SEC' },
      { id: 'T2', type: 'truss', behavior: 'truss', n1: 'B', n2: 'C', matId: 'MAT', secId: 'SEC' },
    ],
    materials: [{ id: 'MAT', E: elasticModulus, G: 8e7, density: 0 }],
    sections: [{ id: 'SEC', type: 'direct', A: area, Iy: 0, Iz: 0, J: 0 }],
  };
  const domain = buildCanonicalAnalysisDomain(model);
  assert.equal(domain.ok, true, domain.reason);
  assert.equal(domain.constraint.reducedDofCount, 1);
  const elements = buildCorotationalFrame3dEntries(domain);
  const referenceFull = new Float64Array(domain.constraint.fullDofCount);
  referenceFull[domain.nodes.findIndex((node) => node.id === 'C') * 6 + 2] = -1;
  const assembler = createEquilibriumAssembler({
    domain,
    elements,
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
  const result = await runMdofArcLength({
    assembler,
    stateStore,
    backend,
    options: { ...arcOptions(0.01, { alpha: 1e-8 }), steps: 42 },
  });
  assert.equal(result.ok, true, JSON.stringify(result.details));
  const referenceLength = Math.hypot(halfSpan, rise);
  const effectiveModulus = domain.elements[0].propertySnapshot.effectiveMaterial.E;
  let maximumReferenceError = 0;
  let maximumReferenceDetail = null;
  for (const row of result.acceptedSteps) {
    const currentRise = rise + row.q[0];
    const currentLength = Math.hypot(halfSpan, currentRise);
    const axialForce = effectiveModulus * area * (currentLength - referenceLength) / referenceLength;
    const expected = -2 * axialForce * currentRise / currentLength;
    const error = Math.abs(row.lambda - expected);
    if (error > maximumReferenceError) {
      maximumReferenceError = error;
      maximumReferenceDetail = {
        q: row.q[0], lambda: row.lambda, expected, currentLength, axialForce,
        material: domain.elements[0].propertySnapshot?.effectiveMaterial,
        section: domain.elements[0].propertySnapshot?.effectiveSection,
      };
    }
  }
  assert.ok(maximumReferenceError < 0.02, `von Mises truss reference error ${maximumReferenceError}: ${JSON.stringify(maximumReferenceDetail)}`);
  assert.ok(result.acceptedSteps.some((row) => row.increment.deltaLambda < 0), 'snap-through descending branch missing');
  assert.ok(Math.min(...result.acceptedSteps.map((row) => row.q[0])) < -rise, 'von Mises truss did not cross the flat configuration');
  return {
    benchmark: 'two-bar-von-mises-corotational-truss',
    maximumReferenceError,
    acceptedSteps: result.acceptedStepCount,
    minimumApexDisplacement: Math.min(...result.acceptedSteps.map((row) => row.q[0])),
  };
}

async function verifySnapBack() {
  const { assembler, stateStore } = nonlinearSystem(2, ({ q }) => {
    const t = q[0];
    const tracked = q[1];
    const path = t - 2 * t ** 3 + t ** 5;
    const derivative = 1 - 6 * t ** 2 + 5 * t ** 4;
    return {
      resistingForceGlobal: [tracked - path, t],
      tangentGlobal: [[-derivative, 1], [1, 0]],
      trialState: { t, tracked },
      energies: {},
    };
  }, [0, 1]);
  const result = await runMdofArcLength({
    assembler,
    stateStore,
    backend,
    options: { ...arcOptions(0.07, { alpha: 0.2, weights: [1, 1] }), steps: 20 },
  });
  assert.equal(result.ok, true, JSON.stringify(result.details));
  const rows = result.acceptedSteps;
  const backward = rows.some((row, index) => index > 0
    && row.lambda > rows[index - 1].lambda
    && row.q[1] < rows[index - 1].q[1]);
  assert.ok(backward, 'snap-back branch with increasing load and reversing tracked displacement was not found');
  let pathError = 0;
  for (const row of rows) {
    const t = row.q[0];
    pathError = Math.max(pathError, Math.abs(row.q[1] - (t - 2 * t ** 3 + t ** 5)));
  }
  assert.ok(pathError < 2e-8);
  return { backward, pathError, finalLambda: rows.at(-1).lambda, finalTrackedDisplacement: rows.at(-1).q[1] };
}

function verifyRadiusAdaptation() {
  const grown = adaptArcLengthRadius({ radius: 0.1, iterationCount: 2, targetIterations: 8, minRadius: 0.04, maxRadius: 0.14 });
  const shrunk = adaptArcLengthRadius({ radius: 0.1, iterationCount: 20, targetIterations: 5, minRadius: 0.06, maxRadius: 0.2 });
  assert.equal(grown.nextRadius, 0.14);
  assert.equal(shrunk.nextRadius, 0.06);
  return { grown: grown.nextRadius, shrunk: shrunk.nextRadius };
}

function verifyIndefiniteTrace(limitPoint) {
  const postPeak = limitPoint.result.acceptedSteps.find((row) => row.increment.deltaLambda < 0);
  assert.ok(postPeak.iterationCount > 1, 'post-peak corrector must use the augmented system');
  const diagnostics = postPeak.evaluation.diagnostics;
  assert.ok(diagnostics.tangentSymmetryError < 1e-12);
  const pivotTrace = postPeak.iterations.filter((row) => Number.isFinite(row.backend?.pivotMin));
  assert.ok(pivotTrace.length > 0, 'indefinite augmented solve pivot trace missing');
  assert.ok(postPeak.iterations.every((row) => row.backend?.matrixClass === 'general'));
  return {
    postPeakStep: postPeak.step,
    iterationCount: postPeak.iterationCount,
    tangentSymmetryError: diagnostics.tangentSymmetryError,
    minimumPivot: Math.min(...pivotTrace.map((row) => row.backend.pivotMin)),
  };
}

async function verifyRollbackAndRestart() {
  const failedSystem = nonlinearSystem(1, cubicSpringResponse(), [1]);
  const before = stateStoreByteSnapshot(failedSystem.stateStore);
  let solveCount = 0;
  const failingBackend = {
    ...backend,
    id: 'p8-m7-failing-after-predictor',
    async solve(matrix, rhs, options) {
      solveCount += 1;
      if (solveCount === 1) return backend.solve(matrix, rhs, options);
      return { ok: false, reason: 'INJECTED_AUGMENTED_SOLVE_FAILURE', x: null };
    },
  };
  const failed = await solveMdofArcLengthStep({
    assembler: failedSystem.assembler,
    stateStore: failedSystem.stateStore,
    backend: failingBackend,
    radius: 0.45,
    options: arcOptions(0.45),
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.rollbackEquivalent, true);
  assert.equal(stateStoreByteSnapshot(failed.stateStore), before);

  const continuousSystem = nonlinearSystem(1, cubicSpringResponse(), [1]);
  const continuous = await runMdofArcLength({
    ...continuousSystem,
    backend,
    options: { ...arcOptions(0.04), steps: 10 },
  });
  assert.equal(continuous.ok, true);

  const splitSystem = nonlinearSystem(1, cubicSpringResponse(), [1]);
  const first = await runMdofArcLength({
    ...splitSystem,
    backend,
    options: { ...arcOptions(0.04), steps: 5 },
  });
  assert.equal(first.ok, true);
  const second = await runMdofArcLength({
    assembler: splitSystem.assembler,
    checkpoint: first.restartCheckpoint,
    backend,
    options: { ...arcOptions(0.04), steps: 5 },
  });
  assert.equal(second.ok, true, JSON.stringify(second.details));
  assert.equal(second.stateStore.committedHash, continuous.stateStore.committedHash);
  assert.equal(stateStoreByteSnapshot(second.stateStore), stateStoreByteSnapshot(continuous.stateStore));
  return {
    rollbackReason: failed.reason,
    rollbackEquivalent: failed.rollbackEquivalent,
    restartCommittedHash: second.stateStore.committedHash,
  };
}

async function verifyDisplacementHandoff() {
  const system = nonlinearSystem(1, cubicSpringResponse(), [1]);
  const displacement = await runMdofDisplacementControl({
    ...system,
    backend,
    control: { nodeId: 'N1', component: 'ux' },
    targetDisplacement: 0.2,
    options: {
      targetDisplacement: 0.2,
      steps: 4,
      initialIncrement: 0.05,
      minIncrement: 0.01,
      maxIncrement: 0.05,
      newton: newtonOptions(),
    },
  });
  assert.equal(displacement.ok, true, JSON.stringify(displacement.details));
  const current = displacement.acceptedSteps.at(-1);
  const previous = displacement.acceptedSteps.at(-2);
  const sourceIncrement = {
    deltaQ: current.q
      ? current.q.map((value, index) => value - previous.q[index])
      : current.stateStore.committed.q.map((value, index) => value - previous.stateStore.committed.q[index]),
    deltaLambda: current.lambda - previous.lambda,
  };
  const checkpoint = createStateCheckpoint(displacement.stateStore, { role: 'p8-m7-test-handoff' });
  const sourceSnapshot = stateStoreByteSnapshot(displacement.stateStore);
  const result = await runMdofArcLength({
    assembler: system.assembler,
    stateStore: displacement.stateStore,
    checkpoint,
    handoff: {
      eligible: true,
      targetEngine: 'p8-m7-arc-length',
      sourceStateHash: displacement.stateStore.committedHash,
      checkpointRef: checkpoint.integrityHash,
      sourceIncrement,
    },
    backend,
    options: { ...arcOptions(0.04), steps: 2 },
  });
  assert.equal(result.ok, true, JSON.stringify(result.details));
  assert.equal(result.source, 'displacement-control-handoff');
  const first = result.acceptedSteps[0];
  assert.ok(first.lambda > displacement.finalLambda, 'handoff must preserve the incoming positive continuation branch');
  assert.equal(stateStoreByteSnapshot(displacement.stateStore), sourceSnapshot, 'handoff source state must remain immutable');
  return {
    sourceCommittedHash: displacement.stateStore.committedHash,
    firstArcLambda: first.lambda,
    sourceLambda: displacement.finalLambda,
  };
}

async function verifyGpuPolicyBoundary() {
  const system = nonlinearSystem(1, linearResponse([[10]]), [1]);
  const unavailable = await solveMdofArcLengthStep({
    ...system,
    backend,
    radius: 0.1,
    options: { ...arcOptions(0.1), backendPreference: 'gpu', gpuEnabled: true },
  });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.reason, 'GPU_BACKEND_UNAVAILABLE');

  const qualifiedGpu = {
    ...backend,
    id: 'test-deterministic-f64-gpu-backend',
    executionTarget: 'webgpu-gpu',
    numericPrecision: 'f64',
    deterministic: true,
  };
  const disabled = await solveMdofArcLengthStep({
    ...system,
    backend: qualifiedGpu,
    radius: 0.1,
    options: { ...arcOptions(0.1), backendPreference: 'gpu', gpuEnabled: false },
  });
  assert.equal(disabled.reason, 'GPU_BACKEND_NOT_ENABLED');
  const enabled = await solveMdofArcLengthStep({
    ...system,
    backend: qualifiedGpu,
    radius: 0.1,
    options: { ...arcOptions(0.1), backendPreference: 'gpu', gpuEnabled: true },
  });
  assert.equal(enabled.ok, true, JSON.stringify(enabled.details));
  return {
    requested: 'gpu',
    unavailableReason: unavailable.reason,
    disabledReason: disabled.reason,
    enabledBackend: enabled.backend,
    fallbackUsed: false,
  };
}

function nonlinearSystem(dofCount, response, reference) {
  const fix = new Array(6).fill(true);
  for (let index = 0; index < dofCount; index += 1) fix[index] = false;
  const model = baseModel([
    { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N1', x: 1, y: 0, z: 0, support: 'custom', fix },
  ]);
  const domain = buildCanonicalAnalysisDomain(model);
  assert.equal(domain.ok, true, domain.reason);
  assert.equal(domain.constraint.reducedDofCount, dofCount);
  const kernel = createNonlinearElementContract({
    type: 'p8-m7-reference-system',
    dofCount,
    evaluate({ trialKinematics, committedState }) {
      return response({ q: Array.from(trialKinematics.uGlobal, Number), committedState });
    },
  });
  const referenceFull = new Float64Array(domain.constraint.fullDofCount);
  reference.forEach((value, index) => { referenceFull[6 + index] = value; });
  const assembler = createEquilibriumAssembler({
    domain,
    elements: [{
      id: 'S1',
      dofs: Array.from({ length: dofCount }, (_value, index) => 6 + index),
      kernel,
      descriptor: { id: 'S1' },
    }],
    loadPattern: {
      ok: true,
      constantFull: new Float64Array(referenceFull.length),
      referenceFull,
    },
  });
  const stateStore = createNonlinearStateStore({
    domainHash: domain.identity.domainHash,
    initialState: { q: new Array(dofCount).fill(0), elementStates: {}, energies: {} },
  });
  return { domain, assembler, stateStore };
}

function linearResponse(stiffness) {
  return ({ q }) => {
    const force = stiffness.map((row) => row.reduce((sum, value, index) => sum + value * q[index], 0));
    return {
      resistingForceGlobal: force,
      tangentGlobal: stiffness.map((row) => row.slice()),
      trialState: { q },
      energies: { strain: 0.5 * dot(q, force) },
    };
  };
}

function cubicSpringResponse() {
  return ({ q }) => {
    const u = q[0];
    return {
      resistingForceGlobal: [u - u ** 3],
      tangentGlobal: [[1 - 3 * u ** 2]],
      trialState: { u },
      energies: { strain: 0.5 * u ** 2 - 0.25 * u ** 4 },
    };
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

function arcOptions(radius, scaling = {}) {
  return {
    initialRadius: radius,
    radius,
    minRadius: radius,
    maxRadius: radius,
    targetIterations: 5,
    shrinkLimit: 1,
    growthLimit: 1,
    maxIterations: 35,
    lineSearch: true,
    linearRelativeTolerance: 1e-8,
    arcAbsolute: 1e-11,
    arcRelative: 1e-8,
    scaling: { alpha: 0.12, ...scaling },
    convergence: newtonOptions().convergence,
  };
}

function newtonOptions() {
  return {
    maxIterations: 30,
    lineSearch: true,
    pivotTolerance: 1e-14,
    convergence: {
      forceAbsolute: 1e-10,
      forceRelative: 1e-9,
      momentAbsolute: 1e-10,
      momentRelative: 1e-9,
      displacementAbsolute: 1e-12,
      displacementRelative: 1e-9,
      rotationAbsolute: 1e-12,
      rotationRelative: 1e-9,
      energyAbsolute: 1e-12,
      energyRelative: 1e-9,
    },
    controlAbsolute: 1e-11,
    controlRelative: 1e-9,
  };
}

function maxAbs(values) {
  return Array.from(values || []).reduce((maximum, value) => Math.max(maximum, Math.abs(Number(value))), 0);
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} +/- ${tolerance}, got ${actual}`);
}
