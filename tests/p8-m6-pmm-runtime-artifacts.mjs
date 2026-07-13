import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getPhase8VerificationSuite,
  validatePhase8EvidenceArtifact,
} from '../src/verification/registry.js';
import { P8_M6_PMM_RUNTIME_GATE_MS } from './fixtures/p8-m6-pmm-runtime-fixture.mjs';

const artifact = JSON.parse(readFileSync(new URL(
  '../reports/validation-evidence/phase8/p8-m6-pmm-runtime.json',
  import.meta.url,
)));
const suite = getPhase8VerificationSuite('P8-M6-PMM-RUNTIME');
const verificationIds = Array.from(
  { length: 6 },
  (_, index) => `NL-PMM-${String(index + 9).padStart(2, '0')}`,
);

assert.deepEqual(suite?.verificationIds, verificationIds);
assert.deepEqual(validatePhase8EvidenceArtifact(artifact), { ok: true, errors: [] });
assert.equal(artifact.suiteId, suite.id);
assert.equal(artifact.status, 'PASS');
assert.deepEqual(artifact.verificationIds, verificationIds);
assert.ok(verificationIds.every((id) => (
  artifact.results.some((row) => row.id === id && row.status === 'PASS')
)));

const metrics = artifact.metrics;
assert.ok(metrics && typeof metrics === 'object');
const cold = metrics.coldBenchmark;
assert.equal(cold.gateMs, P8_M6_PMM_RUNTIME_GATE_MS);
assertFiniteRange(cold.elapsedMs, 0, cold.gateMs, 'coldBenchmark.elapsedMs');
assertPositiveInteger(cold.operations.fiberCount, 'coldBenchmark.operations.fiberCount');
assertPositiveInteger(cold.operations.sectionEvaluationCount, 'coldBenchmark.operations.sectionEvaluationCount');
assertPositiveInteger(cold.operations.sectionSolveCount, 'coldBenchmark.operations.sectionSolveCount');
assertPositiveInteger(cold.operations.sectionSolveRequestCount, 'coldBenchmark.operations.sectionSolveRequestCount');
assertNonnegativeInteger(cold.operations.sectionSolveCacheHitCount, 'coldBenchmark.operations.sectionSolveCacheHitCount');
assert.equal(
  cold.operations.sectionSolveRequestCount,
  cold.operations.sectionSolveCount + cold.operations.sectionSolveCacheHitCount,
);

assertPositiveInteger(metrics.cache.memoryHits, 'cache.memoryHits');
assertPositiveInteger(metrics.cache.persistentHits, 'cache.persistentHits');
assert.equal(metrics.cache.sourceIdentityBound, true);
assertPositiveInteger(metrics.determinism.memoizedSolves, 'determinism.memoizedSolves');
assertPositiveInteger(metrics.determinism.unmemoizedSolves, 'determinism.unmemoizedSolves');
assert.ok(metrics.determinism.memoizedSolves < metrics.determinism.unmemoizedSolves);
assertPositiveInteger(metrics.worker.uniqueWorkerRuns, 'worker.uniqueWorkerRuns');
assert.equal(metrics.worker.cancelledCacheWrites, 0);
assert.equal(metrics.worker.lateCancellationCacheWrites, 0);
assert.ok(metrics.staleProtection.changedInputCount >= 4);
assert.equal(metrics.staleProtection.evictionPolicyClaimed, false);

assert.deepEqual(metrics.parity.map((row) => row.id), [
  'small-steel',
  'symmetric-rc',
  'asymmetric-rc',
]);
for (const row of metrics.parity) {
  assertFiniteRange(row.responseMaxRelativeError, 0, 2e-12, `${row.id}.responseMaxRelativeError`);
  assertFiniteRange(row.rootMaxRelativeError, 0, 2e-10, `${row.id}.rootMaxRelativeError`);
  assertFiniteRange(row.pmmMaxRelativeError, 0, 2e-9, `${row.id}.pmmMaxRelativeError`);
  assertPositiveInteger(row.comparedPmmNumericValues, `${row.id}.comparedPmmNumericValues`);
  assert.match(row.fullSurfaceHash, /^[a-f0-9]{64}$/);
  assert.equal(row.optimizedSurfaceHash, row.fullSurfaceHash);
}

console.log(JSON.stringify({
  ok: true,
  suiteId: suite.id,
  verificationCount: verificationIds.length,
  coldElapsedMs: cold.elapsedMs,
  coldGateMs: cold.gateMs,
  parityFixtureCount: metrics.parity.length,
}, null, 2));

function assertFiniteRange(value, minimum, maximum, label) {
  assert.ok(Number.isFinite(value), `${label} must be finite`);
  assert.ok(value >= minimum && value <= maximum, `${label}=${value} outside [${minimum}, ${maximum}]`);
}

function assertPositiveInteger(value, label) {
  assert.ok(Number.isInteger(value) && value > 0, `${label} must be a positive integer`);
}

function assertNonnegativeInteger(value, label) {
  assert.ok(Number.isInteger(value) && value >= 0, `${label} must be a nonnegative integer`);
}
