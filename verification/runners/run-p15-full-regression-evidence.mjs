import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { arch, platform, release } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PHASE15_FULL_REGRESSION_DEFAULT_TIMEOUT_MS,
  runPhase15FullRegressionEvidence,
  strictCanonicalHash,
  validatePhase15FullRegressionEvidence,
} from '../framework/phase15/index.js';
import { analyzePhase15Architecture } from '../harnesses/check-phase15-architecture.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INVENTORY_VERSION = 'p15-m9-full-regression-inventory-v1';
const options = parseOptions(process.argv.slice(2));
const command = fullRegressionCommand();
const before = await captureInputBindings();
if (options.inspectInputs) {
  console.log(JSON.stringify({
    version: INVENTORY_VERSION,
    currentTestInventoryHash: before.testInventoryHash,
    testInventory: before.testInventory,
    command: command.record,
  }, null, 2));
  process.exit(0);
}
const suiteManifest = await readSuiteManifest(options.suiteManifest);

const evidence = await runPhase15FullRegressionEvidence({
  calculation: {
    sourceDigest: before.sourceDigest,
    suiteManifestHash: suiteManifest.manifestHash,
    frozenTestInventoryHash: suiteManifest.frozenTestInventoryHash,
    testInventoryHash: before.testInventoryHash,
    frozenPlannedCount: suiteManifest.plannedCount,
    testInventory: before.testInventory,
    command: command.record,
    timeoutMs: options.timeoutMs,
  },
  runtime: {
    node: process.version,
    platform: platform(),
    release: release(),
    architecture: arch(),
    launcher: command.launcher,
    npmUserAgent: process.env.npm_config_user_agent || null,
  },
  runner: async (request) => {
    const outcome = await runChild(command, request.timeoutMs);
    try {
      const after = await captureInputBindings();
      return {
        ...outcome,
        sourceDigestAfter: after.sourceDigest,
        testInventoryHashAfter: after.testInventoryHash,
      };
    } catch (error) {
      return {
        ...outcome,
        runnerFailed: true,
        runnerError: error,
        sourceDigestAfter: null,
        testInventoryHashAfter: null,
        mandatoryCounts: {
          ...outcome.mandatoryCounts,
          fail: Math.max(1, outcome.mandatoryCounts.fail),
        },
      };
    }
  },
});

const validation = validatePhase15FullRegressionEvidence(evidence);
if (!validation.ok) throw new Error(`Generated full-regression evidence is invalid: ${validation.errors.join(', ')}`);

if (options.output) {
  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify({
  ok: evidence.fullRegressionPassed,
  status: evidence.status,
  output: options.output ? normalize(relative(ROOT, options.output)) : null,
  calculationHash: evidence.calculationHash,
  fullRegressionHash: evidence.fullRegressionHash,
  mandatoryCounts: evidence.mandatoryCounts,
  exitCode: evidence.result.exitCode,
  signal: evidence.result.signal,
  timedOut: evidence.result.timedOut,
  inputSnapshotStable: evidence.result.inputSnapshotStable,
  suiteInventoryMatched: evidence.result.suiteInventoryMatched,
  plannedCount: evidence.result.plannedCount,
  durationMs: evidence.run.durationMs,
  cleanEnvironmentClaimed: false,
}, null, 2));

if (!evidence.fullRegressionPassed) process.exitCode = 1;

async function captureInputBindings() {
  const [architecture, inventory] = await Promise.all([
    analyzePhase15Architecture({ root: ROOT }),
    collectFullRegressionInventory(),
  ]);
  return {
    sourceDigest: architecture.sourceDigest,
    testInventoryHash: inventory.inventoryHash,
    testInventory: {
      version: inventory.version,
      entryCount: inventory.entries.length,
      testFileCount: inventory.testFileCount,
      runnerFileCount: inventory.runnerFileCount,
      plannedCount: inventory.plannedCount,
    },
  };
}

