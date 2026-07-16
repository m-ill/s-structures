import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PHASE9_M9_VERIFICATION_IDS,
  validatePhase9M9Evidence,
  validatePhase9M9Manifest,
} from '../src/compute/governance/phase9M9.js';

const evidence = JSON.parse(await readFile(
  new URL('../reports/validation-evidence/phase9/p9-m9-product-workflow.json', import.meta.url),
  'utf8',
));
const manifest = JSON.parse(await readFile(
  new URL('../docs/verification/phase9/release-manifest.json', import.meta.url),
  'utf8',
));

assert.deepEqual(validatePhase9M9Evidence(evidence), { ok: true, errors: [] });
assert.deepEqual(validatePhase9M9Manifest(manifest), { ok: true, errors: [] });
assert.equal(evidence.results.filter((row) => row.status === 'PASS').length, PHASE9_M9_VERIFICATION_IDS.length);
assert.equal(manifest.implementation.implementedMilestones.includes('P9-M9'), true);
assert.equal(manifest.implementation.completedMilestones.includes('P9-M9'), true);
assert.equal(manifest.implementation.activeMilestone, 'P9-M10');
assert.equal(manifest.computeQualification.grade, 'G2');
assert.equal(manifest.computeQualification.productWorkflowIntegrated, true);
assert.equal(manifest.computeQualification.automaticGpuRoutingAllowed, false);
assert.equal(manifest.release.designTransferAllowed, false);
assert.equal(manifest.evidence.m9ProductWorkflow, evidence.artifactHash);

console.log(JSON.stringify({
  ok: true,
  artifactHash: evidence.artifactHash,
  manifestHash: manifest.manifestHash,
  passed: PHASE9_M9_VERIFICATION_IDS.length,
  nextMilestone: manifest.implementation.activeMilestone,
}, null, 2));
