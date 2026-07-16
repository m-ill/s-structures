import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PHASE9_M5_PERFORMANCE_BLOCKER,
  PHASE9_M5_PROFILE_BLOCKER,
  PHASE9_M5_VERIFICATION_IDS,
  validatePhase9M5Evidence,
  validatePhase9M5Manifest,
} from '../src/compute/governance/phase9M5.js';

const evidence = JSON.parse(await readFile(
  new URL('../reports/validation-evidence/phase9/p9-m5-hybrid-elastic.json', import.meta.url),
  'utf8',
));
const manifest = JSON.parse(await readFile(
  new URL('../docs/verification/phase9/release-manifest.json', import.meta.url),
  'utf8',
));

assert.deepEqual(validatePhase9M5Evidence(evidence), { ok: true, errors: [] });
assert.deepEqual(validatePhase9M5Manifest(manifest), { ok: true, errors: [] });
assert.equal(evidence.verificationIds.length, PHASE9_M5_VERIFICATION_IDS.length);
assert.equal(evidence.numeric.qualified, true);
assert.equal(evidence.product.elastic.designStatus, 'qualified');
assert.equal(evidence.product.directPDelta.reusedMatrixSessionCount, 0);
assert.equal(evidence.resources.allocationBalanced, true);
assert.equal(evidence.performance.endToEnd.thresholdMet, false);
assert.ok(evidence.performance.endToEnd.speedup < evidence.performance.endToEnd.threshold);
assert.equal(evidence.results.find((row) => row.id === 'P9-GPU-ELA-15').status, 'FAIL');
assert.equal(evidence.results.find((row) => row.id === 'P9-GPU-ELA-16').status, 'BLOCKED');
assert.equal(evidence.results.find((row) => row.id === 'P9-PERF-10').status, 'FAIL');
assert.equal(manifest.computeQualification.grade, 'G2');
assert.equal(manifest.computeQualification.hybridElasticImplemented, true);
assert.equal(manifest.computeQualification.elasticCandidateQualified, false);
assert.equal(manifest.computeQualification.autoGpuAllowed, false);
assert.ok(manifest.blockers.includes(PHASE9_M5_PERFORMANCE_BLOCKER));
assert.ok(manifest.blockers.includes(PHASE9_M5_PROFILE_BLOCKER));
assert.equal(manifest.release.designTransferAllowed, false);
assert.equal(manifest.evidence.m5HybridElastic, evidence.artifactHash);

console.log(JSON.stringify({
  ok: true,
  artifactHash: evidence.artifactHash,
  implementation: 'complete',
  qualification: manifest.computeQualification.status,
  speedup: evidence.performance.endToEnd.speedup,
  autoGpuAllowed: manifest.computeQualification.autoGpuAllowed,
}, null, 2));
