import assert from 'node:assert/strict';
import { createNonlinearStateStore } from '../src/nonlinear/core/stateStore.js';
import { createDenseReferenceBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';
import { buildMdofGroundMotionSet, createMdofGroundMotionRecord } from '../src/nonlinear/dynamics/mdofGroundMotion.js';
import { runMdofNewmark } from '../src/nonlinear/dynamics/mdofNewmark.js';
import { createCscFromTriplets } from '../src/nonlinear/dynamics/sparseMatrix.js';

const backend = createDenseReferenceBackend({ limit: 100 });
const sdof = createSystem({ mass: [[2]], stiffness: [[50]] });
const sdofValues = [0, 1, -0.5, 0.2, 0];
const sdofRun = await runSystem(sdof, sdofValues, 0.05);
assert.equal(sdofRun.ok, true, sdofRun.reason);
const sdofHistory = historyRows(sdofRun).map((row) => row.q[0]);
const sdofReference = linearNewmarkReference({
  mass: [[2]],
  stiffness: [[50]],
  accelerations: sdofValues,
  dt: 0.05,
}).map((row) => row.q[0]);
closeVector(sdofHistory, sdofReference, 1e-12, 'linear SDOF Newmark');

const mdofMass = [[2, 0], [0, 1]];
const mdofStiffness = [[20, -5], [-5, 10]];
const mdof = createSystem({ mass: mdofMass, stiffness: mdofStiffness });
const mdofValues = [0, 0.8, -0.4, 0.3, 0];
const mdofRun = await runSystem(mdof, mdofValues, 0.04);
assert.equal(mdofRun.ok, true, mdofRun.reason);
const mdofHistory = historyRows(mdofRun).map((row) => row.q);
const mdofReference = linearNewmarkReference({
  mass: mdofMass,
  stiffness: mdofStiffness,
  accelerations: mdofValues,
  dt: 0.04,
});
mdofHistory.forEach((row, index) => closeVector(row, mdofReference[index].q, 2e-12, `linear MDOF step ${index}`));

const firstSegment = await runSystem(mdof, mdofValues, 0.04, { endTime: 0.08 });
assert.equal(firstSegment.ok, true, firstSegment.reason);
assert.equal(firstSegment.endTime, 0.08);
const restarted = await runSystem(mdof, mdofValues, 0.04, { checkpoint: firstSegment.checkpoint });
assert.equal(restarted.ok, true, restarted.reason);
assert.equal(restarted.startTime, firstSegment.endTime);
closeVector(restarted.stateStore.committed.q, mdofRun.stateStore.committed.q, 2e-12, 'restart q');
closeVector(restarted.stateStore.committed.v, mdofRun.stateStore.committed.v, 2e-12, 'restart v');
closeVector(restarted.stateStore.committed.a, mdofRun.stateStore.committed.a, 2e-12, 'restart a');

let cancellationRequested = false;
const cancellationCommits = [];
const cancelledRun = await runSystem(sdof, [0, 1], 0.1, {
  initialDt: 0.05,
  minDt: 0.025,
  isCancelled: () => cancellationRequested,
  onCommit: (row) => {
    cancellationCommits.push(row);
    cancellationRequested = true;
  },
});
assert.equal(cancelledRun.ok, false);
assert.equal(cancelledRun.status, 'cancelled');
assert.equal(cancelledRun.reason, 'ANALYSIS_CANCELLED');
assert.equal(cancellationCommits.length, 1);
assert.equal(cancelledRun.stateStore.committed.time, cancellationCommits[0].time);
assert.equal(cancelledRun.checkpoint.committedHash, cancellationCommits[0].stateHash);

let failedCallbackCommit = null;
const callbackFailure = await runSystem(sdof, [0, 1], 0.05, {
  onCommit: (row) => {
    failedCallbackCommit = row;
    throw new Error('simulated commit sink failure');
  },
});
assert.equal(callbackFailure.ok, false);
assert.equal(callbackFailure.reason, 'DYNAMIC_COMMIT_CALLBACK_FAILED');
assert.equal(callbackFailure.stateStore.committed.time, failedCallbackCommit.time);
assert.equal(callbackFailure.stateStore.committedHash, failedCallbackCommit.stateHash);
assert.equal(callbackFailure.checkpoint.committed.time, failedCallbackCommit.time);
assert.equal(callbackFailure.acceptedStepCount, 1);

const nonlinear = createSystem({ mass: [[1]], stiffness: [[30]], cubic: 5000 });
const nonlinearValues = [0, 5, -5, 3, 0];
const nonlinearRun = await runSystem(nonlinear, nonlinearValues, 0.02, {
  newton: { maxIterations: 40, convergence: strictConvergence() },
});
assert.equal(nonlinearRun.ok, true, nonlinearRun.reason);
const nonlinearHistory = historyRows(nonlinearRun).map((row) => row.q[0]);
const nonlinearReference = nonlinearNewmarkReference({
  mass: 1,
  stiffness: 30,
  cubic: 5000,
  accelerations: nonlinearValues,
  dt: 0.02,
});
closeVector(nonlinearHistory, nonlinearReference, 2e-10, 'nonlinear oscillator');

const finiteDifference = effectiveTangentFiniteDifference({
  stiffness: 30,
  mass: 2,
  damping: 0.4,
  dt: 0.05,
  qPredictor: 0.003,
  vPredictor: -0.02,
  q: 0.004,
});
assert.ok(Math.abs(finiteDifference.relativeError) < 1e-8, JSON.stringify(finiteDifference));

const cutbackSystem = createSystem({ mass: [[1]], stiffness: [[20]], maximumAcceptedDt: 0.05 });
const cutback = await runSystem(cutbackSystem, [0, 1], 0.1, {
  initialDt: 0.1,
  minDt: 0.025,
  maximumSubstepLevel: 4,
  stepTraceLimit: 1,
});
assert.equal(cutback.ok, true, cutback.reason);
assert.equal(cutback.rejectedStepCount, 1);
assert.equal(cutback.acceptedStepCount, 2);
assert.equal(cutback.internalStepCount, 2);
assert.equal(cutback.outputStepCount, 2);
assert.equal(cutback.maximumSubstepLevel, 1);
assert.equal(cutback.rejectedSteps[0].rollbackEquivalent, true);
assert.equal(cutback.acceptedSteps.length, 1);
assert.equal(cutback.stepTrace.acceptedTruncated, true);

const partialCommits = [];
const partialFailureSystem = createSystem({
  mass: [[1]],
  stiffness: [[20]],
  maximumAcceptedDt: 0.05,
  minimumAcceptedQ: -0.00075,
});
const partialFailure = await runSystem(partialFailureSystem, [0, 1], 0.1, {
  initialDt: 0.1,
  minDt: 0.025,
  maximumSubstepLevel: 4,
  onCommit: (row) => partialCommits.push(row),
});
assert.equal(partialFailure.ok, false);
assert.equal(partialFailure.reason, 'DYNAMIC_MINIMUM_DT_REACHED');
assert.ok(partialCommits.length > 0, 'at least one substep must commit before the terminal failure');
assert.equal(partialFailure.stateStore.committed.time, partialCommits.at(-1).time);
assert.equal(partialFailure.stateStore.committedHash, partialCommits.at(-1).stateHash);
assert.equal(partialFailure.checkpoint.committed.time, partialCommits.at(-1).time);
assert.equal(partialFailure.acceptedStepCount, partialCommits.length);
assert.ok(partialFailure.endTime > 0 && partialFailure.endTime < partialFailure.requestedEndTime);

const convergenceRuns = [];
for (const dt of [0.1, 0.05, 0.025, 0.00625]) {
  const values = sampleSine(dt, 1);
  const run = await runSystem(sdof, values, dt);
  assert.equal(run.ok, true, `${dt}: ${run.reason}`);
  convergenceRuns.push({ dt, final: historyRows(run).at(-1).q[0] });
}
const referenceFinal = convergenceRuns.at(-1).final;
const errors = convergenceRuns.slice(0, 3).map((row) => Math.abs(row.final - referenceFinal));
assert.ok(errors[1] < errors[0], JSON.stringify({ convergenceRuns, errors }));
assert.ok(errors[2] < errors[1], JSON.stringify({ convergenceRuns, errors }));
assert.ok(Math.abs(sdofRun.energyAudit.relativeResidual) < 1e-10, JSON.stringify(sdofRun.energyAudit));

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-DYN-07', 'NL-DYN-08', 'NL-DYN-09', 'NL-DYN-11', 'NL-DYN-12', 'NL-DYN-13', 'NL-DYN-14'],
  sdofMaximum: Math.max(...sdofHistory.map(Math.abs)),
  mdofFinal: mdofHistory.at(-1),
  restartTime: firstSegment.endTime,
  cancellationCommitTime: cancelledRun.endTime,
  callbackFailureCommitTime: callbackFailure.endTime,
  nonlinearFinal: nonlinearHistory.at(-1),
  tangentRelativeError: finiteDifference.relativeError,
  cutback: { accepted: cutback.acceptedStepCount, rejected: cutback.rejectedStepCount },
  partialFailureCommitTime: partialFailure.endTime,
  timeStepErrors: errors,
  energyRelativeResidual: sdofRun.energyAudit.relativeResidual,
}, null, 2));

