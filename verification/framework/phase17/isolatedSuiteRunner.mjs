import { spawn } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

export const P17_ISOLATED_SUITE_RUNNER_VERSION = 'p17-m1-isolated-suite-runner-v2';
export const P17_ISOLATED_TERMINAL_STATUSES = Object.freeze([
  'CHILD_SUCCEEDED_UNQUALIFIED',
  'FAILED',
  'TIMED_OUT',
  'SPAWN_BLOCKED',
]);

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;

/** Runs cases in deterministic ordinal order, one child process per case. */
export async function runIsolatedSuite(cases = [], options = {}) {
  const ordered = validateAndOrderCases(cases);
  const results = [];
  for (const item of ordered) {
    // Sequential execution is deliberate: WIP=1 and deterministic case order.
    // A child failure is converted to a terminal record and never rejects the suite.
    results.push(await runIsolatedCase(item, options));
  }
  const summary = {
    total: results.length,
    childSucceededUnqualified: results.filter((row) => row.status === 'CHILD_SUCCEEDED_UNQUALIFIED').length,
    failed: results.filter((row) => row.status === 'FAILED').length,
    timedOut: results.filter((row) => row.status === 'TIMED_OUT').length,
    spawnBlocked: results.filter((row) => row.status === 'SPAWN_BLOCKED').length,
    continuedAfterFailure: continuedAfter(results, new Set(['FAILED', 'TIMED_OUT', 'SPAWN_BLOCKED'])),
  };
  summary.terminalCount = summary.childSucceededUnqualified + summary.failed + summary.timedOut + summary.spawnBlocked;
  if (summary.terminalCount !== summary.total) throw runnerError('P17_SUITE_SUMMARY_MISMATCH', `Terminal summary mismatch: ${summary.terminalCount}/${summary.total}.`);
  return Object.freeze({
    version: P17_ISOLATED_SUITE_RUNNER_VERSION,
    mode: 'GENERIC_ISOLATED_CHILD_EXECUTION',
    officialBenchmarkExecuted: null,
    benchmarkExecuted: null,
    solverExecuted: null,
    executionObservation: 'UNKNOWN_UNQUALIFIED_CHILDREN',
    orderedCaseIds: ordered.map((row) => row.caseId),
    results: results.map(deepFreeze),
    summary: deepFreeze(summary),
  });
}

