import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PHASE9_BASELINE_VERIFICATION_IDS,
  phase9ArtifactHash,
  validatePhase9BaselineEvidence,
  validatePhase9DebtRegistry,
  validatePhase9ReleaseManifestSkeleton,
} from '../src/compute/governance/phase9Baseline.js';

const baseline = await readJson('../reports/validation-evidence/phase9/p9-m0-baseline.json');
const debt = await readJson('../reports/validation-evidence/phase9/p9-m0-debt-inventory.json');
const manifest = await readJson('../docs/verification/phase9/release-manifest.json');

assertValidation(validatePhase9BaselineEvidence(baseline), 'baseline');
assertValidation(validatePhase9DebtRegistry(debt), 'debt registry');
assertValidation(validatePhase9ReleaseManifestSkeleton(manifest), 'release manifest');

assert.deepEqual(baseline.verificationIds, PHASE9_BASELINE_VERIFICATION_IDS);
assert.equal(baseline.executionPlan.profile, 'ci-minimal');
assert.equal(baseline.executionPlan.mediumLargePolicy, 'materialize-hash-preflight-only');
assert.equal(baseline.executionPlan.nonlinearPolicy, 'reuse-phase8-evidence-no-rerun');
assert.equal(baseline.backendBuilds.gpu.implemented, false);
assert.equal(baseline.backendBuilds.gpu.qualification, 'G0');
assert.equal(baseline.actual.syntheticKernelDistinction.usedAsPhase9FrameTiming, false);
assert.equal(baseline.actual.currentPathPolicy.M.includes('blocked'), true);
assert.equal(baseline.actual.currentPathPolicy.L.includes('blocked'), true);
assert.equal(baseline.recomputedErrors.stageAccountingMs <= baseline.tolerances.stageAccountingAbsoluteMs, true);
assert.equal(baseline.actual.memory.peakRssBytes > 0, true);
assert.equal(baseline.actual.mainThreadLatency.rows.length >= 5, true);
assert.equal(baseline.actual.operationCounts.elasticMembers, 174);
assert.equal(baseline.actual.operationCounts.elasticCombinations, 10);
assert.equal(baseline.actual.golden.elastic.complete, true);
assert.equal(baseline.actual.golden.elastic.auditStatus, 'PASS');

const fixtures = Object.fromEntries(baseline.actual.fixtures.map((row) => [row.tier, row]));
assert.deepEqual(Object.keys(fixtures), ['S', 'M', 'L']);
assert.deepEqual([fixtures.S.activeDof, fixtures.M.activeDof, fixtures.L.activeDof], [288, 8112, 29106]);
assert.deepEqual([fixtures.S.memberCount, fixtures.M.memberCount, fixtures.L.memberCount], [174, 8456, 40491]);

assert.deepEqual(baseline.reference.nonlinearEvidence.map((row) => row.kind), ['pushover', 'nlth']);
for (const row of baseline.reference.nonlinearEvidence) {
  assert.equal(row.status, 'PASS');
  assert.equal(row.rerun, false);
  assert.match(row.sourcePath, /^reports\/validation-evidence\/phase8\//);
  assert.match(row.evidenceHash, /^[a-f0-9]{64}$/);
}

assert.equal(debt.rows.length, 12);
assert.equal(debt.rows.every((row) => row.owner && row.targetMilestone && row.replacement), true);
assert.equal(debt.rows.every((row) => Array.isArray(row.inventory)), true);
assert.equal(debt.retention.forbidden.includes('manually edited generated evidence'), true);
assert.equal(manifest.implementation.completedMilestones.includes('P9-M0'), true);
assert.ok(['G0', 'G1', 'G2', 'G3'].includes(manifest.computeQualification.grade));
assert.equal(manifest.release.allowed, false);
assert.equal(manifest.release.designTransferAllowed, false);
assert.equal(manifest.evidence.baseline, baseline.artifactHash);
assert.equal(manifest.evidence.debtRegistry, debt.artifactHash);

const tampered = structuredClone(baseline);
tampered.actual.fixtures[0].memberCount += 1;
tampered.artifactHash = phase9ArtifactHash(tampered);
assert.equal(validatePhase9BaselineEvidence(tampered).ok, false);

console.log(JSON.stringify({
  ok: true,
  baselineHash: baseline.artifactHash,
  debtHash: debt.artifactHash,
  fixtureHash: baseline.fixtureHash,
  nonlinearSolverRerun: false,
  release: manifest.release.status,
}, null, 2));

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), 'utf8'));
}

function assertValidation(result, label) {
  assert.equal(result.ok, true, `${label}: ${result.errors.join(', ')}`);
}
