import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import {
  assertP17M2ExecutionAuthorized,
  buildP17M2GateAssessment,
} from '../verification/milestones/phase17/m2/framework/m2TerminalGate.mjs';
import {
  auditExternalTrustRegistry,
  verifyScopedReviewerAttestation,
} from '../verification/milestones/phase17/m2/framework/externalTrust.mjs';
import { auditReferenceArtifactBytes } from '../verification/milestones/phase17/m2/framework/referenceByteAudit.mjs';
import { createP17ReplayAudit } from '../verification/milestones/phase17/m2/framework/replayQualification.mjs';
import {
  canonicalJson,
  sha256Canonical,
} from '../verification/framework/phase17/canonical.mjs';

const repoRoot = path.resolve('.');
const sourceRoot = path.resolve('..', 'STRIX-verification-21');
const emptyRegistry = JSON.parse(readFileSync('verification/benchmarks/strix21/trust/external-custodian-trust-registry.json', 'utf8'));
const emptyAudit = auditExternalTrustRegistry(emptyRegistry, {});
assert.equal(emptyAudit.status, 'BLOCKED');
assert.equal(emptyAudit.terminalEligible, false);
assert.ok(emptyAudit.reasonCodes.includes('P17_EXTERNAL_TRUST_PIN_ENV_MISSING'));

const roles = ['executionCustodian', 'modelReviewer', 'referenceReviewer', 'numericalReviewer', 'releaseReviewer'];
const keyPairs = Object.fromEntries(roles.map((role, index) => [role, {
  principalId: `fixture-principal-${index + 1}`,
  keyId: `fixture-key-${index + 1}`,
  ...generateKeyPairSync('ed25519'),
}]));
const registryCore = {
  version: 'p17-external-custodian-trust-registry-v1',
  registryId: 'p17-test-external-registry-v1',
  status: 'PINNED',
  authority: { name: 'P17 TEST EXTERNAL AUTHORITY', governance: 'EXTERNAL', contact: 'test-only@example.invalid' },
  pin: { method: 'EXTERNAL_CANONICAL_SHA256', environmentVariable: 'P17_EXTERNAL_CUSTODIAN_REGISTRY_SHA256', status: 'PROVIDED_OUT_OF_BAND' },
  keys: roles.map((role) => ({
    keyId: keyPairs[role].keyId,
    principalId: keyPairs[role].principalId,
    role,
    algorithm: 'Ed25519',
    publicKeyPem: keyPairs[role].publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2027-01-01T00:00:00.000Z',
    status: 'ACTIVE',
  })),
  reasonCodes: [],
};
const registry = { ...registryCore, registryHash: sha256Canonical(registryCore) };
const registryAudit = auditExternalTrustRegistry(registry, { expectedRegistrySha256: registry.registryHash });
assert.equal(registryAudit.status, 'READY');
assert.equal(registryAudit.terminalEligible, true);
assert.equal(auditExternalTrustRegistry(registry, { expectedRegistrySha256: 'f'.repeat(64) }).status, 'BLOCKED');

const localRegistryCore = {
  ...registryCore,
  registryId: 'p17-test-only-local-registry-v1',
  authority: { name: 'P17 LOCAL TEST AUTHORITY', governance: 'TEST_ONLY', contact: null },
};
const localRegistry = { ...localRegistryCore, registryHash: sha256Canonical(localRegistryCore) };
const localRegistryAudit = auditExternalTrustRegistry(localRegistry, {
  expectedRegistrySha256: localRegistry.registryHash,
  qualificationMode: 'TEST_ONLY',
});
assert.equal(localRegistryAudit.status, 'READY');
assert.equal(localRegistryAudit.qualificationMode, 'TEST_ONLY');
assert.equal(localRegistryAudit.terminalEligible, false);
assert.equal(auditExternalTrustRegistry(localRegistry, {
  expectedRegistrySha256: localRegistry.registryHash,
}).status, 'BLOCKED');

const modelKey = keyPairs.modelReviewer;
const attestationPayload = {
  version: 'p17-reviewer-attestation-v1',
  attestationId: 'fixture-attestation-model-01',
  caseId: 'SB1',
  role: 'modelReviewer',
  reviewerId: modelKey.principalId,
  keyId: modelKey.keyId,
  issuedAt: '2026-08-28T12:00:00.000Z',
  scope: { decision: 'APPROVE', artifactHashes: ['a'.repeat(64)], claimBoundary: 'TEST_ONLY_CRYPTOGRAPHIC_CONTRACT' },
};
const payloadHash = sha256Canonical(attestationPayload);
const signatureBase64 = sign(null, Buffer.from(canonicalJson(attestationPayload), 'utf8'), modelKey.privateKey).toString('base64');
const attestationWithoutHash = { ...attestationPayload, payloadHash, signatureBase64 };
const attestation = { ...attestationWithoutHash, attestationHash: sha256Canonical(attestationWithoutHash) };
const attestationAudit = verifyScopedReviewerAttestation(attestation, registry, {
  expectedRegistrySha256: registry.registryHash,
  expectedArtifactHashes: ['a'.repeat(64)],
});
assert.equal(attestationAudit.status, 'VERIFIED');
assert.equal(attestationAudit.terminalEligible, true);
assert.equal(verifyScopedReviewerAttestation(attestation, registry, {
  expectedRegistrySha256: registry.registryHash,
  expectedArtifactHashes: ['b'.repeat(64)],
}).status, 'BLOCKED');

