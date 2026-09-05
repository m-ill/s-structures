import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalJson,
  prettyJson,
  sha256Canonical,
  sha256Text,
} from '../../../../framework/phase17/canonical.mjs';
import { auditExternalTrustRegistry } from './externalTrust.mjs';
import { buildP17M2GateAssessment } from './m2TerminalGate.mjs';
import { validateP17ProductModel } from '../../../../framework/phase17/productAdapter.mjs';
import { auditReferenceArtifactBytes } from './referenceByteAudit.mjs';
import { createP17ReplayAudit } from './replayQualification.mjs';
import { P17_SB1_PRIMARY_REFERENCE } from './sb1Qualification.mjs';
import { assertJsonSchema } from '../../../../framework/phase17/jsonSchemaStrict.mjs';
import { validateManifestDocument } from '../../../../framework/phase17/manifestValidation.mjs';

export const P17_M2_SB1_LOCK_PACKAGE_VERSION = 'p17-m2-sb1-lock-package-builder-v1';
export const P17_M2_SB1_OVERLAY_ROOT = 'verification/benchmarks/strix21/milestones/P17-M2/SB1';

const repoRootDefault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const schemaDirectory = path.join(repoRootDefault, 'verification', 'specs', 'phase17');
const productBuildSchema = JSON.parse(readFileSync(path.join(schemaDirectory, 'product-build-lock-schema.json'), 'utf8'));
const gateSchema = JSON.parse(readFileSync(path.join(schemaDirectory, 'm2-terminal-gate-schema.json'), 'utf8'));
const packageSchema = JSON.parse(readFileSync(path.join(schemaDirectory, 'm2-case-package-schema.json'), 'utf8'));

const productSourceArtifacts = Object.freeze([
  ['src/index.js', 'PUBLIC_ENTRYPOINT'],
  ['src/compute/product/analysisProductService.js', 'PRODUCT_ANALYSIS_SERVICE'],
  ['src/compute/product/analysisCaseEngine.js', 'ANALYSIS_CASE_ENGINE'],
  ['src/ui/analysisRunners.js', 'PUBLIC_ANALYSIS_RUNNER'],
  ['src/solver/linear3d.js', 'IN_HOUSE_LINEAR_STATIC_SOLVER'],
  ['src/solver/linear3dAssembly.js', 'IN_HOUSE_LINEAR_STATIC_ASSEMBLY'],
  ['package.json', 'PACKAGE_MANIFEST'],
]);

