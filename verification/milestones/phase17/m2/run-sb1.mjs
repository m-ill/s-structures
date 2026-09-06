#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertP17M2ExecutionAuthorized } from './framework/m2TerminalGate.mjs';
import { buildP17M2Sb1LockPackage, serializeP17M2Sb1Document } from './framework/sb1LockPackage.mjs';

const argumentsSet = new Set(process.argv.slice(2));
const supported = new Set(['--check', '--write', '--execute']);
for (const argument of argumentsSet) {
  if (!supported.has(argument)) throw new Error(`Unknown argument: ${argument}\nUsage: node verification/runners/run-p17-m2-sb1.mjs --check|--write|--execute`);
}
if (argumentsSet.size > 1) throw new Error('--check, --write and --execute are mutually exclusive.');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const bundle = buildP17M2Sb1LockPackage({ repoRoot });
const mode = argumentsSet.has('--write') ? 'write' : argumentsSet.has('--execute') ? 'execute' : 'check';

if (mode === 'execute') {
  try {
    assertP17M2ExecutionAuthorized(bundle.gateAssessment);
    throw Object.assign(new Error('Execution authorization unexpectedly passed without the external execution workflow.'), { code: 'P17_M2_DIRECT_RUNNER_EXECUTION_FORBIDDEN' });
  } catch (error) {
    if (error.code !== 'P17_M2_EXECUTION_NOT_AUTHORIZED') throw error;
    process.stdout.write(`${JSON.stringify({
      mode,
      status: 'BLOCKED_PRE_EXECUTION',
      code: error.code,
      message: error.message,
      solverExecutionCount: 0,
      benchmarkExecutionCount: 0,
      releaseAllowed: false,
    }, null, 2)}\n`);
    process.exitCode = 2;
  }
} else {
  const rows = [];
  for (const [repositoryPath, value] of Object.entries(bundle.documents)) {
    const absolutePath = path.join(repoRoot, ...repositoryPath.split('/'));
    const expected = Buffer.from(serializeP17M2Sb1Document(value), 'utf8');
    let outcome = 'UNCHANGED';
    try {
      const actual = readFileSync(absolutePath);
      if (!actual.equals(expected)) throw Object.assign(new Error(`Committed M2 artifact differs from the deterministic builder: ${repositoryPath}`), { code: 'P17_M2_ARTIFACT_MISMATCH' });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (mode !== 'write') throw Object.assign(new Error(`Missing committed M2 artifact: ${repositoryPath}`), { code: 'P17_M2_ARTIFACT_MISSING' });
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, expected, { flag: 'wx' });
      outcome = 'CREATED_APPEND_ONLY';
    }
    rows.push({ path: repositoryPath, outcome, byteLength: expected.length });
  }
  process.stdout.write(`${JSON.stringify({
    mode,
    status: bundle.status,
    packageHash: bundle.casePackage.packageHash,
    artifactCount: rows.length,
    readyGateCount: bundle.gateAssessment.readyGateCount,
    passedTerminalGateCount: bundle.gateAssessment.passedTerminalGateCount,
    executionAuthorized: false,
    solverExecutionCount: 0,
    benchmarkExecutionCount: 0,
    artifacts: rows,
    releaseAllowed: false,
  }, null, 2)}\n`);
}

