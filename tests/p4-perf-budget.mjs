import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const report = JSON.parse(await readFile('verification/evidence/validation/perf-budget.json', 'utf8'));
const required = [
  'pointcloud-load-proxy',
  'viewer-frame-proxy',
  'elastic-representative-building',
  'pushover-direction',
  'nlth-20s-record',
  'calculation-table-generation',
];

assert.equal(report.version, 'p4-perf-budget-v1');
assert.equal(report.rows.length, required.length);
for (const id of required) {
  const row = report.rows.find((item) => item.id === id);
  assert.ok(row, `missing budget row: ${id}`);
  assert.equal(row.runs.length, report.runCount);
  assert.ok(Number.isFinite(row.measuredMs));
  assert.ok(row.measuredMs <= row.budgetMs * 2, `${id} exceeds relaxed CI budget`);
}

console.log(JSON.stringify({ ok: true, version: 'p4-perf-budget', rows: report.rows.length }, null, 2));
