import assert from 'node:assert/strict';
import {
  buildPhase8TridiagonalCsr,
  createWasmSparseBackend,
  evaluatePhase8PerformanceQualification,
  measurePhase8Performance,
  validatePhase8PerformanceMeasurement,
} from '../src/index.js';

const backend = await createWasmSparseBackend();
const qualification = await measurePhase8Performance({
  backend,
  smallDof: 12,
  mediumDof: 256,
  pushoverKernelSteps: 4,
  historySteps: 600,
  historyChunkSize: 50,
  measuredRuns: 2,
  warmupRuns: 1,
  availableMemoryBytes: 2 * 1024 ** 3,
});

assert.equal(validatePhase8PerformanceMeasurement(qualification.measurement).ok, true);
assert.equal(qualification.status, 'BLOCKED');
assert.equal(qualification.results.length, 16);
for (const id of ['NL-PERF-01', 'NL-PERF-03', 'NL-PERF-04', 'NL-PERF-05', 'NL-PERF-06', 'NL-PERF-08', 'NL-PERF-09', 'NL-PERF-10', 'NL-PERF-11', 'NL-PERF-14', 'NL-PERF-15']) {
  assert.equal(qualification.results.find((row) => row.id === id).status, 'PASS', id);
}
for (const id of ['NL-PERF-02', 'NL-PERF-07', 'NL-PERF-12', 'NL-PERF-13', 'NL-PERF-16']) {
  assert.equal(qualification.results.find((row) => row.id === id).status, 'BLOCKED', id);
}
assert.equal(qualification.measurement.mediumKernel.denseFallbackUsed, false);
assert.ok(qualification.measurement.mediumKernel.symbolicCacheHitCount > 0);
assert.equal(qualification.measurement.streaming.outputStepCount, 600);
assert.equal(qualification.measurement.streaming.retainedBytes, 0);
assert.equal(qualification.measurement.worker.cancelled, true);
assert.equal(qualification.measurement.worker.restartCompleted, true);
assert.ok(qualification.measurement.worker.cancelAcknowledgementMs <= 2000);

const completeMeasurement = structuredClone(qualification.measurement);
completeMeasurement.uiLatency = evidence('main-thread-ui-latency', null, { p95Ms: 25 });
completeMeasurement.parallel = evidence('deterministic-parallel-worker', null, {
  deterministic: true,
  eventOrderingEquivalent: true,
});
completeMeasurement.endToEnd.pushoverMedium = evidence(
  'end-to-end-production-frame-pushover',
  'PERF-PUSH-M',
  { durationMs: 120000, peakMemoryBytes: 500 * 1024 ** 2 },
  'end-to-end-production-frame',
);
completeMeasurement.endToEnd.pushoverTarget = evidence(
  'end-to-end-production-frame-pushover-target',
  'PERF-PUSH-L',
  { durationMs: 240000, peakMemoryBytes: 900 * 1024 ** 2 },
  'end-to-end-production-frame',
);
completeMeasurement.endToEnd.nlthMedium = evidence(
  'end-to-end-production-frame-nlth',
  'PERF-NLTH-M',
  { durationMs: 600000, peakMemoryBytes: 800 * 1024 ** 2 },
  'end-to-end-production-frame',
);
const completed = evaluatePhase8PerformanceQualification(completeMeasurement);
assert.equal(completed.status, 'PASS');
assert.ok(completed.results.every((row) => row.status === 'PASS'));

const matrix = buildPhase8TridiagonalCsr(10);
assert.equal(matrix.nnz, 28);
assert.throws(() => buildPhase8TridiagonalCsr(10, { diagonal: 2, offDiagonal: -1 }), (error) => error.code === 'PERFORMANCE_MATRIX_NOT_STRICTLY_DIAGONALLY_DOMINANT');

console.log(JSON.stringify({
  ok: true,
  measuredStatus: qualification.status,
  blockedIds: qualification.results.filter((row) => row.status !== 'PASS').map((row) => row.id),
  completedStatus: completed.status,
  mediumKernel: {
    dofCount: qualification.measurement.mediumKernel.dofCount,
    solveCount: qualification.measurement.mediumKernel.solveCount,
    medianMs: qualification.measurement.mediumKernel.medianMs,
  },
  streamingSteps: qualification.measurement.streaming.outputStepCount,
}, null, 2));

function evidence(kind, workloadId, metrics, coverage = null) {
  return {
    status: 'PASS',
    kind,
    coverage,
    workloadId,
    profileId: 'test-profile',
    sourceHash: `hash-${kind}-${workloadId || 'none'}`,
    reproducible: true,
    metrics,
  };
}