async function runSystem(system, accelerations, dt, options = {}) {
  const record = createMdofGroundMotionRecord({
    id: `GM-${dt}`,
    values: accelerations,
    dt,
    unit: 'm/s2',
    direction: 'x',
  });
  const groundMotion = buildMdofGroundMotionSet(record, system.massDomain);
  const store = createNonlinearStateStore({
    domainHash: system.assembler.domain.identity.domainHash,
    initialState: {
      q: new Array(system.size).fill(0),
      v: new Array(system.size).fill(0),
      a: new Array(system.size).fill(0),
      elementStates: {},
    },
  });
  return runMdofNewmark({
    assembler: system.assembler,
    massDomain: system.massDomain,
    damping: system.damping,
    groundMotion,
    stateStore: store,
    checkpoint: options.checkpoint,
    backend,
    production: false,
    isCancelled: options.isCancelled,
    onCommit: options.onCommit,
    options: {
      outputDt: dt,
      initialDt: options.initialDt || dt,
      minDt: options.minDt || dt / 64,
      maximumSubstepLevel: options.maximumSubstepLevel || 8,
      checkpointInterval: 1000,
      endTime: options.endTime,
      stepTraceLimit: options.stepTraceLimit,
      newton: {
        maxIterations: 30,
        convergence: strictConvergence(),
        ...(options.newton || {}),
      },
    },
  });
}

