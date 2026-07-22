import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { stableHash } from '../src/core/stableHash.js';
import { M10_SNAPSHOT as m10 } from './p10-m10-load-generation.mjs';

const records = [
  record('LG-01-ONE-WAY-EQUILIBRIUM', m10.oneWayEquilibriumError, 1e-10),
  record('LG-02-TWO-WAY-EQUILIBRIUM', m10.twoWayEquilibriumError, 1e-10),
  record('LG-03-SLAB-MASS-DEDUP', m10.massDeduplicated ? 0 : 1, 0),
  record('LG-04-WIND-SIGN-DIRECTION', m10.windward > 0 && m10.leeward < 0 ? 0 : 1, 0),
];
const core = {
  version: 'p10-evidence-artifact-v1',
  suiteId: 'P10-M10-LOAD-GENERATION',
  milestone: 'P10-M10',
  status: records.every((row) => row.status === 'OK') ? 'OK' : 'NG',
  generatedAt: '2026-07-22T23:59:30.000+09:00',
  sourceRevision: 'ef4c066+p10-m10-worktree',
  tests: ['tests/p10-m10-load-generation.mjs'],
  results: { m10 },
  records,
  qualification: {
    slabPanelSchemaIntegrated: true,
    fixedEndDistributedLoadsConnected: true,
    missingBeamFallbackTraced: true,
    massSourceDeduplicated: true,
    windGeometryAndSignsTraced: true,
    externallyCrossValidated: false,
    releaseQualified: false,
    releaseGate: 'P10-M11',
    remainingGates: ['full-product-integration', 'external-cross-validation'],
  },
};
export const LIVE_P10_M10_EVIDENCE = Object.freeze({ ...core, artifactHash: stableHash(core).slice(0, 24) });

if (process.argv.includes('--print')) {
  console.log(JSON.stringify(LIVE_P10_M10_EVIDENCE, null, 2));
} else {
  const committed = JSON.parse(await readFile(path.resolve(
    'reports', 'validation-evidence', 'phase10', 'p10-m10-load-generation.json',
  ), 'utf8'));
  assert.deepEqual(committed, LIVE_P10_M10_EVIDENCE, 'P10-M10 committed evidence is stale');
  assert.equal(committed.status, 'OK');
  assert.equal(committed.records.length, 4);
  assert.equal(committed.qualification.releaseQualified, false);
  console.log(JSON.stringify({ ok: true, artifactHash: committed.artifactHash, recordCount: committed.records.length }, null, 2));
}

function record(caseId, computed, tolerance) {
  return { caseId, reference: 0, computed, relError: Math.abs(computed), tolerance, status: Math.abs(computed) <= tolerance ? 'OK' : 'NG' };
}