export function buildP17M2Sb1LockPackage(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || repoRootDefault);
  const sourceRoot = path.resolve(options.sourceRoot || path.join(repoRoot, '..', 'STRIX-verification-21'));
  const sourceLockPath = 'verification/benchmarks/strix21/references/source-locks-r2/SB1.source-lock.json';
  const baseManifestPath = 'verification/benchmarks/strix21/cases/SB1/case-manifest.json';
  const trustRegistryPath = 'verification/benchmarks/strix21/trust/external-custodian-trust-registry.json';
  const sourceLock = readJson(repoRoot, sourceLockPath);
  const baseManifest = readJson(repoRoot, baseManifestPath);
  const trustRegistry = readJson(repoRoot, trustRegistryPath);
  const externalArtifacts = [
    sourceLock.sourceRoles.strixPublishedResult.file,
    sourceLock.sourceRoles.archivalNarrative.manual,
    sourceLock.sourceRoles.archivalNarrative.casePdf,
  ].map((row) => ({ path: row.path, byteLength: row.byteLength, sha256: row.sha256 }));
  const byteAudit = auditReferenceArtifactBytes({ repoRoot, sourceRoot, caseId: 'SB1', artifacts: externalArtifacts });
  if (byteAudit.status !== 'PASS') throw packageError('P17_SB1_REFERENCE_BYTE_AUDIT_FAILED', byteAudit.reasonCodes.join(', '));

  const transcription = sourceTranscription();
  const closedForm = closedFormReference();
  const referenceProposalHash = sha256Canonical({
    caseId: 'SB1',
    purpose: 'REFERENCE_CONTENT_PROPOSAL_PENDING_EXTERNAL_ATTESTATION',
    values: referenceValueRows(),
  });
  const toleranceProposalHash = sha256Canonical({ caseId: 'SB1', purpose: 'TOLERANCE_CONTENT_PROPOSAL_PENDING_EXTERNAL_ATTESTATION', criteria: toleranceRows() });
  const probeProposalHash = sha256Canonical({ caseId: 'SB1', purpose: 'PROBE_CONTENT_PROPOSAL_PENDING_EXTERNAL_ATTESTATION', probes: probeRows() });

  const sourceManifest = buildSourceManifest(sourceLock, externalArtifacts);
  const expectedValues = {
    schemaVersion: 'p17-expected-values-v1',
    caseId: 'SB1',
    status: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
    payloadAbsent: false,
    releaseAllowed: false,
    values: referenceValueRows().map((row) => ({ ...row, approvalHash: referenceProposalHash })),
    reasonCodes: ['P17_EXTERNAL_REFERENCE_REVIEW_PENDING'],
  };
  const toleranceManifest = {
    schemaVersion: 'p17-tolerance-manifest-v1',
    caseId: 'SB1',
    status: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
    payloadAbsent: false,
    releaseAllowed: false,
    policy: { signedComparisonDefault: true, nearZeroPolicy: 'ABSOLUTE_TOLERANCE', postResultTuningAllowed: false },
    criteria: toleranceRows().map((row) => ({ ...row, approvalHash: toleranceProposalHash })),
    approval: { reviewer: 'EXTERNAL_NUMERICAL_REVIEWER_UNASSIGNED', status: 'PENDING', approvalHash: null },
    reasonCodes: ['P17_EXTERNAL_TOLERANCE_REVIEW_PENDING'],
  };
  const probeManifest = {
    schemaVersion: 'p17-probe-manifest-v1',
    caseId: 'SB1',
    status: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
    payloadAbsent: false,
    releaseAllowed: false,
    signConventionStatus: 'LOCKED',
    probes: probeRows().map((row) => ({ ...row, approvalHash: probeProposalHash })),
    approval: { reviewer: 'EXTERNAL_NUMERICAL_REVIEWER_UNASSIGNED', status: 'PENDING', approvalHash: null },
    reasonCodes: ['P17_EXTERNAL_PROBE_REVIEW_PENDING'],
  };
  const canonicalInput = buildCanonicalInput();
  const nativeModel = buildNativeModel();
  const productValidation = validateP17ProductModel(nativeModel);
  if (productValidation.ok !== true) throw packageError('P17_SB1_NATIVE_MODEL_INVALID', JSON.stringify(productValidation.errors || []));
  const sstructuresInput = {
    schemaVersion: 'p17-sstructures-input-v1',
    caseId: 'SB1',
    artifactStatus: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
    payloadAbsent: false,
    releaseAllowed: false,
    productProjectSchemaVersion: '6',
    payload: nativeModel,
    reasonCodes: ['P17_EXTERNAL_MODEL_REVIEW_PENDING'],
  };
  const modelProposalHash = sha256Canonical({
    caseId: 'SB1',
    canonicalInputHash: sha256Canonical(canonicalInput),
    sstructuresInputHash: sha256Canonical(sstructuresInput),
    purpose: 'MODEL_EQUIVALENCE_PROPOSAL_PENDING_EXTERNAL_ATTESTATION',
  });
  const modelEquivalence = buildModelEquivalence(canonicalInput, sstructuresInput, modelProposalHash);
  const productBuild = buildProductLock(repoRoot);
  const transcriptionBytes = Buffer.from(transcription, 'utf8');
  const sourcePdf = sourceLock.sourceRoles.archivalNarrative.casePdf;
  const sourceHtml = sourceLock.sourceRoles.strixPublishedResult.file;
  const referenceManifest = {
    schemaVersion: 'p17-reference-manifest-v1',
    caseId: 'SB1',
    artifactStatus: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
    payloadAbsent: false,
    releaseAllowed: false,
    sourceManifestBinding: {
      path: `${P17_M2_SB1_OVERLAY_ROOT}/source/source-manifest-r1.json`,
      sha256: sha256Canonical(sourceManifest),
    },
    expectedValuesPath: `${P17_M2_SB1_OVERLAY_ROOT}/reference/expected-values-r1.json`,
    expectedValuesHash: sha256Canonical(expectedValues),
    lanes: [
      {
        id: 'PRIMARY_INDEPENDENT', referenceClass: 'R1_R2_EXTERNAL', claimEvidenceLevel: 'R1', status: 'LOCKED',
        artifacts: [
          artifact('SB1-SOURCE-PDF', sourcePdf.path, sourcePdf, 'application/pdf', 'page 1 section 5', 'PRIMARY_REFERENCE_PUBLICATION'),
          {
            artifactId: 'SB1-TRANSCRIPTION-R1', path: `${P17_M2_SB1_OVERLAY_ROOT}/source/transcription-r1.md`,
            sha256: sha256(transcriptionBytes), byteLength: transcriptionBytes.length, mimeType: 'text/markdown',
            sourceLocator: 'Timoshenko & Gere closed form as transcribed from SB1 PDF page 1 section 5', role: 'PRIMARY_REFERENCE_TRANSCRIPTION',
          },
        ],
        reasonCodes: [],
      },
      {
        id: 'STRIX_PUBLISHED', referenceClass: 'R1_R2_EXTERNAL', claimEvidenceLevel: 'R4', status: 'LOCKED',
        artifacts: [
          artifact('SB1-PUBLISHED-HTML', sourceHtml.path, sourceHtml, 'text/html', 'results comparison table', 'STRIX_PUBLISHED_VALUE'),
          artifact('SB1-PUBLISHED-PDF', sourcePdf.path, sourcePdf, 'application/pdf', 'page 2 section 6', 'STRIX_PUBLISHED_VALUE'),
        ],
        reasonCodes: [],
      },
      { id: 'STRIX_R4', referenceClass: 'R1_R2_EXTERNAL', claimEvidenceLevel: 'R4', status: 'BLOCKED_SOURCE', artifacts: [], reasonCodes: ['STRIX_RAW_RECORD_AND_EVIDENCE_ARCHIVE_NOT_PUBLISHED'] },
      { id: 'MIDAS_R4', referenceClass: 'NOT_ASSIGNED', claimEvidenceLevel: 'NOT_ASSIGNED', status: 'NOT_AVAILABLE', artifacts: [], reasonCodes: ['P17_MIDAS_R4_EXPORT_NOT_AVAILABLE'] },
    ],
    approval: { reviewer: 'EXTERNAL_REFERENCE_REVIEWER_UNASSIGNED', status: 'PENDING', approvalHash: null },
    reasonCodes: ['P17_EXTERNAL_REFERENCE_REVIEW_PENDING', 'STRIX_R4_RAW_EVIDENCE_UNAVAILABLE', 'MIDAS_R4_EXPORT_UNAVAILABLE'],
  };
  const referenceByteReplay = createP17ReplayAudit({
    caseId: 'SB1', runId: null, auditKind: 'REFERENCE_BYTES', status: 'PASS',
    sourceArtifacts: byteAudit.sourceArtifacts, replayHash: byteAudit.auditHash, reasonCodes: [],
  });
  const signoff = buildPendingSignoff();
  const modelingNotes = buildModelingNotes(modelProposalHash);

  const documents = {
    [`${P17_M2_SB1_OVERLAY_ROOT}/source/transcription-r1.md`]: transcription,
    [`${P17_M2_SB1_OVERLAY_ROOT}/source/source-manifest-r1.json`]: sourceManifest,
    [`${P17_M2_SB1_OVERLAY_ROOT}/source/reference-byte-audit-r1.json`]: referenceByteReplay,
    [`${P17_M2_SB1_OVERLAY_ROOT}/reference/closed-form-r1.json`]: closedForm,
    [`${P17_M2_SB1_OVERLAY_ROOT}/reference/expected-values-r1.json`]: expectedValues,
    [`${P17_M2_SB1_OVERLAY_ROOT}/reference/tolerance-manifest-r1.json`]: toleranceManifest,
    [`${P17_M2_SB1_OVERLAY_ROOT}/reference/probe-manifest-r1.json`]: probeManifest,
    [`${P17_M2_SB1_OVERLAY_ROOT}/reference/reference-manifest-r1.json`]: referenceManifest,
    [`${P17_M2_SB1_OVERLAY_ROOT}/model/canonical-input-r1.json`]: canonicalInput,
    [`${P17_M2_SB1_OVERLAY_ROOT}/model/sstructures-input-r1.json`]: sstructuresInput,
    [`${P17_M2_SB1_OVERLAY_ROOT}/model/model-equivalence-r1.json`]: modelEquivalence,
    [`${P17_M2_SB1_OVERLAY_ROOT}/model/product-build-lock-r1.json`]: productBuild,
    [`${P17_M2_SB1_OVERLAY_ROOT}/model/modeling-notes-r1.md`]: modelingNotes,
    [`${P17_M2_SB1_OVERLAY_ROOT}/review/signoff-r1.json`]: signoff,
  };
  validateDocuments(documents);

  const implementationHashes = hashImplementationFiles(repoRoot);
  const trustAudit = auditExternalTrustRegistry(trustRegistry, {
    expectedRegistrySha256: options.externalRegistryPin || process.env.P17_EXTERNAL_CUSTODIAN_REGISTRY_SHA256,
  });
  const gateAssessment = buildP17M2GateAssessment({
    gates: buildGateRows({ implementationHashes, trustAudit, referenceByteReplay }),
    lockSummary: {
      source: 'APPROVED',
      reference: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
      probe: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
      tolerance: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
      canonicalModel: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
      nativeModel: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
      modelEquivalence: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
      productBuild: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
    },
    counters: {},
    externalDependencies: [
      'P17_EXTERNAL_CUSTODIAN_REGISTRY_AND_OUT_OF_BAND_PIN_REQUIRED',
      'P17_EXTERNAL_REFERENCE_REVIEWER_ATTESTATION_REQUIRED',
      'P17_EXTERNAL_MODEL_REVIEWER_ATTESTATION_REQUIRED',
      'P17_EXTERNAL_NUMERICAL_REVIEWER_ATTESTATION_REQUIRED',
      'P17_EXTERNAL_RELEASE_REVIEWER_ATTESTATION_REQUIRED',
    ],
  });
  assertJsonSchema(gateSchema, gateAssessment, 'P17-M2 gate assessment');
  documents[`${P17_M2_SB1_OVERLAY_ROOT}/gates/gate-assessment-r1.json`] = gateAssessment;

  const baseBytes = readFileSync(path.join(repoRoot, ...baseManifestPath.split('/')));
  const artifactRows = Object.entries(documents).map(([artifactPath, value]) => documentBinding(artifactPath, value));
  const packageCore = {
    version: 'p17-m2-sb1-case-package-v1',
    phase: 17,
    milestone: 'P17-M2',
    caseId: 'SB1',
    revision: 1,
    status: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
    baseScaffoldBinding: {
      path: baseManifestPath,
      canonicalHash: sha256Canonical(baseManifest),
      sha256: sha256(baseBytes),
      byteLength: baseBytes.length,
    },
    artifacts: artifactRows,
    lockStates: gateAssessment.lockSummary,
    gateAssessmentHash: gateAssessment.assessmentHash,
    counters: {
      officialExecutionCount: 0,
      solverExecutionCount: 0,
      benchmarkExecutionCount: 0,
      engineeringResultCount: 0,
      caseReportCount: 0,
      officialPassCount: 0,
    },
    reasonCodes: [
      'P17_M2_EXECUTION_NOT_AUTHORIZED',
      'P17_EXTERNAL_CUSTODIAN_REGISTRY_REQUIRED',
      'P17_INDEPENDENT_REVIEWER_ATTESTATIONS_REQUIRED',
    ],
    releaseAllowed: false,
  };
  const casePackage = { ...packageCore, packageHash: sha256Canonical(packageCore) };
  assertJsonSchema(packageSchema, casePackage, 'P17-M2 case package');
  documents[`${P17_M2_SB1_OVERLAY_ROOT}/m2-case-package-r1.json`] = casePackage;
  return deepFreeze({
    version: P17_M2_SB1_LOCK_PACKAGE_VERSION,
    status: casePackage.status,
    documents,
    casePackage,
    gateAssessment,
    trustAudit,
    referenceByteAudit: byteAudit,
    productValidation,
    benchmarkExecutionCount: 0,
    solverExecutionCount: 0,
    releaseAllowed: false,
  });
}

