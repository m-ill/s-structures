#!/usr/bin/env node
import { generateKeyPairSync, sign, verify as verifySignature } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createP17ProductAdapter } from '../../../framework/phase17/productAdapter.mjs';
import {
  canonicalJson,
  sha256Canonical,
  sha256Text,
} from '../../../framework/phase17/canonical.mjs';
import {
  auditExternalTrustRegistry,
  verifyScopedReviewerAttestation,
} from './framework/externalTrust.mjs';
import { qualifyP17M2Sb1 } from './framework/sb1Qualification.mjs';

const argumentsSet = new Set(process.argv.slice(2));
if (argumentsSet.size !== 1 || !argumentsSet.has('--execute')) {
  throw new Error('Usage: node verification/milestones/phase17/m2/run-sb1-local.mjs --execute');
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const caseRoot = path.join(repoRoot, 'verification', 'benchmarks', 'strix21', 'milestones', 'P17-M2', 'SB1');
const nativeInputPath = path.join(caseRoot, 'model', 'sstructures-input-r1.json');
const packagePath = path.join(caseRoot, 'm2-case-package-r1.json');
const nativeInput = JSON.parse(readFileSync(nativeInputPath, 'utf8'));
const casePackage = JSON.parse(readFileSync(packagePath, 'utf8'));
const startedAt = new Date();
const setId = `SB1-LOCAL-${startedAt.toISOString().replace(/[-:.]/gu, '')}`;
const relativeOutputDirectory = path.posix.join(
  'verification', 'benchmarks', 'strix21', 'milestones', 'P17-M2', 'SB1', 'local-runs', setId,
);
const outputDirectory = path.join(repoRoot, ...relativeOutputDirectory.split('/'));
mkdirSync(path.join(outputDirectory, 'runs'), { recursive: true });

const roles = ['executionCustodian', 'modelReviewer', 'referenceReviewer', 'numericalReviewer', 'releaseReviewer'];
const keys = Object.fromEntries(roles.map((role, index) => {
  const pair = generateKeyPairSync('ed25519');
  return [role, {
    pair,
    keyId: `${setId.toLowerCase()}-key-${index + 1}`,
    principalId: `${setId.toLowerCase()}-principal-${index + 1}`,
  }];
}));
const validFrom = new Date(startedAt.getTime() - 60_000).toISOString();
const validTo = new Date(startedAt.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
const registryCore = {
  version: 'p17-external-custodian-trust-registry-v1',
  registryId: `${setId.toLowerCase()}-registry`,
  status: 'PINNED',
  authority: {
    name: 'S-Structures local self-custodied test authority',
    governance: 'TEST_ONLY',
    contact: null,
  },
  pin: {
    method: 'EXTERNAL_CANONICAL_SHA256',
    environmentVariable: 'P17_EXTERNAL_CUSTODIAN_REGISTRY_SHA256',
    status: 'PROVIDED_OUT_OF_BAND',
  },
  keys: roles.map((role) => ({
    keyId: keys[role].keyId,
    principalId: keys[role].principalId,
    role,
    algorithm: 'Ed25519',
    publicKeyPem: keys[role].pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    validFrom,
    validTo,
    status: 'ACTIVE',
  })),
  reasonCodes: ['P17_LOCAL_TEST_ONLY_SELF_CUSTODY'],
};
const registry = { ...registryCore, registryHash: sha256Canonical(registryCore) };
const registryAudit = auditExternalTrustRegistry(registry, {
  expectedRegistrySha256: registry.registryHash,
  qualificationMode: 'TEST_ONLY',
});
if (registryAudit.status !== 'READY' || registryAudit.terminalEligible !== false) {
  throw new Error(`Local trust registry did not verify: ${registryAudit.reasonCodes.join(', ')}`);
}

const approvedArtifactHashes = [...new Set(casePackage.artifacts.map((row) => row.sha256))].sort();
const reviewerRoles = roles.filter((role) => role !== 'executionCustodian');
const attestations = reviewerRoles.map((role, index) => createAttestation(role, index));
const attestationAudits = attestations.map((attestation) => verifyScopedReviewerAttestation(attestation, registry, {
  expectedRegistrySha256: registry.registryHash,
  expectedArtifactHashes: approvedArtifactHashes,
  qualificationMode: 'TEST_ONLY',
}));
if (attestationAudits.some((row) => row.status !== 'VERIFIED' || row.terminalEligible !== false)) {
  throw new Error('One or more local reviewer attestations failed cryptographic verification.');
}

writeJson('trust-registry.json', registry);
writeJson('trust-registry-pin.json', {
  version: 'p17-local-registry-pin-v1',
  registryHash: registry.registryHash,
  custody: 'LOCAL_TEST_ONLY_SAME_PROCESS',
  externallyPinned: false,
});
for (const attestation of attestations) writeJson(`attestation-${attestation.role}.json`, attestation);

const adapter = createP17ProductAdapter();
const runRows = [];
const receipts = [];
let solverExecutionCount = 0;
for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
  const runId = `${setId}-R${ordinal}`;
  const baseline = await executeModel(`${runId}-BASE`, structuredClone(nativeInput.payload));
  solverExecutionCount += 1;
  const meshLevels = [{
    elements: 1,
    tipUzM: baseline.values.tipUzM,
    engineeringResultHash: baseline.engineeringResultHash,
  }];
  for (const elements of [2, 4, 8]) {
    const mesh = await executeModel(`${runId}-MESH-${elements}`, createMeshModel(nativeInput.payload, elements));
    solverExecutionCount += 1;
    meshLevels.push({ elements, tipUzM: mesh.values.tipUzM, engineeringResultHash: mesh.engineeringResultHash });
  }
  const reversedModel = structuredClone(nativeInput.payload);
  reversedModel.loads = reversedModel.loads.map((row) => row.id === 'P' ? { ...row, P: -Number(row.P) } : row);
  const reversed = await executeModel(`${runId}-REV`, reversedModel);
  solverExecutionCount += 1;
  const run = {
    runId,
    engineeringResultHash: baseline.engineeringResultHash,
    values: baseline.values,
    energy: { strainEnergyKnm: 0.5 * Math.abs(baseline.values.tipUzM) },
    meshLevels,
    mutations: { loadReversal: reversed.values },
    execution: {
      productStatus: baseline.status,
      externalRuntimeObservation: baseline.externalRuntimeObservation,
      networkFallbackObservation: baseline.networkFallbackObservation,
      requestedComputeTarget: baseline.requestedComputeTarget,
      executionProvenance: baseline.executionProvenance,
    },
  };
  const artifact = {
    version: 'p17-local-engineering-result-v1',
    caseId: 'SB1',
    runId,
    mode: 'LOCAL_TEST_ONLY',
    engineeringResultHash: baseline.engineeringResultHash,
    engineeringHashBasis: 'P17_SB1_ENGINEERING_PROJECTION_V1_EXCLUDES_RUNTIME_TIMING_AND_PLAN_METADATA',
    engineeringProjection: baseline.engineeringProjection,
    values: baseline.values,
    rawProductResult: baseline.rawProductResult,
    artifactHash: null,
  };
  artifact.artifactHash = sha256Canonical(without(artifact, ['artifactHash']));
  const artifactPath = `runs/run-${ordinal}-engineering-result.json`;
  const artifactWrite = writeJson(artifactPath, artifact);
  run.resultArtifact = {
    path: path.posix.join(relativeOutputDirectory, artifactPath),
    sha256: artifactWrite.sha256,
    byteLength: artifactWrite.byteLength,
  };
  const receipt = createSignedReceipt(run, ordinal);
  const receiptVerification = verifySignedReceipt(receipt);
  if (receiptVerification.status !== 'VERIFIED') throw new Error(`Local execution receipt ${runId} failed signature verification.`);
  const receiptPath = `runs/run-${ordinal}-local-signed-receipt.json`;
  const receiptWrite = writeJson(receiptPath, receipt);
  receipts.push({
    ...receipt,
    signatureVerification: receiptVerification,
    artifact: {
      path: path.posix.join(relativeOutputDirectory, receiptPath),
      sha256: receiptWrite.sha256,
      byteLength: receiptWrite.byteLength,
    },
  });
  runRows.push(run);
}

const qualification = qualifyP17M2Sb1({ runs: runRows });
const completedAt = new Date().toISOString();
const evidenceCore = {
  version: 'p17-m2-sb1-local-execution-evidence-v1',
  phase: 17,
  milestone: 'P17-M2',
  caseId: 'SB1',
  setId,
  mode: 'LOCAL_TEST_ONLY',
  startedAt: startedAt.toISOString(),
  completedAt,
  claimBoundary: {
    cryptographicSignaturesVerified: true,
    signerCustody: 'SELF_CUSTODIED_EPHEMERAL_KEYS',
    independentExternalReviewPerformed: false,
    officialQualificationPerformed: false,
    releaseAllowed: false,
  },
  sourceBinding: {
    casePackagePath: path.posix.relative(repoRoot.replaceAll('\\', '/'), packagePath.replaceAll('\\', '/')),
    casePackageHash: casePackage.packageHash,
    nativeInputPath: path.posix.relative(repoRoot.replaceAll('\\', '/'), nativeInputPath.replaceAll('\\', '/')),
    nativeInputHash: sha256Canonical(nativeInput),
    approvedArtifactHashes,
  },
  trust: {
    registry,
    registryAudit,
    attestationCount: attestations.length,
    attestationAudits,
  },
  productBinding: {
    adapterVersion: adapter.version,
    productServiceVersion: adapter.productServiceVersion,
    publicEntrypoint: adapter.publicEntrypoint,
    executionProvenance: adapter.executionProvenance,
    externalRuntimeUsed: false,
    networkFallbackUsed: false,
  },
  counters: {
    primaryRunCount: runRows.length,
    meshReplayCount: runRows.length * 4,
    loadReversalCount: runRows.length,
    solverExecutionCount,
    benchmarkExecutionCount: runRows.length,
  },
  runs: runRows,
  signedReceipts: receipts,
  qualification,
  verdict: {
    engineeringStatus: qualification.status,
    deterministic: qualification.deterministic,
    localCryptographicEvidenceStatus: 'VERIFIED',
    externalQualificationStatus: 'NOT_PERFORMED',
    officialPass: false,
    releaseAllowed: false,
    reasonCodes: [
      'P17_LOCAL_TEST_ONLY_NOT_EXTERNAL_VERIFICATION',
      'P17_OFFICIAL_EXTERNAL_ATTESTATIONS_STILL_REQUIRED',
    ],
  },
};
const evidence = { ...evidenceCore, evidenceHash: sha256Canonical(evidenceCore) };
const evidenceWrite = writeJson('sb1-local-execution-evidence.json', evidence);

process.stdout.write(`${JSON.stringify({
  status: qualification.status,
  mode: 'LOCAL_TEST_ONLY',
  setId,
  outputDirectory: relativeOutputDirectory,
  evidencePath: path.posix.join(relativeOutputDirectory, 'sb1-local-execution-evidence.json'),
  evidenceSha256: evidenceWrite.sha256,
  evidenceHash: evidence.evidenceHash,
  primaryRunCount: runRows.length,
  solverExecutionCount,
  deterministic: qualification.deterministic,
  metricRows: qualification.runAudits[0]?.metricRows || [],
  officialPass: false,
  releaseAllowed: false,
}, null, 2)}\n`);
if (qualification.status !== 'PASS') process.exitCode = 1;

function createAttestation(role, index) {
  const payload = {
    version: 'p17-reviewer-attestation-v1',
    attestationId: `${setId.toLowerCase()}-${role.toLowerCase()}-${index + 1}`,
    caseId: 'SB1',
    role,
    reviewerId: keys[role].principalId,
    keyId: keys[role].keyId,
    issuedAt: startedAt.toISOString(),
    scope: {
      decision: 'APPROVE',
      artifactHashes: approvedArtifactHashes,
      claimBoundary: 'LOCAL_TEST_ONLY_SELF_CUSTODIED_CRYPTOGRAPHIC_APPROVAL_NOT_INDEPENDENT_EXTERNAL_REVIEW',
    },
  };
  const payloadHash = sha256Canonical(payload);
  const signatureBase64 = sign(null, Buffer.from(canonicalJson(payload), 'utf8'), keys[role].pair.privateKey).toString('base64');
  const withoutHash = { ...payload, payloadHash, signatureBase64 };
  return { ...withoutHash, attestationHash: sha256Canonical(withoutHash) };
}

function createSignedReceipt(run, ordinal) {
  const payload = {
    version: 'p17-local-signed-execution-receipt-v1',
    caseId: 'SB1',
    runId: run.runId,
    ordinal,
    status: 'COMPLETED',
    mode: 'LOCAL_TEST_ONLY',
    issuedAt: new Date().toISOString(),
    engineeringResultHash: run.engineeringResultHash,
    resultArtifactSha256: run.resultArtifact.sha256,
    productBinding: {
      serviceVersion: adapter.productServiceVersion,
      adapterVersion: adapter.version,
      publicEntrypoint: adapter.publicEntrypoint,
      externalRuntimeUsed: false,
      networkFallbackUsed: false,
    },
    custody: {
      authority: registry.authority.name,
      governance: 'TEST_ONLY',
      keyId: keys.executionCustodian.keyId,
      principalId: keys.executionCustodian.principalId,
      independentExternalCustody: false,
    },
  };
  const payloadHash = sha256Canonical(payload);
  const signatureBase64 = sign(null, Buffer.from(canonicalJson(payload), 'utf8'), keys.executionCustodian.pair.privateKey).toString('base64');
  const withoutHash = { ...payload, payloadHash, signatureBase64 };
  return { ...withoutHash, receiptHash: sha256Canonical(withoutHash) };
}

function verifySignedReceipt(receipt) {
  const signedPayload = without(receipt, ['payloadHash', 'signatureBase64', 'receiptHash']);
  const payloadHashMatches = receipt.payloadHash === sha256Canonical(signedPayload);
  const receiptHashMatches = receipt.receiptHash === sha256Canonical(without(receipt, ['receiptHash']));
  const signatureValid = verifySignature(
    null,
    Buffer.from(canonicalJson(signedPayload), 'utf8'),
    keys.executionCustodian.pair.publicKey,
    Buffer.from(receipt.signatureBase64, 'base64'),
  );
  const status = payloadHashMatches && receiptHashMatches && signatureValid ? 'VERIFIED' : 'BLOCKED';
  return {
    version: 'p17-local-receipt-verification-v1',
    status,
    payloadHashMatches,
    receiptHashMatches,
    signatureValid,
    terminalEligible: false,
  };
}

async function executeModel(runId, model) {
  const analysisCase = model.analysisCases.find((row) => row.id === 'SB1-STATIC');
  const execution = await adapter.execute({
    runId,
    model,
    analysisCase,
    computeTarget: 'cpu',
    options: {
      fallbackPolicy: 'forbidden',
      externalRuntimeAllowed: false,
      networkFallbackAllowed: false,
    },
  });
  if (execution.status?.status !== 'completed') throw new Error(`Product execution ${runId} ended at ${execution.status?.status}.`);
  const combo = execution.result?.payload?.byCombo?.D_ONLY;
  const values = {
    tipUzM: finite(combo?.disp?.N2?.[2], `${runId} tipUzM`),
    tipRyRad: finite(combo?.disp?.N2?.[4], `${runId} tipRyRad`),
    supportRzKn: finite(combo?.reactions?.N1?.rz, `${runId} supportRzKn`),
    supportMyKnm: finite(combo?.reactions?.N1?.rmy, `${runId} supportMyKnm`),
  };
  return {
    status: execution.status.status,
    values,
    engineeringResultHash: sha256Canonical(engineeringProjection(execution.result.payload)),
    engineeringProjection: engineeringProjection(execution.result.payload),
    rawProductResult: toPlainJson(execution.result),
    externalRuntimeObservation: execution.externalRuntimeObservation,
    networkFallbackObservation: execution.networkFallbackObservation,
    requestedComputeTarget: execution.requestedComputeTarget,
    executionProvenance: execution.executionProvenance,
  };
}

function createMeshModel(baseModel, elements) {
  const model = structuredClone(baseModel);
  model.nodes = Array.from({ length: elements + 1 }, (_, index) => ({
    id: index === 0 ? 'N1' : index === elements ? 'N2' : `N-MESH-${elements}-${index}`,
    x: 3 * index / elements,
    y: 0,
    z: 0,
    ...(index === 0 ? { support: 'fixed' } : {}),
  }));
  model.members = Array.from({ length: elements }, (_, index) => ({
    ...structuredClone(baseModel.members[0]),
    id: `M-MESH-${elements}-${index + 1}`,
    n1: model.nodes[index].id,
    n2: model.nodes[index + 1].id,
  }));
  return model;
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Missing finite product result: ${label}.`);
  return number;
}

function writeJson(relativePath, value) {
  const absolutePath = path.join(outputDirectory, ...relativePath.split('/'));
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(absolutePath, text, { flag: 'wx' });
  return { sha256: sha256Text(text), byteLength: Buffer.byteLength(text) };
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function engineeringProjection(payload) {
  const combo = toPlainJson(payload?.byCombo?.D_ONLY || {});
  const keys = [
    'disp',
    'reactions',
    'memberResults',
    'foundationResults',
    'shellResults',
    'elasticExpansion',
    'dmax',
    'anyOk',
    'maxRatio',
    'ngCount',
    'okCount',
    'shellFem',
    'semiRigidDiaphragm',
    'shellFrameAssembly',
    'summary',
    'combo',
  ];
  return {
    version: 'p17-sb1-engineering-projection-v1',
    caseId: 'SB1',
    combinationId: 'D_ONLY',
    result: Object.fromEntries(keys.map((key) => [key, combo[key] ?? null])),
  };
}

function without(value, keysToRemove) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keysToRemove.includes(key)));
}
