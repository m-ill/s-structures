import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { stableHash } from '../src/core/stableHash.js';
import { M5_VERIFICATION_SNAPSHOT as results } from './p10-m5-mpc-rigidlink.mjs';

const records = [
  record('CN-M01-RIGID-LINK-EQUIVALENCE', results.metrics.rigidLinkError, results.tolerances.rigidLink, results.modelHashes.rigidLink),
  record('CN-M02-MPC-EQUILIBRIUM', results.metrics.equilibriumResidual, results.tolerances.equilibrium, results.modelHashes.mpc),
  record('CN-M03-DIAPHRAGM-REGRESSION', results.metrics.diaphragmError, results.tolerances.diaphragm, results.modelHashes.diaphragm),
  record('CN-M05-MODAL-KM-TRANSFORM', results.metrics.modalError, results.tolerances.modal, results.modelHashes.modal),
  record('CN-M06-PDELTA-KG-TRANSFORM', results.metrics.pDeltaResidual, results.tolerances.pDelta, results.modelHashes.rigidLink),
];
const core = {
  version: 'p10-evidence-artifact-v1',
  suiteId: 'P10-M5-MPC-RIGIDLINK',
  milestone: 'P10-M5',
  status: records.every((row) => row.status === 'OK') ? 'OK' : 'NG',
  generatedAt: '2026-07-22T18:00:00.000+09:00',
  sourceRevision: 'fd25269+p10-m5-worktree',
  test: 'tests/p10-m5-mpc-rigidlink.mjs',
  solverVersion: results.solverVersion,
  results,
  records,
  collisionGate: { status: 'OK', codes: results.collisionCodes },
  qualification: {
    internalClosedFormStatus: 'OK', externallyCrossValidated: false, releaseQualified: false, releaseGate: 'P10-M11',
  },
};
export const LIVE_P10_M5_EVIDENCE = Object.freeze({ ...core, artifactHash: stableHash(core).slice(0, 24) });

if (process.argv.includes('--print')) {
  console.log(JSON.stringify(LIVE_P10_M5_EVIDENCE, null, 2));
} else {
  const committed = JSON.parse(await readFile(path.resolve(
    'reports', 'validation-evidence', 'phase10', 'p10-m5-mpc-rigidlink.json',
  ), 'utf8'));
  assert.deepEqual(committed, LIVE_P10_M5_EVIDENCE, 'P10-M5 committed evidence is stale');
  assert.equal(committed.status, 'OK');
  assert.equal(committed.records.length, 5);
  assert.equal(committed.collisionGate.codes.length, 3);
  assert.equal(committed.qualification.releaseQualified, false);
  console.log(JSON.stringify({ ok: true, artifactHash: committed.artifactHash, recordCount: committed.records.length }, null, 2));
}

function record(caseId, computed, tolerance, modelHash) {
  return {
    caseId, reference: 0, computed, relError: Math.abs(computed), tolerance, modelHash,
    solverVersion: results.solverVersion,
    status: Math.abs(computed) <= tolerance ? 'OK' : 'NG',
  };
}