export function serializeP17M2Sb1Document(value) {
  return typeof value === 'string' ? value : `${prettyJson(value)}\n`;
}

function validateDocuments(documents) {
  const kinds = new Map([
    ['source/source-manifest-r1.json', 'sourceManifest'],
    ['reference/expected-values-r1.json', 'expectedValues'],
    ['reference/tolerance-manifest-r1.json', 'toleranceManifest'],
    ['reference/probe-manifest-r1.json', 'probeManifest'],
    ['reference/reference-manifest-r1.json', 'referenceManifest'],
    ['model/canonical-input-r1.json', 'canonicalInput'],
    ['model/sstructures-input-r1.json', 'sstructuresInput'],
    ['model/model-equivalence-r1.json', 'modelEquivalence'],
    ['review/signoff-r1.json', 'reviewSignoff'],
  ]);
  for (const [suffix, kind] of kinds) {
    const entry = Object.entries(documents).find(([artifactPath]) => artifactPath.endsWith(suffix));
    if (['sourceManifest', 'reviewSignoff'].includes(kind)) validateManifestDocument(kind, entry[1]);
    else {
      validatePendingM2Document(kind, entry[1]);
      validateManifestDocument(kind, projectPendingDocumentToApprovedShape(kind, entry[1]));
    }
  }
  const productBuild = Object.entries(documents).find(([artifactPath]) => artifactPath.endsWith('product-build-lock-r1.json'))[1];
  assertJsonSchema(productBuildSchema, productBuild, 'P17 product build lock');
}

