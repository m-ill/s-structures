import assert from 'node:assert/strict';
import {
  runP3s2,
  runSb12,
  runSh1,
  runSm5b,
  runSm6,
  runSp1,
  runSr1Readiness,
  runSr2Readiness,
  runSr2bReadiness,
  runTh1,
} from '../verification/framework/benchmarks/strix21Completion.js';

const cases = {
  TH1: runTh1(),
  SP1: await runSp1(),
  SM6: runSm6(),
  SM5b: runSm5b(),
  SR1: runSr1Readiness(),
  SR2: runSr2Readiness(),
  SR2b: runSr2bReadiness(),
  P3S2: runP3s2(),
  SB12: runSb12(),
  SH1: runSh1(),
};

for (const id of ['TH1', 'SP1', 'SM6', 'SM5b', 'P3S2', 'SB12', 'SH1']) {
  assert.equal(cases[id].status, 'PASS', `${id}: ${JSON.stringify(cases[id], null, 2)}`);
}
for (const id of ['SR1', 'SR2', 'SR2b']) {
  assert.equal(cases[id].status, 'ENGINE_PASS_SOURCE_BLOCKED', `${id}: ${JSON.stringify(cases[id], null, 2)}`);
  assert.equal(cases[id].engineStatus, 'PASS');
  assert.equal(cases[id].officialBenchmarkStatus, 'INPUT_BLOCKED');
  assert.equal(cases[id].officialPassClaimed, false);
}
for (const result of Object.values(cases)) assert.ok(result.probes.every((probe) => probe.passed));

console.log(JSON.stringify({
  ok: true,
  milestone: 'P18-STRIX21-COMPLETION',
  counts: { completedEngineCase: 7, enginePassSourceBlocked: 3, engineFail: 0 },
  cases: Object.fromEntries(Object.entries(cases).map(([id, result]) => [id, {
    status: result.status,
    engineStatus: result.engineStatus || result.status,
    officialBenchmarkStatus: result.officialBenchmarkStatus,
    probeCount: result.probes.length,
    engineeringHash: result.engineeringHash,
  }])),
}, null, 2));