export async function runIsolatedCase(item, options = {}) {
  const started = monotonicNow();
  let timeoutMs;
  let maxOutputBytes;
  let entrypoint;
  let cwd;
  let args;
  try {
    if (!options.allowedEntrypointRoot) throw runnerError('P17_ALLOWED_ENTRYPOINT_ROOT_REQUIRED', 'An explicit allowedEntrypointRoot is required.');
    timeoutMs = integerInRange(item.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 10, 3_600_000, 'P17_TIMEOUT_INVALID');
    maxOutputBytes = integerInRange(options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES, 1024, 16_777_216, 'P17_OUTPUT_LIMIT_INVALID');
    entrypoint = await validateEntrypoint(item.entrypoint, options.allowedEntrypointRoot);
    cwd = await validateWorkingDirectory(item.cwd || options.cwd || path.dirname(entrypoint), options.allowedEntrypointRoot);
    args = Array.isArray(item.args) ? item.args.map(String) : [];
  } catch (error) {
    return blockedTerminal(item, error, started);
  }

  return new Promise((resolve) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let outputLimitExceeded = false;
    let timedOut = false;
    let settled = false;
    let child;

    try {
      child = spawn(process.execPath, [entrypoint, ...args], {
        cwd,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: buildChildEnvironment(item.env),
      });
    } catch (error) {
      resolve(terminal('SPAWN_BLOCKED', null, error?.code || 'P17_CHILD_SPAWN_FAILED', '', String(error?.message || error), started));
      return;
    }

    const append = (current, chunk) => {
      if (current.byteLength + chunk.byteLength > maxOutputBytes) {
        outputLimitExceeded = true;
        child.kill();
        return current;
      }
      return Buffer.concat([current, chunk]);
    };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, Buffer.from(chunk)); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, Buffer.from(chunk)); });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    timer.unref?.();

    child.on('error', (error) => finish('SPAWN_BLOCKED', null, error?.code || 'P17_CHILD_PROCESS_ERROR', error));
    child.on('close', (code, signal) => {
      if (timedOut) finish('TIMED_OUT', code, 'P17_CASE_TIMEOUT', { signal });
      else if (outputLimitExceeded) finish('FAILED', code, 'P17_CHILD_OUTPUT_LIMIT_EXCEEDED', { signal });
      else if (code === 0) finish('CHILD_SUCCEEDED_UNQUALIFIED', code, null, { signal });
      else finish('FAILED', code, 'P17_CHILD_NONZERO_EXIT', { signal });
    });

    function finish(status, exitCode, reasonCode, detail) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(terminal(status, exitCode, reasonCode, stdout.toString('utf8'), stderr.toString('utf8'), started, detail));
    }

    function terminal(status, exitCode, reasonCode, stdoutText, stderrText, start, detail = null) {
      return deepFreeze({
        caseId: item.caseId,
        ordinal: item.ordinal,
        status,
        exitCode,
        reasonCodes: reasonCode ? [reasonCode] : [],
        stdout: stdoutText,
        stderr: stderrText,
        parsedOutput: parseSingleJsonLine(stdoutText),
        durationMs: Math.max(0, monotonicNow() - start),
        processIsolated: true,
        benchmarkExecuted: null,
        solverExecuted: null,
        executionObservation: 'UNKNOWN_UNQUALIFIED_CHILD',
        detail,
      });
    }
  });
}

function validateAndOrderCases(cases) {
  if (!Array.isArray(cases) || cases.length === 0) throw runnerError('P17_SUITE_CASES_REQUIRED', 'At least one case is required.');
  const ids = new Set();
  const ordinals = new Set();
  const rows = cases.map((item) => {
    if (!plainRecord(item)) throw runnerError('P17_SUITE_CASE_INVALID', 'Each case descriptor must be an object.');
    const caseId = clean(item.caseId);
    const ordinal = Number(item.ordinal);
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/u.test(caseId)) throw runnerError('P17_SUITE_CASE_ID_INVALID', `Invalid case ID: ${caseId}`);
    if (!Number.isInteger(ordinal) || ordinal < 1) throw runnerError('P17_SUITE_ORDINAL_INVALID', `Invalid ordinal for ${caseId}.`);
    if (ids.has(caseId)) throw runnerError('P17_SUITE_DUPLICATE_CASE_ID', `Duplicate case ID: ${caseId}`);
    if (ordinals.has(ordinal)) throw runnerError('P17_SUITE_DUPLICATE_ORDINAL', `Duplicate ordinal: ${ordinal}`);
    ids.add(caseId);
    ordinals.add(ordinal);
    return { ...item, caseId, ordinal };
  });
  return rows.sort((left, right) => left.ordinal - right.ordinal || left.caseId.localeCompare(right.caseId));
}

async function validateEntrypoint(value, allowedRoot) {
  const entrypoint = path.resolve(String(value || ''));
  const info = await lstat(entrypoint).catch((error) => {
    if (error?.code === 'ENOENT') throw runnerError('P17_ENTRYPOINT_MISSING', `Entrypoint not found: ${entrypoint}`);
    throw error;
  });
  if (!info.isFile() || info.isSymbolicLink()) throw runnerError('P17_ENTRYPOINT_UNSAFE', `Entrypoint must be a regular file: ${entrypoint}`);
  if (!['.mjs', '.js'].includes(path.extname(entrypoint).toLowerCase())) throw runnerError('P17_ENTRYPOINT_EXTENSION_INVALID', `Unsupported entrypoint: ${entrypoint}`);
  if (allowedRoot) {
    const allowed = await realpath(path.resolve(allowedRoot));
    const actual = await realpath(entrypoint);
    if (actual !== allowed && !actual.startsWith(`${allowed}${path.sep}`)) {
      throw runnerError('P17_ENTRYPOINT_PATH_ESCAPE', `${actual} is outside ${allowed}.`);
    }
  }
  return entrypoint;
}

