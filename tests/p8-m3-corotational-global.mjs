import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { analyzeAll } from '../src/solver/linear3d.js';
import { createNonlinearStateStore } from '../src/nonlinear/core/stateStore.js';
import { createNonlinearElementContract } from '../src/nonlinear/core/elementContract.js';
import { createEquilibriumAssembler } from '../src/nonlinear/equilibrium/assembler.js';
import { createDenseReferenceBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';
import { runMdofLoadControl } from '../src/nonlinear/equilibrium/loadControl.js';
import { solveMdofNewtonStep } from '../src/nonlinear/equilibrium/newton.js';
import { createWasmSparseBackend } from '../src/nonlinear/equilibrium/backends/wasmSparseBackend.js';
import { buildCorotationalFrame3dEntries, createCorotationalFrame3dKernel } from '../src/nonlinear/elements/corotationalFrame3d.js';
import { buildNonlinearLoadPattern } from '../src/nonlinear/equilibrium/externalLoads.js';
import { matTrans, matVec } from '../src/solver/linear3dElement.js';

const skewReference = JSON.parse(await readFile(
  new URL('./fixtures/phase8/corotational-skew-reference-v1.json', import.meta.url),
  'utf8',
));

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} +/- ${tolerance}, received ${actual}`,
  );
}

const skew = await verifySkewFrameLinearLimit();
const station = await verifyMemberLoadStationParity();
const releasedMemberLoad = await verifyReleasedMemberLoad();
const released = await verifyReleasedGlobalResponse();
const releasedTangent = await verifyReleasedTangentConsistency();
const skewRelease = await verifySkewReleaseGauge();
const weakRelease = await verifyReleasedWeakRestraint();
const offsetReleaseGauge = await verifyOffsetReleaseGauge();
const offset = await verifyOffsetAndReleaseParity();
const spatialMoment = await verifySpatialMomentEquilibrium();
const thermal = await verifyThermalInitialStrain();
const truss = await verifyTrussInactiveDofs();
const stability = await verifyMechanismAndWeakStiffness();
verifyMeshInvariantLengthScale();
const buckling = await verifyEulerTrend();
const elastica = await verifyLargeDisplacementCantilever();
verifyFollowerLoadGuard();

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-COR-08', 'NL-COR-09', 'NL-COR-10', 'NL-COR-11', 'NL-COR-12'],
  skewDisplacementError: skew.displacementError,
  stationForceError: station.stationForceError,
  releasedMemberLoadError: releasedMemberLoad.error,
  releasedRotationError: released.rotationError,
  releasedTangentError: releasedTangent.error,
  skewReleaseMomentError: skewRelease.momentError,
  releasedWeakRestraintError: weakRelease.rotationError,
  offsetReleaseGaugeError: offsetReleaseGauge.axialError,
  offsetTransferError: offset.transferError,
  releaseOffsetError: offset.releaseOffsetError,
  spatialMomentError: spatialMoment.error,
  thermalExpansionError: thermal.error,
  trussDisplacementError: truss.displacementError,
  weakRotationError: stability.weakRotationError,
  eulerRatio: buckling.computed / buckling.expected,
  eulerAmplification: buckling.amplification,
  elasticaTipError: elastica.tipError,
  elasticaAcceptedSteps: elastica.acceptedSteps,
}, null, 2));

async function verifySkewFrameLinearLimit() {
  const model = commonModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 2.5, y: 0.8, z: 1.7 },
      { id: 'N2', x: 4.8, y: -0.6, z: 3.9 },
    ],
    members: [
      member('M1', 'N0', 'N1', { roll: 17, strongAxis: 'z' }),
      member('M2', 'N1', 'N2', { roll: -23, strongAxis: 'z' }),
    ],
    loads: [
      { id: 'P', type: 'nodal', node: 'N2', P: 0.8, direction: [0.4, -0.7, -1], case: 'D' },
      { id: 'M', type: 'nmoment', node: 'N2', M: 0.15, axis: 'y', coordinate: 'global', case: 'D' },
    ],
  });
  const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
  assert.equal(domain.ok, true, domain.reason);
  const assembler = createEquilibriumAssembler({ domain, elements: buildCorotationalFrame3dEntries(domain) });
  const result = await solveMdofNewtonStep({
    assembler,
    stateStore: stateFor(domain),
    targetLambda: 1,
    backend: createDenseReferenceBackend(),
    options: strictNewton(8),
  });
  assert.equal(result.ok, true, result.reason);
  const linear = analyzeAll(model, { D: 1 });
  assert.equal(linear.ok, true, linear.reason);
  assert.equal(skewReference.version, 'p8-m3-skew-frame-reference-v1');
  const expected = domain.nodes.flatMap((node) => skewReference.displacements[node.id]);
  assert.ok(maxRelativeError(domain.nodes.flatMap((node) => linear.disp[node.id]), expected) < 1e-13, 'Phase 7 reference fixture drift');
  const displacementError = maxRelativeError(result.u, expected);
  assert.ok(displacementError < 2e-5, `skew frame displacement error ${displacementError}`);
  for (const descriptor of domain.elements) {
    const actual = result.evaluation.elementResponses[descriptor.id].localResponse.resistingForce;
    const target = skewReference.memberEnds[descriptor.id];
    assert.ok(maxRelativeError(linear.memberResults[descriptor.id].end, target) < 1e-13, `${descriptor.id} reference fixture drift`);
    assert.ok(maxRelativeError(actual, target) < 3e-5, `${descriptor.id} member-end force parity`);
    const actualGlobal = result.evaluation.elementResponses[descriptor.id].globalResponse.resistingForce;
    const targetGlobal = matVec(matTrans(descriptor.geometry.transform), target);
    assert.ok(maxRelativeError(actualGlobal, targetGlobal) < 3e-5, `${descriptor.id} global member-force parity`);
  }
  return { displacementError };
}

async function verifyMemberLoadStationParity() {
  const model = commonModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 4, y: 0, z: 0 },
    ],
    members: [member('M1', 'N0', 'N1', { refVector: [0, 1, 0], roll: 0, strongAxis: 'z' })],
    loads: [{ id: 'W', type: 'udl', member: 'M1', w: 0.02, dir: '-z', case: 'D' }],
  });
  const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
  assert.equal(domain.ok, true, domain.reason);
  const assembler = createEquilibriumAssembler({ domain, elements: buildCorotationalFrame3dEntries(domain) });
  const result = await solveMdofNewtonStep({
    assembler,
    stateStore: stateFor(domain),
    targetLambda: 1,
    backend: createDenseReferenceBackend(),
    options: strictNewton(8),
  });
  assert.equal(result.ok, true, result.reason);
  const linear = analyzeAll(model, { D: 1 });
  assert.equal(linear.ok, true, linear.reason);
  const actual = result.evaluation.elementResponses.M1.localResponse.stations;
  const expected = linear.memberResults.M1;
  let stationForceError = 0;
  for (const key of ['N', 'Vy', 'Vz', 'Tq', 'My', 'Mz']) {
    stationForceError = Math.max(stationForceError, maxRelativeError(actual[key], expected[key]));
  }
  assert.ok(stationForceError < 2e-5, `station force error ${stationForceError}`);
  return { stationForceError };
}

async function verifyReleasedMemberLoad() {
  const model = commonModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 4, y: 0, z: 0, support: 'pin' },
    ],
    members: [{
      ...member('M1', 'N0', 'N1', { refVector: [0, 1, 0], roll: 0, strongAxis: 'z' }),
      releases: { i: 'rigid', j: 'pin' },
    }],
    loads: [{ id: 'W', type: 'udl', member: 'M1', w: 20, dir: '-z', case: 'D' }],
  });
  const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
  assert.equal(domain.ok, true, domain.reason);
  const entries = buildCorotationalFrame3dEntries(domain);
  const assembler = createEquilibriumAssembler({ domain, elements: entries });
  const result = await solveMdofNewtonStep({
    assembler,
    stateStore: stateFor(domain),
    targetLambda: 1,
    backend: createDenseReferenceBackend(),
    options: strictNewton(16),
  });
  assert.equal(result.ok, true, JSON.stringify({ reason: result.reason, details: result.details, iterations: result.iterations }));
  const linear = analyzeAll(model, { D: 1 });
  assert.equal(linear.ok, true, linear.reason);
  const local = result.evaluation.elementResponses.M1.localResponse;
  const error = maxRelativeError(local.referenceResistingForce, linear.memberResults.M1.end);
  assert.ok(error < 2e-5, `released member-load end-force error ${error}`);
  const hingeRotationError = Math.abs(local.deformation[10] - linear.memberResults.M1.dl[10]);
  assert.ok(hingeRotationError < 1e-9, `released member-load hinge rotation error ${hingeRotationError}`);
  assert.ok(
    result.evaluation.elementStates.M1.releaseRotations.some((value) => Math.abs(value) > 1e-8),
    'mechanical member load must produce a nonzero internal release rotation',
  );
  for (const dof of domain.elements[0].releases.localDofs) {
    close(local.referenceResistingForce[dof], 0, 1e-8, `released member-load reference force ${dof}`);
  }
  let stationError = 0;
  for (const key of ['N', 'Vy', 'Vz', 'Tq', 'My', 'Mz']) {
    stationError = Math.max(stationError, maxRelativeError(local.stations[key], linear.memberResults.M1[key]));
  }
  assert.ok(stationError < 2e-5, `released member-load station error ${stationError}`);
  assert.equal(result.evaluation.audit.ok, true, JSON.stringify(result.evaluation.audit));

  const pattern = buildNonlinearLoadPattern(domain);
  assert.equal(pattern.ok, true, pattern.reason);
  const rotation = Math.PI / 2;
  const rigid = [0, 0, 0, rotation, 0, 0, 0, 0, 0, rotation, 0, 0];
  const rigidResponse = await entries[0].kernel.evaluate({
    trialKinematics: { uGlobal: rigid, lambda: 1 },
    elementLoads: { trace: pattern.trace },
    mode: 'static',
  });
  const expectedFixedEnd = pattern.trace[0].condensedFixedEnd;
  assert.ok(
    maxRelativeError(rigidResponse.localResponse.referenceResistingForce, expectedFixedEnd) < 1e-8,
    'rigidly rotated dead member load must recover in the reference frame',
  );
  assert.ok(
    maxRelativeError(rigidResponse.localResponse.resistingForce, expectedFixedEnd) > 1e-4,
    'current-local and reference-local recovery must remain distinct after rigid rotation',
  );

  const torsionModel = commonModel({
    nodes: model.nodes,
    members: model.members,
    loads: [{ id: 'MX', type: 'mmoment', member: 'M1', M: 100, axis: 'x', at: 0.5, case: 'D' }],
  });
  const torsionDomain = buildCanonicalAnalysisDomain(torsionModel, { factors: { D: 1 } });
  assert.equal(torsionDomain.ok, true, torsionDomain.reason);
  const torsionPattern = buildNonlinearLoadPattern(torsionDomain);
  assert.equal(torsionPattern.ok, true, torsionPattern.reason);
  const torsionKernel = buildCorotationalFrame3dEntries(torsionDomain)[0].kernel;
  const quarterTurn = Math.PI / 2;
  const torsionResponse = await torsionKernel.evaluate({
    trialKinematics: {
      uGlobal: [0, 0, 0, 0, 0, quarterTurn, -4, 4, 0, 0, 0, quarterTurn],
      lambda: 1,
    },
    elementLoads: { trace: torsionPattern.trace },
    mode: 'static',
  });
  for (const dof of torsionDomain.elements[0].releases.localDofs) {
    close(torsionResponse.localResponse.resistingForce[dof], 0, 1e-7, `rotated dead-load release force ${dof}`);
  }
  return { error: Math.max(error, stationError, hingeRotationError) };
}

async function verifyReleasedGlobalResponse() {
  const model = commonModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 4, y: 0, z: 0, support: 'custom', fix: [false, true, false, true, false, true] },
    ],
    members: [{
      ...member('M1', 'N0', 'N1', { refVector: [0, 1, 0], roll: 0, strongAxis: 'z' }),
      releases: { i: 'rigid', j: 'pin' },
    }],
    loads: [{ id: 'P', type: 'nodal', node: 'N1', P: 1000, direction: [0, 0, -1], case: 'D' }],
  });
  const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
  assert.equal(domain.ok, true, domain.reason);
  const assembler = createEquilibriumAssembler({ domain, elements: buildCorotationalFrame3dEntries(domain) });
  const initial = await assembler.evaluate({ q: new Array(domain.constraint.reducedDofCount).fill(0), lambda: 1 });
  const nullRatios = initial.inactiveModesReduced.map((mode) => nullModeRatio(initial.tangentReduced, mode));
  const result = await solveMdofNewtonStep({
    assembler,
    stateStore: stateFor(domain),
    targetLambda: 1,
    matrixClass: 'spd',
    backend: createDenseReferenceBackend(),
    options: strictNewton(12),
  });
  assert.equal(result.ok, true, JSON.stringify({
    reason: result.reason,
    nullRatios,
    modes: initial.inactiveModesReduced.map((mode) => Array.from(mode)),
    tangent: cscToDense(initial.tangentReduced),
    iterations: result.iterations,
    failure: result.failure || null,
  }));
  assert.ok(
    result.iterations.some((row) => row.backend?.gaugeModeCount > 0 || row.backend?.inactiveDofCount > 0),
    'released nodal rotation must be resolved by an approved inactive mode',
  );
  assert.ok(
    result.iterations.every((row) => row.backend?.matrixClass === 'general'),
    'released elements must override an unsafe SPD matrix-class request',
  );
  const local = result.evaluation.elementResponses.M1.localResponse;
  const releaseDofs = domain.elements[0].releases.localDofs;
  for (const dof of releaseDofs) close(local.resistingForce[dof], 0, 1e-7, `released force ${dof}`);
  assert.equal(result.evaluation.audit.ok, true, JSON.stringify(result.evaluation.audit));
  const linear = analyzeAll(model, { D: 1 });
  assert.equal(linear.ok, true, linear.reason);
  const chordRotationY = Math.atan2(-local.currentAxes[0][2], local.currentAxes[0][0]);
  const recoveredNodalRotationY = local.deformation[10] + chordRotationY;
  const rotationError = Math.abs(recoveredNodalRotationY - linear.memberResults.M1.dl[10]);
  assert.ok(rotationError < 1e-8, `released internal rotation error ${rotationError}`);
  assert.ok(Math.abs(local.deformation[10] - local.nodalBasicDeformation[10]) > 1e-8, 'internal release rotation must be recovered independently of inactive nodal rotation');
  return { rotationError };
}

async function verifyReleasedTangentConsistency() {
  const model = commonModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0 },
      { id: 'N1', x: 2, y: 1, z: 3 },
    ],
    members: [{
      ...member('M1', 'N0', 'N1', { refVector: [0, 0, 1], roll: 19, strongAxis: 'z' }),
      releases: { i: 'rigid', j: 'pin' },
    }],
    loads: [],
  });
  const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
  assert.equal(domain.ok, true, domain.reason);
  const kernel = createCorotationalFrame3dKernel(domain.elements[0]);
  const u = [
    0.01, -0.02, 0.015, 0.08, -0.05, 0.04,
    -0.03, 0.025, 0.02, -0.06, 0.07, -0.03,
  ];
  const base = await kernel.evaluate({
    trialKinematics: { uGlobal: u, lambda: 0 },
    elementLoads: { trace: [] },
    mode: 'static',
  });
  const errors = [];
  for (const step of [2e-6, 1e-6]) {
    const finiteDifference = await finiteDifferenceElementTangent(kernel, u, base.trialState, step);
    errors.push(matrixRelativeErrorDetail(base.tangentGlobal, finiteDifference));
  }
  const error = Math.min(...errors.map((row) => row.error));
  assert.ok(error < 2e-5, `released tangent finite-difference error ${error}; ${JSON.stringify(errors)}`);
  assert.ok(Math.max(...errors.map((row) => row.error)) < 5e-5, `released tangent step sensitivity ${JSON.stringify(errors)}`);
  return { error, errors };
}

async function verifySkewReleaseGauge() {
  const axis = normalize([2, 1, 3]);
  const model = commonModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 2, y: 1, z: 3, support: 'custom', fix: [true, true, true, false, false, false] },
    ],
    members: [{
      ...member('M1', 'N0', 'N1', { refVector: [0, 0, 1], roll: 19, strongAxis: 'z' }),
      releases: { i: 'rigid', j: 'pin' },
    }],
    loads: [{ id: 'T', type: 'nmoment', node: 'N1', M: 1000, direction: axis, coordinate: 'global', case: 'D' }],
  });
  const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
  assert.equal(domain.ok, true, domain.reason);
  const assembler = createEquilibriumAssembler({ domain, elements: buildCorotationalFrame3dEntries(domain) });
  const initial = await assembler.evaluate({ q: new Array(domain.constraint.reducedDofCount).fill(0), lambda: 1 });
  assert.equal(initial.inactiveModesReduced.length, 2, `skew release candidate modes ${initial.inactiveModesReduced.length}`);
  const nullRatios = initial.inactiveModesReduced.map((mode) => nullModeRatio(initial.tangentReduced, mode));
  const result = await solveMdofNewtonStep({
    assembler,
    stateStore: stateFor(domain),
    targetLambda: 1,
    backend: createDenseReferenceBackend(),
    options: strictNewton(20),
  });
  assert.equal(result.ok, true, JSON.stringify({
    reason: result.reason,
    details: result.details,
    iterations: result.iterations,
    nullRatios,
  }));
  const convergedNullRatios = result.evaluation.inactiveModesReduced.map(
    (mode) => nullModeRatio(result.evaluation.tangentReduced, mode),
  );
  assert.ok(Math.min(...nullRatios) > 1e-6, `applied torque must contribute a finite initial load tangent: ${nullRatios.join(',')}`);
  assert.ok(
    Math.max(...convergedNullRatios) < 1e-10,
    `skew pin converged null ratios ${convergedNullRatios.join(',')}`,
  );
  const local = result.evaluation.elementResponses.M1.localResponse.resistingForce;
  const releases = domain.elements[0].releases.localDofs;
  for (const dof of releases) close(local[dof], 0, 1e-5, `skew release force ${dof}`);
  const momentError = Math.abs(Math.abs(local[9]) - 1000);
  assert.ok(momentError < 1e-4, `skew torsion transfer error ${momentError}`);
  assert.equal(result.evaluation.audit.ok, true, JSON.stringify(result.evaluation.audit));
  return { momentError };
}

async function verifyReleasedWeakRestraint() {
  const model = commonModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 3, y: 0, z: 0, support: 'custom', fix: [true, true, true, false, false, false] },
    ],
    members: [{
      ...member('M1', 'N0', 'N1', { refVector: [0, 1, 0], roll: 0, strongAxis: 'z' }),
      releases: { i: 'rigid', j: 'pin' },
    }],
    loads: [],
  });
  const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
  assert.equal(domain.ok, true, domain.reason);
  const frameEntries = buildCorotationalFrame3dEntries(domain, {
    releaseAbsoluteTolerance: 1e-14,
    releaseTolerance: 1e-13,
  });
  const frameAssembler = createEquilibriumAssembler({ domain, elements: frameEntries });
  const frameInitial = await frameAssembler.evaluate({ q: new Array(domain.constraint.reducedDofCount).fill(0), lambda: 0 });
  assert.equal(frameInitial.inactiveModesReduced.length, 2);
  assert.equal(frameInitial.inactiveModeGroupsReduced.length, 1);
  const firstMode = normalize(Array.from(frameInitial.inactiveModesReduced[0]));
  const secondMode = normalize(Array.from(frameInitial.inactiveModesReduced[1]));
  const weakAxis = normalize(firstMode.map((value, index) => value + secondMode[index]));
  const nullAxis = normalize(firstMode.map((value, index) => value - secondMode[index]));
  const stiffness = 1e-6;
  const expectedRotation = 1e-3;
  const referenceFull = new Float64Array(domain.constraint.fullDofCount);
  weakAxis.forEach((value, index) => { referenceFull[9 + index] = stiffness * expectedRotation * value; });
  const weakKernel = createNonlinearElementContract({
    type: 'released-weak-restraint-verification',
    dofCount: 3,
    evaluate({ trialKinematics }) {
      const rotation = Array.from(trialKinematics.uGlobal, Number);
      const projection = rotation.reduce((sum, value, index) => sum + value * weakAxis[index], 0);
      return {
        resistingForceGlobal: weakAxis.map((value) => stiffness * projection * value),
        tangentGlobal: weakAxis.map((row) => weakAxis.map((column) => stiffness * row * column)),
        trialState: { projection },
        energies: { strain: 0.5 * stiffness * projection ** 2 },
      };
    },
  });
  const assembler = createEquilibriumAssembler({
    domain,
    elements: [
      ...frameEntries,
      { id: 'WEAK', dofs: [9, 10, 11], kernel: weakKernel, descriptor: { id: 'WEAK' } },
    ],
    loadPattern: {
      ok: true,
      constantFull: new Float64Array(referenceFull.length),
      referenceFull,
    },
  });
  const initial = await assembler.evaluate({ q: new Array(domain.constraint.reducedDofCount).fill(0), lambda: 1 });
  const initialRatios = initial.inactiveModesReduced.map((mode) => nullModeRatio(initial.tangentReduced, mode));
  const initialActions = initial.inactiveModesReduced.map((mode) => nullModeAction(initial.tangentReduced, mode));
  const nullAction = nullModeAction(initial.tangentReduced, nullAxis);
  assert.ok(Math.min(...initialActions) > 2e-7, `45-degree weak restraint must act on both supplied basis modes: ${initialActions.join(',')}`);
  assert.ok(nullAction < 2e-8, `orthogonal mode in the release subspace must remain inactive: ${nullAction}`);
  const options = strictNewton(12);
  options.pivotTolerance = 1e-18;
  options.convergence = {
    ...options.convergence,
    forceAbsolute: 1e-14,
    forceRelative: 0,
    momentAbsolute: 1e-14,
    momentRelative: 0,
    displacementAbsolute: 1e-14,
    displacementRelative: 0,
    rotationAbsolute: 1e-14,
    rotationRelative: 0,
    energyAbsolute: 1e-18,
    energyRelative: 0,
  };
  const result = await solveMdofNewtonStep({
    assembler,
    stateStore: stateFor(domain),
    targetLambda: 1,
    backend: createDenseReferenceBackend(),
    options,
  });
  assert.equal(result.ok, true, JSON.stringify({
    reason: result.reason,
    details: result.details,
    iterations: result.iterations,
    weakAxis,
    initialActions,
    nullAxis,
    nullAction,
    initialResidual: Array.from(initial.residualReduced),
    initialModes: initial.inactiveModesReduced.map((mode) => Array.from(mode)),
  }));
  const projectedRotation = Array.from(result.q).reduce((sum, value, index) => sum + value * weakAxis[index], 0);
  const rotationError = Math.abs(projectedRotation - expectedRotation);
  assert.ok(rotationError < 2e-9, `weak restraint rotation error ${rotationError}: ${JSON.stringify({
    q: Array.from(result.q),
    initialResidual: Array.from(initial.residualReduced),
    initialActions,
    iterations: result.iterations,
    convergence: result.convergence,
  })}`);
  assert.ok(
    result.iterations.some((row) => row.backend?.gaugeModeCount === 1),
    `only the unrestrained release mode should be gauged: ${JSON.stringify(result.iterations)}`,
  );
  return { rotationError, initialRatios, initialActions, nullAction };
}

async function verifyOffsetReleaseGauge() {
  const model = commonModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 4, y: 0, z: 0 },
    ],
    members: [{
      ...member('M1', 'N0', 'N1', { refVector: [0, 1, 0], roll: 0, strongAxis: 'z' }),
      endOffset: { i: 0, j: 0.2, rigidFactor: 1 },
      releases: { i: 'rigid', j: 'pin' },
    }],
    loads: [{ id: 'P', type: 'nodal', node: 'N1', P: 1000, direction: [1, 0, 0], case: 'D' }],
  });
  const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
  assert.equal(domain.ok, true, domain.reason);
  const assembler = createEquilibriumAssembler({ domain, elements: buildCorotationalFrame3dEntries(domain) });
  const initial = await assembler.evaluate({ q: new Array(domain.constraint.reducedDofCount).fill(0), lambda: 1 });
  assert.equal(initial.inactiveModesReduced.length, 2);
  for (const mode of initial.inactiveModesReduced) {
    const translationNorm = Math.hypot(...Array.from(mode).slice(0, 3));
    assert.ok(translationNorm > 0.1, `offset release mode must include joint translation: ${Array.from(mode)}`);
  }
  const result = await solveMdofNewtonStep({
    assembler,
    stateStore: stateFor(domain),
    targetLambda: 1,
    backend: createDenseReferenceBackend(),
    options: strictNewton(12),
  });
  assert.equal(result.ok, true, JSON.stringify({ reason: result.reason, details: result.details, iterations: result.iterations }));
  assert.ok(result.iterations.some((row) => row.backend?.gaugeModeCount === 2));
  const properties = domain.elements[0].propertySnapshot;
  const expected = 1000 * domain.elements[0].geometry.length
    / (properties.effectiveMaterial.E * properties.effectiveSection.A);
  const axialError = Math.abs(result.u[6] - expected);
  assert.ok(axialError < 1e-10, `offset release axial displacement error ${axialError}`);
  return { axialError };
}

async function verifyOffsetAndReleaseParity() {
  const offset = { i: 0.35, j: 0.2, rigidFactor: 1 };
  const baseMember = { ...member('M1', 'N0', 'N1', { refVector: [0, 1, 0], roll: 0 }), endOffset: offset };
  const loadedModel = commonModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 4, y: 0, z: 0 },
    ],
    members: [baseMember],
    loads: [{ id: 'P', type: 'nodal', node: 'N1', P: 10, direction: [0, 0, -1], case: 'D' }],
  });
  const loadedDomain = buildCanonicalAnalysisDomain(loadedModel, { factors: { D: 1 } });
  assert.equal(loadedDomain.ok, true, loadedDomain.reason);
  const loaded = await solveMdofNewtonStep({
    assembler: createEquilibriumAssembler({ domain: loadedDomain, elements: buildCorotationalFrame3dEntries(loadedDomain) }),
    stateStore: stateFor(loadedDomain),
    targetLambda: 1,
    backend: createDenseReferenceBackend(),
    options: strictNewton(10),
  });
  assert.equal(loaded.ok, true, loaded.reason);
  const loadedLinear = analyzeAll(loadedModel, { D: 1 });
  assert.equal(loadedLinear.ok, true, loadedLinear.reason);
  const loadedResponse = loaded.evaluation.elementResponses.M1;
  const expectedGlobal = matVec(matTrans(loadedDomain.elements[0].geometry.transform), loadedLinear.memberResults.M1.end);
  const transferError = maxRelativeError(loadedResponse.globalResponse.resistingForce, expectedGlobal);
  assert.ok(transferError < 2e-5, `loaded offset transfer error ${transferError}`);
  assert.ok(Math.abs(loadedResponse.localResponse.resistingForce[10]) > 1, 'offset face moment must be recovered');
  assert.ok(Math.abs(loadedResponse.globalResponse.resistingForce[10]) < 1e-5, 'free joint moment must close after rigid-arm transfer');

  const releasedModel = commonModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 4, y: 0, z: 0, support: 'custom', fix: [false, true, false, true, true, true] },
    ],
    members: [{ ...baseMember, releases: { i: 'rigid', j: 'pin' } }],
    loads: [{ id: 'P', type: 'nodal', node: 'N1', P: 1, direction: [0, 0, -1], case: 'D' }],
  });
  const releasedDomain = buildCanonicalAnalysisDomain(releasedModel, { factors: { D: 1 } });
  assert.equal(releasedDomain.ok, true, releasedDomain.reason);
  const released = await solveMdofNewtonStep({
    assembler: createEquilibriumAssembler({ domain: releasedDomain, elements: buildCorotationalFrame3dEntries(releasedDomain) }),
    stateStore: stateFor(releasedDomain),
    targetLambda: 1,
    backend: createDenseReferenceBackend(),
    options: strictNewton(10),
  });
  assert.equal(released.ok, true, released.reason);
  const releasedLinear = analyzeAll(releasedModel, { D: 1 });
  assert.equal(releasedLinear.ok, true, releasedLinear.reason);
  const releasedLocal = released.evaluation.elementResponses.M1.localResponse.resistingForce;
  const releaseOffsetError = maxRelativeError(releasedLocal, releasedLinear.memberResults.M1.end);
  assert.ok(releaseOffsetError < 2e-5, `release-offset force error ${releaseOffsetError}`);
  for (const dof of releasedDomain.elements[0].releases.localDofs) close(releasedLocal[dof], 0, 1e-7, `release-offset force ${dof}`);
  assert.equal(released.evaluation.audit.ok, true, JSON.stringify(released.evaluation.audit));
  return { transferError, releaseOffsetError };
}

async function verifySpatialMomentEquilibrium() {
  const direction = normalize([0.4, -0.7, 0.6]);
  const magnitude = 1e3;
  const model = commonModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 4, y: 0, z: 0 },
    ],
    members: [member('M1', 'N0', 'N1', { refVector: [0, 1, 0], roll: 0 })],
    loads: [{ id: 'M3D', type: 'nmoment', node: 'N1', M: magnitude, direction, coordinate: 'global', case: 'D' }],
  });
  const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
  assert.equal(domain.ok, true, domain.reason);
  const assembler = createEquilibriumAssembler({ domain, elements: buildCorotationalFrame3dEntries(domain) });
  assert.equal(assembler.requiredMatrixClass, 'general');
  const tangentProbe = [1e-5, -2e-5, 1e-5, 0.02, -0.015, 0.01];
  const tangentEvaluation = await assembler.evaluate({ q: tangentProbe, lambda: 0.2 });
  const residualDerivative = await finiteDifferenceResidual(assembler, tangentProbe, 0.2, 1e-6);
  const systemTangent = cscToDense(tangentEvaluation.tangentReduced).map((row) => row.map((value) => -value));
  assert.ok(maxMatrixRelativeError(residualDerivative, systemTangent) < 3e-5, 'external-moment system tangent mismatch');
  const progress = [];
  const result = await runMdofLoadControl({
    assembler,
    stateStore: stateFor(domain),
    backend: createDenseReferenceBackend(),
    onProgress: (row) => { if (row.type === 'iteration') progress.push(row); },
    options: {
      targetLambda: 1,
      initialStep: 0.25,
      minStep: 1 / 128,
      maxStep: 0.25,
      newton: strictNewton(30),
    },
  });
  assert.equal(result.ok, true, `${result.reason}: ${JSON.stringify({ rejected: result.rejectedSteps, progress: progress.slice(-4) })}`);
  const evaluation = await assembler.evaluate({
    q: result.stateStore.committed.q,
    lambda: 1,
    committedElementStates: result.stateStore.committed.elementStates,
  });
  const expected = direction.map((value) => value * magnitude);
  const actual = Array.from(evaluation.pInternalFull.slice(9, 12));
  const error = maxRelativeError(actual, expected);
  assert.ok(error < 2e-7, `spatial moment equilibrium error ${error}`);
  assert.equal(evaluation.audit.ok, true, JSON.stringify(evaluation.audit));
  return { error };
}

async function verifyThermalInitialStrain() {
  const alpha = 1.2e-5;
  const deltaTemperature = 30;
  const model = commonModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 4, y: 0, z: 0, support: 'custom', fix: [false, true, true, true, true, true] },
    ],
    members: [member('M1', 'N0', 'N1', { refVector: [0, 1, 0], roll: 0 })],
    loads: [{ id: 'TEMP', type: 'temperature', member: 'M1', dT: deltaTemperature, case: 'D' }],
  });
  model.materials[0].alpha = alpha;
  const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
  assert.equal(domain.ok, true, domain.reason);
  assert.equal(domain.elements[0].propertySnapshot.effectiveMaterial.alpha, alpha);
  const assembler = createEquilibriumAssembler({ domain, elements: buildCorotationalFrame3dEntries(domain) });
  const result = await solveMdofNewtonStep({
    assembler,
    stateStore: stateFor(domain),
    targetLambda: 1,
    backend: createDenseReferenceBackend(),
    options: strictNewton(12),
  });
  assert.equal(result.ok, true, result.reason);
  const expected = alpha * deltaTemperature * domain.elements[0].geometry.length;
  const error = Math.abs(result.u[6] - expected);
  assert.ok(error < 1e-10, `thermal free-expansion error ${error}`);
  assert.ok(Math.abs(result.evaluation.elementResponses.M1.localResponse.resistingForce[6]) < 1e-5);
  assert.ok(Array.from(result.evaluation.pExternalFull).every((value) => value === 0), 'handled thermal prestress must leave external load vector');
  assert.equal(result.evaluation.audit.ok, true, JSON.stringify(result.evaluation.audit));

  const gradientModel = commonModel({
    nodes: model.nodes,
    members: model.members,
    loads: [{ id: 'TG', type: 'tgradient', member: 'M1', dTtop: 20, dTbot: 5, case: 'D' }],
  });
  gradientModel.materials[0].alpha = alpha;
  gradientModel.sections[0].H = 0.6;
  const gradientDomain = buildCanonicalAnalysisDomain(gradientModel, { factors: { D: 1 } });
  assert.equal(gradientDomain.ok, true, gradientDomain.reason);
  const gradientPattern = buildNonlinearLoadPattern(gradientDomain);
  assert.equal(gradientPattern.ok, true, gradientPattern.reason);
  assert.equal(gradientPattern.trace[0].fixedEnd.handcalc.alpha, alpha);
  assert.equal(gradientPattern.trace[0].fixedEnd.handcalc.h, 0.6);

  const missingAlphaModel = commonModel({
    nodes: model.nodes,
    members: model.members,
    loads: [{ id: 'BAD-T', type: 'temperature', member: 'M1', dT: 10, case: 'D' }],
  });
  const missingAlphaDomain = buildCanonicalAnalysisDomain(missingAlphaModel, { factors: { D: 1 } });
  assert.equal(missingAlphaDomain.ok, true, missingAlphaDomain.reason);
  assert.equal(buildNonlinearLoadPattern(missingAlphaDomain).reason, 'TEMPERATURE_ALPHA_REQUIRED');

  const missingDepthModel = commonModel({
    nodes: model.nodes,
    members: model.members,
    loads: [{ id: 'BAD-TG', type: 'tgradient', member: 'M1', dTtop: 20, dTbot: 5, case: 'D' }],
  });
  missingDepthModel.materials[0].alpha = alpha;
  const missingDepthDomain = buildCanonicalAnalysisDomain(missingDepthModel, { factors: { D: 1 } });
  assert.equal(missingDepthDomain.ok, true, missingDepthDomain.reason);
  assert.equal(buildNonlinearLoadPattern(missingDepthDomain).reason, 'TEMPERATURE_GRADIENT_DEPTH_REQUIRED');
  return { error };
}

async function verifyTrussInactiveDofs() {
  const axialLoad = { id: 'P', type: 'nodal', node: 'N1', P: 1000, direction: [1, 0, 0], case: 'D' };
  const model = commonModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 4, y: 0, z: 0, support: 'custom', fix: [false, true, true, false, false, false] },
    ],
    members: [{ ...member('T1', 'N0', 'N1', { refVector: [0, 1, 0], roll: 0 }), type: 'truss', behavior: 'truss' }],
    loads: [axialLoad],
  });
  const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
  assert.equal(domain.ok, true, domain.reason);
  const result = await solveMdofNewtonStep({
    assembler: createEquilibriumAssembler({ domain, elements: buildCorotationalFrame3dEntries(domain) }),
    stateStore: stateFor(domain),
    targetLambda: 1,
    backend: createDenseReferenceBackend(),
    options: strictNewton(8),
  });
  assert.equal(result.ok, true, result.reason);
  assert.ok(result.iterations.some((row) => row.backend?.inactiveDofCount === 3), 'three truss rotations must be inactive');
  const properties = domain.elements[0].propertySnapshot;
  const expected = axialLoad.P * domain.elements[0].geometry.length
    / (properties.effectiveMaterial.E * properties.effectiveSection.A);
  const displacementError = Math.abs(result.u[6] - expected);
  assert.ok(displacementError < 1e-10, `truss displacement error ${displacementError}`);

  const momentModel = commonModel({
    nodes: model.nodes,
    members: model.members,
    loads: [axialLoad, { id: 'MX', type: 'nmoment', node: 'N1', M: 1, axis: 'x', case: 'D' }],
  });
  const momentDomain = buildCanonicalAnalysisDomain(momentModel, { factors: { D: 1 } });
  assert.equal(momentDomain.ok, true, momentDomain.reason);
  const failed = await solveMdofNewtonStep({
    assembler: createEquilibriumAssembler({ domain: momentDomain, elements: buildCorotationalFrame3dEntries(momentDomain) }),
    stateStore: stateFor(momentDomain),
    targetLambda: 1,
    backend: createDenseReferenceBackend(),
    options: strictNewton(8),
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'INACTIVE_DOF_RESIDUAL');
  return { displacementError };
}

async function verifyMechanismAndWeakStiffness() {
  const isolatedDomain = buildCanonicalAnalysisDomain(commonModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 1, y: 0, z: 0 },
    ],
    members: [],
    loads: [],
  }));
  assert.equal(isolatedDomain.ok, true, isolatedDomain.reason);
  const mechanism = await solveMdofNewtonStep({
    assembler: createEquilibriumAssembler({ domain: isolatedDomain, elements: [] }),
    stateStore: stateFor(isolatedDomain),
    targetLambda: 0,
    backend: createDenseReferenceBackend(),
  });
  assert.equal(mechanism.ok, false);
  assert.equal(mechanism.reason, 'STRUCTURAL_MECHANISM_DETECTED');

  const weakDomain = buildCanonicalAnalysisDomain(commonModel({
    nodes: [
      { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N1', x: 1, y: 0, z: 0, support: 'custom', fix: [false, true, true, true, false, true] },
    ],
    members: [],
    loads: [],
  }));
  assert.equal(weakDomain.ok, true, weakDomain.reason);
  const loads = new Float64Array(weakDomain.constraint.fullDofCount);
  loads[6] = 1e4;
  loads[10] = 1e-7;
  const weakKernel = createNonlinearElementContract({
    type: 'weak-stiffness-verification',
    dofCount: 2,
    evaluate({ trialKinematics }) {
      const [translation, rotation] = trialKinematics.uGlobal;
      return {
        resistingForceGlobal: [1e9 * translation, 1e-6 * rotation],
        tangentGlobal: [[1e9, 0], [0, 1e-6]],
        trialState: { translation, rotation },
        energies: { strain: 0.5e9 * translation ** 2 + 0.5e-6 * rotation ** 2 },
      };
    },
  });
  const weakAssembler = createEquilibriumAssembler({
    domain: weakDomain,
    elements: [{ id: 'W1', dofs: [6, 10], kernel: weakKernel, descriptor: { id: 'W1' } }],
    loadPattern: {
      ok: true,
      constantFull: new Float64Array(loads.length),
      referenceFull: loads,
    },
  });
  const weak = await solveMdofNewtonStep({
    assembler: weakAssembler,
    stateStore: stateFor(weakDomain),
    targetLambda: 1,
    backend: createDenseReferenceBackend(),
    options: { ...strictNewton(8), pivotTolerance: 1e-18 },
  });
  assert.equal(weak.ok, true, weak.reason);
  const weakRotationError = Math.abs(weak.u[10] - 0.1);
  assert.ok(Math.abs(weak.u[6] - 1e-5) < 1e-12);
  assert.ok(weakRotationError < 1e-10, `weak rotational stiffness error ${weakRotationError}`);
  const nonsymmetricKernel = createNonlinearElementContract({
    type: 'scaled-symmetry-verification',
    dofCount: 2,
    evaluate() {
      return {
        resistingForceGlobal: [0, 0],
        tangentGlobal: [[1e-12, 1e-12], [0, 1e-12]],
        trialState: {},
        energies: { strain: 0 },
      };
    },
  });
  const nonsymmetricAssembler = createEquilibriumAssembler({
    domain: weakDomain,
    elements: [{ id: 'NS1', dofs: [6, 10], kernel: nonsymmetricKernel, descriptor: { id: 'NS1' } }],
    loadPattern: {
      ok: true,
      constantFull: new Float64Array(loads.length),
      referenceFull: new Float64Array(loads.length),
    },
  });
  const nonsymmetric = await nonsymmetricAssembler.evaluate({ q: [0, 0], lambda: 0 });
  assert.ok(nonsymmetric.diagnostics.tangentSymmetryError > 0.5, 'symmetry metric must remain relative at small scale');
  return { weakRotationError };
}

function verifyMeshInvariantLengthScale() {
  const nodes = [
    { id: 'N0', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N1', x: 4, y: 0, z: 0 },
  ];
  const oneModel = commonModel({ nodes, members: [member('M1', 'N0', 'N1', { refVector: [0, 1, 0] })], loads: [] });
  const splitModel = commonModel({
    nodes: [nodes[0], { id: 'NM', x: 2, y: 0, z: 0 }, nodes[1]],
    members: [
      member('M1', 'N0', 'NM', { refVector: [0, 1, 0] }),
      member('M2', 'NM', 'N1', { refVector: [0, 1, 0] }),
    ],
    loads: [],
  });
  const one = buildCanonicalAnalysisDomain(oneModel);
  const split = buildCanonicalAnalysisDomain(splitModel);
  assert.equal(one.ok, true, one.reason);
  assert.equal(split.ok, true, split.reason);
  const oneScale = createEquilibriumAssembler({ domain: one, elements: buildCorotationalFrame3dEntries(one) }).characteristicLength;
  const splitScale = createEquilibriumAssembler({ domain: split, elements: buildCorotationalFrame3dEntries(split) }).characteristicLength;
  assert.equal(oneScale, 4);
  assert.equal(splitScale, oneScale);
}

async function verifyEulerTrend() {
  const elementCount = 8;
  const length = 4;
  const model = commonModel({
    nodes: Array.from({ length: elementCount + 1 }, (_value, index) => ({
      id: `N${index}`,
      x: length * index / elementCount,
      y: 0,
      z: 0,
    })),
    members: Array.from({ length: elementCount }, (_value, index) => member(
      `M${index}`,
      `N${index}`,
      `N${index + 1}`,
      { refVector: [0, 1, 0], roll: 0, strongAxis: 'z' },
    )),
    loads: [],
  });
  const domain = buildCanonicalAnalysisDomain(model);
  assert.equal(domain.ok, true, domain.reason);
  const kernels = domain.elements.map((descriptor) => ({ descriptor, kernel: createCorotationalFrame3dKernel(descriptor) }));
  const material = domain.elements[0].propertySnapshot.effectiveMaterial;
  const section = domain.elements[0].propertySnapshot.effectiveSection;
  const expected = Math.PI ** 2 * material.E * section.Iz / length ** 2;
  const low = minimumBendingEigenvalue(kernels, domain.nodes, expected * 0.75, length, material.E * section.A);
  const high = minimumBendingEigenvalue(kernels, domain.nodes, expected * 1.25, length, material.E * section.A);
  assert.ok(low > 0, `Euler precritical eigenvalue ${low}`);
  assert.ok(high < 0, `Euler postcritical eigenvalue ${high}`);
  let lower = expected * 0.75;
  let upper = expected * 1.25;
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const trial = 0.5 * (lower + upper);
    if (minimumBendingEigenvalue(kernels, domain.nodes, trial, length, material.E * section.A) > 0) lower = trial;
    else upper = trial;
  }
  const computed = 0.5 * (lower + upper);
  assert.ok(Math.abs(computed / expected - 1) < 0.02, `Euler ratio ${computed / expected}`);
  const displacements = [];
  for (const axialRatio of [0, 0.4, 0.7, 0.85]) {
    displacements.push(await solveEulerLateralResponse({ elementCount, length, axialForce: axialRatio * expected }));
  }
  for (let index = 1; index < displacements.length; index += 1) {
    assert.ok(displacements[index] > displacements[index - 1] * 1.05, `Euler response trend ${displacements.join(', ')}`);
  }
  const amplification = displacements.at(-1) / displacements[0];
  assert.ok(amplification > 3, `Euler near-critical amplification ${amplification}`);
  return { computed, expected, displacements, amplification };
}

async function solveEulerLateralResponse({ elementCount, length, axialForce }) {
  const middle = elementCount / 2;
  const nodes = Array.from({ length: elementCount + 1 }, (_value, index) => ({
    id: `N${index}`,
    x: length * index / elementCount,
    y: 0,
    z: 0,
    support: 'custom',
    fix: index === 0
      ? [true, true, true, true, true, false]
      : index === elementCount
        ? [false, true, true, true, true, false]
        : [false, false, true, true, true, false],
  }));
  const loads = [{ id: 'H', type: 'nodal', node: `N${middle}`, P: 100, direction: [0, 1, 0], case: 'D' }];
  if (axialForce > 0) loads.push({ id: 'P', type: 'nodal', node: `N${elementCount}`, P: axialForce, direction: [-1, 0, 0], case: 'D' });
  const model = commonModel({
    nodes,
    members: Array.from({ length: elementCount }, (_value, index) => member(
      `M${index}`,
      `N${index}`,
      `N${index + 1}`,
      { refVector: [0, 1, 0], roll: 0, strongAxis: 'z' },
    )),
    loads,
  });
  const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
  assert.equal(domain.ok, true, domain.reason);
  const solved = await solveMdofNewtonStep({
    assembler: createEquilibriumAssembler({ domain, elements: buildCorotationalFrame3dEntries(domain) }),
    stateStore: stateFor(domain),
    targetLambda: 1,
    backend: createDenseReferenceBackend(),
    options: strictNewton(30),
  });
  assert.equal(solved.ok, true, `Euler load ${axialForce}: ${solved.reason}`);
  return Math.abs(solved.u[middle * 6 + 1]);
}

async function verifyLargeDisplacementCantilever() {
  const elementCount = 10;
  const length = 4;
  const E = 210e9;
  const Iy = 8e-5;
  const dimensionlessLoad = 1.2;
  const targetForceN = dimensionlessLoad * E * Iy / length ** 2;
  const model = commonModel({
    nodes: Array.from({ length: elementCount + 1 }, (_value, index) => ({
      id: `N${index}`,
      x: length * index / elementCount,
      y: 0,
      z: 0,
      support: index === 0 ? 'fixed' : 'custom',
      ...(index === 0 ? {} : { fix: [false, true, false, true, false, true] }),
    })),
    members: Array.from({ length: elementCount }, (_value, index) => member(
      `M${index}`,
      `N${index}`,
      `N${index + 1}`,
      { refVector: [0, 1, 0], roll: 0, strongAxis: 'z' },
    )),
    loads: [{ id: 'P', type: 'nodal', node: `N${elementCount}`, P: targetForceN, direction: [0, 0, -1], case: 'D' }],
  });
  const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
  assert.equal(domain.ok, true, domain.reason);
  const actualForce = domain.loads.find((load) => load.id === 'P').P;
  const effective = domain.elements[0].propertySnapshot;
  const reference = elasticaTip(actualForce, effective.effectiveMaterial.E * effective.effectiveSection.Iy, length);
  const assembler = createEquilibriumAssembler({ domain, elements: buildCorotationalFrame3dEntries(domain) });
  const backend = await createWasmSparseBackend();
  const result = await runMdofLoadControl({
    assembler,
    stateStore: stateFor(domain),
    backend,
    production: true,
    options: {
      targetLambda: 1,
      initialStep: 0.1,
      minStep: 0.0125,
      maxStep: 0.2,
      fastIterations: 5,
      newton: strictNewton(24),
    },
  });
  assert.equal(result.ok, true, JSON.stringify({
    reason: result.reason,
    finalLambda: result.finalLambda,
    accepted: result.acceptedSteps,
    rejected: result.rejectedSteps,
  }));
  const tipIndex = domain.nodes.findIndex((node) => node.id === `N${elementCount}`) * 6;
  const tipX = length + result.stateStore.committed.u[tipIndex];
  const tipZ = result.stateStore.committed.u[tipIndex + 2];
  const tipError = Math.hypot(tipX - reference.x, tipZ - reference.y) / length;
  assert.ok(tipError < 0.012, `elastica tip error ${tipError}: FE=(${tipX},${tipZ}), ref=(${reference.x},${reference.y})`);
  return { tipError, acceptedSteps: result.acceptedStepCount };
}

function verifyFollowerLoadGuard() {
  const model = commonModel({
    nodes: [{ id: 'N0', x: 0, y: 0, z: 0 }, { id: 'N1', x: 4, y: 0, z: 0 }],
    members: [member('M1', 'N0', 'N1', { refVector: [0, 1, 0], roll: 0 })],
    loads: [{ id: 'FOLLOW', type: 'udl', member: 'M1', w: 1, dir: '-z', follower: true, case: 'D' }],
  });
  const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
  assert.equal(domain.ok, true, domain.reason);
  const pattern = buildNonlinearLoadPattern(domain);
  assert.equal(pattern.ok, false);
  assert.equal(pattern.reason, 'FOLLOWER_LOAD_UNSUPPORTED');
}

function minimumBendingEigenvalue(kernels, nodes, compression, length, EA) {
  const ndof = nodes.length * 6;
  const matrix = Array.from({ length: ndof }, () => new Array(ndof).fill(0));
  for (const { descriptor, kernel } of kernels) {
    const i = nodes.findIndex((node) => node.id === descriptor.nodeIds[0]);
    const j = nodes.findIndex((node) => node.id === descriptor.nodeIds[1]);
    const ui = -compression * nodes[i].x / EA;
    const uj = -compression * nodes[j].x / EA;
    const response = kernel.evaluate({
      trialKinematics: { uGlobal: [ui, 0, 0, 0, 0, 0, uj, 0, 0, 0, 0, 0] },
    });
    descriptor.fullDofs.forEach((row, localRow) => descriptor.fullDofs.forEach((column, localColumn) => {
      matrix[row][column] += response.tangentGlobal[localRow][localColumn];
    }));
  }
  const selected = [];
  nodes.forEach((_node, index) => {
    if (index > 0 && index < nodes.length - 1) selected.push(index * 6 + 1);
    selected.push(index * 6 + 5);
  });
  const reduced = selected.map((row) => selected.map((column) => matrix[row][column]));
  return Math.min(...jacobiEigenvalues(reduced));
}

function elasticaTip(force, EI, length) {
  const steps = 4000;
  const ds = length / steps;
  const load = force / EI;
  const integrate = (initialCurvature) => {
    let state = [0, initialCurvature, 0, 0];
    for (let step = 0; step < steps; step += 1) state = rk4(state, ds, load);
    return state;
  };
  let low = -2 * load * length;
  let high = 0;
  assert.ok(integrate(low)[1] < 0 && integrate(high)[1] > 0, 'elastica shooting bracket');
  for (let iteration = 0; iteration < 70; iteration += 1) {
    const middle = 0.5 * (low + high);
    if (integrate(middle)[1] < 0) low = middle;
    else high = middle;
  }
  const state = integrate(0.5 * (low + high));
  return { theta: state[0], curvature: state[1], x: state[2], y: state[3] };
}

function rk4(state, step, load) {
  const derivative = ([theta, curvature]) => [curvature, load * Math.cos(theta), Math.cos(theta), Math.sin(theta)];
  const k1 = derivative(state);
  const k2 = derivative(state.map((value, index) => value + 0.5 * step * k1[index]));
  const k3 = derivative(state.map((value, index) => value + 0.5 * step * k2[index]));
  const k4 = derivative(state.map((value, index) => value + step * k3[index]));
  return state.map((value, index) => value + step * (k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index]) / 6);
}

function jacobiEigenvalues(input) {
  const A = input.map((row) => row.slice());
  const n = A.length;
  for (let sweep = 0; sweep < 100 * n * n; sweep += 1) {
    let p = 0;
    let q = 1;
    let max = 0;
    for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) {
      if (Math.abs(A[i][j]) > max) { max = Math.abs(A[i][j]); p = i; q = j; }
    }
    if (max < 1e-10 * Math.max(1, ...A.map((row, index) => Math.abs(row[index])))) break;
    const angle = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (let k = 0; k < n; k += 1) {
      if (k === p || k === q) continue;
      const akp = A[k][p];
      const akq = A[k][q];
      A[k][p] = A[p][k] = c * akp - s * akq;
      A[k][q] = A[q][k] = s * akp + c * akq;
    }
    const app = A[p][p];
    const aqq = A[q][q];
    const apq = A[p][q];
    A[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    A[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    A[p][q] = A[q][p] = 0;
  }
  return A.map((row, index) => row[index]);
}

function commonModel({ nodes, members, loads }) {
  return {
    schemaVersion: 5,
    nodes,
    members,
    materials: [{ id: 'MAT', E: 210e6, G: 80e6, density: 0 }],
    sections: [{ id: 'SEC', type: 'direct', A: 0.02, Iy: 8e-5, Iz: 1.2e-4, J: 3e-5 }],
    loads,
    loadCases: [{ id: 'D', name: 'Load', type: 'dead' }],
    loadCombinations: [{ id: 'D1', name: 'Load', type: 'service', factors: { D: 1 } }],
    analysisSettings: { includeSelfWeight: false, validateBeforeSolve: true, useSparseSolver: false },
  };
}

function member(id, n1, n2, localAxis) {
  return { id, type: 'frame', behavior: 'frame', n1, n2, matId: 'MAT', secId: 'SEC', localAxis };
}

function stateFor(domain) {
  return createNonlinearStateStore({
    domainHash: domain.identity.domainHash,
    initialState: { q: new Array(domain.constraint.reducedDofCount).fill(0), elementStates: {}, energies: {} },
  });
}

function strictNewton(maxIterations) {
  return {
    maxIterations,
    lineSearch: true,
    convergence: {
      forceAbsolute: 1e-5,
      forceRelative: 1e-9,
      momentAbsolute: 1e-5,
      momentRelative: 1e-9,
      displacementAbsolute: 1e-11,
      displacementRelative: 1e-9,
      rotationAbsolute: 1e-11,
      rotationRelative: 1e-9,
      energyAbsolute: 1e-9,
      energyRelative: 1e-10,
    },
  };
}

function maxRelativeError(actual, expected) {
  let error = 0;
  Array.from(actual).forEach((value, index) => {
    error = Math.max(error, Math.abs(Number(value) - Number(expected[index])) / Math.max(1, Math.abs(Number(value)), Math.abs(Number(expected[index]))));
  });
  return error;
}

async function finiteDifferenceResidual(assembler, q, lambda, step) {
  const output = Array.from({ length: q.length }, () => new Array(q.length).fill(0));
  for (let column = 0; column < q.length; column += 1) {
    const plus = q.slice();
    const minus = q.slice();
    plus[column] += step;
    minus[column] -= step;
    const fp = await assembler.evaluate({ q: plus, lambda });
    const fm = await assembler.evaluate({ q: minus, lambda });
    for (let row = 0; row < q.length; row += 1) {
      output[row][column] = (fp.residualReduced[row] - fm.residualReduced[row]) / (2 * step);
    }
  }
  return output;
}

async function finiteDifferenceElementTangent(kernel, u, committedState, step) {
  const output = Array.from({ length: u.length }, () => new Array(u.length).fill(0));
  for (let column = 0; column < u.length; column += 1) {
    const plus = u.slice();
    const minus = u.slice();
    plus[column] += step;
    minus[column] -= step;
    const fp = await kernel.evaluate({
      committedState,
      trialKinematics: { uGlobal: plus, lambda: 0 },
      elementLoads: { trace: [] },
      mode: 'static',
    });
    const fm = await kernel.evaluate({
      committedState,
      trialKinematics: { uGlobal: minus, lambda: 0 },
      elementLoads: { trace: [] },
      mode: 'static',
    });
    for (let row = 0; row < u.length; row += 1) {
      output[row][column] = (fp.resistingForceGlobal[row] - fm.resistingForceGlobal[row]) / (2 * step);
    }
  }
  return output;
}

function cscToDense(matrix) {
  const output = Array.from({ length: matrix.rowCount }, () => new Array(matrix.colCount).fill(0));
  for (let column = 0; column < matrix.colCount; column += 1) {
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      output[matrix.rowIdx[offset]][column] = matrix.values[offset];
    }
  }
  return output;
}

function nullModeRatio(matrix, mode) {
  const product = new Float64Array(matrix.rowCount);
  let scale = 0;
  for (let column = 0; column < matrix.colCount; column += 1) {
    if (mode[column] === 0) continue;
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      product[matrix.rowIdx[offset]] += matrix.values[offset] * mode[column];
      scale = Math.max(scale, Math.abs(matrix.values[offset]));
    }
  }
  return Math.max(...Array.from(product, Math.abs)) / Math.max(1, scale);
}

function nullModeAction(matrix, mode) {
  const product = new Float64Array(matrix.rowCount);
  for (let column = 0; column < matrix.colCount; column += 1) {
    if (mode[column] === 0) continue;
    for (let offset = matrix.colPtr[column]; offset < matrix.colPtr[column + 1]; offset += 1) {
      product[matrix.rowIdx[offset]] += matrix.values[offset] * mode[column];
    }
  }
  return Math.max(...Array.from(product, Math.abs));
}

function maxMatrixRelativeError(actual, expected) {
  let error = 0;
  actual.forEach((row, i) => row.forEach((value, j) => {
    error = Math.max(error, Math.abs(value - expected[i][j]) / Math.max(1, Math.abs(value), Math.abs(expected[i][j])));
  }));
  return error;
}

function matrixRelativeErrorDetail(actual, expected) {
  let detail = { error: 0, row: 0, column: 0, actual: 0, expected: 0 };
  actual.forEach((row, i) => row.forEach((value, j) => {
    const error = Math.abs(value - expected[i][j]) / Math.max(1, Math.abs(value), Math.abs(expected[i][j]));
    if (error > detail.error) detail = { error, row: i, column: j, actual: value, expected: expected[i][j] };
  }));
  return detail;
}

function normalize(vector) {
  const norm = Math.hypot(...vector);
  return vector.map((value) => value / norm);
}
