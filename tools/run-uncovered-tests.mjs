import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { collectTestInventory } from './testInventory.mjs';

const inventory = await collectTestInventory();
let tests = inventory.records.filter((row) => row.classification === 'release-long');
const from = process.argv.find((arg) => arg.startsWith('--from='))?.slice('--from='.length);
if (from) {
  const index = tests.findIndex((row) => row.file === from);
  if (index < 0) throw new Error(`Unknown release-long test: ${from}`);
  tests = tests.slice(index);
}
if (process.argv.includes('--list')) {
  for (const test of tests) console.log(`${test.owner}\t${test.file}`);
  process.exit(0);
}
for (const test of tests) {
  console.log(`\n[release-long] ${test.file}`);
  await runNode(resolve('tests', test.file));
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