const sourceLock = JSON.parse(readFileSync('verification/benchmarks/strix21/references/source-locks-r2/SB1.source-lock.json', 'utf8'));
const sourceArtifacts = [
  sourceLock.sourceRoles.strixPublishedResult.file,
  sourceLock.sourceRoles.archivalNarrative.manual,
  sourceLock.sourceRoles.archivalNarrative.casePdf,
].map((row) => ({ path: row.path, byteLength: row.byteLength, sha256: row.sha256 }));
const byteAudit = auditReferenceArtifactBytes({ repoRoot, sourceRoot, caseId: 'SB1', artifacts: sourceArtifacts });
assert.equal(byteAudit.status, 'PASS');
assert.equal(byteAudit.sourceArtifacts.length, 3);
const pathMutation = auditReferenceArtifactBytes({ repoRoot, sourceRoot, caseId: 'SB1', artifacts: [{ path: 'STRIX-verification-21/../package.json', byteLength: 1, sha256: 'a'.repeat(64) }] });
assert.equal(pathMutation.status, 'FAIL');

const readyGates = rolesForGates('READY', 'PENDING');
const approvedLocks = Object.fromEntries(['source', 'reference', 'probe', 'tolerance', 'canonicalModel', 'nativeModel', 'modelEquivalence', 'productBuild'].map((key) => [key, 'APPROVED']));
const executionReady = buildP17M2GateAssessment({ gates: readyGates, lockSummary: approvedLocks });
assert.equal(executionReady.status, 'READY_FOR_OFFICIAL_EXECUTION');
assert.equal(assertP17M2ExecutionAuthorized(executionReady), true);

const blockedGates = readyGates.map((row) => row.id.includes('TRUST_REGISTRY') || row.id.includes('REVIEWER_ATTESTATIONS')
  ? { ...row, readinessStatus: 'BLOCKED', terminalEvidenceStatus: 'BLOCKED', reasonCodes: ['P17_EXTERNAL_EVIDENCE_REQUIRED'] }
  : row);
const pendingLocks = Object.fromEntries(Object.keys(approvedLocks).map((key) => [key, 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL']));
const blocked = buildP17M2GateAssessment({ gates: blockedGates, lockSummary: pendingLocks, externalDependencies: ['P17_EXTERNAL_CUSTODIAN_REGISTRY_REQUIRED'] });
assert.equal(blocked.status, 'BLOCKED_PRE_EXECUTION');
assert.throws(() => assertP17M2ExecutionAuthorized(blocked), (error) => error.code === 'P17_M2_EXECUTION_NOT_AUTHORIZED');

const terminalGates = rolesForGates('READY', 'PASS');
const terminal = buildP17M2GateAssessment({
  gates: terminalGates,
  lockSummary: approvedLocks,
  counters: { officialExecutionCount: 3, externallyCustodiedRunCount: 3, officialPassCount: 1, solverExecutionCount: 3, benchmarkExecutionCount: 3, caseReportCount: 1 },
});
assert.equal(terminal.status, 'TERMINAL_EVIDENCE_COMPLETE');
assert.equal(terminal.terminalAuthorization, true);

const replay = createP17ReplayAudit({
  caseId: 'SB1',
  runId: null,
  auditKind: 'REFERENCE_BYTES',
  status: 'PASS',
  sourceArtifacts: byteAudit.sourceArtifacts,
  replayHash: byteAudit.auditHash,
  reasonCodes: [],
});
assert.match(replay.auditHash, /^[a-f0-9]{64}$/u);

console.log(JSON.stringify({
  suite: 'P17-M2 terminal gates and external trust',
  status: 'PASS',
  officialBenchmarkExecuted: false,
  solverExecuted: false,
  persistedExternalCredentialCount: 0,
  sourceByteAudit: `${byteAudit.sourceArtifacts.length}/${byteAudit.sourceArtifacts.length}`,
  gateCount: terminal.gates.length,
}, null, 2));

function rolesForGates(readinessStatus, terminalEvidenceStatus) {
  return [
    'OFFICIAL_EXECUTION_ORCHESTRATOR_AND_RECEIPT',
    'PINNED_EXTERNAL_EXECUTION_CUSTODIAN_TRUST_REGISTRY',
    'REFERENCE_ARTIFACT_BYTE_AUDIT',
    'EXTRACTION_AND_COMPARISON_REPLAY',
    'PHYSICS_AND_MUTATION_REPLAY',
    'THREE_INDEPENDENT_EXTERNALLY_CUSTODIED_RUNS',
    'DETERMINISTIC_PDF_REPRODUCTION_AND_VISUAL_PARITY_AUDIT',
    'SCOPED_INDEPENDENT_REVIEWER_ATTESTATIONS',
  ].map((id) => ({ id, readinessStatus, terminalEvidenceStatus, artifactHashes: ['c'.repeat(64)], reasonCodes: terminalEvidenceStatus === 'PASS' ? [] : ['P17_TERMINAL_EVIDENCE_PENDING'] }));
}