function validatePendingM2Document(kind, value) {
  const statusKey = ['canonicalInput', 'sstructuresInput', 'modelEquivalence', 'referenceManifest'].includes(kind) ? 'artifactStatus' : 'status';
  if (value[statusKey] !== 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL' || value.payloadAbsent !== false || value.releaseAllowed !== false || !value.reasonCodes.length) {
    throw packageError('P17_M2_PENDING_CONTENT_STATE_INVALID', `${value.caseId}.${kind} must carry present, non-releasable content and explicit external-approval blockers.`);
  }
  if (value.approval && (value.approval.status !== 'PENDING' || value.approval.approvalHash !== null)) {
    throw packageError('P17_M2_PENDING_APPROVAL_INVALID', `${value.caseId}.${kind} must remain an unsigned PENDING approval.`);
  }
}

function projectPendingDocumentToApprovedShape(kind, value) {
  const projected = structuredClone(value);
  projected.releaseAllowed = true;
  projected.reasonCodes = [];
  if (['canonicalInput', 'sstructuresInput'].includes(kind)) projected.artifactStatus = 'MODEL_LOCKED';
  else if (['modelEquivalence', 'referenceManifest'].includes(kind)) projected.artifactStatus = 'LOCKED';
  else projected.status = 'LOCKED';
  if (projected.approval) {
    projected.approval.status = 'APPROVED';
    projected.approval.approvalHash = kind === 'probeManifest'
      ? projected.probes[0].approvalHash
      : kind === 'toleranceManifest'
        ? projected.criteria[0].approvalHash
        : sha256Canonical(value);
  }
  return projected;
}

function buildSourceManifest(sourceLock, externalArtifacts) {
  return {
    schemaVersion: 'p17-source-manifest-v1',
    caseId: 'SB1',
    officialSuiteMember: true,
    status: 'LOCKED',
    custodyBinding: {
      registryPath: 'verification/benchmarks/strix21/suite-source-registry-r2.json',
      registryHash: 'de4b442ab56af5b14a907d320b85281a04b3f66ab5f75f9073a3f563df09f79c',
      sourceLockPath: 'verification/benchmarks/strix21/references/source-locks-r2/SB1.source-lock.json',
      sourceLockHash: sourceLock.sourceLockHash,
    },
    extraction: {
      status: 'COMPLETE',
      method: 'MANUAL_TRANSCRIPTION',
      artifacts: externalArtifacts.map((row, index) => ({ path: row.path, sha256: row.sha256, role: ['STRIX_PUBLISHED_HTML', 'STRIX_MANUAL_PDF', 'STRIX_CASE_PDF'][index] })),
    },
    transcription: { status: 'COMPLETE', path: `${P17_M2_SB1_OVERLAY_ROOT}/source/transcription-r1.md`, valueCount: 18 },
    reasonCodes: [],
  };
}

function closedFormReference() {
  return {
    version: 'p17-m2-sb1-closed-form-v1',
    caseId: 'SB1',
    source: 'Timoshenko & Gere, Mechanics of Materials; cantilever under an end load',
    sourceLocator: 'STRIX-verification-21/reports/SB1.pdf page 1 section 5',
    unitSystem: 'N_MM_RAD',
    inputs: { P_N: 1000, L_mm: 3000, E_N_per_mm2: 26700, I_strong_mm4: 3125000000 },
    formulas: {
      tipUzMm: '-P*L^3/(3*E*I)',
      tipRyRad: '+P*L^2/(2*E*I)',
      supportRzN: '+P',
      supportMyNmm: '-P*L',
      strainEnergyNmm: 'P^2*L^3/(6*E*I)',
    },
    fullPrecision: {
      tipUzMm: P17_SB1_PRIMARY_REFERENCE.tipUzM * 1000,
      tipRyRad: P17_SB1_PRIMARY_REFERENCE.tipRyRad,
      supportRzN: P17_SB1_PRIMARY_REFERENCE.supportRzKn * 1000,
      supportMyNmm: P17_SB1_PRIMARY_REFERENCE.supportMyKnm * 1000000,
      strainEnergyNmm: 0.5 * 1000 * Math.abs(P17_SB1_PRIMARY_REFERENCE.tipUzM * 1000),
    },
    canonicalProductUnits: { displacement: 'm', rotation: 'rad', force: 'kN', moment: 'kN-m' },
    referenceHash: sha256Canonical(P17_SB1_PRIMARY_REFERENCE),
  };
}

function referenceValueRows() {
  const primary = [
    ['tip-uz', P17_SB1_PRIMARY_REFERENCE.tipUzM, 'm', 'full double from closed form', 'closed-form-r1.json#/fullPrecision/tipUzMm'],
    ['tip-ry', P17_SB1_PRIMARY_REFERENCE.tipRyRad, 'rad', 'full double from closed form', 'closed-form-r1.json#/fullPrecision/tipRyRad'],
    ['support-rz', P17_SB1_PRIMARY_REFERENCE.supportRzKn, 'kN', 'exact', 'closed-form-r1.json#/fullPrecision/supportRzN'],
    ['support-my', P17_SB1_PRIMARY_REFERENCE.supportMyKnm, 'kN-m', 'exact', 'closed-form-r1.json#/fullPrecision/supportMyNmm'],
  ].map(([metricId, value, unit, precision, sourceLocator]) => ({ metricId, lane: 'PRIMARY_INDEPENDENT', value, unit, precision, sourceLocator }));
  const published = [
    ['tip-uz', -0.000107865, 'm', '6 decimals in mm converted exactly to m', 'SB1.pdf page 2 N2.uz'],
    ['tip-ry', 0.000053933, 'rad', '5 significant digits as displayed', 'SB1.pdf page 2 N2.ry'],
    ['support-rz', 1, 'kN', 'integer N converted exactly to kN', 'SB1.pdf page 2 N1.Fz'],
    ['support-my', -3, 'kN-m', 'integer N-mm converted exactly to kN-m', 'SB1.pdf page 2 N1.My'],
  ].map(([metricId, value, unit, precision, sourceLocator]) => ({ metricId, lane: 'STRIX_PUBLISHED', value, unit, precision, sourceLocator }));
  return [...primary, ...published];
}

