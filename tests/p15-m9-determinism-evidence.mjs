import assert from 'node:assert/strict';
import {
  PHASE15_DETERMINISM_RUN_COUNT,
  runPhase15DeterminismQualification,
} from '../verification/framework/phase15/determinismEvidence.js';
import {
  hashStrix21BenchmarkResult,
  projectStrix21BenchmarkResult,
  runStrix21M7QualificationCase,
  STRIX21_RESULT_HASH_PROJECTION_VERSION,
} from '../verification/framework/benchmarks/strix21FirstBatch.js';

const hash = (digit) => digit.repeat(64);
const benchmark = {
  calculationHash: hash('a'),
  resultHash: hash('b'),
  runRecordHash: hash('c'),
  artifactHash: hash('d'),
  summary: { attempted: 12, PASS: 9, CUSTOM_PASS: 1, REVIEW: 0, BLOCKED: 2, metricCount: 52, metricPassCount: 52 },
};
let timerValue = 0;
const passed = runPhase15DeterminismQualification({
  runBenchmark: () => ({ ...benchmark }),
  now: () => '2026-08-27T00:00:00.000Z',
  timer: () => timerValue++,
});
assert.equal(PHASE15_DETERMINISM_RUN_COUNT, 3);
assert.equal(passed.status, 'PASS');
assert.equal(passed.deterministic, true);
assert.equal(passed.runs.length, 3);
assert.equal(passed.m9ExecutionInputFragment.determinismRuns.length, 3);

let runIndex = 0;
const blocked = runPhase15DeterminismQualification({
  runBenchmark: () => ({ ...benchmark, resultHash: runIndex++ === 2 ? hash('e') : hash('b') }),
  now: () => '2026-08-27T00:00:00.000Z',
  timer: () => timerValue++,
});
assert.equal(blocked.status, 'BLOCKED');
assert.equal(blocked.deterministic, false);
assert.equal(blocked.resultHash, null);

assert.throws(
  () => runPhase15DeterminismQualification({ runBenchmark: () => ({}) }),
  /invalid calculationHash/u,
);

const representativeResult = {
  disp: { N1: [0.125, 0, 0, 0, 0, 0] },
  summary: { equilibriumResidual: 2e-12 },
  solver: {
    method: 'scaled-ic0-pcg',
    iterations: 7,
    residual: 3e-13,
    factorizationMs: 1.25,
    solveMs: 0.75,
    totalSolveMs: 2,
  },
};
const timingMutation = structuredClone(representativeResult);
timingMutation.solver.factorizationMs = 90;
timingMutation.solver.solveMs = 40;
timingMutation.solver.totalSolveMs = 130;
assert.equal(
  hashStrix21BenchmarkResult(timingMutation),
  hashStrix21BenchmarkResult(representativeResult),
  'runtime timing telemetry must not change a deterministic engineering-result hash',
);
const projected = projectStrix21BenchmarkResult(representativeResult);
assert.equal(projected.solver.factorizationMs, undefined);
assert.equal(projected.solver.iterations, 7, 'solver iterations remain meaningful deterministic evidence');
assert.equal(projected.solver.residual, 3e-13, 'solver residual remains meaningful deterministic evidence');

const displacementMutation = structuredClone(representativeResult);
displacementMutation.disp.N1[0] += 1e-6;
assert.notEqual(
  hashStrix21BenchmarkResult(displacementMutation),
  hashStrix21BenchmarkResult(representativeResult),
  'a meaningful response mutation must change the deterministic result hash',
);
const residualMutation = structuredClone(representativeResult);
residualMutation.solver.residual *= 10;
assert.notEqual(
  hashStrix21BenchmarkResult(residualMutation),
  hashStrix21BenchmarkResult(representativeResult),
  'a meaningful solver-diagnostic mutation must change the deterministic result hash',
);

for (const caseId of ['SB10', 'SB1']) {
  const first = runStrix21M7QualificationCase(caseId);
  const second = runStrix21M7QualificationCase(caseId);
  assert.equal(second.resultHash, first.resultHash, `${caseId} repeated same-process result hash`);
  if (caseId === 'SB1') {
    assert.deepEqual(
      second.audit.meshSequence.map((row) => row.calculationHash),
      first.audit.meshSequence.map((row) => row.calculationHash),
      'SB1 nested mesh calculation hashes must also be deterministic',
    );
  }
}

console.log(JSON.stringify({
  ok: true,
  milestone: 'P15-M9',
  deterministicRunCount: passed.runs.length,
  nondeterminismDetected: blocked.status === 'BLOCKED',
  resultHashProjectionVersion: STRIX21_RESULT_HASH_PROJECTION_VERSION,
  sameProcessActualCases: ['SB10', 'SB1'],
  timingTelemetryExcluded: true,
  meaningfulMutationDetected: true,
  evidenceHash: passed.evidenceHash,
}, null, 2));