async function collectFullRegressionInventory() {
  const packagePath = resolve(ROOT, 'package.json');
  const packageSource = await readFile(packagePath, 'utf8');
  const packageJson = JSON.parse(packageSource);
  const scripts = packageJson.scripts || {};
  const testPaths = await listFiles(resolve(ROOT, 'tests'));
  const commandSources = [scripts.test || '', ...Object.entries(scripts)
    .filter(([name]) => /^test:m\d+$/u.test(name))
    .map(([, script]) => script)];
  const runnerPaths = [...new Set(commandSources.flatMap(scriptFiles)
    .filter((file) => file.startsWith('tools/'))
    .concat([
      'tools/check-phase15-architecture.mjs',
      'tools/run-p15-full-regression-evidence.mjs',
    ]))].sort();
  const topLevelTests = testPaths
    .map((path) => normalize(relative(resolve(ROOT, 'tests'), path)))
    .filter((path) => !path.includes('/') && path.endsWith('.mjs'));
  const plannedFiles = mandatoryTestFiles(topLevelTests, scripts).sort();
  const inventoryPaths = [...new Set([
    ...testPaths.map((path) => normalize(relative(ROOT, path))),
    ...runnerPaths,
  ])].sort();
  const entries = await Promise.all(inventoryPaths.map(async (path) => ({
    path,
    sha256: sha256(await readFile(resolve(ROOT, path))),
  })));
  const core = {
    version: INVENTORY_VERSION,
    packageJsonHash: sha256(packageSource),
    packageScriptsHash: strictCanonicalHash(scripts, 'package scripts'),
    defaultTestCommand: String(scripts.test || ''),
    plannedFiles,
    entries,
  };
  return {
    ...core,
    testFileCount: testPaths.length,
    runnerFileCount: runnerPaths.length,
    plannedCount: plannedFiles.length,
    inventoryHash: strictCanonicalHash(core, 'Phase 15 full-regression inventory'),
  };
}

function runChild(commandSpec, timeoutMs) {
  return new Promise((resolveOutcome) => {
    const stdoutHash = createHash('sha256');
    const stderrHash = createHash('sha256');
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let runnerError = null;
    let settled = false;
    const child = spawn(commandSpec.executable, commandSpec.args, {
      cwd: ROOT,
      env: process.env,
      shell: false,
      stdio: ['inherit', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
    child.stdout.on('data', (chunk) => {
      stdoutHash.update(chunk);
      stdoutBytes += chunk.length;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderrHash.update(chunk);
      stderrBytes += chunk.length;
      process.stderr.write(chunk);
    });
    child.once('error', (error) => {
      runnerError = error;
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
    }, timeoutMs);
    child.once('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const processFailed = runnerError != null || signal != null || exitCode !== 0;
      resolveOutcome({
        exitCode: Number.isInteger(exitCode) && exitCode >= 0 ? exitCode : null,
        signal: signal || null,
        timedOut,
        runnerFailed: runnerError != null,
        runnerError,
        mandatoryCounts: {
          fail: !timedOut && processFailed ? 1 : 0,
          skip: 0,
          timeout: timedOut ? 1 : 0,
          flake: 0,
        },
        stdout: { sha256: stdoutHash.digest('hex'), bytes: stdoutBytes },
        stderr: { sha256: stderrHash.digest('hex'), bytes: stderrBytes },
      });
    });
  });
}

function terminateProcessTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.once('error', () => child.kill());
    return;
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  setTimeout(() => {
    if (child.exitCode == null && child.signalCode == null) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }
  }, 5000).unref();
}

async function listFiles(root) {
  const output = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = resolve(root, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(target));
    else if (entry.isFile()) output.push(target);
  }
  return output;
}

function scriptFiles(script) {
  return [...String(script || '').matchAll(/(?:^|\s)node\s+((?:tools|tests)[\\/][^\s&]+\.mjs)/gu)]
    .map((match) => normalize(match[1]));
}

