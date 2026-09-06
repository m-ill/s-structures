import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStrictJson, canonicalJson, sha256Canonical, sha256Text } from '../../../../framework/phase17/canonical.mjs';
import { assertJsonSchema } from '../../../../framework/phase17/jsonSchemaStrict.mjs';

export const P17_EXTERNAL_TRUST_VERSION = 'p17-external-trust-v1';
export const P17_EXTERNAL_REGISTRY_PIN_ENV = 'P17_EXTERNAL_CUSTODIAN_REGISTRY_SHA256';
export const P17_REQUIRED_EXTERNAL_ROLES = Object.freeze([
  'executionCustodian',
  'modelReviewer',
  'referenceReviewer',
  'numericalReviewer',
  'releaseReviewer',
]);

const schemaDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'specs', 'phase17');
const registrySchema = JSON.parse(readFileSync(path.join(schemaDirectory, 'external-custodian-trust-registry-schema.json'), 'utf8'));
const attestationSchema = JSON.parse(readFileSync(path.join(schemaDirectory, 'reviewer-attestation-schema.json'), 'utf8'));

export function auditExternalTrustRegistry(input, options = {}) {
  const registry = strictClone(input, 'external trust registry');
  assertJsonSchema(registrySchema, registry, 'external trust registry');
  const qualificationMode = options.qualificationMode === 'TEST_ONLY' ? 'TEST_ONLY' : 'OFFICIAL';
  const declaredHash = registry.registryHash;
  const calculatedHash = sha256Canonical(without(registry, ['registryHash']));
  const expectedPin = clean(options.expectedRegistrySha256);
  const reasons = [];
  if (declaredHash !== calculatedHash) reasons.push('P17_EXTERNAL_TRUST_REGISTRY_SELF_HASH_MISMATCH');
  if (registry.status !== 'PINNED') reasons.push('P17_EXTERNAL_TRUST_REGISTRY_UNPROVISIONED');
  const expectedGovernance = qualificationMode === 'TEST_ONLY' ? 'TEST_ONLY' : 'EXTERNAL';
  if (registry.authority.governance !== expectedGovernance) {
    reasons.push(qualificationMode === 'TEST_ONLY'
      ? 'P17_EXTERNAL_TRUST_AUTHORITY_NOT_TEST_ONLY'
      : 'P17_EXTERNAL_TRUST_AUTHORITY_NOT_EXTERNAL');
  }
  if (registry.pin.status !== 'PROVIDED_OUT_OF_BAND') reasons.push('P17_EXTERNAL_TRUST_PIN_NOT_DECLARED');
  if (!expectedPin) reasons.push('P17_EXTERNAL_TRUST_PIN_ENV_MISSING');
  else if (expectedPin !== declaredHash) reasons.push('P17_EXTERNAL_TRUST_PIN_MISMATCH');

  const active = registry.keys.filter((row) => row.status === 'ACTIVE');
  const keyIds = new Set();
  const principals = new Set();
  for (const row of active) {
    if (keyIds.has(row.keyId)) reasons.push('P17_EXTERNAL_TRUST_DUPLICATE_KEY_ID');
    keyIds.add(row.keyId);
    if (principals.has(row.principalId)) reasons.push('P17_EXTERNAL_TRUST_PRINCIPAL_ROLE_REUSE');
    principals.add(row.principalId);
    try {
      const key = createPublicKey(row.publicKeyPem);
      if (key.asymmetricKeyType !== 'ed25519') reasons.push('P17_EXTERNAL_TRUST_KEY_ALGORITHM_INVALID');
    } catch {
      reasons.push('P17_EXTERNAL_TRUST_PUBLIC_KEY_INVALID');
    }
    if (Date.parse(row.validFrom) >= Date.parse(row.validTo)) reasons.push('P17_EXTERNAL_TRUST_KEY_VALIDITY_INVALID');
  }
  for (const role of P17_REQUIRED_EXTERNAL_ROLES) {
    if (active.filter((row) => row.role === role).length !== 1) reasons.push(`P17_EXTERNAL_TRUST_${role.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_KEY_REQUIRED`);
  }
  const ready = reasons.length === 0;
  const core = {
    version: P17_EXTERNAL_TRUST_VERSION,
    registryId: registry.registryId,
    status: ready ? 'READY' : 'BLOCKED',
    qualificationMode,
    terminalEligible: ready && qualificationMode === 'OFFICIAL',
    declaredHash,
    calculatedHash,
    expectedPin: expectedPin || null,
    activeKeyCount: active.length,
    distinctPrincipalCount: principals.size,
    reasonCodes: [...new Set(reasons)].sort(),
  };
  return deepFreeze({ ...core, auditHash: sha256Canonical(core) });
}

