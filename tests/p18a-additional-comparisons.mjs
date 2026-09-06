import assert from 'node:assert/strict';
import {
  runP3s2PrintedMembraneCriterion,
  runSp1EquivalentCriterion,
  runXv1CantileverWall,
} from '../verification/framework/benchmarks/additionalComparison.js';

const sp1 = await runSp1EquivalentCriterion();
assert.equal(sp1.status, 'PASS');
assert.ok(sp1.sStructures <= sp1.referenceLimit);

const p3s2 = runP3s2PrintedMembraneCriterion();
assert.equal(p3s2.status, 'PASS');
assert.ok(p3s2.sStructures <= p3s2.referenceLimit);
assert.equal(p3s2.meshMode1Sec.length, 3);
assert.notEqual(p3s2.meshMode1Sec[0].period, p3s2.meshMode1Sec[1].period);

const xv1 = runXv1CantileverWall([1]);
assert.equal(xv1.status, 'PASS');
assert.ok(Math.abs(xv1.practice.errorVsProgramAPct) < 0.001);

console.log(JSON.stringify({
  ok: true,
  SP1: { status: sp1.status, value: sp1.sStructures },
  P3S2: { status: p3s2.status, value: p3s2.sStructures },
  XV1: { status: xv1.status, value: xv1.practice.displacementMm, programAErrorPct: xv1.practice.errorVsProgramAPct },
}, null, 2));