function toleranceRows() {
  return [
    { metricId: 'tip-uz', comparisonMode: 'SIGNED_RELATIVE', relativeTolerancePct: 0.01, absoluteTolerance: 1e-12, nearZeroThreshold: 1e-15, unit: 'm', mandatory: true },
    { metricId: 'tip-ry', comparisonMode: 'SIGNED_RELATIVE', relativeTolerancePct: 0.01, absoluteTolerance: 1e-12, nearZeroThreshold: 1e-15, unit: 'rad', mandatory: true },
    { metricId: 'support-rz', comparisonMode: 'SIGNED_RELATIVE', relativeTolerancePct: 0.01, absoluteTolerance: 1e-10, nearZeroThreshold: 1e-15, unit: 'kN', mandatory: true },
    { metricId: 'support-my', comparisonMode: 'SIGNED_RELATIVE', relativeTolerancePct: 0.01, absoluteTolerance: 1e-10, nearZeroThreshold: 1e-15, unit: 'kN-m', mandatory: true },
  ];
}

function probeRows() {
  return [
    { probeId: 'sb1-tip-uz', metricId: 'tip-uz', resultKind: 'NODE_DISPLACEMENT', entityId: 'N2', location: 'NODE', component: 'GLOBAL_UZ', unit: 'm', signConvention: 'positive global +Z; downward response negative', mandatory: true, jsonPointer: '/result/payload/byCombo/D_ONLY/disp/N2/2', extractionOperation: 'IDENTITY_FINITE_NUMBER' },
    { probeId: 'sb1-tip-ry', metricId: 'tip-ry', resultKind: 'NODE_ROTATION', entityId: 'N2', location: 'NODE', component: 'GLOBAL_RY', unit: 'rad', signConvention: 'positive global +Y right-hand rotation', mandatory: true, jsonPointer: '/result/payload/byCombo/D_ONLY/disp/N2/4', extractionOperation: 'IDENTITY_FINITE_NUMBER' },
    { probeId: 'sb1-support-rz', metricId: 'support-rz', resultKind: 'SUPPORT_REACTION', entityId: 'N1', location: 'NODE', component: 'GLOBAL_RZ', unit: 'kN', signConvention: 'positive global +Z reaction', mandatory: true, jsonPointer: '/result/payload/byCombo/D_ONLY/reactions/N1/rz', extractionOperation: 'IDENTITY_FINITE_NUMBER' },
    { probeId: 'sb1-support-my', metricId: 'support-my', resultKind: 'SUPPORT_REACTION_MOMENT', entityId: 'N1', location: 'NODE', component: 'GLOBAL_MY', unit: 'kN-m', signConvention: 'positive global +Y right-hand moment', mandatory: true, jsonPointer: '/result/payload/byCombo/D_ONLY/reactions/N1/rmy', extractionOperation: 'IDENTITY_FINITE_NUMBER' },
  ];
}

