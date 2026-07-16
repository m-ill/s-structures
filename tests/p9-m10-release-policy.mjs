import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildPhase9M10Evidence,
  buildPhase9M10DebtStatus,
  upgradePhase9ManifestToM10,
  validatePhase9M10DebtStatus,
  validatePhase9M10Evidence,
  validatePhase9M10Manifest,
} from '../src/compute/governance/phase9M10.js';

const manifest = JSON.parse(await readFile(new URL('../docs/verification/phase9/release-manifest.json', import.meta.url), 'utf8'));
const prior = JSON.parse(await readFile(new URL('../reports/validation-evidence/phase9/p9-m9-product-workflow.json', import.meta.url), 'utf8'));
const cleanup = {
  registryVersion: 'p9-m10-compatibility-registry-v1', expiredProductionCompatibilityCallers: 0,
  finalDebtHash: 'a'.repeat(64),
  unexpectedCompatibilityCallers: 0, unregisteredLegacyExports: 0, ownerlessDebt: 0,
  dependencyCycles: 0, dependencyViolations: 0, staleArtifacts: 0, unapprovedDependencies: 0,
};
const debt = buildPhase9M10DebtStatus({ generatedAt: '2026-07-16T00:00:00.000Z', sourceRevision: 'TEST' });
assert.deepEqual(validatePhase9M10DebtStatus(debt), { ok: true, errors: [] });
const evidence = buildPhase9M10Evidence({
  generatedAt: '2026-07-16T00:00:00.000Z', sourceRevision: 'TEST', priorEvidenceHash: prior.artifactHash,
  cleanup, releasePolicy: { externalQualificationDeferred: true }, focusedRegression: { ok: true }, releaseBuild: { ok: true },
});
assert.deepEqual(validatePhase9M10Evidence(evidence), { ok: true, errors: [] });
const upgraded = upgradePhase9ManifestToM10(manifest, evidence, { generatedAt: evidence.generatedAt, sourceRevision: evidence.sourceRevision });
assert.deepEqual(validatePhase9M10Manifest(upgraded), { ok: true, errors: [] });
assert.equal(upgraded.release.allowed, false);
assert.equal(upgraded.release.designTransferAllowed, false);
assert.equal(upgraded.computeQualification.automaticGpuRoutingAllowed, false);
assert.equal(upgraded.implementation.activeMilestone, 'external-qualification');

console.log(JSON.stringify({
  ok: true,
  requirements: ['P9-PERF-16~18', 'P9-REL-01~12'],
  decision: evidence.releaseDecision,
  grade: upgraded.computeQualification.grade,
  implementedMilestone: upgraded.implementation.implementedMilestones.at(-1),
}, null, 2));
