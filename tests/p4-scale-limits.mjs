import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const report = JSON.parse(await readFile('reports/validation-evidence/scale-limits.json', 'utf8'));
assert.equal(report.version, 'p4-scale-limits-v1');
assert.equal(report.rows.length, 4);
assert.ok(report.recommended.routineInteractiveMemberLimit >= 1000);
assert.ok(report.rows.find((row) => row.id === 'scale-4000').memberCount >= 3900);
assert.ok(['ok', 'ng'].includes(report.rows.find((row) => row.id === 'scale-1000').analysisStatus));

console.log(JSON.stringify({ ok: true, version: 'p4-scale-limits', rows: report.rows.length }, null, 2));
