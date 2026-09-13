import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PHASE9_M1_EVIDENCE_VERSION,
  PHASE9_M1_VERIFICATION_IDS,
  buildPhase9M1ContractSnapshot,
  validatePhase9M1Evidence,
} from '../src/compute/governance/phase9M1.js';

// phase9M1 was the only governance module in its family with no importer, so
// the evidence artifact it produces was retained with nothing checking that the
// generator still agrees with it. Its siblings phase9M2..M10 all have a test.

const committed = JSON.parse(await readFile(path.resolve(
  'verification', 'evidence', 'validation', 'phase9', 'p9-m1-common-compute.json',
), 'utf8'));

assert.equal(committed.suiteVersion, PHASE9_M1_EVIDENCE_VERSION);
assert.deepEqual(committed.verificationIds, [...PHASE9_M1_VERIFICATION_IDS]);

const validation = validatePhase9M1Evidence(committed);
assert.equal(validation.ok, true, JSON.stringify(validation.errors));

// A malformed artifact must be rejected rather than silently accepted.
const missingIds = { ...committed, verificationIds: committed.verificationIds.slice(0, 3) };
assert.equal(validatePhase9M1Evidence(missingIds).ok, false);
assert.equal(validatePhase9M1Evidence({}).ok, false);

// The contract snapshot is deterministic for the same model.
const model = { nodes: [{ id: 'A', x: 0, y: 0, z: 0 }], members: [], loadCombinations: [] };
assert.deepEqual(buildPhase9M1ContractSnapshot(model), buildPhase9M1ContractSnapshot(model));

console.log(JSON.stringify({
  ok: true,
  suiteVersion: committed.suiteVersion,
  verificationIds: committed.verificationIds.length,
  status: committed.status,
}, null, 2));
