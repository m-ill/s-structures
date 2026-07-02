import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const list = execFileSync(process.execPath, ['tools/run-milestone-tests.mjs', '--phase3', '--list'], { encoding: 'utf8' });
const rows = list.trim().split(/\r?\n/).map((line) => line.split('\t'));
assert.equal(rows.length, 27);
assert.deepEqual(rows[0].slice(0, 2), ['P3-M0', 'test:m0']);
assert.deepEqual(rows.at(-1).slice(0, 2), ['P3-M20', 'test:p3runner']);
assert.ok(rows.find(([milestone, name]) => milestone === 'P3-M6' && name === 'test:p3m6'));
assert.ok(rows.find(([milestone, name]) => milestone === 'P3-M20' && name === 'test:p3m20'));
assert.ok(rows.find(([milestone, name]) => milestone === 'P3-M20' && name === 'test:p3alignment'));
assert.ok(rows.find(([milestone, name]) => milestone === 'P3-M20' && name === 'test:p3runner'));

const scoped = execFileSync(process.execPath, [
  'tools/run-milestone-tests.mjs',
  '--phase3',
  '--from=P3-M6',
  '--to=P3-M9',
  '--list',
], { encoding: 'utf8' });
const scopedRows = scoped.trim().split(/\r?\n/).map((line) => line.split('\t'));
assert.deepEqual(scopedRows.map((row) => row[0]), ['P3-M6', 'P3-M7', 'P3-M7', 'P3-M8', 'P3-M9', 'P3-M9']);
assert.deepEqual(scopedRows.map((row) => row[1]), [
  'test:p3m6',
  'test:p3m7',
  'test:p3m7-ui',
  'test:p3m8',
  'test:p3m9',
  'test:p3m9-e2e',
]);

console.log(JSON.stringify({
  ok: true,
  phase3RunnerTests: rows.length,
  scopedRunnerTests: scopedRows.length,
}, null, 2));
