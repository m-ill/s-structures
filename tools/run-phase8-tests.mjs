import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const bounds = parseBounds(args);
const tests = (await readdir('tests'))
  .map((file) => {
    const match = /^p8-m(\d+)-.+\.mjs$/i.exec(file);
    return match ? { file, milestone: Number(match[1]) } : null;
  })
  .filter(Boolean)
  .filter((item) => item.milestone >= bounds.from && item.milestone <= bounds.to)
  .sort((a, b) => a.milestone - b.milestone || a.file.localeCompare(b.file));

if (!tests.length) throw new Error('No Phase 8 tests matched the requested milestone range.');

if (listOnly) {
  for (const test of tests) console.log(`P8-M${test.milestone}\t${test.file}`);
  process.exit(0);
}

for (const test of tests) {
  console.log(`\n[P8-M${test.milestone}] ${test.file}`);
  await runNode(path.resolve('tests', test.file));
}

function parseBounds(values) {
  let from = 0;
  let to = 11;
  for (const value of values) {
    if (value === '--list' || value === 'all') continue;
    if (value.startsWith('--from=')) from = parseMilestone(value.slice('--from='.length));
    else if (value.startsWith('--to=')) to = parseMilestone(value.slice('--to='.length));
    else if (/^(?:P8-)?M?\d+$/i.test(value)) from = to = parseMilestone(value);
    else throw new Error(`Unsupported Phase 8 test argument: ${value}`);
  }
  if (from > to) throw new Error(`Invalid Phase 8 milestone range: M${from}..M${to}`);
  return { from, to };
}

function parseMilestone(value) {
  const match = /^(?:P8-)?M?(\d+)$/i.exec(String(value).trim());
  if (!match) throw new Error(`Invalid Phase 8 milestone: ${value}`);
  return Number(match[1]);
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
