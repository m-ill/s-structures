import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  validatePhase9M3Evidence,
  validatePhase9M3Manifest,
} from '../src/compute/governance/phase9M3.js';

const evidence = JSON.parse(await readFile(
  new URL('../reports/validation-evidence/phase9/p9-m3-elastic-runtime.json', import.meta.url),
  'utf8',
));
const manifest = JSON.parse(await readFile(
  new URL('../docs/verification/phase9/release-manifest.json', import.meta.url),
  'utf8',
));

assert.deepEqual(validatePhase9M3Evidence(evidence), { ok: true, errors: [] });
assert.deepEqual(validatePhase9M3Manifest(manifest), { ok: true, errors: [] });
assert.equal(evidence.performance.medium.fixture.activeDof, 8112);
assert.equal(evidence.performance.medium.fixture.combinationCount, 30);
assert.equal(evidence.execution.medium.factorizationCount, 1);
assert.equal(evidence.execution.medium.factorGroupCount, 1);
assert.equal(evidence.execution.medium.solveCount, 30);
assert.equal(evidence.execution.medium.reusedSolveCount, 29);
assert.equal(evidence.execution.medium.resourceBalanced, true);
assert.equal(evidence.resultStorage.medium.mode, 'bounded-slices');
assert.equal(evidence.resultStorage.mediumEnvelopeMemberCount, 8456);
assert.equal(manifest.evidence.m3ElasticRuntime, evidence.artifactHash);
assert.equal(
  manifest.computeQualification.grade,
  manifest.implementation.completedMilestones.includes('P9-M4') ? 'G2' : 'G1',
  'the cumulative manifest may advance beyond the M3 qualification grade',
);
assert.equal(manifest.release.allowed, false);
assert.equal(manifest.release.designTransferAllowed, false);

for (const id of ['P9-ELA-13', 'P9-ELA-14', 'P9-ELA-15', 'P9-ELA-16']) {
  assert.equal(
    evidence.results.find((row) => row.id === id)?.test,
    'tests/p9-m3-worker-product.mjs',
    `${id} evidence mapping`,
  );
}

console.log(JSON.stringify({
  ok: true,
  artifactHash: evidence.artifactHash,
  mediumActiveDof: evidence.performance.medium.fixture.activeDof,
  mediumCombinationCount: evidence.performance.medium.fixture.combinationCount,
  releaseAllowed: manifest.release.allowed,
}, null, 2));