export function verifyScopedReviewerAttestation(input, registryInput, options = {}) {
  const attestation = strictClone(input, 'reviewer attestation');
  const registry = strictClone(registryInput, 'external trust registry');
  assertJsonSchema(attestationSchema, attestation, 'reviewer attestation');
  const trust = auditExternalTrustRegistry(registry, options);
  const reasons = [...trust.reasonCodes];
  const payload = without(attestation, ['payloadHash', 'signatureBase64', 'attestationHash']);
  if (attestation.payloadHash !== sha256Canonical(payload)) reasons.push('P17_REVIEW_ATTESTATION_PAYLOAD_HASH_MISMATCH');
  const calculatedAttestationHash = sha256Canonical(without(attestation, ['attestationHash']));
  if (attestation.attestationHash !== calculatedAttestationHash) reasons.push('P17_REVIEW_ATTESTATION_SELF_HASH_MISMATCH');
  const keyRecord = registry.keys.find((row) => row.keyId === attestation.keyId && row.status === 'ACTIVE');
  if (!keyRecord) reasons.push('P17_REVIEW_ATTESTATION_KEY_NOT_TRUSTED');
  else {
    if (keyRecord.role !== attestation.role) reasons.push('P17_REVIEW_ATTESTATION_ROLE_MISMATCH');
    if (keyRecord.principalId !== attestation.reviewerId) reasons.push('P17_REVIEW_ATTESTATION_PRINCIPAL_MISMATCH');
    if (Date.parse(attestation.issuedAt) < Date.parse(keyRecord.validFrom) || Date.parse(attestation.issuedAt) > Date.parse(keyRecord.validTo)) {
      reasons.push('P17_REVIEW_ATTESTATION_KEY_OUTSIDE_VALIDITY');
    }
    try {
      const verified = verifySignature(
        null,
        Buffer.from(canonicalJson(payload), 'utf8'),
        createPublicKey(keyRecord.publicKeyPem),
        Buffer.from(attestation.signatureBase64, 'base64'),
      );
      if (!verified) reasons.push('P17_REVIEW_ATTESTATION_SIGNATURE_INVALID');
    } catch {
      reasons.push('P17_REVIEW_ATTESTATION_SIGNATURE_INVALID');
    }
  }
  const expectedArtifacts = new Set(options.expectedArtifactHashes || []);
  if (expectedArtifacts.size && (
    attestation.scope.artifactHashes.length !== expectedArtifacts.size
    || attestation.scope.artifactHashes.some((hash) => !expectedArtifacts.has(hash))
  )) reasons.push('P17_REVIEW_ATTESTATION_SCOPE_MISMATCH');
  if (attestation.scope.decision !== 'APPROVE') reasons.push('P17_REVIEW_ATTESTATION_NOT_APPROVED');
  const core = {
    version: P17_EXTERNAL_TRUST_VERSION,
    attestationId: attestation.attestationId,
    caseId: attestation.caseId,
    role: attestation.role,
    status: reasons.length ? 'BLOCKED' : 'VERIFIED',
    terminalEligible: reasons.length === 0 && trust.terminalEligible,
    reasonCodes: [...new Set(reasons)].sort(),
  };
  return deepFreeze({ ...core, verificationHash: sha256Canonical(core) });
}

export function createReviewerAttestationPayload(input) {
  const payload = strictClone(input, 'reviewer attestation payload');
  return deepFreeze({ canonical: canonicalJson(payload), payloadHash: sha256Canonical(payload), byteHash: sha256Text(canonicalJson(payload)) });
}

function without(value, keys) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

function strictClone(value, label) {
  assertStrictJson(value, label);
  return JSON.parse(JSON.stringify(value));
}

function clean(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
