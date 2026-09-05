import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  NONLINEAR_PRODUCT_SCOPE_VERSION,
  PHASE8_PERFORMANCE_BASELINE_VERSION,
  PHASE8_REFERENCE_PROFILE_VERSION,
  PHASE8_REFERENCE_SOURCES,
  PHASE8_UX_PERFORMANCE_BUDGET,
  PHASE8_WORKLOAD_FIXTURES,
  buildNonlinearProductScopeCatalog,
  phase8ReferenceSourceCanQualify,
} from '../src/index.js';
import {
  P8_M0_GOVERNANCE_AUDIT_VERSION,
  VERIFICATION_REGISTRY_VERSION,
  validatePhase8EvidenceArtifact,
  verificationRegistryManifest,
} from '../verification/index.js';

const profile = JSON.parse(await readFile(new URL('../verification/evidence/validation/phase8/p8-m0-reference-profile.json', import.meta.url), 'utf8'));
assert.equal(profile.version, PHASE8_REFERENCE_PROFILE_VERSION);
assert.ok(profile.hardware.cpu);
assert.ok(profile.hardware.logicalCores > 0);
assert.ok(profile.hardware.memoryBytes > 0);
assert.ok(profile.os.platform);
assert.ok(profile.browser.name);
assert.ok(profile.browser.version);
assert.ok(profile.browser.userAgent);
assert.ok(profile.powerMode);
assert.ok(profile.backend.id);
assert.ok(profile.backend.build);
assert.equal(profile.measurement.status, 'pending-production-worker-wasm-backend');

assert.equal(PHASE8_PERFORMANCE_BASELINE_VERSION, 'p8-m0-performance-baseline-v1');
assert.deepEqual(PHASE8_WORKLOAD_FIXTURES.map((item) => item.id), [
  'PERF-PUSH-S', 'PERF-PUSH-M', 'PERF-PUSH-L', 'PERF-NLTH-S', 'PERF-NLTH-M', 'PERF-RESULT-M',
]);
assert.equal(PHASE8_UX_PERFORMANCE_BUDGET.inputAcknowledgementP95Ms, 100);
assert.equal(PHASE8_UX_PERFORMANCE_BUDGET.cancelAcknowledgementMaxMs, 2000);
assert.equal(PHASE8_UX_PERFORMANCE_BUDGET.engineeringTargets.peakAnalysisMemoryMaxBytes, Math.trunc(1.5 * 1024 ** 3));

const scope = buildNonlinearProductScopeCatalog();
assert.equal(scope.version, NONLINEAR_PRODUCT_SCOPE_VERSION);
assert.equal(scope.currentGrade, 'Q0');
assert.equal(scope.scopes['P8-S1'].status, 'planned');
assert.ok(scope.qualificationGrades.every((item) => item.id === 'Q0' || item.status === 'not-achieved'));

assert.ok(PHASE8_REFERENCE_SOURCES.length >= 14);
assert.ok(PHASE8_REFERENCE_SOURCES.every((item) => item.status === 'link-only'));
assert.ok(PHASE8_REFERENCE_SOURCES.every((item) => phase8ReferenceSourceCanQualify(item) === false));

const governance = JSON.parse(await readFile(new URL('../verification/evidence/validation/phase8/p8-m0-governance.json', import.meta.url), 'utf8'));
const evidenceValidation = validatePhase8EvidenceArtifact(governance);
assert.equal(evidenceValidation.ok, true, evidenceValidation.errors.join(', '));
assert.deepEqual(governance.verificationIds, ['NL-GOV-01', 'NL-GOV-02', 'NL-GOV-03', 'NL-GOV-04', 'NL-GOV-05', 'NL-GOV-06']);

const registry = verificationRegistryManifest();
assert.equal(registry.version, VERIFICATION_REGISTRY_VERSION);
assert.ok(registry.trustedAuditVersions.includes('p7-m11-run-record-audit-v1'));
assert.ok(!registry.trustedAnalysisAuditVersions.includes(P8_M0_GOVERNANCE_AUDIT_VERSION));
assert.ok(registry.governanceAuditVersions.includes(P8_M0_GOVERNANCE_AUDIT_VERSION));
assert.ok(registry.suites.some((item) => item.id === 'P8-M0-GOV'));

console.log(JSON.stringify({
  ok: true,
  profile: profile.version,
  workloadCount: PHASE8_WORKLOAD_FIXTURES.length,
  sourceCount: PHASE8_REFERENCE_SOURCES.length,
  evidenceIds: governance.verificationIds,
}, null, 2));
