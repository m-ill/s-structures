import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PHASE9_M10_BLOCKED_IDS,
  PHASE9_M10_PASS_IDS,
  validatePhase9M10Evidence,
  validatePhase9M10DebtStatus,
  validatePhase9M10Manifest,
} from '../src/compute/governance/phase9M10.js';

const evidence = JSON.parse(await readFile(
  new URL('../reports/validation-evidence/phase9/p9-m10-release-gate.json', import.meta.url),
  'utf8',
));
const manifest = JSON.parse(await readFile(
  new URL('../docs/verification/phase9/release-manifest.json', import.meta.url),
  'utf8',
));
const debt = JSON.parse(await readFile(
  new URL('../reports/validation-evidence/phase9/p9-m10-final-debt.json', import.meta.url),
  'utf8',
));

assert.deepEqual(validatePhase9M10Evidence(evidence), { ok: true, errors: [] });
assert.deepEqual(validatePhase9M10DebtStatus(debt), { ok: true, errors: [] });
assert.deepEqual(validatePhase9M10Manifest(manifest), { ok: true, errors: [] });
assert.equal(evidence.results.filter((row) => row.status === 'PASS').length, PHASE9_M10_PASS_IDS.length);
assert.equal(evidence.results.filter((row) => row.status === 'BLOCKED').length, PHASE9_M10_BLOCKED_IDS.length);
assert.equal(manifest.implementation.implementedMilestones.includes('P9-M10'), true);
assert.equal(manifest.implementation.completedMilestones.includes('P9-M10'), false);
assert.equal(manifest.implementation.activeMilestone, 'external-qualification');
assert.equal(manifest.computeQualification.grade, 'G2');
assert.equal(manifest.computeQualification.automaticGpuRoutingAllowed, false);
assert.equal(manifest.release.allowed, false);
assert.equal(manifest.release.designTransferAllowed, false);
assert.equal(manifest.evidence.m10ReleaseGate, evidence.artifactHash);
assert.equal(manifest.evidence.m10FinalDebt, debt.artifactHash);

console.log(JSON.stringify({
  ok: true,
  artifactHash: evidence.artifactHash,
  manifestHash: manifest.manifestHash,
  passed: PHASE9_M10_PASS_IDS.length,
  blocked: PHASE9_M10_BLOCKED_IDS.length,
  nextGate: manifest.implementation.activeMilestone,
}, null, 2));
