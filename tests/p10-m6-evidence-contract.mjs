import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { stableHash } from '../src/core/stableHash.js';
import { M6_VERIFICATION_SNAPSHOT as results } from './p10-m6-tapered.mjs';

const records = [
  record('EL-P01-PRISMATIC-REGRESSION', results.metrics.prismaticRegressionError, results.tolerances.prismaticRegression, results.modelHashes.prismatic),
  record('EL-P02-LINEAR-TAPER-CLOSED-FORM', results.metrics.closedFormError, results.tolerances.closedForm, results.modelHashes.tapered5),
  record('EL-P03-GAUSS-INTEGRATION-CONVERGENCE', results.metrics.integrationConvergence, results.tolerances.integrationConvergence, results.modelHashes.tapered10),
];
const core = {
  version: 'p10-evidence-artifact-v1',
  suiteId: 'P10-M6-TAPERED-MEMBER',
  milestone: 'P10-M6',
  status: records.every((row) => row.status === 'OK') ? 'OK' : 'NG',
  generatedAt: '2026-07-22T21:00:00.000+09:00',
  sourceRevision: '716638c+p10-m6-worktree',
  test: 'tests/p10-m6-tapered.mjs',
  solverVersion: results.solverVersion,
  results,
  records,
  qualification: {
    internalClosedFormStatus: 'OK', externallyCrossValidated: false, releaseQualified: false, releaseGate: 'P10-M11',
  },
};
export const LIVE_P10_M6_EVIDENCE = Object.freeze({ ...core, artifactHash: stableHash(core).slice(0, 24) });

if (process.argv.includes('--print')) {
  console.log(JSON.stringify(LIVE_P10_M6_EVIDENCE, null, 2));
} else {
  const committed = JSON.parse(await readFile(path.resolve(
    'verification', 'evidence', 'validation', 'phase10', 'p10-m6-tapered.json',
  ), 'utf8'));
  assert.deepEqual(committed, LIVE_P10_M6_EVIDENCE, 'P10-M6 committed evidence is stale');
  assert.equal(committed.status, 'OK');
  assert.equal(committed.records.length, 3);
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
