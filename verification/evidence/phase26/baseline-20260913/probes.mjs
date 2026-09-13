// Phase26 debt register reproduction.
//
// Reads docs/phase26/DEBT_REGISTER.json and runs every registered test target
// SERIALLY. Several checks in this repository bind a fixed port or the shared
// data directory, so running them concurrently produces false failures.
//
//   node verification/evidence/phase26/baseline-20260913/probes.mjs [--write] [--filter=<substring>]
//
// Without --write the run only prints its summary; with --write it records
// baseline.json next to this script.

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const REGISTER = path.join(ROOT, 'docs', 'phase26', 'DEBT_REGISTER.json');
const SIGNATURE = /AssertionError|^Error:|TypeError|ReferenceError|ENOENT|throw new Error/;

const args = process.argv.slice(2);
const write = args.includes('--write');
const filter = args.find((value) => value.startsWith('--filter='))?.slice('--filter='.length) || '';

const register = JSON.parse(await readFile(REGISTER, 'utf8'));
const targets = register.items.filter((item) => (
  item.kind === 'test' && (!filter || item.id.includes(filter) || item.target.includes(filter))
));

const results = [];
for (const item of targets) {
  const started = Date.now();
  const { code, output } = await run(path.join(ROOT, item.target));
  const signature = output.split(/\r?\n/).find((line) => SIGNATURE.test(line))?.trim().slice(0, 300) || null;
  results.push({
    id: item.id,
    target: item.target,
    group: item.group,
    phase: item.phase,
    passed: code === 0,
    exitCode: code,
    signature: code === 0 ? null : signature,
    elapsedMs: Date.now() - started,
  });
  process.stdout.write(`${code === 0 ? 'PASS' : 'FAIL'} ${item.id} ${item.target}\n`);
}

const failed = results.filter((row) => !row.passed);
const summary = {
  version: 'p26-m0-baseline-v1',
  capturedAt: new Date().toISOString().slice(0, 10),
  baseCommit: register.baseCommit,
  registered: targets.length,
  passed: results.length - failed.length,
  failed: failed.length,
  failedByGroup: Object.fromEntries(
    [...new Set(failed.map((row) => row.group))].sort()
      .map((group) => [group, failed.filter((row) => row.group === group).length]),
  ),
  note: 'Serial execution is required: fixed ports and the shared data directory make concurrent runs report false failures.',
};

console.log(JSON.stringify(summary, null, 2));

if (write) {
  const file = path.join(HERE, 'baseline.json');
  await writeFile(file, `${JSON.stringify({ ...summary, results }, null, 2)}\n`, 'utf8');
  console.log(`recorded ${path.relative(ROOT, file).replaceAll('\\', '/')}`);
}

function run(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code: code ?? 1, output }));
  });
}
