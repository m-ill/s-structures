import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PHASE9_M7_VERIFICATION_IDS,
  validatePhase9M7Evidence,
  validatePhase9M7Manifest,
} from '../src/compute/governance/phase9M7.js';

const evidence = JSON.parse(await readFile(
  new URL('../reports/validation-evidence/phase9/p9-m7-nonlinear-batch.json', import.meta.url),
  'utf8',
));
const manifest = JSON.parse(await readFile(
  new URL('../docs/verification/phase9/release-manifest.json', import.meta.url),
  'utf8',
));

assert.deepEqual(validatePhase9M7Evidence(evidence), { ok: true, errors: [] });
assert.deepEqual(validatePhase9M7Manifest(manifest), { ok: true, errors: [] });
assert.equal(evidence.verificationIds.length, PHASE9_M7_VERIFICATION_IDS.length);
assert.equal(evidence.numeric.rollbackByteParity, true);
assert.equal(evidence.performance.perElementCommittedStateCloneCount, 0);
assert.equal(evidence.backend.gpuProductionQualified, false);
assert.equal(manifest.computeQualification.nonlinearBatchCpuQualified, true);
assert.equal(manifest.computeQualification.nonlinearGpuProductionQualified, false);
assert.ok(manifest.implementation.activeMilestone === 'external-qualification'
  || Number(manifest.implementation.activeMilestone.split('M').at(-1)) >= 8);
assert.equal(manifest.evidence.m7NonlinearBatch, evidence.artifactHash);

console.log(JSON.stringify({
  ok: true,
  artifactHash: evidence.artifactHash,
  manifestHash: manifest.manifestHash,
  nextMilestone: manifest.implementation.activeMilestone,
}, null, 2));
