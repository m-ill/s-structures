import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { stableHash } from '../src/core/stableHash.js';
import { verificationError } from '../src/verification/matrix/record.js';
import { analyzeModel, modelHash, parseXvalReferenceArtifact } from '../src/index.js';
import { M2_VERIFICATION_SNAPSHOT as snapshot } from './p10-m2-timoshenko.mjs';

const SOLVER_VERSION = 'p10-m2-timoshenko-frame-v1';
const records = [
  record('EL-T01', 0, snapshot.zeroPhiMaxError, snapshot.tolerances.phiZero, snapshot.modelHashes.simple),
  record('Q0-POINT-TIMOSHENKO', snapshot.pointReference, snapshot.pointComputed, snapshot.tolerances.phiZero, snapshot.modelHashes.simple),
  record('Q0-PARTIAL-UDL-TIMOSHENKO', snapshot.partialReference, snapshot.partialComputed, snapshot.tolerances.phiZero, snapshot.modelHashes.simple),
  record('EL-T02', snapshot.deepSimpleReference, snapshot.deepSimple, snapshot.tolerances.deepBeam, snapshot.modelHashes.simple),
  record('EL-T03', snapshot.fixedReference.slice(0, 2), snapshot.fixedComputed.slice(0, 2), snapshot.tolerances.deepBeam, snapshot.modelHashes.fixed),
  record('EL-T03-FORCE', snapshot.fixedReference.slice(2), snapshot.fixedComputed.slice(2), snapshot.tolerances.deepBeam, snapshot.modelHashes.fixed),
  record('EL-T04', snapshot.releasedReference.slice(0, 2), snapshot.releasedComputed.slice(0, 2), snapshot.tolerances.release, snapshot.modelHashes.released),
  record('EL-T04-RELEASE', 0, Math.max(...snapshot.releasedComputed.slice(2).map(Math.abs)), snapshot.tolerances.release, snapshot.modelHashes.released, 1),
];
const core = {
  version: 'p10-evidence-artifact-v1',
  suiteId: 'P10-M2-TIMOSHENKO',
  milestone: 'P10-M2',
  status: records.every((row) => row.status === 'OK') ? 'OK' : 'NG',
  generatedAt: '2026-07-21T12:00:00.000+09:00',
  sourceRevision: '1f3cf1d+p10-m2-worktree',
  test: 'tests/p10-m2-timoshenko.mjs',
  solverVersion: SOLVER_VERSION,
  results: snapshot,
  records,
  crossValidation: {
    caseId: 'XV-09',
    internalClosedFormStatus: 'OK',
    externalReferenceStatus: 'pending-reference',
    externallyCrossValidated: false,
  },
};
export const LIVE_P10_M2_EVIDENCE = Object.freeze({
  ...core,
  artifactHash: stableHash(core).slice(0, 24),
});

if (process.argv.includes('--print')) {
  console.log(JSON.stringify(LIVE_P10_M2_EVIDENCE, null, 2));
} else {
  const evidencePath = path.resolve('reports', 'validation-evidence', 'phase10', 'p10-m2-timoshenko.json');
  const committed = JSON.parse(await readFile(evidencePath, 'utf8'));
  assert.deepEqual(committed, LIVE_P10_M2_EVIDENCE, 'P10-M2 committed evidence is stale');
  assert.equal(committed.status, 'OK');
  assert.equal(committed.crossValidation.externallyCrossValidated, false);
  assert.equal(committed.crossValidation.externalReferenceStatus, 'pending-reference');
  for (const row of committed.records) {
    for (const field of ['reference', 'computed', 'relError', 'tolerance', 'modelHash', 'solverVersion']) {
      assert.ok(Object.hasOwn(row, field), `${row.caseId} is missing ${field}`);
    }
    assert.equal(row.status, 'OK', `${row.caseId} evidence gate`);
  }
  const fixturePath = path.resolve('tests', 'fixtures', 'phase10', 'xval', 'XV-09.model.json');
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const reference = parseXvalReferenceArtifact(await readFile(
    path.resolve('reports', 'validation-evidence', 'phase10', 'xv', 'XV-09-pending-reference.json'),
    'utf8',
  ));
  assert.equal(reference.model.modelHash, modelHash(fixture));
  assert.equal(reference.status, 'pending-reference');
  const xv09 = analyzeModel(fixture).byCombo.C1;
  assert.equal(xv09.ok, true);
  assert.deepEqual(
    xv09.memberResults.M1.shape[10].slice(1, 3).map(Math.abs),
    [snapshot.deepSimple[1], snapshot.deepSimple[0]],
  );
  console.log(JSON.stringify({
    ok: true,
    artifactHash: committed.artifactHash,
    recordCount: committed.records.length,
    xv09: reference.status,
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
    solverVersion: SOLVER_VERSION,
    status: relError <= tolerance ? 'OK' : 'NG',
  };
}
