import assert from 'node:assert/strict';
import { runSecondOrderPDelta } from '../src/solver/pdelta/secondOrder.js';
import { buildPDeltaTangentStiffness } from '../src/solver/pdelta/tangentStiffness.js';

const model = {
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 3 },
  ],
  members: [{
    id: 'M_RELEASED',
    n1: 'N1',
    n2: 'N2',
    matId: 'steel',
    secId: 'h300',
    releases: { i: 'rigid', j: 'pin' },
  }],
  loads: [{ id: 'H', type: 'nodal', node: 'N2', P: 10, dir: '+x', case: 'W' }],
  loadCases: [{ id: 'W', name: 'Wind', type: 'wind' }],
  loadCombinations: [{ id: 'C1', name: 'Wind', factors: { W: 1 } }],
  analysisSettings: { responseSpectrum: { enabled: false }, validateBeforeSolve: false },
};

const blocked = runSecondOrderPDelta(model, { W: 1 });
const tangentBlocked = buildPDeltaTangentStiffness(model);

assert.equal(blocked.ok, false);
assert.equal(blocked.status, 'blocked');
assert.equal(blocked.reason, 'DIRECT_PDELTA_RELEASE_UNSUPPORTED');
assert.equal(blocked.method, 'geometric-stiffness-second-order-direct');
assert.equal(blocked.result, null);
assert.equal(blocked.designEligibility.eligible, false);
assert.equal(blocked.designEligibility.reason, 'DIRECT_PDELTA_RELEASE_UNSUPPORTED');
assert.deepEqual(blocked.compatibility.releaseMemberIds, ['M_RELEASED']);
assert.equal(blocked.provenance.routedMethod, 'direct');
assert.equal(tangentBlocked.ok, false);
assert.equal(tangentBlocked.reason, 'DIRECT_PDELTA_RELEASE_UNSUPPORTED');
assert.deepEqual(tangentBlocked.releaseMemberIds, ['M_RELEASED']);

console.log(JSON.stringify({
  ok: true,
  status: blocked.status,
  reason: blocked.reason,
  releaseMemberIds: blocked.compatibility.releaseMemberIds,
}, null, 2));
