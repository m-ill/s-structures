import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const bounds = parseBounds(args);
const tests = (await readdir('tests'))
  .map((file) => {
    const match = /^p15-m(\d+)-.+\.mjs$/i.exec(file);
    return match ? { file, milestone: Number(match[1]) } : null;
  })
  .filter(Boolean)
  .filter((item) => item.milestone >= bounds.from && item.milestone <= bounds.to)
  .sort((left, right) => left.milestone - right.milestone || left.file.localeCompare(right.file));

if (!tests.length) throw new Error('No Phase 15 tests matched the requested range.');
if (listOnly) {
  for (const test of tests) console.log(`P15-M${test.milestone}\t${test.file}`);
  process.exit(0);
}
for (const test of tests) {
  console.log(`\n[P15-M${test.milestone}] ${test.file}`);
  await runNode(resolve('tests', test.file));
}

function parseBounds(values) {
  let from = 0;
  let to = 9;
  for (const value of values) {
    if (value === '--list' || value === 'all') continue;
    if (value.startsWith('--from=')) from = Number(value.slice(7));
    else if (value.startsWith('--to=')) to = Number(value.slice(5));
    else if (/^(?:P15-)?M?\d+$/i.test(value)) {
      const match = /(?:^|M)(\d+)$/i.exec(value);
      from = to = Number(match[1]);
    } else throw new Error(`Unsupported Phase 15 test argument: ${value}`);
  }
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > 9 || from > to) throw new Error('Invalid Phase 15 range.');
  return { from, to };
}

function runNode(file) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [file], { stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${file} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`));
    });
  });
}
