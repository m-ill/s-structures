// Canonical runner for phase 16~25.
//
// These phases used to sit outside `npm test`, which is how 27 of their checks
// rotted unnoticed. The register at docs/phase26/DEBT_REGISTER.json is the only
// place that decides what is excluded, and an excluded check is still executed:
// if a deferred check starts passing this runner fails, so an exclusion cannot
// become a permanent hiding place.
//
//   node verification/harnesses/run-phase16-25-tests.mjs [--list] [--phase=25]

import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FROM = 16;
const TO = 25;
const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const only = Number(args.find((value) => value.startsWith('--phase='))?.slice('--phase='.length)) || null;

const register = JSON.parse(await readFile(resolve('docs', 'phase26', 'DEBT_REGISTER.json'), 'utf8'));
const deferred = new Map(register.items
  .filter((item) => item.kind === 'test' && item.status === 'DEFERRED')
  .map((item) => [item.target.replace(/^tests\//, ''), item]));

const tests = (await readdir('tests'))
  .map((file) => {
    const match = /^p(\d+)-.+\.mjs$/i.exec(file);
    const phase = match ? Number(match[1]) : null;
    return phase !== null && phase >= FROM && phase <= TO && (!only || phase === only)
      ? { file, phase }
      : null;
  })
  .filter(Boolean)
  .sort((left, right) => left.phase - right.phase || left.file.localeCompare(right.file));

if (!tests.length) throw new Error('No phase 16~25 tests matched the requested range.');

if (listOnly) {
  for (const test of tests) {
    console.log(`P${test.phase}\t${test.file}\t${deferred.has(test.file) ? 'DEFERRED' : 'REQUIRED'}`);
  }
  process.exit(0);
}

console.log(`[P${FROM}-P${TO}] ${tests.length} checks, ${deferred.size} deferred by the register`);
for (const [file, item] of [...deferred].sort()) {
  console.log(`  deferred ${item.id} ${file}\n    reason: ${item.cause}`);
}

const started = Date.now();
const unexpectedFailures = [];
const unexpectedPasses = [];
let executed = 0;

for (const test of tests) {
  const expectFailure = deferred.has(test.file);
  const code = await runNode(resolve('tests', test.file), expectFailure);
  executed += 1;
  if (code === 0 && expectFailure) {
    unexpectedPasses.push(test.file);
    console.log(`\n[P${test.phase}] ${test.file} PASSED WHILE DEFERRED`);
  } else if (code !== 0 && !expectFailure) {
    unexpectedFailures.push(test.file);
    console.log(`\n[P${test.phase}] ${test.file} FAILED (exit ${code})`);
  }
}

const elapsedMinutes = ((Date.now() - started) / 60000).toFixed(1);
console.log(JSON.stringify({
  ok: unexpectedFailures.length === 0 && unexpectedPasses.length === 0,
  executed,
  required: executed - deferred.size,
  deferred: deferred.size,
  unexpectedFailures,
  unexpectedPasses,
  elapsedMinutes: Number(elapsedMinutes),
}, null, 2));

if (unexpectedPasses.length) {
  throw new Error(`Deferred checks now pass and must be promoted in the register: ${unexpectedPasses.join(', ')}`);
}
if (unexpectedFailures.length) {
  throw new Error(`Phase 16~25 checks failed: ${unexpectedFailures.join(', ')}`);
}

function runNode(file, expectFailure) {
  return new Promise((resolvePromise, reject) => {
    // Serial by design: some checks bind a fixed port or the shared data
    // directory, so concurrent execution reports false failures.
    const child = spawn(process.execPath, [file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0 && stderr) console.log(stderr.split(/\r?\n/).slice(0, 6).join('\n'));
      resolvePromise(code ?? 1);
    });
  });
}
