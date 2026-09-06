import assert from 'node:assert/strict';
import {
  PHASE15_FULL_REGRESSION_EVIDENCE_VERSION,
  runPhase15FullRegressionEvidence,
  validatePhase15FullRegressionEvidence,
} from '../verification/framework/phase15/index.js';

const SOURCE_DIGEST = 'a'.repeat(64);
const INVENTORY_HASH = 'b'.repeat(64);
const calculation = {
  sourceDigest: SOURCE_DIGEST,
  suiteManifestHash: 'c'.repeat(64),
  frozenTestInventoryHash: INVENTORY_HASH,
  testInventoryHash: INVENTORY_HASH,
  frozenPlannedCount: 8,
  testInventory: {
    version: 'fixture-test-inventory-v1',
    entryCount: 12,
    testFileCount: 10,
    runnerFileCount: 2,
    plannedCount: 8,
  },
  command: {
    program: 'npm.cmd',
    args: ['test'],
    display: 'npm.cmd test',
    cwdPolicy: 'repository-root',
  },
  timeoutMs: 10_000,
};

let successCalls = 0;
const success = await evidenceFor(async (request) => {
  successCalls += 1;
  assert.equal(request.command.display, 'npm.cmd test');
  assert.equal(request.timeoutMs, 10_000);
  return outcome();
});
assert.equal(successCalls, 1, 'the injected runner must execute exactly once');
assert.equal(success.version, PHASE15_FULL_REGRESSION_EVIDENCE_VERSION);
assert.equal(success.status, 'PASS');
assert.equal(success.fullRegressionPassed, true);
assert.deepEqual(success.mandatoryCounts, { fail: 0, skip: 0, timeout: 0, flake: 0 });
assert.deepEqual(validatePhase15FullRegressionEvidence(success), { ok: true, errors: [] });
assert.equal(success.fullRegressionHash, success.evidenceHash);
assert.equal(success.result.plannedCount, 8);
assert.match(success.calculation.commandHash, /^[a-f0-9]{64}$/);
assert.equal(success.m9ExecutionInputFragment.fullRegressionPassed, true);
assert.equal(success.m9ExecutionInputFragment.fullRegressionHash, success.evidenceHash);
assert.equal(success.m9ExecutionInputFragment.cleanEnvironmentPassed, false);
assert.equal(success.m9ExecutionInputFragment.cleanRunHash, null);

const laterTelemetry = await evidenceFor(async () => outcome({
  stdout: { sha256: 'c'.repeat(64), bytes: 100 },
}), {
  timestamps: ['2026-08-28T01:00:00.000Z', '2026-08-28T01:00:02.000Z'],
  ticks: [10, 2010],
  runtime: { node: 'fixture-node-other', platform: 'fixture-other' },
});
assert.equal(laterTelemetry.calculationHash, success.calculationHash, 'runtime and timestamps must not change calculationHash');
assert.equal(laterTelemetry.evidenceHash, success.evidenceHash, 'runtime and timestamps must not change evidenceHash');
assert.notEqual(laterTelemetry.run.runRecordHash, success.run.runRecordHash, 'run telemetry must change only runRecordHash');

const failed = await evidenceFor(async () => outcome({
  exitCode: 2,
  mandatoryCounts: { fail: 0, skip: 0, timeout: 0, flake: 0 },
}));
assert.equal(failed.status, 'FAIL');
assert.equal(failed.fullRegressionPassed, false);
assert.equal(failed.mandatoryCounts.fail, 1, 'nonzero child exit must force at least one failure');
assert.equal(failed.result.reason, 'FULL_REGRESSION_NONZERO_EXIT');

const timedOut = await evidenceFor(async () => outcome({
  exitCode: null,
  timedOut: true,
  signal: 'SIGTERM',
  mandatoryCounts: { fail: 0, skip: 0, timeout: 0, flake: 0 },
}));
assert.equal(timedOut.status, 'TIMEOUT');
assert.equal(timedOut.fullRegressionPassed, false);
assert.equal(timedOut.mandatoryCounts.timeout, 1, 'timeout must be counted even when the runner reports zero');
assert.equal(timedOut.result.reason, 'FULL_REGRESSION_TIMEOUT');

