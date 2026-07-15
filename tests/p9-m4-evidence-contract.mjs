import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PHASE9_M4_EXTERNAL_MATRIX_BLOCKER,
  PHASE9_M4_VERIFICATION_IDS,
  validatePhase9M4Evidence,
  validatePhase9M4Manifest,
} from '../src/compute/governance/phase9M4.js';

const evidence = JSON.parse(await readFile(
  new URL('../reports/validation-evidence/phase9/p9-m4-webgpu-foundation.json', import.meta.url),
  'utf8',
));
const manifest = JSON.parse(await readFile(
  new URL('../docs/verification/phase9/release-manifest.json', import.meta.url),
  'utf8',
));

assert.deepEqual(validatePhase9M4Evidence(evidence), { ok: true, errors: [] });
assert.deepEqual(validatePhase9M4Manifest(manifest), { ok: true, errors: [] });
assert.equal(evidence.browser.status, 'PASS');
assert.match(evidence.browser.capability.adapterInfo.vendor, /\S+/, 'recorded local profile vendor');
assert.equal(evidence.browser.checks.filter((row) => row.status === 'PASS').length, 8);
assert.equal(evidence.resourceLifecycle.allocationBalanced, true);
assert.equal(evidence.profileMatrix.fullRequiredMatrixQualified, false);
assert.equal(evidence.results.find((row) => row.id === 'P9-GPU-PLT-12').status, 'DEFERRED');
assert.equal(evidence.verificationIds.length, PHASE9_M4_VERIFICATION_IDS.length);
assert.ok(evidence.performance.vectorScale.gpuToCpuMedianRatio > 1);
assert.ok(evidence.performance.csrSpmv.gpuToCpuMedianRatio > 1);
assert.equal(manifest.computeQualification.grade, 'G2');
assert.equal(manifest.computeQualification.gpuImplemented, true);
assert.equal(manifest.release.allowed, false);
assert.equal(manifest.release.designTransferAllowed, false);
assert.ok(manifest.blockers.includes(PHASE9_M4_EXTERNAL_MATRIX_BLOCKER));
assert.equal(manifest.evidence.m4WebGpuFoundation, evidence.artifactHash);

console.log(JSON.stringify({
  ok: true,
  artifactHash: evidence.artifactHash,
  profileVendor: evidence.browser.capability.adapterInfo.vendor,
  qualification: manifest.computeQualification.status,
  deferred: 'P9-GPU-PLT-12',
  designTransferAllowed: manifest.release.designTransferAllowed,
}, null, 2));
