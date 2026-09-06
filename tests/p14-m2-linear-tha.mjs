import assert from 'node:assert/strict';
import {
  buildModalDampingMatrix,
  buildLinearThaReport,
  createCanonicalAccelerationSeries,
  createModel,
  runAnalysisCase,
  runLinearDirectTha,
} from '../src/index.js';

const canonical = createCanonicalAccelerationSeries({
  recordId: 'GM-1',
  accelerations: [0, 1, 0],
  dt: 0.1,
  targetDt: 0.05,
  accelerationUnit: 'm/s2',
});
[0, 0.5, 1, 0.5, 0].forEach((value, index) => close(canonical.accelerations[index], value, 1e-14, `resample ${index}`));
assert.equal(canonical.signConvention, 'positive-ground-acceleration-produces-negative-inertial-load');
assert.throws(() => createCanonicalAccelerationSeries({ accelerations: [0, 1], times: [0.1, 0.2] }), (error) => error.code === 'GROUND_MOTION_TIME_ORIGIN_INVALID');

const mass = [[2, 0], [0, 3]];
const modes = [
  { id: 'M1', omega: 2, vector: [1 / Math.sqrt(2), 0] },
  { id: 'M2', omega: 5, vector: [0, 1 / Math.sqrt(3)] },
];
const modalDamping = buildModalDampingMatrix({ mass, modes, dampingRatios: { M1: 0.02, M2: 0.05 } });
assert.equal(modalDamping.audit.passed, true, JSON.stringify(modalDamping.audit));
assert.ok(modalDamping.symmetryError <= 1e-14);
close(modalDamping.audit.rows[0].value, 0.08, 1e-12, 'mode 1 damping');
close(modalDamping.audit.rows[3].value, 0.5, 1e-12, 'mode 2 damping');

const zero = runLinearDirectTha({
  mass: [[1]], stiffness: [[4]], damping: [[0.1]], influence: [1], dt: 0.01, accelerations: new Array(101).fill(0),
});
assert.equal(zero.ok, true);
assert.equal(zero.maxDisplacement, 0);
assert.equal(zero.rows.every((row) => row.velocity[0] === 0 && row.acceleration[0] === 0), true);

const errors = [0.05, 0.025, 0.0125].map((dt) => freeVibrationError(dt));
assert.ok(errors[0] / errors[1] > 3.5, `coarse order ratio ${errors[0] / errors[1]}`);
assert.ok(errors[1] / errors[2] > 3.5, `fine order ratio ${errors[1] / errors[2]}`);

const modalRun = runLinearDirectTha({
  mass,
  stiffness: [[8, 0], [0, 75]],
  modes,
  dampingType: 'modal',
  modalDampingRatios: { M1: 0.02, M2: 0.05 },
  influence: [1, 1],
  dt: 0.01,
  accelerations: Array.from({ length: 201 }, (_row, index) => 0.2 * Math.sin(index * 0.01 * 3)),
});
assert.equal(modalRun.ok, true);
assert.equal(modalRun.damping.type, 'modal');
assert.equal(modalRun.damping.audit.passed, true);
assert.equal(modalRun.stiffnessSnapshot.policy, 'initial-elastic');
assert.ok(modalRun.rows.every((row) => Array.isArray(row.displacement) && Array.isArray(row.velocity) && Array.isArray(row.acceleration)));

const input = {
  mass: [[1]], stiffness: [[16]], damping: [[0.08]], influence: [1], dt: 0.01,
  accelerations: Array.from({ length: 101 }, (_row, index) => Math.sin(index * 0.01)),
  checkpointEvery: 20,
};
let firstCheckpoint = null;
const continuous = runLinearDirectTha({ ...input, onCheckpoint: (checkpoint) => { firstCheckpoint ||= checkpoint; } });
assert.ok(firstCheckpoint && firstCheckpoint.nextStep === 21);
const restarted = runLinearDirectTha({ ...input, restart: firstCheckpoint });
assert.equal(restarted.runHash, continuous.runHash);
close(restarted.finalState.displacement[0], continuous.finalState.displacement[0], 1e-13, 'restart displacement');
close(restarted.finalState.velocity[0], continuous.finalState.velocity[0], 1e-13, 'restart velocity');

const controller = new AbortController();
const cancelled = runLinearDirectTha({
  ...input,
  signal: controller.signal,
  onCheckpoint: () => controller.abort(),
});
assert.equal(cancelled.status, 'cancelled');
assert.equal(cancelled.partialPublish, false);
assert.equal(cancelled.rows.length, 0);
assert.equal(cancelled.factorization.disposed, true);
assert.ok(cancelled.checkpoint);

const model = columnModel();
const caseResult = runAnalysisCase(model, {
  id: 'LTH-MODAL',
  kind: 'linearTha',
  settings: {
    integration: 'direct',
    dampingType: 'modal',
    dampingRatio: 0.03,
    modalModeCount: 2,
    direction: 'x',
    dt: 0.01,
    accelerationUnit: 'model',
    accelerations: Array.from({ length: 101 }, (_row, index) => 0.1 * Math.sin(index * 0.02)),
  },
});
assert.ok(caseResult.status === 'ok', JSON.stringify(caseResult, null, 2));
assert.equal(caseResult.payload.damping.type, 'modal');
assert.ok(caseResult.payload.rows[0].fullDisplacement.length === model.nodes.length * 6);
const report = buildLinearThaReport({ 'LTH-MODAL': caseResult });
assert.equal(report.completedCount, 1);
assert.equal(report.rows[0].dampingType, 'modal');

console.log(JSON.stringify({
  ok: true,
  milestone: 'P14-M2',
  canonicalSeriesHash: canonical.seriesHash,
  modalDampingHash: modalDamping.dampingHash,
  convergenceErrors: errors,
  convergenceRatios: [errors[0] / errors[1], errors[1] / errors[2]],
  restartHash: restarted.runHash,
  cancellationPartialPublish: cancelled.partialPublish,
  fullPathStatus: caseResult.status,
}, null, 2));

function freeVibrationError(dt) {
  const omega = 2 * Math.PI;
  const count = Math.round(1 / dt) + 1;
  const run = runLinearDirectTha({
    mass: [[1]], stiffness: [[omega * omega]], damping: [[0]], influence: [1], dt,
    accelerations: new Array(count).fill(0), initialDisplacement: [1], initialVelocity: [0], energyTol: 1e-10,
  });
  assert.equal(run.energy.qualified, true, `energy ${run.energy.maxRelativeError}`);
  return Math.abs(run.finalState.displacement[0] - 1);
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(actual), Math.abs(expected)), `${label}: ${actual} vs ${expected}`);
}

function columnModel() {
  const model = createModel();
  model.nodes = [
    { id: 'B', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'T', x: 0, y: 0, z: 3, support: null },
  ];
  model.members = [{ id: 'C', type: 'frame', n1: 'B', n2: 'T', matId: 'steel', secId: 'h300', releases: { i: 'rigid', j: 'rigid' } }];
  model.loadCases = [{ id: 'D', name: 'D', type: 'dead' }];
  model.loadCombinations = [{ id: 'D', name: 'D', factors: { D: 1 } }];
  model.loads = [];
  model.analysisSettings = { ...model.analysisSettings, responseSpectrum: { enabled: false }, includeSelfWeight: false };
  return model;
}