function buildChildEnvironment(extra) {
  const keys = ['PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'SystemRoot', 'TEMP', 'TMP', 'COMSPEC', 'WINDIR'];
  const env = Object.fromEntries(keys.filter((key) => process.env[key] != null).map((key) => [key, process.env[key]]));
  const reserved = new Set(['P17_FRAMEWORK_CONTRACT_ONLY', 'P17_EXTERNAL_RUNTIME_ALLOWED', 'P17_NETWORK_FALLBACK_ALLOWED']);
  for (const [key, value] of Object.entries(extra || {})) {
    if (!/^P17_[A-Z0-9_]+$/u.test(key)) throw runnerError('P17_CHILD_ENV_KEY_FORBIDDEN', `Only P17_* child environment keys are accepted: ${key}`);
    if (reserved.has(key)) throw runnerError('P17_CHILD_POLICY_ENV_RESERVED', `Policy environment key cannot be overridden: ${key}`);
    env[key] = String(value);
  }
  env.P17_FRAMEWORK_CONTRACT_ONLY = '1';
  env.P17_EXTERNAL_RUNTIME_ALLOWED = '0';
  env.P17_NETWORK_FALLBACK_ALLOWED = '0';
  return env;
}

async function validateWorkingDirectory(value, allowedRoot) {
  const directory = path.resolve(String(value || ''));
  const info = await lstat(directory).catch((error) => {
    if (error?.code === 'ENOENT') throw runnerError('P17_CHILD_CWD_MISSING', `Working directory not found: ${directory}`);
    throw error;
  });
  if (!info.isDirectory() || info.isSymbolicLink()) throw runnerError('P17_CHILD_CWD_UNSAFE', `Working directory must be a real directory: ${directory}`);
  const allowed = await realpath(path.resolve(allowedRoot));
  const actual = await realpath(directory);
  if (actual !== allowed && !actual.startsWith(`${allowed}${path.sep}`)) throw runnerError('P17_CHILD_CWD_PATH_ESCAPE', `${actual} is outside ${allowed}.`);
  return actual;
}

function blockedTerminal(item, error, started) {
  return deepFreeze({
    caseId: item?.caseId || 'UNKNOWN',
    ordinal: Number(item?.ordinal) || 0,
    status: 'SPAWN_BLOCKED',
    exitCode: null,
    reasonCodes: [error?.code || 'P17_CHILD_SPAWN_BLOCKED'],
    stdout: '',
    stderr: String(error?.message || error),
    parsedOutput: null,
    durationMs: Math.max(0, monotonicNow() - started),
    processIsolated: true,
    benchmarkExecuted: null,
    solverExecuted: null,
    executionObservation: 'UNKNOWN_CHILD_NOT_STARTED',
    detail: null,
  });
}

function continuedAfter(results, failingStatuses) {
  const firstFailure = results.findIndex((row) => failingStatuses.has(row.status));
  return firstFailure >= 0 && results.slice(firstFailure + 1).some((row) => P17_ISOLATED_TERMINAL_STATUSES.includes(row.status));
}

function parseSingleJsonLine(value) {
  const lines = String(value || '').trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) return null;
  try { return JSON.parse(lines[0]); } catch { return null; }
}

function integerInRange(value, minimum, maximum, code) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < minimum || numeric > maximum) throw runnerError(code, `Expected an integer from ${minimum} through ${maximum}.`);
  return numeric;
}

function monotonicNow() {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

function runnerError(code, message) {
  return Object.assign(new Error(message), { code });
}

function plainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