function buildCanonicalInput() {
  return {
    schemaVersion: 'p17-canonical-input-v1',
    caseId: 'SB1',
    artifactStatus: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
    payloadAbsent: false,
    releaseAllowed: false,
    canonicalUnitSystem: 'SI_KN_M_S_RAD',
    entities: {
      nodes: [{ id: 'N1', xyzM: [0, 0, 0] }, { id: 'N2', xyzM: [3, 0, 0] }],
      elements: [{ id: 'M1', type: 'EULER_BERNOULLI_3D_FRAME', nodeIds: ['N1', 'N2'], localX: '+GLOBAL_X', localY: '+GLOBAL_Y', localZ: '+GLOBAL_Z', strongBendingInertia: 'IZ' }],
      materials: [{ id: 'SB1-MAT', model: 'LINEAR_ELASTIC_ISOTROPIC', E_MPa: 26700, nu: 0.2, G_MPa: 11125, density: 0 }],
      sections: [{ id: 'SB1-SEC', shape: 'RECTANGLE', bM: 0.3, hM: 0.5, areaM2: 0.15, IyM4: 0.001125, IzM4: 0.003125, jM4: 0.0028173708 }],
      constraints: [{ nodeId: 'N1', dofs: ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'], value: 0 }],
      loadCases: [{ id: 'D', type: 'STATIC' }],
      loads: [{ id: 'P', caseId: 'D', type: 'NODAL_FORCE', nodeId: 'N2', vectorKn: [0, 0, -1] }],
      masses: [],
      analysisCases: [{ id: 'SB1-STATIC', kind: 'LINEAR_STATIC', combinationId: 'D_ONLY', pDelta: false }],
    },
    silentDefaults: {
      status: 'LOCKED',
      items: [
        { id: 'SELF_WEIGHT', value: false, source: 'SB1 PDF page 1 section 4' },
        { id: 'SHEAR_DEFORMATION', value: false, source: 'SB1 PDF page 1 section 2: Euler-Bernoulli, no shear area' },
        { id: 'GEOMETRIC_STIFFNESS', value: false, source: 'SB1 PDF page 1 section 4: linear static' },
        { id: 'MEMBER_END_RELEASES', value: 'RIGID_RIGID', source: 'cantilever continuity and fixed N1' },
        { id: 'LOAD_COMBINATION', value: 'D_ONLY_1_0', source: 'single load case normalization' },
        { id: 'TORSION_AND_SHEAR_AREAS', value: 'NON_CONTROLLING', source: 'pure strong-axis bending; no torsion or shear deformation' },
      ],
    },
    reasonCodes: ['P17_EXTERNAL_MODEL_REVIEW_PENDING'],
  };
}

function buildNativeModel() {
  return {
    schemaVersion: 6,
    units: { length: 'm', force: 'kN', moment: 'kN.m', stress: 'N/mm2', displacement: 'mm' },
    unitSystem: { version: 'p2-t01-unit-system', internal: { length: 'm', force: 'kN', moment: 'kN.m', stress: 'N/mm2', displacement: 'mm' }, display: { length: 'm', force: 'kN', moment: 'kN.m', stress: 'N/mm2', displacement: 'mm' }, conversionAudit: [] },
    storyModel: { version: 'p2-s4-story-model', source: 'node-z', count: 0 },
    stories: [], diaphragms: [],
    materials: [{ id: 'SB1-MAT', version: 1, name: 'SB1 elastic material', E: 26700, G: 11125, density: 0, Fy: 1000000000, Fu: 1000000000 }],
    sections: [{ id: 'SB1-SEC', version: 1, name: 'SB1 300x500 rectangular section', type: 'RECT', dims: { B: 300, H: 500 }, A: 0.15, Iy: 0.001125, Iz: 0.003125, J: 0.0028173708, Ay: 0.125, Az: 0.125, Zy: 0.0075, Zz: 0.0125 }],
    nodes: [{ id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' }, { id: 'N2', x: 3, y: 0, z: 0 }],
    members: [{ id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'SB1-MAT', secId: 'SB1-SEC', localAxis: { roll: 0, strongAxis: 'z' }, releases: { i: 'rigid', j: 'rigid' } }],
    foundationProperties: [],
    loads: [{ id: 'P', type: 'nodal', node: 'N2', P: 1, dir: '-z', case: 'D' }],
    loadCases: [{ id: 'D', name: 'SB1 tip load', type: 'dead' }],
    loadCombinations: [{ id: 'D_ONLY', name: '1.0D', type: 'service', factors: { D: 1 } }],
    massSources: [], sourceRegistry: [],
    designBasis: { status: 'unconfigured', codeSourceId: null, designMethod: null, unitSystem: null, fields: {}, floorUsages: [], confirmedFields: [] },
    projectSetup: { version: 'p7-m0-project-setup-v1', status: 'legacy-unreviewed', templateId: null, configuredAt: null, reviewedAt: null, warnings: [] },
    analysisCases: [{ id: 'SB1-STATIC', name: 'SB1 linear static', kind: 'static', settings: { comboId: 'D_ONLY', pDeltaMethod: 'off' }, input: {}, status: 'not-run', caseVersion: 'p8-analysis-case-v2', lastRun: null }],
    analysisSettings: { analysisType: 'linear_static', elementType: '3d_frame', shearDeformation: false, includeGeometricStiffness: false, includeSelfWeight: false, solverTolerance: 1e-10, memberStations: 41, includeFixedEndDeformation: true, validateBeforeSolve: true, pDeltaMaxIterations: 12, pDeltaTolerance: 0.0001, pDeltaMaxAmplification: 2.5, modalModeCount: 6, responseSpectrum: { enabled: false, directions: ['x', 'y'], dampingRatio: 0.05, scale: 9.80665, points: [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }] } },
    analysisCriteria: { version: 'p6-m0-analysis-criteria-v1', preset: 'kds', criteria: {} },
    nonlinearMaterials: [], nonlinearSections: [], hingeProperties: [], linkProperties: [], timeHistoryFunctions: [], analysisStates: [],
    designParams: { global: { mode: 'off', codeCompliance: false, defaultKy: 1, defaultKz: 1, defaultLbY: null, defaultLbZ: null, defaultDeflectionLimitTotal: 250, defaultDeflectionLimitLive: 360, defaultCompressionSlendernessLimit: 200, defaultTensionSlendernessLimit: 300, warnAtRatio: 0.7 }, rc: { defaultCover: 0.05, defaultRebarFy: 400, defaultBeamRebarRatio: 0.01, defaultColumnRebarRatio: 0.015, minBeamRebarRatio: 0.002, minColumnRebarRatio: 0.01, maxColumnRebarRatio: 0.04, phiFlexure: 0.85, phiShear: 0.75, phiCompression: 0.65, warnAtRatio: 0.7 }, members: {} },
    designSettings: { method: 'allowable_stress', defaultCheck: 'elastic_stress_interaction' },
  };
}

function buildModelEquivalence(canonicalInput, sstructuresInput, approvalHash) {
  const dimensions = [
    ['UNIT_SYSTEM_AND_GLOBAL_AXES', 'IDENTICAL_SPECIFICATION'],
    ['NODE_COORDINATES_AND_CONNECTIVITY', 'IDENTICAL_SPECIFICATION'],
    ['ELEMENT_TYPE_AND_FORMULATION', 'ENGINEERING_EQUIVALENT'],
    ['MATERIAL_AND_SECTION_CONSTANTS', 'IDENTICAL_SPECIFICATION'],
    ['LOCAL_AXES_AND_STRONG_WEAK_ROUTING', 'ENGINEERING_EQUIVALENT'],
    ['SUPPORT_RELEASE_LINK_DIAPHRAGM_CONSTRAINT', 'IDENTICAL_SPECIFICATION'],
    ['LOAD_MAGNITUDE_DIRECTION_DISTRIBUTION_RESULTANT_CENTROID_SELF_WEIGHT', 'IDENTICAL_SPECIFICATION'],
    ['MASS_SOURCE_ROTATIONAL_INERTIA_LUMPED_CONSISTENT', 'IDENTICAL_SPECIFICATION'],
    ['DAMPING_SPECTRUM_INTERPOLATION_MODAL_COMBINATION', 'IDENTICAL_SPECIFICATION'],
    ['MESH_INTEGRATION_STABILIZATION_SHEAR_CORRECTION', 'ENGINEERING_EQUIVALENT'],
    ['PDELTA_STAGE_STEP_CONVERGENCE_HINGE_REGULARIZATION', 'IDENTICAL_SPECIFICATION'],
    ['OUTPUT_PROBE_LOCATION_COMPONENT_UNIT_SIGN', 'ENGINEERING_EQUIVALENT'],
  ].map(([id, status]) => ({ id, mandatory: true, status, sstructures: 'LOCKED', strix: 'LOCKED', midas: 'NOT_AVAILABLE', reasonCodes: [] }));
  return {
    schemaVersion: 'p17-model-equivalence-v1',
    caseId: 'SB1',
    artifactStatus: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
    payloadAbsent: false,
    releaseAllowed: false,
    overallStatus: 'ENGINEERING_EQUIVALENT',
    dimensions,
    knownDifferences: [
      { id: 'SB1-EQ-01', classification: 'KNOWN_EQUIVALENT', description: 'STRIX publishes OpenSees elasticBeamColumn while S-Structures uses the in-house 3D frame solver; both are linear Euler-Bernoulli for this no-shear case.', disposition: 'Require signed closed-form, subdivision, equilibrium, energy and load-reversal gates.' },
      { id: 'SB1-EQ-02', classification: 'KNOWN_EQUIVALENT', description: 'Saint-Venant J and shear areas are supplied to satisfy the 3D product schema but no torsion acts and shear deformation is disabled.', disposition: 'Treat as non-controlling and preserve a load-axis mutation gate.' },
      { id: 'SB1-EQ-03', classification: 'KNOWN_EQUIVALENT', description: 'Product results use m, kN and kN-m while STRIX displays mm, N and N-mm.', disposition: 'Convert the locked published reference lane before execution; product extraction remains identity-only.' },
    ],
    modelBindings: { canonicalInputHash: sha256Canonical(canonicalInput), sstructuresInputHash: sha256Canonical(sstructuresInput) },
    approval: { status: 'PENDING', reviewer: 'EXTERNAL_MODEL_REVIEWER_UNASSIGNED', approvalHash: null },
    reasonCodes: ['P17_EXTERNAL_MODEL_REVIEW_PENDING', 'P17_MIDAS_MODEL_NOT_AVAILABLE'],
  };
}

function buildProductLock(repoRoot) {
  const codeArtifacts = productSourceArtifacts.map(([artifactPath, role]) => {
    const bytes = readFileSync(path.join(repoRoot, ...artifactPath.split('/')));
    return { path: artifactPath, byteLength: bytes.length, sha256: sha256(bytes), role };
  });
  const core = {
    version: 'p17-product-build-lock-v1', caseId: 'SB1', status: 'HASH_LOCKED', productSchemaVersion: '6',
    serviceVersion: 'p9-m9-product-analysis-service-v1', adapterVersion: 'p17-m1-product-adapter-v1', publicEntrypoint: 'src/index.js',
    codeArtifacts, aggregateHash: sha256Canonical(codeArtifacts), releaseAllowed: false,
    reasonCodes: ['P17_EXTERNAL_PRODUCT_BUILD_REVIEW_PENDING', 'P17_DIRTY_WORKTREE_CONTENT_HASH_LOCK_ONLY'],
  };
  const result = { ...core, buildLockHash: sha256Canonical(core) };
  assertJsonSchema(productBuildSchema, result, 'P17 product build lock');
  return result;
}

function buildGateRows({ implementationHashes, trustAudit, referenceByteReplay }) {
  const hash = (...paths) => paths.map((artifactPath) => implementationHashes[artifactPath]);
  return [
    { id: 'OFFICIAL_EXECUTION_ORCHESTRATOR_AND_RECEIPT', readinessStatus: 'READY', terminalEvidenceStatus: 'PENDING', artifactHashes: hash('verification/milestones/phase17/m2/framework/officialExecutionOrchestrator.mjs', 'verification/specs/phase17/official-execution-receipt-schema.json'), reasonCodes: ['P17_OFFICIAL_EXECUTION_RECEIPT_PENDING'] },
    { id: 'PINNED_EXTERNAL_EXECUTION_CUSTODIAN_TRUST_REGISTRY', readinessStatus: trustAudit.terminalEligible ? 'READY' : 'BLOCKED', terminalEvidenceStatus: trustAudit.terminalEligible ? 'PENDING' : 'BLOCKED', artifactHashes: hash('verification/milestones/phase17/m2/framework/externalTrust.mjs', 'verification/specs/phase17/external-custodian-trust-registry-schema.json', 'verification/benchmarks/strix21/trust/external-custodian-trust-registry.json'), reasonCodes: trustAudit.terminalEligible ? ['P17_EXTERNAL_CUSTODY_ANCHOR_PENDING'] : trustAudit.reasonCodes },
    { id: 'REFERENCE_ARTIFACT_BYTE_AUDIT', readinessStatus: 'READY', terminalEvidenceStatus: 'PASS', artifactHashes: [implementationHashes['verification/milestones/phase17/m2/framework/referenceByteAudit.mjs'], referenceByteReplay.auditHash], reasonCodes: [] },
    { id: 'EXTRACTION_AND_COMPARISON_REPLAY', readinessStatus: 'READY', terminalEvidenceStatus: 'PENDING', artifactHashes: hash('verification/framework/phase17/resultExtractor.mjs', 'verification/framework/phase17/comparisonEvaluator.mjs', 'verification/milestones/phase17/m2/framework/replayQualification.mjs'), reasonCodes: ['P17_OFFICIAL_EXTRACTION_COMPARISON_REPLAY_PENDING'] },
    { id: 'PHYSICS_AND_MUTATION_REPLAY', readinessStatus: 'READY', terminalEvidenceStatus: 'PENDING', artifactHashes: hash('verification/milestones/phase17/m2/framework/sb1Qualification.mjs', 'tests/p17-m2-sb1-qualification.mjs'), reasonCodes: ['P17_OFFICIAL_PHYSICS_MUTATION_REPLAY_PENDING'] },
    { id: 'THREE_INDEPENDENT_EXTERNALLY_CUSTODIED_RUNS', readinessStatus: 'BLOCKED', terminalEvidenceStatus: 'BLOCKED', artifactHashes: hash('verification/framework/phase17/appendOnlyRunStore.mjs', 'verification/milestones/phase17/m2/framework/externalTrust.mjs'), reasonCodes: ['P17_EXTERNAL_CUSTODIAN_REGISTRY_REQUIRED', 'P17_THREE_INDEPENDENT_RUNS_NOT_EXECUTED'] },
    { id: 'DETERMINISTIC_PDF_REPRODUCTION_AND_VISUAL_PARITY_AUDIT', readinessStatus: 'READY', terminalEvidenceStatus: 'PENDING', artifactHashes: hash('verification/benchmarks/strix21/reporting/render_p17_m2_sb1_readiness.py', 'tools/render-p17-m2-sb1-readiness.mjs'), reasonCodes: ['P17_SB1_TERMINAL_CASE_REPORT_PENDING'] },
    { id: 'SCOPED_INDEPENDENT_REVIEWER_ATTESTATIONS', readinessStatus: 'BLOCKED', terminalEvidenceStatus: 'BLOCKED', artifactHashes: hash('verification/milestones/phase17/m2/framework/externalTrust.mjs', 'verification/specs/phase17/reviewer-attestation-schema.json'), reasonCodes: ['P17_INDEPENDENT_REVIEWER_ATTESTATIONS_REQUIRED'] },
  ];
}

function hashImplementationFiles(repoRoot) {
  const paths = [
    'verification/milestones/phase17/m2/framework/officialExecutionOrchestrator.mjs',
    'verification/specs/phase17/official-execution-receipt-schema.json',
    'verification/milestones/phase17/m2/framework/externalTrust.mjs',
    'verification/specs/phase17/external-custodian-trust-registry-schema.json',
    'verification/benchmarks/strix21/trust/external-custodian-trust-registry.json',
    'verification/milestones/phase17/m2/framework/referenceByteAudit.mjs',
    'verification/framework/phase17/resultExtractor.mjs',
    'verification/framework/phase17/comparisonEvaluator.mjs',
    'verification/milestones/phase17/m2/framework/replayQualification.mjs',
    'verification/milestones/phase17/m2/framework/sb1Qualification.mjs',
    'tests/p17-m2-sb1-qualification.mjs',
    'verification/framework/phase17/appendOnlyRunStore.mjs',
    'verification/benchmarks/strix21/reporting/render_p17_m2_sb1_readiness.py',
    'tools/render-p17-m2-sb1-readiness.mjs',
    'verification/specs/phase17/reviewer-attestation-schema.json',
  ];
  return Object.fromEntries(paths.map((artifactPath) => [artifactPath, sha256(readFileSync(path.join(repoRoot, ...artifactPath.split('/'))))]));
}

function buildPendingSignoff() {
  const roles = ['owner', 'modelReviewer', 'referenceReviewer', 'numericalReviewer', 'releaseReviewer'];
  return {
    schemaVersion: 'p17-review-signoff-v1', caseId: 'SB1', status: 'IN_REVIEW', releaseAllowed: false, runId: null, terminalStatus: 'BLOCKED_QUALIFICATION',
    reviewerApprovals: roles.map((role) => ({ role, assignment: `${role.toUpperCase()}_EXTERNAL_ASSIGNMENT_REQUIRED`, status: 'NOT_STARTED', approvalHash: null })),
    approvedArtifactHashes: [], approvedArtifacts: [], signoffHash: null,
    reasonCodes: ['P17_INDEPENDENT_REVIEWER_ATTESTATIONS_REQUIRED', 'P17_OFFICIAL_EXECUTION_NOT_AUTHORIZED'],
  };
}

function buildModelingNotes(modelProposalHash) {
  return `# SB1 P17-M2 modeling notes R1\n\nStatus: CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL\n\n- Geometry: one 3.0 m member from N1 to N2 along global +X.\n- Support: N1 fixed in all six DOFs; N2 free.\n- Load: 1 kN at N2 along global -Z; self-weight off.\n- Material: E=26,700 MPa, nu=0.2, G=11,125 MPa.\n- Section: 0.3 x 0.5 m rectangle, A=0.15 m2, Iy=0.001125 m4, Iz=0.003125 m4.\n- Formulation: S-Structures in-house linear 3D frame with shear deformation disabled and geometric stiffness off.\n- Axis routing: member local x is global +X; strong Iz is used for global Z bending and global My reaction.\n- Non-controlling values: J and shear areas satisfy the 3D product schema but do not affect this pure-bending, no-shear case.\n- Product extraction is identity-only in m, rad, kN and kN-m; published STRIX values are converted before execution.\n- MIDAS R4 model/export is unavailable and must not be claimed.\n- Model proposal hash: ${modelProposalHash}\n\nNo solver or benchmark was executed while creating this lock revision. Independent model/release attestations remain required.\n`;
}

function sourceTranscription() {
  return `# SB1 source transcription R1\n\nStatus: CONTENT_LOCKED_PENDING_EXTERNAL_REVIEW\n\n## Source custody\n\n- HTML: STRIX-verification-21/html/SB1.html, engine publication snapshot v1.0.4.\n- Case PDF: STRIX-verification-21/reports/SB1.pdf, engine narrative v1.0.2, 2 pages.\n- Manual: STRIX-verification-21/documents/StrixVerificationManual.pdf, printed pages 1-2.\n- Raw records/SB1.json and evidence archive SHA remain unpublished; STRIX R4 rerun is therefore unavailable.\n\n## Geometry, material and loading\n\n- Cantilever length L = 3000 mm.\n- Rectangular section b x h = 300 x 500 mm.\n- Area A = 150000 mm2.\n- Strong inertia Iz = 3.125e9 mm4.\n- Weak inertia Iy = 1.125e9 mm4.\n- Elastic modulus E = 26700 MPa.\n- Poisson ratio nu = 0.2.\n- N1 fixed in 6 DOFs.\n- N2 load Fz = -1000 N.\n- Self-weight off; linear static analysis.\n\n## Independent closed form\n\n- tip uz = -P*L^3/(3*E*I) = -0.10786516853932584 mm at full precision.\n- tip ry = +P*L^2/(2*E*I) = 5.393258426966292e-5 rad at full precision.\n- support Rz = +1000 N.\n- support My = -3000000 N-mm.\n\n## STRIX published display values\n\n- N2.uz = -0.107865 mm.\n- N2.ry = 5.3933e-5 rad.\n- N1.Fz = +1000 N.\n- N1.My = -3e6 N-mm.\n- Published tolerance = 1%; P17-M2 proposed qualification tolerance = 0.01% and remains externally unapproved.\n\nThe HTML and both PDF pages were checked by byte hash and visual rendering. This transcription does not claim a STRIX R4 rerun or MIDAS result.\n`;
}

function artifact(artifactId, artifactPath, record, mimeType, sourceLocator, role) {
  return { artifactId, path: artifactPath, sha256: record.sha256, byteLength: record.byteLength, mimeType, sourceLocator, role };
}

function documentBinding(artifactPath, value) {
  const serialized = serializeP17M2Sb1Document(value);
  const bytes = Buffer.from(serialized, 'utf8');
  return {
    role: artifactRole(artifactPath),
    path: artifactPath,
    canonicalHash: typeof value === 'string' ? null : sha256Canonical(value),
    sha256: sha256(bytes),
    byteLength: bytes.length,
  };
}

function artifactRole(artifactPath) {
  return path.basename(artifactPath).replace(/-r1\.(?:json|md)$/u, '').replace(/[^A-Za-z0-9]+/gu, '_').toUpperCase();
}

function readJson(repoRoot, relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8'));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function packageError(code, message) {
  return Object.assign(new Error(message), { code });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

