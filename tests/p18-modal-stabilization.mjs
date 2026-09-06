import assert from 'node:assert/strict';
import { runP3s2, runSm5b, runSm6 } from '../verification/framework/benchmarks/strix21Completion.js';

const runners = { SM6: runSm6, SM5b: runSm5b, P3S2: runP3s2 };
const summary = {};

for (const [id, runner] of Object.entries(runners)) {
  const rows = [runner(), runner(), runner()];
  assert.ok(rows.every((row) => row.status === 'PASS'), `${id} failed: ${JSON.stringify(rows[0], null, 2)}`);
  assert.equal(new Set(rows.map((row) => row.engineeringHash)).size, 1, `${id} is not deterministic`);
  assert.ok(rows[0].probes.length > 0);
  assert.ok(rows[0].probes.every((probe) => probe.passed));
  summary[id] = { status: rows[0].status, probeCount: rows[0].probes.length, engineeringHash: rows[0].engineeringHash };
}

console.log(JSON.stringify({ ok: true, milestone: 'P18-MODAL-STABILIZATION', summary }, null, 2));