function createSystem({
  mass,
  stiffness,
  cubic = 0,
  maximumAcceptedDt = Infinity,
  minimumAcceptedQ = -Infinity,
}) {
  const size = mass.length;
  const massMatrix = csc(mass);
  const stiffnessMatrix = csc(stiffness);
  const fullDofCount = size * 6;
  const fullMass = Array.from({ length: fullDofCount }, () => new Array(fullDofCount).fill(0));
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) fullMass[row * 6][column * 6] = mass[row][column];
  }
  const influence = multiply(mass, new Array(size).fill(1));
  const massDomain = {
    version: 'p8-m8-mdof-mass-domain-v1',
    ok: true,
    formulation: 'lumped',
    reducedDofCount: size,
    fullDofCount,
    matrix: massMatrix,
    fullMatrix: csc(fullMass),
    activeDofs: Object.freeze(Array.from({ length: size }, (_value, index) => index)),
    influenceByAxis: Object.freeze([Object.freeze(influence), Object.freeze(new Array(size).fill(0)), Object.freeze(new Array(size).fill(0))]),
    activeMassByAxis: Object.freeze([influence.reduce((sum, value) => sum + value, 0), 0, 0]),
    physicalMassByAxis: Object.freeze([influence.reduce((sum, value) => sum + value, 0), 0, 0]),
    massHash: `mass-${size}-${stableNumber(influence)}`,
  };
  const constraint = {
    ok: true,
    reducedDofCount: size,
    fullDofCount,
    reducedDofs: Array.from({ length: size }, (_value, index) => ({ index, key: `n:N${index}:0` })),
    rows: Array.from({ length: fullDofCount }, (_value, fullDof) => (
      fullDof % 6 === 0 ? [[Math.floor(fullDof / 6), 1]] : []
    )),
  };
  const domain = {
    ok: true,
    constraint,
    nodes: Array.from({ length: size }, (_value, index) => ({ id: `N${index}`, x: index, y: 0, z: 0 })),
    identity: { domainHash: `domain-${size}-${cubic}-${maximumAcceptedDt}` },
  };
  const assembler = {
    domain,
    requiredMatrixClass: 'spd',
    characteristicLength: 1,
    allowedInactiveReducedDofs: [],
    async evaluate({ q, dt = 0 }) {
      if (dt > maximumAcceptedDt + 1e-14) return { ok: false, reason: 'FORCED_COARSE_STEP_FAILURE' };
      if (Number(q[0]) < minimumAcceptedQ) return { ok: false, reason: 'FORCED_RESPONSE_LIMIT_FAILURE' };
      const linearForce = multiply(stiffness, q);
      const internal = linearForce.map((value, index) => value + (index === 0 ? cubic * Number(q[index]) ** 3 : 0));
      const tangent = stiffness.map((row, i) => row.map((value, j) => value + (i === 0 && j === 0 ? 3 * cubic * Number(q[0]) ** 2 : 0)));
      const strain = 0.5 * dot(q, linearForce) + 0.25 * cubic * Number(q[0]) ** 4;
      return {
        ok: true,
        q: Float64Array.from(q),
        u: Float64Array.from(constraint.rows, (row) => row.length ? Number(q[row[0][0]]) : 0),
        pExternalReduced: new Float64Array(size),
        pInternalReduced: Float64Array.from(internal),
        residualReduced: Float64Array.from(internal, (value) => -value),
        tangentReduced: csc(tangent),
        inactiveModesReduced: [],
        inactiveModeGroupsReduced: [],
        elementStates: { spring: { q: Array.from(q) } },
        elementResponses: {},
        energies: { strain, dissipated: 0 },
        audit: { ok: true },
        diagnostics: { tangentSymmetryError: 0 },
      };
    },
  };
  return {
    size,
    assembler,
    massDomain,
    damping: {
      version: 'p8-m8-mdof-damping-v1',
      ok: true,
      type: 'none',
      matrix: createCscFromTriplets(size, size, []),
      dampingHash: `none-${size}`,
    },
  };
}

