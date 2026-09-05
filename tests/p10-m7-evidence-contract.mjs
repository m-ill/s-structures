import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { stableHash } from '../src/core/stableHash.js';
import { M7_VERIFICATION_SNAPSHOT as results } from './p10-m7-dynamics-extension.mjs';

const records = [
  record('DY-01-ZERO-PRESTRESS-PARITY', results.metrics.zeroPrestressRelativeError, results.tolerances.zeroPrestress),
  directionRecord('DY-02-COMPRESSION-PERIOD-INCREASE', results.metrics.compressionPeriodIncrease),
  record('DY-03-EULER-BUCKLING', results.metrics.eulerRelativeError, results.tolerances.euler),
  record('DY-04-LEGACY-LOWEST-MODE', results.metrics.legacyLowestModeRelativeError, results.tolerances.legacyLowestMode),
  record('DY-05-DIRECT-MODAL-PARITY', results.metrics.directModalError, results.tolerances.directModal),
  record('DY-06-ENERGY-BALANCE', results.metrics.energyError, results.tolerances.energy),
];
const core = {
  version: 'p10-evidence-artifact-v1',
  suiteId: 'P10-M7-DYNAMICS-EXTENSION',
  milestone: 'P10-M7',
  status: records.every((row) => row.status === 'OK') ? 'OK' : 'NG',
  generatedAt: '2026-07-22T23:00:00.000+09:00',
  sourceRevision: '4aa64f3+p10-m7-worktree',
  test: 'tests/p10-m7-dynamics-extension.mjs',
  solverVersion: results.solverVersion,
  results,
  records,
  qualification: {
    internalClosedFormStatus: 'OK', externallyCrossValidated: false, releaseQualified: false, releaseGate: 'P10-M11',
  },
};
export const LIVE_P10_M7_EVIDENCE = Object.freeze({ ...core, artifactHash: stableHash(core).slice(0, 24) });

if (process.argv.includes('--print')) {
  console.log(JSON.stringify(LIVE_P10_M7_EVIDENCE, null, 2));
} else {
  const committed = JSON.parse(await readFile(path.resolve(
    'verification', 'evidence', 'validation', 'phase10', 'p10-m7-dynamics-extension.json',
  ), 'utf8'));
  assert.deepEqual(committed, LIVE_P10_M7_EVIDENCE, 'P10-M7 committed evidence is stale');
  assert.equal(committed.status, 'OK');
  assert.equal(committed.records.length, 6);
  assert.equal(committed.results.contracts.factorizationCount, 1);
  assert.equal(committed.qualification.releaseQualified, false);
  console.log(JSON.stringify({ ok: true, artifactHash: committed.artifactHash, recordCount: committed.records.length }, null, 2));
}

function record(caseId, computed, tolerance) {
  return { caseId, reference: 0, computed, relError: Math.abs(computed), tolerance, modelHash: results.modelHash, solverVersion: results.solverVersion, status: Math.abs(computed) <= tolerance ? 'OK' : 'NG' };
}
function directionRecord(caseId, computed) {
  return { caseId, reference: '>0', computed, relError: null, tolerance: 'positive', modelHash: results.modelHash, solverVersion: results.solverVersion, status: computed > 0 ? 'OK' : 'NG' };
}
