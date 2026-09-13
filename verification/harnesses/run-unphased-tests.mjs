// Runs the checks that no phase runner or package script reaches.
//
// A test file nobody executes rots silently, which is how phase 16~25 built up
// failures before Phase26. The phase runners discover by filename pattern and
// the milestone runner works from package scripts, so anything named outside
// those conventions had no home. This is that home: it takes whatever
// check-test-gate-coverage reports as unreached, so a new file is picked up by
// existing here rather than by being registered somewhere.
//
//   node verification/harnesses/run-unphased-tests.mjs [--list]

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { report } from './check-test-gate-coverage.mjs';

const register = JSON.parse(await readFile(path.resolve('docs', 'phase26', 'DEBT_REGISTER.json'), 'utf8'));
const deferred = new Map(register.items
  .filter((item) => item.kind === 'test' && item.status === 'DEFERRED')
  .map((item) => [item.target.replace(/^tests\//, ''), item]));

const tests = report.orphans.slice().sort();
if (process.argv.includes('--list')) {
  for (const name of tests) console.log(`${name}\t${deferred.has(name) ? 'DEFERRED' : 'REQUIRED'}`);
  process.exit(0);
}

console.log(`[UNPHASED] ${tests.length} checks reached by no phase runner or package script`);
for (const [name, item] of [...deferred].filter(([name]) => tests.includes(name))) {
  console.log(`  deferred ${item.id} ${name}\n    reason: ${item.cause}`);
}

const unexpectedFailures = [];
const unexpectedPasses = [];
for (const name of tests) {
  const expectFailure = deferred.has(name);
  const code = await runNode(path.resolve('tests', name), expectFailure);
  if (code === 0 && expectFailure) unexpectedPasses.push(name);
  else if (code !== 0 && !expectFailure) unexpectedFailures.push(name);
}

console.log(JSON.stringify({
  ok: !unexpectedFailures.length && !unexpectedPasses.length,
  executed: tests.length,
  deferred: tests.filter((name) => deferred.has(name)).length,
  unexpectedFailures,
  unexpectedPasses,
}, null, 2));

if (unexpectedPasses.length) throw new Error(`Deferred checks now pass and must be promoted: ${unexpectedPasses.join(', ')}`);
if (unexpectedFailures.length) throw new Error(`Unphased checks failed: ${unexpectedFailures.join(', ')}`);

function runNode(file, expectFailure) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0 && stderr && !expectFailure) console.log(stderr.split(/\r?\n/).slice(0, 6).join('\n'));
      resolve(code ?? 1);
    });
  });
}