function linearNewmarkReference({ mass, stiffness, accelerations, dt }) {
  const size = mass.length;
  const beta = 0.25;
  const gamma = 0.5;
  const coefficient = 1 / (beta * dt ** 2);
  const effective = add(stiffness, scale(mass, coefficient));
  let q = new Array(size).fill(0);
  let v = new Array(size).fill(0);
  let a = new Array(size).fill(0);
  const rows = [{ q: q.slice(), v: v.slice(), a: a.slice() }];
  for (let step = 1; step < accelerations.length; step += 1) {
    const qPredictor = q.map((value, index) => value + dt * v[index] + dt ** 2 * (0.5 - beta) * a[index]);
    const vPredictor = v.map((value, index) => value + dt * (1 - gamma) * a[index]);
    const ground = multiply(mass, new Array(size).fill(-Number(accelerations[step])));
    const rhs = addVector(ground, multiply(scale(mass, coefficient), qPredictor));
    q = solveDense(effective, rhs);
    a = q.map((value, index) => coefficient * (value - qPredictor[index]));
    v = vPredictor.map((value, index) => value + gamma * dt * a[index]);
    rows.push({ q: q.slice(), v: v.slice(), a: a.slice() });
  }
  return rows;
}

function nonlinearNewmarkReference({ mass, stiffness, cubic, accelerations, dt }) {
  const beta = 0.25;
  const gamma = 0.5;
  const coefficient = 1 / (beta * dt ** 2);
  let q = 0;
  let v = 0;
  let a = 0;
  const rows = [q];
  for (let step = 1; step < accelerations.length; step += 1) {
    const qPredictor = q + dt * v + dt ** 2 * (0.5 - beta) * a;
    const vPredictor = v + dt * (1 - gamma) * a;
    let trial = qPredictor;
    for (let iteration = 0; iteration < 80; iteration += 1) {
      const trialA = coefficient * (trial - qPredictor);
      const residual = -mass * accelerations[step] - stiffness * trial - cubic * trial ** 3 - mass * trialA;
      const correction = residual / (stiffness + 3 * cubic * trial ** 2 + mass * coefficient);
      trial += correction;
      if (Math.abs(residual) < 1e-13) break;
    }
    q = trial;
    a = coefficient * (q - qPredictor);
    v = vPredictor + gamma * dt * a;
    rows.push(q);
  }
  return rows;
}

