import {
  cloneStrictJson,
  immutable,
  requiredHash,
  requiredText,
  strictCanonicalHash,
} from './strictCanonical.js';

export const PHASE15_FULL_REGRESSION_EVIDENCE_VERSION = 'p15-m9-full-regression-evidence-v1';
export const PHASE15_FULL_REGRESSION_SUITE_ID = 'P15-M9-FULL-MANDATORY-REGRESSION';
export const PHASE15_FULL_REGRESSION_DEFAULT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

const COUNT_FIELDS = Object.freeze(['fail', 'skip', 'timeout', 'flake']);

/**
 * Runs one full-regression observation through an injected command runner.
 * Node process creation and filesystem capture remain in the CLI adapter; this
 * module owns the fail-closed result semantics and deterministic hash boundary.
 */
export async function runPhase15FullRegressionEvidence(input = {}) {
  if (typeof input.runner !== 'function') throw new TypeError('runner must be a function.');
  const calculation = normalizeCalculation(input.calculation || input);
  const calculationHash = strictCanonicalHash(calculation, 'Phase 15 full-regression calculation');
  const now = typeof input.now === 'function' ? input.now : () => new Date().toISOString();
  const timer = typeof input.timer === 'function'
    ? input.timer
    : () => globalThis.performance?.now?.() ?? Date.now();
  const startedAt = timestamp(now(), 'startedAt');
  const startedTick = finiteTimer(timer(), 'started timer');
  let rawOutcome = null;
  let runnerError = null;
  try {
    rawOutcome = await input.runner(immutable({
      command: calculation.command,
      timeoutMs: calculation.timeoutMs,
      sourceDigest: calculation.sourceDigest,
      testInventoryHash: calculation.testInventoryHash,
    }));
  } catch (error) {
    runnerError = normalizeRunnerError(error);
    rawOutcome = error?.outcome && typeof error.outcome === 'object' ? error.outcome : null;
  }
  if (!runnerError && rawOutcome?.runnerError) runnerError = normalizeRunnerError(rawOutcome.runnerError);
  const completedTick = finiteTimer(timer(), 'completed timer');
  const completedAt = timestamp(now(), 'completedAt');
  const durationMs = Math.max(0, completedTick - startedTick);
  const result = normalizeResult(rawOutcome, runnerError, calculation);
  const status = result.status;
  const evidenceCore = {
    version: PHASE15_FULL_REGRESSION_EVIDENCE_VERSION,
    suiteId: PHASE15_FULL_REGRESSION_SUITE_ID,
    calculationHash,
    result,
  };
  const evidenceHash = strictCanonicalHash(evidenceCore, 'Phase 15 full-regression evidence');
  const fullRegressionHash = evidenceHash;
  const runCore = {
    calculationHash,
    evidenceHash,
    startedAt,
    completedAt,
    durationMs,
    runtime: strictObject(input.runtime || {}, 'runtime'),
    stdout: outputTelemetry(rawOutcome?.stdout),
    stderr: outputTelemetry(rawOutcome?.stderr),
    runnerError,
  };
  const run = {
    ...runCore,
    runRecordHash: strictCanonicalHash(runCore, 'Phase 15 full-regression run record'),
  };
  const m9ExecutionInputFragment = {
    fullRegressionPassed: result.fullRegressionPassed,
    fullRegressionHash,
    mandatoryCounts: result.mandatoryCounts,
    cleanEnvironmentPassed: false,
    cleanRunHash: null,
  };
  return immutable({
    ...evidenceCore,
    calculation,
    status,
    fullRegressionPassed: result.fullRegressionPassed,
    mandatoryCounts: result.mandatoryCounts,
    fullRegressionHash,
    evidenceHash,
    run,
    m9ExecutionInputFragment,
  });
}

