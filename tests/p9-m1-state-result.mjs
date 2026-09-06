import assert from 'node:assert/strict';
import { createStateArena } from '../src/compute/contracts/stateArena.js';
import { createResultChunk, validateResultChunk } from '../src/compute/contracts/resultChunk.js';
import { createResourceLedger } from '../src/compute/telemetry/resourceLedger.js';

const arena = createStateArena({ runId: 'state-run', globalSize: 2, elementSize: 2, initialCommitted: [1, 2, 3, 4] });
const initial = arena.snapshot();
arena.beginTrial('state-run')[0] = 9;
const rolledBack = arena.rollback('state-run');
assert.equal(rolledBack.committedHash, initial.committedHash, 'P9-CMP-05 committed state survives rollback');
assert.equal(rolledBack.trialHash, initial.trialHash, 'P9-CMP-05 trial rollback byte parity');
assert.throws(() => arena.beginTrial('other-run'), { code: 'STATE_OWNER_MISMATCH' }, 'P9-CMP-06 owner isolation');
const heldTrial = arena.beginTrial();
heldTrial[1] = 8;
const committed = arena.commit();
assert.equal(committed.epoch, 1, 'P9-CMP-06 commit epoch');
assert.equal(arena.committed[1], 8, 'P9-CMP-06 committed trial state');
heldTrial[1] = 77;
assert.equal(arena.committed[1], 8, 'P9-CMP-06 committed storage is isolated from held trial views');
arena.committed[1] = 66;
assert.equal(arena.committed[1], 8, 'P9-CMP-06 committed getter is read only by copy');

let disposed = 0;
const ledger = createResourceLedger({ runId: 'ledger-run' });
const token = ledger.register(new Uint8Array(8), { kind: 'test-buffer', dispose: () => { disposed += 1; } });
assert.equal(ledger.snapshot().outstandingBytes, 8, 'P9-CMP-11 resource bytes');
await ledger.release(token);
assert.equal(disposed, 1, 'P9-CMP-11 disposer called exactly once');
assert.equal(ledger.assertBalanced().outstandingCount, 0, 'P9-CMP-11 balanced ledger');

const input = {
  channel: 'displacement',
  unit: 'm',
  values: [0, 1, 2, 3],
  componentCount: 2,
  provenance: { runId: 'result-run', planHash: 'p'.repeat(64), backendId: 'backend', operationId: 'solve' },
};
const first = createResultChunk(input);
const second = createResultChunk(input);
assert.equal(first.chunkHash, second.chunkHash, 'P9-CMP-12 reproducible result hash');
assert.equal(validateResultChunk(first).ok, true, 'P9-CMP-12 result schema');
first.values[0] = 99;
assert.equal(validateResultChunk(first).ok, false, 'P9-CMP-12 mutation detected');

console.log('P9-M1 StateArena/ResultChunk/ResourceLedger: PASS');
