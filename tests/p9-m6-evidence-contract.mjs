import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PHASE9_M6_VERIFICATION_IDS,
  validatePhase9M6Evidence,
  validatePhase9M6Manifest,
} from '../src/compute/governance/phase9M6.js';

const evidence = JSON.parse(await readFile(
  new URL('../reports/validation-evidence/phase9/p9-m6-sparse-eigen.json', import.meta.url),
  'utf8',
));
const manifest = JSON.parse(await readFile(
  new URL('../docs/verification/phase9/release-manifest.json', import.meta.url),
  'utf8',
));

assert.deepEqual(validatePhase9M6Evidence(evidence), { ok: true, errors: [] });
assert.deepEqual(validatePhase9M6Manifest(manifest), { ok: true, errors: [] });
assert.equal(evidence.verificationIds.length, PHASE9_M6_VERIFICATION_IDS.length);
assert.equal(evidence.backend.fullDenseEigenMatrixAllocated, false);
assert.equal(evidence.backend.optionalGpuSpmvQualified, false);
assert.equal(evidence.performance.budgetMet, true);
assert.equal(manifest.computeQualification.sparseEigenCpuQualified, true);
assert.equal(manifest.computeQualification.eigenGpuQualified, false);
assert.ok(Number(manifest.implementation.activeMilestone.split('M').at(-1)) >= 7);
assert.equal(manifest.evidence.m6SparseEigen, evidence.artifactHash);

console.log(JSON.stringify({
  ok: true,
  artifactHash: evidence.artifactHash,
  manifestHash: manifest.manifestHash,
  nextMilestone: manifest.implementation.activeMilestone,
}, null, 2));