export function validatePhase15FullRegressionEvidence(value = {}) {
  const errors = [];
  try {
    if (!hasExactKeys(value, [
      'version', 'suiteId', 'calculation', 'calculationHash', 'result', 'status', 'fullRegressionPassed',
      'mandatoryCounts', 'fullRegressionHash', 'evidenceHash', 'run', 'm9ExecutionInputFragment',
    ])) errors.push('evidence:unknown-or-missing-field');
    if (value.version !== PHASE15_FULL_REGRESSION_EVIDENCE_VERSION
      || value.suiteId !== PHASE15_FULL_REGRESSION_SUITE_ID) errors.push('evidence:scope');
    if (!hasExactKeys(value.result, [
      'exitCode', 'signal', 'timedOut', 'runnerFailed', 'inputSnapshotStable',
      'suiteInventoryMatched', 'plannedCount', 'mandatoryCounts',
      'fullRegressionPassed', 'status', 'reason',
    ])) errors.push('evidence:result-schema');
    if (!hasExactKeys(value.mandatoryCounts, COUNT_FIELDS)
      || !hasExactKeys(value.result?.mandatoryCounts, COUNT_FIELDS)) errors.push('evidence:mandatory-count-schema');
    if (!hasExactKeys(value.calculation, [
      'sourceDigest', 'suiteManifestHash', 'frozenTestInventoryHash', 'testInventoryHash',
      'frozenPlannedCount', 'testInventory', 'command', 'commandHash', 'timeoutMs',
      'attemptPolicy', 'mandatoryCountFields',
    ])) errors.push('evidence:calculation-schema');
    if (!hasExactKeys(value.run, [
      'calculationHash', 'evidenceHash', 'startedAt', 'completedAt', 'durationMs',
      'runtime', 'stdout', 'stderr', 'runnerError', 'runRecordHash',
    ])) errors.push('evidence:run-schema');
    const normalizedCalculation = normalizeCalculation(value.calculation || {});
    const expectedCalculationHash = strictCanonicalHash(normalizedCalculation, 'Phase 15 full-regression calculation');
    if (strictCanonicalHash(value.calculation || {}, 'recorded full-regression calculation')
      !== strictCanonicalHash(normalizedCalculation, 'normalized full-regression calculation')) errors.push('evidence:calculation-normalization');
    if (value.calculationHash !== expectedCalculationHash) errors.push('evidence:calculation-hash');
    if (!recordedResultSemanticsPassed(value.result)) errors.push('evidence:result-semantics');
    const evidenceCore = {
      version: value.version,
      suiteId: value.suiteId,
      calculationHash: value.calculationHash,
      result: value.result,
    };
    const expectedEvidenceHash = strictCanonicalHash(evidenceCore, 'Phase 15 full-regression evidence');
    if (!isHash(value.calculationHash)) errors.push('evidence:calculation-hash-format');
    if (value.evidenceHash !== expectedEvidenceHash || value.fullRegressionHash !== expectedEvidenceHash) errors.push('evidence:hash');
    if (value.status !== value.result?.status
      || value.fullRegressionPassed !== value.result?.fullRegressionPassed
      || strictCanonicalHash(value.mandatoryCounts || {}, 'top-level mandatory counts')
        !== strictCanonicalHash(value.result?.mandatoryCounts || {}, 'result mandatory counts')) errors.push('evidence:projection');
    const fragment = value.m9ExecutionInputFragment || {};
    if (!hasExactKeys(fragment, [
      'fullRegressionPassed', 'fullRegressionHash', 'mandatoryCounts',
      'cleanEnvironmentPassed', 'cleanRunHash',
    ])
      || fragment.fullRegressionPassed !== value.fullRegressionPassed
      || fragment.fullRegressionHash !== value.fullRegressionHash
      || strictCanonicalHash(fragment.mandatoryCounts || {}, 'fragment mandatory counts')
        !== strictCanonicalHash(value.mandatoryCounts || {}, 'evidence mandatory counts')
      || fragment.cleanEnvironmentPassed !== false
      || fragment.cleanRunHash !== null) errors.push('evidence:m9-fragment');
    const runCore = cloneStrictJson(value.run, 'Phase 15 full-regression run record');
    delete runCore.runRecordHash;
    if (value.run?.calculationHash !== value.calculationHash
      || value.run?.evidenceHash !== value.evidenceHash
      || value.run?.runRecordHash !== strictCanonicalHash(runCore, 'Phase 15 full-regression run record')) errors.push('evidence:run-hash');
  } catch (error) {
    errors.push(`evidence:schema:${error.message}`);
  }
  return immutable({ ok: errors.length === 0, errors: [...new Set(errors)] });
}

