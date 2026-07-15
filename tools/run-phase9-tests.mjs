import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const bounds = parseBounds(args);
const tests = (await readdir('tests'))
  .map((file) => {
    const match = /^p9-m(\d+)-.+\.mjs$/i.exec(file);
    return match ? { file, milestone: Number(match[1]) } : null;
  })
  .filter(Boolean)
  .filter((item) => item.milestone >= bounds.from && item.milestone <= bounds.to)
  .sort((a, b) => a.milestone - b.milestone || a.file.localeCompare(b.file));

if (!tests.length) throw new Error('No Phase 9 tests matched the requested milestone range.');

if (listOnly) {
  for (const test of tests) console.log(`P9-M${test.milestone}\t${test.file}`);
  process.exit(0);
}

for (const test of tests) {
  console.log(`\n[P9-M${test.milestone}] ${test.file}`);
  await runNode(path.resolve('tests', test.file));
}

function parseBounds(values) {
  let from = 0;
  let to = 10;
  for (const value of values) {
    if (value === '--list' || value === 'all') continue;
    if (value.startsWith('--from=')) from = parseMilestone(value.slice('--from='.length));
    else if (value.startsWith('--to=')) to = parseMilestone(value.slice('--to='.length));
    else if (/^(?:P9-)?M?\d+$/i.test(value)) from = to = parseMilestone(value);
    else throw new Error(`Unsupported Phase 9 test argument: ${value}`);
  }
  if (from > to) throw new Error(`Invalid Phase 9 milestone range: M${from}..M${to}`);
  return { from, to };
}

function parseMilestone(value) {
  const match = /^(?:P9-)?M?(\d+)$/i.exec(String(value).trim());
  if (!match) throw new Error(`Invalid Phase 9 milestone: ${value}`);
  const milestone = Number(match[1]);
  if (milestone < 0 || milestone > 10) throw new RangeError(`Phase 9 milestone is outside M0..M10: ${value}`);
  return milestone;
}

function runNode(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(file)} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`));
    });
  });
}
