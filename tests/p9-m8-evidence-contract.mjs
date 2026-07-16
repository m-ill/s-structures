import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PHASE9_M8_BLOCKED_IDS,
  PHASE9_M8_PASS_IDS,
  validatePhase9M8Evidence,
  validatePhase9M8Manifest,
} from '../src/compute/governance/phase9M8.js';

const evidence = JSON.parse(await readFile(
  new URL('../reports/validation-evidence/phase9/p9-m8-hybrid-nonlinear.json', import.meta.url),
  'utf8',
));
const manifest = JSON.parse(await readFile(
  new URL('../docs/verification/phase9/release-manifest.json', import.meta.url),
  'utf8',
));

assert.deepEqual(validatePhase9M8Evidence(evidence), { ok: true, errors: [] });
assert.deepEqual(validatePhase9M8Manifest(manifest), { ok: true, errors: [] });
assert.equal(evidence.results.filter((row) => row.status === 'PASS').length, PHASE9_M8_PASS_IDS.length);
assert.equal(evidence.results.filter((row) => row.status === 'BLOCKED').length, PHASE9_M8_BLOCKED_IDS.length);
assert.equal(manifest.implementation.implementedMilestones.includes('P9-M8'), true);
assert.equal(manifest.implementation.completedMilestones.includes('P9-M8'), false);
assert.equal(manifest.implementation.activeMilestone, 'P9-M9');
assert.equal(manifest.computeQualification.grade, 'G2');
assert.equal(manifest.computeQualification.nonlinearResidentCpuQualified, true);
assert.equal(manifest.computeQualification.nonlinearGpuProductionQualified, false);
assert.equal(manifest.release.designTransferAllowed, false);

console.log(JSON.stringify({
  ok: true,
  artifactHash: evidence.artifactHash,
  manifestHash: manifest.manifestHash,
  passed: PHASE9_M8_PASS_IDS.length,
  blocked: PHASE9_M8_BLOCKED_IDS.length,
  nextMilestone: manifest.implementation.activeMilestone,
}, null, 2));