function recordedResultSemanticsPassed(result = {}) {
  if (!hasExactKeys(result.mandatoryCounts, COUNT_FIELDS)) return false;
  if (!COUNT_FIELDS.every((field) => Number.isInteger(result.mandatoryCounts[field]) && result.mandatoryCounts[field] >= 0)) return false;
  if (!(result.exitCode === null || (Number.isInteger(result.exitCode) && result.exitCode >= 0))) return false;
  if (!(result.signal === null || (typeof result.signal === 'string' && result.signal.trim()))) return false;
  if (typeof result.timedOut !== 'boolean'
    || typeof result.runnerFailed !== 'boolean'
    || typeof result.inputSnapshotStable !== 'boolean'
    || typeof result.suiteInventoryMatched !== 'boolean'
    || !Number.isInteger(result.plannedCount)
    || result.plannedCount < 0) return false;
  const countsPassed = COUNT_FIELDS.every((field) => result.mandatoryCounts[field] === 0);
  const expectedPassed = result.exitCode === 0
    && result.signal === null
    && !result.timedOut
    && !result.runnerFailed
    && result.inputSnapshotStable
    && result.suiteInventoryMatched
    && result.plannedCount > 0
    && countsPassed;
  const expectedStatus = expectedPassed ? 'PASS' : result.timedOut ? 'TIMEOUT' : result.runnerFailed ? 'ERROR' : 'FAIL';
  return result.fullRegressionPassed === expectedPassed
    && result.status === expectedStatus
    && result.reason === expectedReason({ ...result, fullRegressionPassed: expectedPassed });
}

function normalizeCalculation(input) {
  const timeoutMs = positiveInteger(input.timeoutMs, PHASE15_FULL_REGRESSION_DEFAULT_TIMEOUT_MS, 'timeoutMs');
  const command = input.command || {};
  const args = Array.from(command.args || [], (value, index) => requiredText(value, `command.args[${index}]`));
  if (!args.length) throw new TypeError('command.args must not be empty.');
  const inventory = input.testInventory || {};
  const normalizedCommand = {
    program: requiredText(command.program, 'command.program'),
    args,
    display: requiredText(command.display, 'command.display'),
    cwdPolicy: requiredText(command.cwdPolicy || 'repository-root', 'command.cwdPolicy'),
  };
  return immutable({
    sourceDigest: requiredHash(input.sourceDigest, 'sourceDigest'),
    suiteManifestHash: requiredHash(input.suiteManifestHash, 'suiteManifestHash'),
    frozenTestInventoryHash: requiredHash(input.frozenTestInventoryHash, 'frozenTestInventoryHash'),
    testInventoryHash: requiredHash(input.testInventoryHash, 'testInventoryHash'),
    frozenPlannedCount: nonnegativeInteger(input.frozenPlannedCount, 'frozenPlannedCount'),
    testInventory: {
      version: requiredText(inventory.version, 'testInventory.version'),
      entryCount: nonnegativeInteger(inventory.entryCount, 'testInventory.entryCount'),
      testFileCount: nonnegativeInteger(inventory.testFileCount, 'testInventory.testFileCount'),
      runnerFileCount: nonnegativeInteger(inventory.runnerFileCount, 'testInventory.runnerFileCount'),
      plannedCount: nonnegativeInteger(inventory.plannedCount, 'testInventory.plannedCount'),
    },
    command: normalizedCommand,
    commandHash: strictCanonicalHash(normalizedCommand, 'Phase 15 full-regression command'),
    timeoutMs,
    attemptPolicy: 'single-run-no-retry',
    mandatoryCountFields: [...COUNT_FIELDS],
  });
}

