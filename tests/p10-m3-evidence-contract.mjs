import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PARTIAL_FIXITY_VERSION } from '../src/index.js';
import { stableHash } from '../src/core/stableHash.js';
import { verificationError } from '../verification/framework/matrix/record.js';
import { M3_VERIFICATION_SNAPSHOT as snapshot } from './p10-m3-partial-fixity.mjs';

// Evidence is a JSON artifact; normalize signed zero before hashing and
// comparing so the live object has the same value semantics as its file form.
const results = JSON.parse(JSON.stringify(snapshot));
const records = [
  record('CN-F01-DISPLACEMENT', results.rigidLimit.reference, results.rigidLimit.computed,
    results.tolerances.rigidLimit, results.modelHashes.nearRigid),
  record('CN-F02-DISPLACEMENT', results.releaseLimit.reference, results.releaseLimit.computed,
    results.tolerances.releaseLimit, results.modelHashes.springRelease),
  record('CN-F02-RELEASE-MOMENT', 0, results.releaseLimit.momentResidual,
    results.tolerances.releaseLimit, results.modelHashes.springRelease, 1),
  record('CN-F03-EB-DISPLACEMENT', results.closedForm.ebReference, results.closedForm.ebComputed,
    results.tolerances.closedForm, results.modelHashes.eb),
  record('CN-F03-TIMOSHENKO-DISPLACEMENT', results.closedForm.timoshenkoReference,
    results.closedForm.timoshenkoComputed, results.tolerances.closedForm, results.modelHashes.timoshenko),
  record('CN-F03-END-ROTATION', results.closedForm.rotationReference, results.closedForm.rotationComputed,
    results.tolerances.closedForm, results.modelHashes.eb),
  record('Q0-PARTIAL-FIXITY', results.q0.reference, results.q0.computed,
    results.tolerances.releaseLimit, results.modelHashes.springRelease),
];

const core = {
  version: 'p10-evidence-artifact-v1',
  suiteId: 'P10-M3-PARTIAL-FIXITY',
  milestone: 'P10-M3',
  status: records.every((row) => row.status === 'OK') ? 'OK' : 'NG',
  generatedAt: '2026-07-21T22:10:00.000+09:00',
  sourceRevision: 'c54a25b+p10-m3-worktree',
  test: 'tests/p10-m3-partial-fixity.mjs',
  solverVersion: PARTIAL_FIXITY_VERSION,
  results,
  records,
  qualification: {
    internalClosedFormStatus: 'OK',
    externallyCrossValidated: false,
    releaseQualified: false,
    releaseGate: 'P10-M11',
  },
};

export const LIVE_P10_M3_EVIDENCE = Object.freeze({
  ...core,
  artifactHash: stableHash(core).slice(0, 24),
});

if (process.argv.includes('--print')) {
  console.log(JSON.stringify(LIVE_P10_M3_EVIDENCE, null, 2));
} else {
  const evidencePath = path.resolve(
    'verification', 'evidence', 'validation', 'phase10', 'p10-m3-partial-fixity.json',
  );
  const committed = JSON.parse(await readFile(evidencePath, 'utf8'));
  assert.deepEqual(committed, LIVE_P10_M3_EVIDENCE, 'P10-M3 committed evidence is stale');
  assert.equal(committed.status, 'OK');
  assert.equal(committed.records.length, 7);
  assert.equal(committed.qualification.externallyCrossValidated, false);
  assert.equal(committed.qualification.releaseQualified, false);
  for (const row of committed.records) {
    for (const field of ['reference', 'computed', 'relError', 'tolerance', 'modelHash', 'solverVersion']) {
      assert.ok(Object.hasOwn(row, field), `${row.caseId} is missing ${field}`);
    }
    assert.equal(row.status, 'OK', `${row.caseId} evidence gate`);
  }
  console.log(JSON.stringify({
    ok: true,
    artifactHash: committed.artifactHash,
    recordCount: committed.records.length,
    externallyCrossValidated: committed.qualification.externallyCrossValidated,
  }, null, 2));
}

function record(caseId, reference, computed, tolerance, modelHash, errorScale = null) {
  const relError = verificationError(computed, reference, errorScale);
  return {
    caseId,
    reference,
    computed,
    relError,
    tolerance,
    modelHash,
    solverVersion: PARTIAL_FIXITY_VERSION,
    status: relError <= tolerance ? 'OK' : 'NG',
  };
}