function mandatoryTestFiles(files, scripts) {
  const defaultScript = String(scripts.test || '');
  const covered = new Set(directTestFiles(defaultScript));
  if (defaultScript.includes('tools/run-milestone-tests.mjs')) {
    for (const [name, script] of Object.entries(scripts)) {
      if (/^test:m\d+$/u.test(name)) directTestFiles(script).forEach((file) => covered.add(file));
    }
  }
  for (const [runner, pattern] of [
    ['tools/run-phase7-tests.mjs', /^p7-m\d+-.+\.mjs$/iu],
    ['tools/run-phase8-tests.mjs', /^p8-m\d+-.+\.mjs$/iu],
    ['tools/run-phase9-tests.mjs', /^p9-m\d+-.+\.mjs$/iu],
    ['tools/run-phase10-tests.mjs', /^p10-m\d+[a-z]?-.+\.mjs$/iu],
    ['tools/run-phase12-tests.mjs', /^p12-m\d+-.+\.mjs$/iu],
    ['tools/run-phase13-tests.mjs', /^p13-m\d+-.+\.mjs$/iu],
    ['tools/run-phase14-tests.mjs', /^p14-m\d+-.+\.mjs$/iu],
    ['tools/run-phase15-tests.mjs', /^p15-m\d+-.+\.mjs$/iu],
  ]) {
    if (defaultScript.includes(runner)) for (const file of files) if (pattern.test(file)) covered.add(file);
  }
  const missing = [...covered].filter((file) => !files.includes(file));
  if (missing.length) throw new Error(`Full-regression command references missing tests: ${missing.join(', ')}`);
  return [...covered];
}

function directTestFiles(script) {
  return [...String(script || '').matchAll(/node\s+tests[\\/]([^\s&]+\.mjs)/gu)]
    .map((match) => normalize(match[1]));
}

async function readSuiteManifest(path) {
  const value = JSON.parse(await readFile(path, 'utf8'));
  const core = {
    version: value.version,
    suiteId: value.suiteId,
    frozenTestInventoryHash: value.frozenTestInventoryHash,
    plannedCount: value.plannedCount,
    commandDisplay: value.commandDisplay,
    attemptPolicy: value.attemptPolicy,
  };
  const expectedHash = strictCanonicalHash(core, 'Phase 15 full-regression suite manifest');
  if (value.version !== 'p15-m9-full-regression-suite-manifest-v1'
    || value.suiteId !== 'P15-M9-FULL-MANDATORY-REGRESSION'
    || !/^[a-f0-9]{64}$/u.test(value.frozenTestInventoryHash || '')
    || !Number.isInteger(value.plannedCount)
    || value.plannedCount <= 0
    || value.commandDisplay !== command.record.display
    || value.attemptPolicy !== 'single-run-no-retry'
    || value.manifestHash !== expectedHash) {
    throw new Error('Phase 15 full-regression suite manifest is invalid or does not match the current command.');
  }
  return value;
}

function fullRegressionCommand() {
  if (process.platform === 'win32') {
    const executable = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    return {
      executable,
      args: ['/d', '/s', '/c', 'npm.cmd test'],
      launcher: normalize(executable),
      record: {
        program: 'npm.cmd',
        args: ['test'],
        display: 'npm.cmd test',
        cwdPolicy: 'repository-root',
      },
    };
  }
  return {
    executable: 'npm',
    args: ['test'],
    launcher: 'npm',
    record: {
      program: 'npm',
      args: ['test'],
      display: 'npm test',
      cwdPolicy: 'repository-root',
    },
  };
}

function parseOptions(args) {
  const result = {
    output: resolve(ROOT, 'verification/evidence/validation/phase15/p15-m9-full-regression-evidence.json'),
    timeoutMs: PHASE15_FULL_REGRESSION_DEFAULT_TIMEOUT_MS,
    suiteManifest: resolve(ROOT, 'verification/specs/phase15/p15-m9-full-regression-suite.json'),
    inspectInputs: false,
  };
  for (const argument of args) {
    if (argument.startsWith('--output=')) result.output = resolve(ROOT, argument.slice('--output='.length));
    else if (argument.startsWith('--timeout-ms=')) result.timeoutMs = positiveInteger(argument.slice('--timeout-ms='.length), 'timeout-ms');
    else if (argument.startsWith('--suite=')) result.suiteManifest = resolve(ROOT, argument.slice('--suite='.length));
    else if (argument === '--inspect-inputs') result.inspectInputs = true;
    else if (argument === '--no-output') result.output = null;
    else throw new Error(`Unsupported argument: ${argument}`);
  }
  return result;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new RangeError(`${label} must be a positive integer.`);
  return number;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalize(value) {
  return String(value).replaceAll('\\', '/');
}