function normalizeResult(rawInput, runnerError, calculation) {
  const raw = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const timedOut = raw.timedOut === true;
  const exitCode = Number.isInteger(raw.exitCode) && raw.exitCode >= 0 ? raw.exitCode : null;
  const signal = textOrNull(raw.signal);
  const runnerFailed = runnerError != null || raw.runnerFailed === true;
  const sourceDigestAfter = hashOrNull(raw.sourceDigestAfter);
  const testInventoryHashAfter = hashOrNull(raw.testInventoryHashAfter);
  const inputSnapshotStable = sourceDigestAfter === calculation.sourceDigest
    && testInventoryHashAfter === calculation.testInventoryHash;
  const suiteInventoryMatched = calculation.testInventory.plannedCount > 0
    && calculation.frozenPlannedCount === calculation.testInventory.plannedCount
    && calculation.frozenTestInventoryHash === calculation.testInventoryHash;
  const counts = normalizeCounts(raw.mandatoryCounts, {
    fail: !timedOut && (runnerFailed || signal != null || exitCode !== 0 || !inputSnapshotStable || !suiteInventoryMatched) ? 1 : 0,
    timeout: timedOut ? 1 : 0,
  });
  const processPassed = exitCode === 0 && signal == null && !timedOut && !runnerFailed
    && inputSnapshotStable && suiteInventoryMatched;
  const mandatoryCountsPassed = COUNT_FIELDS.every((field) => counts[field] === 0);
  const fullRegressionPassed = processPassed && mandatoryCountsPassed;
  const status = fullRegressionPassed ? 'PASS' : timedOut ? 'TIMEOUT' : runnerFailed ? 'ERROR' : 'FAIL';
  const reason = fullRegressionPassed
    ? null
    : timedOut ? 'FULL_REGRESSION_TIMEOUT'
      : runnerFailed ? 'FULL_REGRESSION_RUNNER_ERROR'
        : !suiteInventoryMatched ? 'FULL_REGRESSION_TEST_INVENTORY_DRIFT'
        : !inputSnapshotStable ? 'FULL_REGRESSION_INPUT_SNAPSHOT_CHANGED'
          : signal != null ? 'FULL_REGRESSION_SIGNALLED'
            : exitCode !== 0 ? 'FULL_REGRESSION_NONZERO_EXIT'
              : 'FULL_REGRESSION_MANDATORY_COUNTS_NONZERO';
  return immutable({
    exitCode,
    signal,
    timedOut,
    runnerFailed,
    inputSnapshotStable,
    suiteInventoryMatched,
    plannedCount: calculation.testInventory.plannedCount,
    mandatoryCounts: counts,
    fullRegressionPassed,
    status,
    reason,
  });
}

function expectedReason(result = {}) {
  if (result.fullRegressionPassed === true) return null;
  if (result.timedOut === true) return 'FULL_REGRESSION_TIMEOUT';
  if (result.runnerFailed === true) return 'FULL_REGRESSION_RUNNER_ERROR';
  if (result.suiteInventoryMatched !== true || !(result.plannedCount > 0)) return 'FULL_REGRESSION_TEST_INVENTORY_DRIFT';
  if (result.inputSnapshotStable !== true) return 'FULL_REGRESSION_INPUT_SNAPSHOT_CHANGED';
  if (textOrNull(result.signal) != null) return 'FULL_REGRESSION_SIGNALLED';
  if (result.exitCode !== 0) return 'FULL_REGRESSION_NONZERO_EXIT';
  return 'FULL_REGRESSION_MANDATORY_COUNTS_NONZERO';
}

function normalizeCounts(value, minimums = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const invalid = COUNT_FIELDS.some((field) => Object.hasOwn(input, field)
    && (!Number.isInteger(input[field]) || input[field] < 0));
  const counts = Object.fromEntries(COUNT_FIELDS.map((field) => [
    field,
    Number.isInteger(input[field]) && input[field] >= 0 ? input[field] : 0,
  ]));
  counts.fail = Math.max(counts.fail, Number(minimums.fail || 0), invalid ? 1 : 0);
  counts.timeout = Math.max(counts.timeout, Number(minimums.timeout || 0));
  return immutable(counts);
}

function normalizeRunnerError(error) {
  if (!error) return null;
  return immutable({
    code: textOrNull(error.code) || 'FULL_REGRESSION_RUNNER_ERROR',
    message: textOrNull(error.message) || String(error),
  });
}

function outputTelemetry(value) {
  const input = value && typeof value === 'object' ? value : {};
  return immutable({
    sha256: hashOrNull(input.sha256),
    bytes: nonnegativeInteger(input.bytes ?? 0, 'output bytes'),
  });
}

function strictObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return cloneStrictJson(value, label);
}

function timestamp(value, label) {
  const text = value instanceof Date ? value.toISOString() : requiredText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new TypeError(`${label} must be an ISO timestamp.`);
  return text;
}

function finiteTimer(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
  return number;
}

function positiveInteger(value, fallback, label) {
  const number = value == null ? fallback : Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new RangeError(`${label} must be a positive integer.`);
  return number;
}

function nonnegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new RangeError(`${label} must be a nonnegative integer.`);
  return number;
}

function textOrNull(value) {
  const text = value == null ? '' : String(value).trim();
  return text || null;
}

function hashOrNull(value) {
  const text = textOrNull(value)?.toLowerCase() || null;
  return text && /^[a-f0-9]{64}$/u.test(text) ? text : null;
}

function isHash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function hasExactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return actual.length === required.length && actual.every((key, index) => key === required[index]);
}