function effectiveTangentFiniteDifference(input) {
  const beta = 0.25;
  const gamma = 0.5;
  const a0 = 1 / (beta * input.dt ** 2);
  const a1 = gamma / (beta * input.dt);
  const expected = input.stiffness + a0 * input.mass + a1 * input.damping;
  const residual = (q) => (
    -input.stiffness * q
    - input.mass * a0 * (q - input.qPredictor)
    - input.damping * (input.vPredictor + a1 * (q - input.qPredictor))
  );
  const h = 1e-7;
  const derivative = (residual(input.q + h) - residual(input.q - h)) / (2 * h);
  return { expected, derivative, relativeError: Math.abs(derivative + expected) / expected };
}

function historyRows(result) {
  return result.history.retainedChunks.flatMap((chunk) => chunk.rows);
}

function sampleSine(dt, duration) {
  const count = Math.round(duration / dt) + 1;
  return Array.from({ length: count }, (_value, index) => Math.sin(2 * Math.PI * index * dt));
}

function strictConvergence() {
  return {
    forceAbsolute: 1e-10,
    forceRelative: 1e-9,
    momentAbsolute: 1e-10,
    momentRelative: 1e-9,
    displacementAbsolute: 1e-12,
    displacementRelative: 1e-9,
    rotationAbsolute: 1e-12,
    rotationRelative: 1e-9,
    energyAbsolute: 1e-13,
    energyRelative: 1e-10,
  };
}

function csc(matrix) {
  const triplets = [];
  matrix.forEach((row, i) => row.forEach((value, j) => {
    if (value !== 0) triplets.push([i, j, value]);
  }));
  return createCscFromTriplets(matrix.length, matrix.length, triplets);
}

function multiply(matrix, vector) {
  return matrix.map((row) => dot(row, vector));
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + Number(value) * Number(right[index]), 0);
}

function add(left, right) {
  return left.map((row, i) => row.map((value, j) => value + right[i][j]));
}

function scale(matrix, factor) {
  return matrix.map((row) => row.map((value) => value * factor));
}

function addVector(left, right) {
  return left.map((value, index) => value + right[index]);
}

function solveDense(matrixInput, rhsInput) {
  const matrix = matrixInput.map((row) => row.slice());
  const rhs = rhsInput.slice();
  for (let pivot = 0; pivot < matrix.length; pivot += 1) {
    let selected = pivot;
    for (let row = pivot + 1; row < matrix.length; row += 1) {
      if (Math.abs(matrix[row][pivot]) > Math.abs(matrix[selected][pivot])) selected = row;
    }
    [matrix[pivot], matrix[selected]] = [matrix[selected], matrix[pivot]];
    [rhs[pivot], rhs[selected]] = [rhs[selected], rhs[pivot]];
    for (let row = pivot + 1; row < matrix.length; row += 1) {
      const factor = matrix[row][pivot] / matrix[pivot][pivot];
      for (let column = pivot; column < matrix.length; column += 1) matrix[row][column] -= factor * matrix[pivot][column];
      rhs[row] -= factor * rhs[pivot];
    }
  }
  const output = new Array(matrix.length).fill(0);
  for (let row = matrix.length - 1; row >= 0; row -= 1) {
    output[row] = (rhs[row] - matrix[row].slice(row + 1).reduce((sum, value, offset) => sum + value * output[row + 1 + offset], 0)) / matrix[row][row];
  }
  return output;
}

function closeVector(actual, expected, tolerance, name) {
  assert.equal(actual.length, expected.length, `${name} length`);
  actual.forEach((value, index) => {
    assert.ok(Math.abs(Number(value) - Number(expected[index])) <= tolerance, `${name}[${index}]: ${value} vs ${expected[index]}`);
  });
}

function stableNumber(values) {
  return values.map((value) => Number(value).toPrecision(8)).join(':');
}