const flaky = await evidenceFor(async () => outcome({
  mandatoryCounts: { fail: 0, skip: 0, timeout: 0, flake: 1 },
}));
assert.equal(flaky.status, 'FAIL');
assert.equal(flaky.fullRegressionPassed, false, 'an observed retry recovery cannot be promoted to PASS');
assert.equal(flaky.mandatoryCounts.flake, 1);
assert.equal(flaky.result.reason, 'FULL_REGRESSION_MANDATORY_COUNTS_NONZERO');

const skipped = await evidenceFor(async () => outcome({
  mandatoryCounts: { fail: 0, skip: 1, timeout: 0, flake: 0 },
}));
assert.equal(skipped.fullRegressionPassed, false);
assert.equal(skipped.mandatoryCounts.skip, 1);

const changedInput = await evidenceFor(async () => outcome({ sourceDigestAfter: 'd'.repeat(64) }));
assert.equal(changedInput.fullRegressionPassed, false);
assert.equal(changedInput.mandatoryCounts.fail, 1);
assert.equal(changedInput.result.reason, 'FULL_REGRESSION_INPUT_SNAPSHOT_CHANGED');

const inventoryDrift = await evidenceFor(async () => outcome(), {
  calculation: { ...calculation, frozenTestInventoryHash: 'd'.repeat(64) },
});
assert.equal(inventoryDrift.fullRegressionPassed, false);
assert.equal(inventoryDrift.result.suiteInventoryMatched, false);
assert.equal(inventoryDrift.result.reason, 'FULL_REGRESSION_TEST_INVENTORY_DRIFT');

const runnerFailure = await evidenceFor(async () => {
  throw Object.assign(new Error('fixture spawn failed'), { code: 'ENOENT' });
});
assert.equal(runnerFailure.status, 'ERROR');
assert.equal(runnerFailure.fullRegressionPassed, false);
assert.equal(runnerFailure.mandatoryCounts.fail, 1);
assert.equal(runnerFailure.run.runnerError.code, 'ENOENT');

const tampered = structuredClone(success);
tampered.mandatoryCounts.fail = 1;
assert.equal(validatePhase15FullRegressionEvidence(tampered).ok, false, 'count tampering must invalidate evidence');
const forgedClean = structuredClone(success);
forgedClean.m9ExecutionInputFragment.cleanEnvironmentPassed = true;
assert.equal(validatePhase15FullRegressionEvidence(forgedClean).ok, false, 'full regression must not fabricate clean-environment evidence');

console.log(JSON.stringify({
  ok: true,
  milestone: 'P15-M9',
  verificationIds: [
    'P15-M9-FULL-REGRESSION-PASS',
    'P15-M9-FULL-REGRESSION-FAIL',
    'P15-M9-FULL-REGRESSION-TIMEOUT',
    'P15-M9-FULL-REGRESSION-FLAKE',
    'P15-M9-FULL-REGRESSION-SNAPSHOT',
    'P15-M9-FULL-REGRESSION-HASH-BOUNDARY',
  ],
  calculationHash: success.calculationHash,
  evidenceHash: success.evidenceHash,
  cleanEnvironmentClaimed: success.m9ExecutionInputFragment.cleanEnvironmentPassed,
}, null, 2));

async function evidenceFor(runner, options = {}) {
  const timestamps = [...(options.timestamps || ['2026-08-28T00:00:00.000Z', '2026-08-28T00:00:01.000Z'])];
  const ticks = [...(options.ticks || [0, 1000])];
  return runPhase15FullRegressionEvidence({
    calculation: options.calculation || calculation,
    runner,
    now: () => timestamps.shift(),
    timer: () => ticks.shift(),
    runtime: options.runtime || { node: 'fixture-node', platform: 'fixture-platform' },
  });
}

function outcome(overrides = {}) {
  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    mandatoryCounts: { fail: 0, skip: 0, timeout: 0, flake: 0 },
    sourceDigestAfter: SOURCE_DIGEST,
    testInventoryHashAfter: INVENTORY_HASH,
    stdout: { sha256: '0'.repeat(64), bytes: 0 },
    stderr: { sha256: '0'.repeat(64), bytes: 0 },
    ...overrides,
  };
}
