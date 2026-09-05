import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { stableHash } from '../src/core/stableHash.js';
import { M8_VERIFICATION_SNAPSHOT as results } from './p10-m8-warping-ltb.mjs';

const records = [
  record('EL-W01-CLOSED-FORM-MCR', results.metrics.closedFormError, results.tolerances.closedForm),
  record('EL-W02-C1-SCALING', results.metrics.c1Error, results.tolerances.c1),
  record('EL-W03-STEEL-DESIGN-INTEGRATION', results.metrics.integratedRatioError, results.tolerances.integratedRatio),
];
const core = {
  version: 'p10-evidence-artifact-v1',
  suiteId: 'P10-M8-WARPING-LTB',
  milestone: 'P10-M8',
  status: records.every((row) => row.status === 'OK') ? 'OK' : 'NG',
  generatedAt: '2026-07-22T23:45:00.000+09:00',
  sourceRevision: '2e72514+p10-m8-worktree',
  test: 'tests/p10-m8-warping-ltb.mjs',
  solverVersion: results.solverVersion,
  results,
  records,
  qualification: {
    implementationOption: 'B-design-check',
    analysisDofChanged: false,
    internalClosedFormStatus: 'OK',
    externallyCrossValidated: false,
    releaseQualified: false,
    releaseGate: 'P10-M11',
  },
};
export const LIVE_P10_M8_EVIDENCE = Object.freeze({ ...core, artifactHash: stableHash(core).slice(0, 24) });

if (process.argv.includes('--print')) {
  console.log(JSON.stringify(LIVE_P10_M8_EVIDENCE, null, 2));
} else {
  const committed = JSON.parse(await readFile(path.resolve(
    'verification', 'evidence', 'validation', 'phase10', 'p10-m8-warping-ltb.json',
  ), 'utf8'));
  assert.deepEqual(committed, LIVE_P10_M8_EVIDENCE, 'P10-M8 committed evidence is stale');
  assert.equal(committed.status, 'OK');
  assert.equal(committed.records.length, 3);
  assert.equal(committed.qualification.implementationOption, 'B-design-check');
  assert.equal(committed.qualification.analysisDofChanged, false);
  assert.equal(committed.qualification.releaseQualified, false);
  console.log(JSON.stringify({ ok: true, artifactHash: committed.artifactHash, recordCount: committed.records.length }, null, 2));
}

function record(caseId, computed, tolerance) {
  return {
    caseId,
    reference: 0,
    computed,
    relError: Math.abs(computed),
    tolerance,
    modelHash: results.modelHash,
    solverVersion: results.solverVersion,
    status: Math.abs(computed) <= tolerance ? 'OK' : 'NG',
  };
}
