import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MEMBER_OFFSET_VERSION } from '../src/index.js';
import { stableHash } from '../src/core/stableHash.js';
import { M4_VERIFICATION_SNAPSHOT as snapshot } from './p10-m4-offsets-panelzone.mjs';

const results = JSON.parse(JSON.stringify(snapshot));
const records = [
  record('EL-O01-ZERO-REGRESSION', 0, results.metrics.zeroRegressionError,
    results.tolerances.zeroRegression, results.modelHashes.zero),
  record('EL-O02-AXIAL-ECCENTRICITY', 0, results.metrics.eccentricMomentError,
    results.tolerances.eccentricMoment, results.modelHashes.eccentric),
  record('EL-O03-PANEL-ZONE-EQUIVALENCE', 0, results.metrics.panelZoneEquivalenceError,
    results.tolerances.panelZoneEquivalence, results.modelHashes.panelZone),
  record('EL-O04-OFFSET-EQUILIBRIUM', 0, results.metrics.offsetEquilibriumResidual,
    results.tolerances.offsetEquilibrium, results.modelHashes.product),
];

const core = {
  version: 'p10-evidence-artifact-v1',
  suiteId: 'P10-M4-OFFSETS-PANELZONE',
  milestone: 'P10-M4',
  status: records.every((row) => row.status === 'OK') ? 'OK' : 'NG',
  generatedAt: '2026-07-22T12:00:00.000+09:00',
  sourceRevision: '21ef4c6+p10-m4-worktree',
  test: 'tests/p10-m4-offsets-panelzone.mjs',
  solverVersion: MEMBER_OFFSET_VERSION,
  results,
  records,
  qualification: {
    internalClosedFormStatus: 'OK',
    externallyCrossValidated: false,
    releaseQualified: false,
    releaseGate: 'P10-M11',
  },
};

export const LIVE_P10_M4_EVIDENCE = Object.freeze({
  ...core,
  artifactHash: stableHash(core).slice(0, 24),
});

if (process.argv.includes('--print')) {
  console.log(JSON.stringify(LIVE_P10_M4_EVIDENCE, null, 2));
} else {
  const evidencePath = path.resolve(
    'verification', 'evidence', 'validation', 'phase10', 'p10-m4-offsets-panelzone.json',
  );
  const committed = JSON.parse(await readFile(evidencePath, 'utf8'));
  assert.deepEqual(committed, LIVE_P10_M4_EVIDENCE, 'P10-M4 committed evidence is stale');
  assert.equal(committed.status, 'OK');
  assert.equal(committed.records.length, 4);
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

function record(caseId, reference, computed, tolerance, modelHash) {
  const relError = Math.abs(Number(computed) - Number(reference));
  return {
    caseId,
    reference,
    computed,
    relError,
    tolerance,
    modelHash,
    solverVersion: MEMBER_OFFSET_VERSION,
    status: relError <= tolerance ? 'OK' : 'NG',
  };
}
