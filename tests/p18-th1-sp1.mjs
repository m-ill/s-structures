import assert from 'node:assert/strict';
import { runSp1, runTh1 } from '../verification/framework/benchmarks/strix21Completion.js';

const th1First = runTh1();
const th1Second = runTh1();
assert.equal(th1First.status, 'PASS', JSON.stringify(th1First.probes, null, 2));
assert.equal(th1First.engineeringHash, th1Second.engineeringHash);
assert.equal(th1First.rows.length, 12);
assert.ok(th1First.convergence.every((row) => row.representativeOrder >= 1.95));

const sp1 = await runSp1();
assert.equal(sp1.status, 'PASS', JSON.stringify({ reason: sp1.reason, probes: sp1.probes }, null, 2));

console.log(JSON.stringify({
  ok: true,
  milestone: 'P18-TH1-SP1',
  TH1: { status: th1First.status, probes: th1First.probes, engineeringHash: th1First.engineeringHash },
  SP1: { status: sp1.status, probes: sp1.probes, engineeringHash: sp1.engineeringHash },
}, null, 2));
