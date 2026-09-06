import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertJsonSchema, validateSchemaDefinition } from './jsonSchemaStrict.mjs';
import {
  CUSTOM_CASE_ID,
  GENERATED_JSON_MANIFESTS,
  MANIFEST_SCHEMA_FILES,
  M1_REASON_CODES,
  MODEL_EQUIVALENCE_DIMENSIONS,
  OFFICIAL_CASE_IDS,
  PRODUCT_SERVICE_BINDING,
  REQUIRED_CASE_RELATIVE_FILES,
  REVIEW_ROLES,
} from './constants.mjs';
import { assertRepoRelativePath, assertSha256, assertStrictJson, sha256Canonical } from './canonical.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.resolve(MODULE_DIR, '..', '..', 'specs', 'phase17');
const REFERENCE_LANES = Object.freeze(['PRIMARY_INDEPENDENT', 'STRIX_PUBLISHED', 'STRIX_R4', 'MIDAS_R4']);
const CAPTURE_KINDS = Object.freeze(['MODEL', 'SUPPORTS_LOADS_AXES', 'ANALYSIS_RESULT', 'COMPARISON']);
const RFC6901_JSON_POINTER_PATTERN = /^(?:\/(?:[^~/]|~[01])*)*$/u;
const SEALED_M0_CLOSURE_HASH = '4b0b748eadad0d48b2ffa80f9dbae7d37b2d4c1a808b4390fae1b9bc7abae224';
const HASH_BINDING_FILES = Object.freeze({
  sourceManifest: 'source/source-manifest.json',
  referenceManifest: 'reference/reference-manifest.json',
  toleranceManifest: 'reference/tolerance-manifest.json',
  probeManifest: 'reference/probe-manifest.json',
  canonicalModel: 'model/canonical-input.json',
  modelMapping: 'model/model-equivalence.json',
  nativeModel: 'model/sstructures-input.json',
});

const schemaCache = new Map();

export function validateManifestDocument(kind, value, options = {}) {
  const schemaFile = MANIFEST_SCHEMA_FILES[kind];
  if (!schemaFile) throw new Error(`Unknown Phase 17 manifest kind: ${kind}`);
  assertStrictJson(value, kind);
  assertJsonSchema(loadSchema(schemaFile), value, `${kind} (${schemaFile})`);
  applySemanticValidation(kind, value, options);
  return value;
}

export function assertRfc6901JsonPointer(value, label = 'jsonPointer') {
  if (typeof value !== 'string' || !RFC6901_JSON_POINTER_PATTERN.test(value)) {
    throw new Error(`${label} must be an RFC 6901 JSON Pointer with only ~0 and ~1 escapes.`);
  }
  return value;
}

export function assertCaseDirectoryContract(caseDirectory, { repoRoot, expectedCaseId, m1Scaffold = true } = {}) {
  const resolvedCaseDirectory = path.resolve(caseDirectory);
  const resolvedRepoRoot = path.resolve(repoRoot || path.join(resolvedCaseDirectory, '..', '..', '..', '..', '..'));
  const caseId = expectedCaseId || path.basename(resolvedCaseDirectory);
  assertSafeDirectoryInside(resolvedRepoRoot, resolvedCaseDirectory, `${caseId} case directory`);
  const missing = REQUIRED_CASE_RELATIVE_FILES.filter((relativePath) => !existsSync(path.join(resolvedCaseDirectory, ...relativePath.split('/'))));
  if (missing.length) throw new Error(`${caseId} scaffold is missing required files: ${missing.join(', ')}`);
  for (const relativePath of REQUIRED_CASE_RELATIVE_FILES) {
    assertRegularFileInside(resolvedRepoRoot, path.join(resolvedCaseDirectory, ...relativePath.split('/')), `${caseId}/${relativePath}`);
  }
  if (m1Scaffold) assertExactCaseInventory(resolvedCaseDirectory, caseId);

  const documents = {};
  for (const [relativePath, kind] of Object.entries(GENERATED_JSON_MANIFESTS)) {
    const value = readJson(path.join(resolvedCaseDirectory, ...relativePath.split('/')));
    validateManifestDocument(kind, value, { m1Scaffold });
    if (value.caseId !== caseId) throw new Error(`${relativePath} caseId ${value.caseId} does not match folder ${caseId}.`);
    documents[kind] = value;
  }

  const manifest = documents.caseManifest;
  const relativeCaseRoot = manifest.officialSuiteMember
    ? `verification/benchmarks/strix21/cases/${caseId}`
    : `verification/benchmarks/strix21/custom/${caseId}`;
  for (const [bindingName, relativePath] of Object.entries(HASH_BINDING_FILES)) {
    const binding = manifest.artifactBindings[bindingName];
    const expectedPath = `${relativeCaseRoot}/${relativePath}`;
    if (binding.path !== expectedPath) throw new Error(`${caseId} ${bindingName}.path must equal ${expectedPath}.`);
    const actualHash = sha256Canonical(readJson(path.join(resolvedCaseDirectory, ...relativePath.split('/'))));
    if (binding.sha256 !== actualHash) throw new Error(`${caseId} ${bindingName}.sha256 does not match ${relativePath}.`);
  }

  const sourceDocumentHash = sha256Canonical(documents.sourceManifest);
  if (documents.referenceManifest.sourceManifestBinding.path !== `${relativeCaseRoot}/source/source-manifest.json`
    || documents.referenceManifest.sourceManifestBinding.sha256 !== sourceDocumentHash) {
    throw new Error(`${caseId} reference manifest is not bound to the immutable source manifest.`);
  }
  const expectedValuesHash = sha256Canonical(documents.expectedValues);
  if (documents.referenceManifest.expectedValuesPath !== `${relativeCaseRoot}/reference/expected-values.json`
    || documents.referenceManifest.expectedValuesHash !== expectedValuesHash) {
    throw new Error(`${caseId} reference manifest is not bound to expected-values.json.`);
  }

  const sourceLockBinding = manifest.artifactBindings.sourceLock;
  if (manifest.officialSuiteMember) {
    assertRepoRelativePath(sourceLockBinding.path, `${caseId}.sourceLock.path`);
    const sourceLockPath = path.resolve(resolvedRepoRoot, ...sourceLockBinding.path.split('/'));
    assertRegularFileInside(resolvedRepoRoot, sourceLockPath, `${caseId} source lock`);
    const sourceLock = readJson(sourceLockPath);
    const sourceLockCore = Object.fromEntries(Object.entries(sourceLock).filter(([key]) => key !== 'sourceLockHash'));
    const computedSourceLockHash = sha256Canonical(sourceLockCore);
    if (sourceLock.caseId !== caseId || sourceLock.sourceLockHash !== computedSourceLockHash || sourceLockBinding.sha256 !== computedSourceLockHash) {
      throw new Error(`${caseId} source-lock binding does not match the locked R2 artifact.`);
    }
    if (documents.sourceManifest.custodyBinding.sourceLockPath !== sourceLockBinding.path
      || documents.sourceManifest.custodyBinding.sourceLockHash !== sourceLockBinding.sha256) {
      throw new Error(`${caseId} source manifest and case manifest disagree on the R2 source-lock binding.`);
    }
  } else if (sourceLockBinding.path !== null || sourceLockBinding.sha256 !== null) {
    throw new Error(`${caseId} custom scaffold must not bind an official source lock.`);
  }

  const runnerText = readFileSync(path.join(resolvedCaseDirectory, 'runner', 'run.mjs'), 'utf8');
  const expectedRunnerText = `${'import'} { runP17CaseCli } from '../../../../../runners/run-p17-case.mjs';\n\nawait runP17CaseCli({ expectedCaseId: '${caseId}', invokedUrl: import.meta.url });\n`;
  if (runnerText !== expectedRunnerText) {
    throw new Error(`${caseId} runner wrapper is not bound to the shared public case runner.`);
  }
  const testText = readFileSync(path.join(resolvedCaseDirectory, 'tests', 'case-contract.mjs'), 'utf8');
  const expectedTestText = `${'import'} { runP17CaseContract } from '../../../../../tests/phase17/run-case-contract.mjs';\n\nawait runP17CaseContract({ expectedCaseId: '${caseId}', invokedUrl: import.meta.url });\n`;
  if (testText !== expectedTestText) {
    throw new Error(`${caseId} test wrapper is not bound to the shared case-contract test.`);
  }

  return {
    caseId,
    officialSuiteMember: manifest.officialSuiteMember,
    manifestHash: sha256Canonical(manifest),
    requiredFileCount: REQUIRED_CASE_RELATIVE_FILES.length,
  };
}

export function assertSuiteScaffold(repoRoot, { m1Scaffold = true } = {}) {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const suiteRoot = path.join(resolvedRepoRoot, 'verification', 'benchmarks', 'strix21');
  assertSafeDirectoryInside(resolvedRepoRoot, suiteRoot, 'STRIX 21 suite directory');
  const suiteManifestPath = path.join(suiteRoot, 'suite-manifest.json');
  const registryPath = path.join(suiteRoot, 'suite-source-registry-r2.json');
  const m0ClosurePath = path.join(resolvedRepoRoot, 'verification', 'evidence', 'validation', 'phase17', 'p17-m0-validation-closure-r3.json');
  assertRegularFileInside(resolvedRepoRoot, suiteManifestPath, 'suite manifest');
  assertRegularFileInside(resolvedRepoRoot, registryPath, 'R2 source registry');
  assertRegularFileInside(resolvedRepoRoot, m0ClosurePath, 'sealed P17-M0 closure');
  const suite = readJson(suiteManifestPath);
  validateManifestDocument('suiteManifest', suite, { m1Scaffold });
  const registry = readJson(registryPath);
  const registryCore = Object.fromEntries(Object.entries(registry).filter(([key]) => key !== 'registryHash'));
  const computedRegistryHash = sha256Canonical(registryCore);
  if (registry.registryHash !== computedRegistryHash || suite.sourceRegistryBinding.registryHash !== computedRegistryHash) throw new Error('Suite registryHash binding mismatch.');
  const m0Closure = readJson(m0ClosurePath);
  const m0ClosureCore = Object.fromEntries(Object.entries(m0Closure).filter(([key]) => key !== 'closureHash'));
  if (m0Closure.closureHash !== SEALED_M0_CLOSURE_HASH || sha256Canonical(m0ClosureCore) !== SEALED_M0_CLOSURE_HASH) throw new Error('P17-M0 closure trust anchor mismatch.');
  const sealedRegistry = m0Closure.evidenceChain?.registry;
  const registryBytes = readFileSync(registryPath);
  if (sealedRegistry?.path !== 'verification/benchmarks/strix21/suite-source-registry-r2.json'
    || sealedRegistry?.registryHash !== computedRegistryHash
    || sealedRegistry?.byteLength !== registryBytes.byteLength
    || sealedRegistry?.sha256 !== createHash('sha256').update(registryBytes).digest('hex')) {
    throw new Error('R2 source registry no longer matches the sealed P17-M0 closure binding.');
  }
  if (!sameOrder(registry.officialOrder, OFFICIAL_CASE_IDS)) throw new Error('R2 source registry official order differs from the Phase 17 contract.');
  assertExactCaseLane(path.join(suiteRoot, 'cases'), OFFICIAL_CASE_IDS, 'official case lane');
  assertExactCaseLane(path.join(suiteRoot, 'custom'), [CUSTOM_CASE_ID], 'custom case lane');

  const cases = suite.cases.map((entry) => {
    const caseDirectory = path.resolve(resolvedRepoRoot, ...entry.folder.split('/'));
    const summary = assertCaseDirectoryContract(caseDirectory, { repoRoot: resolvedRepoRoot, expectedCaseId: entry.caseId, m1Scaffold });
    if (summary.manifestHash !== entry.manifestHash) throw new Error(`${entry.caseId} suite manifest hash binding mismatch.`);
    return summary;
  });
  const customCases = suite.customCases.map((entry) => {
    const caseDirectory = path.resolve(resolvedRepoRoot, ...entry.folder.split('/'));
    const summary = assertCaseDirectoryContract(caseDirectory, { repoRoot: resolvedRepoRoot, expectedCaseId: entry.caseId, m1Scaffold });
    if (summary.manifestHash !== entry.manifestHash) throw new Error(`${entry.caseId} custom suite manifest hash binding mismatch.`);
    return summary;
  });
  return { suite, cases, customCases };
}

function applySemanticValidation(kind, value, options) {
  switch (kind) {
    case 'suiteManifest': return validateSuite(value, options);
    case 'caseManifest': return validateCaseManifest(value, options);
    case 'sourceManifest': return validateSourceManifest(value, options);
    case 'canonicalInput': return validateCanonicalInput(value, options);
    case 'sstructuresInput': return validateSStructuresInput(value, options);
    case 'modelEquivalence': return validateModelEquivalence(value, options);
    case 'referenceManifest': return validateReferenceManifest(value, options);
    case 'expectedValues': return validateExpectedValues(value, options);
    case 'toleranceManifest': return validateTolerance(value, options);
    case 'probeManifest': return validateProbes(value, options);
    case 'runRecord': return validateRunRecord(value);
    case 'caseEvidence': return validateCaseEvidence(value);
    case 'comparison': return validateComparison(value);
    case 'captureIndex': return validateCaptureIndex(value, options);
    case 'reportManifest': return validateReportManifest(value, options);
    case 'reviewSignoff': return validateReviewSignoff(value, options);
    default: throw new Error(`No semantic validator registered for ${kind}.`);
  }
}

function validateSuite(value, { m1Scaffold = false } = {}) {
  if (!sameOrder(value.officialOrder, OFFICIAL_CASE_IDS)) throw new Error('Suite officialOrder must match the manual order exactly.');
  if (!sameOrder(value.cases.map((entry) => entry.caseId), OFFICIAL_CASE_IDS)) throw new Error('Suite cases must match officialOrder exactly.');
  assertUniqueBy(value.cases, (entry) => entry.ordinal, 'suite case ordinal');
  value.cases.forEach((entry, index) => {
    if (entry.ordinal !== index + 1) throw new Error(`${entry.caseId} ordinal must be ${index + 1}.`);
  });
  if (value.customCases.length !== 1 || value.customCases[0].caseId !== CUSTOM_CASE_ID || value.customCases[0].officialSuiteMember !== false) {
    throw new Error('P3S2-SS must be the only custom case and must be excluded from the official denominator.');
  }
  const summary = value.resultSummary;
  if (summary.passCount + summary.failCount + summary.blockedCount > summary.terminalCaseCount) {
    throw new Error('Suite terminal result counts exceed terminalCaseCount.');
  }
  if (m1Scaffold) {
    if (value.milestone !== 'P17-M1' || value.frameworkStatus !== 'CONTRACT_READY_NO_BENCHMARK_RUNS' || value.benchmarkExecutionPolicy !== 'NO_BENCHMARK_EXECUTION_IN_P17_M1') {
      throw new Error('M1 suite scaffold must declare the no-benchmark framework-only policy.');
    }
    if (Object.values(summary).some((count) => count !== 0) || value.cases.some((entry) => entry.status !== 'NOT_STARTED') || value.customCases.some((entry) => entry.status !== 'NOT_STARTED')) {
      throw new Error('M1 suite scaffold must contain zero executions and zero terminal claims.');
    }
    requireReason(value.reasonCodes, M1_REASON_CODES.frameworkOnly, 'suite manifest');
  }
}

function validateCaseManifest(value, { m1Scaffold = false } = {}) {
  const officialIndex = OFFICIAL_CASE_IDS.indexOf(value.caseId);
  const official = officialIndex >= 0;
  if (official) {
    if (!value.officialSuiteMember || value.classification !== 'OFFICIAL_STRIX_21' || value.ordinal !== officialIndex + 1) throw new Error(`${value.caseId} official case identity fields are inconsistent.`);
  } else if (value.caseId === CUSTOM_CASE_ID) {
    if (value.officialSuiteMember || value.classification !== 'S_STRUCTURES_CUSTOM_QUALIFICATION' || value.ordinal !== 0) throw new Error(`${value.caseId} custom case identity fields are inconsistent.`);
  } else {
    throw new Error(`Unknown Phase 17 caseId: ${value.caseId}`);
  }
  if (value.productBinding.serviceVersion !== PRODUCT_SERVICE_BINDING.serviceVersion || value.productBinding.adapterVersion !== PRODUCT_SERVICE_BINDING.adapterVersion || value.productBinding.publicEntrypoint !== PRODUCT_SERVICE_BINDING.publicEntrypoint) {
    throw new Error(`${value.caseId} product binding must use the approved public product service contract.`);
  }
  for (const role of REVIEW_ROLES) validateApproval(value.roles[role], `${value.caseId}.roles.${role}`);
  for (const [name, binding] of Object.entries(value.artifactBindings)) {
    if (binding.sha256 === null || binding.path === null) {
      if (!binding.reasonCodes.length) throw new Error(`${value.caseId}.${name} null binding requires a reason code.`);
      if (binding.status === 'LOCKED' || binding.status === 'MODEL_LOCKED') throw new Error(`${value.caseId}.${name} cannot be locked with a null path/hash.`);
    } else {
      assertRepoRelativePath(binding.path, `${value.caseId}.${name}.path`);
      assertSha256(binding.sha256, `${value.caseId}.${name}.sha256`);
    }
  }
  if (m1Scaffold) {
    const statuses = value.statuses;
    const expected = {
      modelStatus: 'NOT_STARTED', sstructuresRunStatus: 'NOT_RUN_M1_FRAMEWORK_ONLY', independentQualificationStatus: 'NOT_STARTED',
      strixComparisonStatus: 'NOT_RUN_M1_FRAMEWORK_ONLY', midasComparisonStatus: 'NOT_RUN_M1_FRAMEWORK_ONLY',
      performanceComparisonStatus: 'NOT_RUN_M1_FRAMEWORK_ONLY', reportStatus: 'NOT_STARTED', releaseStatus: 'NOT_STARTED',
    };
    for (const [key, expectedStatus] of Object.entries(expected)) if (statuses[key] !== expectedStatus) throw new Error(`${value.caseId}.${key} must be ${expectedStatus} in M1.`);
    if (value.lifecycle.terminalStatus !== 'NOT_STARTED' || value.lifecycle.wipEligible || value.benchmarkExecutionCount !== 0 || value.supersededRunIds.length) throw new Error(`${value.caseId} M1 scaffold must not carry execution or terminal evidence.`);
    requireReason(value.currentTerminalReasonCodes, M1_REASON_CODES.frameworkOnly, `${value.caseId} manifest`);
    if (Object.values(value.roles).some((role) => role.status !== 'NOT_STARTED' || role.approvalHash !== null)) throw new Error(`${value.caseId} M1 roles must remain unsigned.`);
  }
}

function validateSourceManifest(value, { m1Scaffold = false } = {}) {
  const official = OFFICIAL_CASE_IDS.includes(value.caseId);
  if (value.officialSuiteMember !== official) throw new Error(`${value.caseId} source officialSuiteMember mismatch.`);
  if (official && (!value.custodyBinding.sourceLockPath || !value.custodyBinding.sourceLockHash)) throw new Error(`${value.caseId} official source manifest requires the R2 source-lock binding.`);
  if (!official && (value.custodyBinding.sourceLockPath !== null || value.custodyBinding.sourceLockHash !== null)) throw new Error(`${value.caseId} custom source must not bind an official source lock.`);
  if (value.status === 'LOCKED') {
    if (value.extraction.status !== 'COMPLETE' || ['NONE_M1', 'M0_SOURCE_LOCK_BINDING'].includes(value.extraction.method) || !value.extraction.artifacts.length) throw new Error(`${value.caseId} locked source requires completed extraction and at least one byte-bound source artifact.`);
    if (value.transcription.status !== 'COMPLETE' || value.transcription.valueCount < 1 || value.reasonCodes.length) throw new Error(`${value.caseId} locked source requires a completed non-empty transcription and no blocker reasons.`);
  } else if (!value.reasonCodes.length) throw new Error(`${value.caseId} non-locked source requires an explicit reason code.`);
  assertUniqueBy(value.extraction.artifacts, (row) => row.path, `${value.caseId} source artifact path`);
  assertUniqueBy(value.extraction.artifacts, (row) => row.role, `${value.caseId} source artifact role`);
  for (const row of value.extraction.artifacts) assertRepoRelativePath(row.path, `${value.caseId}.source.${row.role}.path`);
  if (m1Scaffold && value.transcription.valueCount !== 0) throw new Error(`${value.caseId} M1 transcription must contain zero values.`);
}

function validateCanonicalInput(value, { m1Scaffold = false } = {}) {
  if (value.artifactStatus === 'MODEL_LOCKED') {
    if (value.payloadAbsent || !value.releaseAllowed || value.silentDefaults.status !== 'LOCKED' || !value.entities.nodes.length || !value.entities.elements.length || !value.entities.analysisCases.length || value.reasonCodes.length) {
      throw new Error(`${value.caseId} locked canonical input requires a present/releasable model, locked defaults, nodes/elements/analysis case and no blocker reasons.`);
    }
  }
  if (m1Scaffold) {
    if (value.artifactStatus !== 'NOT_PREPARED' || !value.payloadAbsent || value.releaseAllowed) throw new Error(`${value.caseId} canonical input must be fail-closed in M1.`);
    if (Object.values(value.entities).some((items) => items.length) || value.silentDefaults.items.length || value.silentDefaults.status !== 'NOT_LOCKED') throw new Error(`${value.caseId} M1 canonical input must not contain a model payload.`);
  }
}

function validateSStructuresInput(value, { m1Scaffold = false } = {}) {
  if (value.artifactStatus === 'MODEL_LOCKED' && (value.payloadAbsent || !value.releaseAllowed || value.productProjectSchemaVersion !== '6' || !Object.keys(value.payload).length || value.reasonCodes.length)) {
    throw new Error(`${value.caseId} locked native input requires a present/releasable schema-v6 product payload and no blocker reasons.`);
  }
  if (m1Scaffold && (value.artifactStatus !== 'NOT_PREPARED' || !value.payloadAbsent || value.releaseAllowed || value.productProjectSchemaVersion !== 'NOT_BOUND' || Object.keys(value.payload).length)) {
    throw new Error(`${value.caseId} native input must be an explicit payload-absent M1 artifact.`);
  }
}

function validateModelEquivalence(value, { m1Scaffold = false } = {}) {
  if (!sameOrder(value.dimensions.map((row) => row.id), MODEL_EQUIVALENCE_DIMENSIONS)) throw new Error(`${value.caseId} model-equivalence dimensions must match the 12-item contract.`);
  if (value.artifactStatus === 'LOCKED') {
    if (value.payloadAbsent || !value.releaseAllowed) throw new Error(`${value.caseId} locked model equivalence requires a present, releasable payload.`);
    if (!value.modelBindings || !value.approval || value.approval.status !== 'APPROVED' || !value.approval.approvalHash) throw new Error(`${value.caseId} locked model equivalence requires model bindings and pre-run approval.`);
    if (!['IDENTICAL_SPECIFICATION', 'ENGINEERING_EQUIVALENT'].includes(value.overallStatus)) throw new Error(`${value.caseId} runnable model equivalence cannot be analogous or unsupported.`);
    const custom = value.dimensions.some((row) => row.strix === 'NOT_APPLICABLE_CUSTOM');
    const unresolvedMandatory = value.dimensions.filter((row) => row.mandatory && (
      !['IDENTICAL_SPECIFICATION', 'ENGINEERING_EQUIVALENT'].includes(row.status)
      || row.sstructures !== 'LOCKED'
      || (custom ? row.strix !== 'NOT_APPLICABLE_CUSTOM' : row.strix !== 'LOCKED')
    ));
    if (unresolvedMandatory.length) throw new Error(`${value.caseId} has unresolved mandatory model-equivalence dimensions: ${unresolvedMandatory.map((row) => row.id).join(', ')}.`);
    if (value.knownDifferences.some((row) => row.classification !== 'KNOWN_EQUIVALENT')) throw new Error(`${value.caseId} runnable model equivalence cannot contain analogous or blocking differences.`);
  }
  if (m1Scaffold) {
    if (value.artifactStatus !== 'NOT_PREPARED' || !value.payloadAbsent || value.releaseAllowed || value.overallStatus !== 'NOT_STARTED' || value.knownDifferences.length || value.modelBindings !== undefined || value.approval !== undefined) throw new Error(`${value.caseId} model-equivalence scaffold must be fail-closed.`);
    if (value.dimensions.some((row) => !row.mandatory || row.status !== 'NOT_STARTED' || row.sstructures !== 'NOT_REVIEWED' || row.midas !== 'NOT_AVAILABLE')) throw new Error(`${value.caseId} M1 model-equivalence rows must remain unreviewed.`);
  }
}

function validateReferenceManifest(value, { m1Scaffold = false } = {}) {
  if (!sameSet(value.lanes.map((lane) => lane.id), REFERENCE_LANES)) throw new Error(`${value.caseId} reference manifest must contain the four separate lanes exactly once.`);
  for (const lane of value.lanes) {
    if ((lane.status === 'NOT_LOCKED' || lane.status === 'NOT_AVAILABLE' || lane.status.startsWith('BLOCKED')) && !lane.reasonCodes.length) throw new Error(`${value.caseId}.${lane.id} unlocked lane requires a reason code.`);
  }
  validateApproval(value.approval, `${value.caseId}.reference.approval`);
  const primary = value.lanes.find((lane) => lane.id === 'PRIMARY_INDEPENDENT');
  if (value.artifactStatus === 'LOCKED' && (value.payloadAbsent || !value.releaseAllowed || value.reasonCodes.length || value.approval.status !== 'APPROVED' || primary?.status !== 'LOCKED' || !primary.artifacts.length || !['R1_R2_EXTERNAL', 'R3_INDEPENDENT_RECONSTRUCTION_REQUIRED'].includes(primary.referenceClass) || !['R1', 'R2', 'R3'].includes(primary.claimEvidenceLevel) || value.lanes.some((lane) => lane.status === 'LOCKED' && (!lane.artifacts.length || lane.reasonCodes.length)))) {
    throw new Error(`${value.caseId} locked reference manifest requires present payload, approval and artifacts for every locked lane.`);
  }
  if (m1Scaffold && (value.artifactStatus !== 'NOT_LOCKED' || !value.payloadAbsent || value.releaseAllowed || value.lanes.some((lane) => lane.status !== 'NOT_LOCKED' || lane.artifacts.length))) throw new Error(`${value.caseId} reference lanes must remain empty and unlocked in M1.`);
}

function validateExpectedValues(value, { m1Scaffold = false } = {}) {
  assertUniqueBy(value.values, (row) => `${row.metricId}\u0000${row.lane}`, `${value.caseId} expected metric lane`);
  if (value.status === 'LOCKED' && !value.values.length) throw new Error(`${value.caseId} locked expected-values cannot be empty.`);
  if (value.status === 'LOCKED' && (value.payloadAbsent || !value.releaseAllowed || value.reasonCodes.length)) throw new Error(`${value.caseId} locked expected-values must declare a present, releasable, blocker-free payload.`);
  if (m1Scaffold && (value.status !== 'NOT_LOCKED' || !value.payloadAbsent || value.releaseAllowed || value.values.length)) throw new Error(`${value.caseId} M1 expected-values must be NOT_LOCKED with values [].`);
}

function validateTolerance(value, { m1Scaffold = false } = {}) {
  assertUniqueBy(value.criteria, (row) => row.metricId, `${value.caseId} tolerance metricId`);
  for (const row of value.criteria) {
    if (row.comparisonMode === 'SIGNED_RELATIVE') {
      if (row.relativeTolerancePct === null || row.absoluteTolerance === null) throw new Error(`${value.caseId}.${row.metricId} signed-relative tolerance requires both relative and near-zero absolute limits.`);
    } else if (row.relativeTolerancePct !== null || row.absoluteTolerance === null) {
      throw new Error(`${value.caseId}.${row.metricId} absolute comparison requires relativeTolerancePct=null and a finite absolute limit.`);
    }
  }
  validateApproval(value.approval, `${value.caseId}.tolerance.approval`);
  if (value.status === 'LOCKED' && (value.payloadAbsent || !value.releaseAllowed || value.reasonCodes.length || !value.criteria.length || value.approval.status !== 'APPROVED' || value.policy.nearZeroPolicy !== 'ABSOLUTE_TOLERANCE')) {
    throw new Error(`${value.caseId} locked tolerance manifest requires approved criteria and a near-zero absolute policy.`);
  }
  if (m1Scaffold && (value.status !== 'NOT_LOCKED' || !value.payloadAbsent || value.releaseAllowed || value.criteria.length || value.policy.nearZeroPolicy !== 'NOT_LOCKED')) throw new Error(`${value.caseId} tolerance criteria must remain absent in M1.`);
}

function validateProbes(value, { m1Scaffold = false } = {}) {
  assertUniqueBy(value.probes, (row) => row.probeId, `${value.caseId} probeId`);
  assertUniqueBy(value.probes, (row) => row.metricId, `${value.caseId} probe metricId`);
  validateApproval(value.approval, `${value.caseId}.probe.approval`);
  if (value.status === 'LOCKED') {
    if (value.payloadAbsent || !value.releaseAllowed || value.reasonCodes.length || !value.probes.length || value.approval.status !== 'APPROVED' || value.signConventionStatus !== 'LOCKED') {
      throw new Error(`${value.caseId} locked probe manifest requires approved probes and sign convention.`);
    }
    assertUniqueBy(value.probes, (row) => row.jsonPointer, `${value.caseId} probe jsonPointer`);
    for (const row of value.probes) {
      assertRfc6901JsonPointer(row.jsonPointer, `${value.caseId}.${row.metricId}.jsonPointer`);
      if (row.extractionOperation !== 'IDENTITY_FINITE_NUMBER') {
        throw new Error(`${value.caseId}.${row.metricId} must use IDENTITY_FINITE_NUMBER extraction.`);
      }
      if (row.approvalHash !== value.approval.approvalHash) {
        throw new Error(`${value.caseId}.${row.metricId} must bind the locked probe approval hash.`);
      }
    }
  }
  if (m1Scaffold && (value.status !== 'NOT_LOCKED' || !value.payloadAbsent || value.releaseAllowed || value.probes.length || value.signConventionStatus !== 'NOT_LOCKED')) throw new Error(`${value.caseId} probes must remain absent in M1.`);
}

function validateRunRecord(value) {
  const core = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'runRecordHash'));
  if (sha256Canonical(core) !== value.runRecordHash) throw new Error(`${value.caseId}/${value.runId} runRecordHash does not match canonical run-record content.`);
  if (value.engineeringResultHash === null && !value.reasonCodes.length) throw new Error(`${value.caseId}/${value.runId} null engineeringResultHash requires a reason code.`);
  if (value.status === 'EXECUTED' && value.engineeringResultHash === null) throw new Error(`${value.caseId}/${value.runId} executed record requires engineeringResultHash.`);
  const provenance = value.productBinding.executionProvenance;
  if (provenance.mode === 'OFFICIAL_PUBLIC_SERVICE') {
    if (
      provenance.terminalQualificationEligible !== true
      || provenance.serviceOrigin !== 'PUBLIC_FACTORY'
      || provenance.callerServiceInjected
      || provenance.callerServiceFactoryInjected
      || provenance.callerCaseRunnerInjected
      || provenance.caseRunnerBinding !== 'PUBLIC_RUN_ANALYSIS_CASE_ASYNC'
      || provenance.publicEntrypoint !== 'src/index.js'
      || provenance.testFixtureId !== null
      || provenance.testProvenance !== null
    ) {
      throw new Error(`${value.caseId}/${value.runId} official run provenance must prove the non-injected public factory and public case-runner binding.`);
    }
  } else {
    const exactlyOneServiceInjection = Number(provenance.callerServiceInjected) + Number(provenance.callerServiceFactoryInjected) === 1;
    const serviceOriginValid = provenance.callerServiceInjected
      ? provenance.serviceOrigin === 'TEST_ONLY_SERVICE_INSTANCE'
      : provenance.serviceOrigin === 'TEST_ONLY_SERVICE_FACTORY';
    const caseRunnerBindingValid = provenance.callerCaseRunnerInjected
      ? provenance.caseRunnerBinding === 'TEST_ONLY_CALLER_CASE_RUNNER'
      : provenance.caseRunnerBinding === 'TEST_ONLY_SERVICE_OWNED';
    if (
      provenance.mode !== 'TEST_ONLY_INJECTED'
      || provenance.terminalQualificationEligible
      || !serviceOriginValid
      || !exactlyOneServiceInjection
      || !caseRunnerBindingValid
      || provenance.publicEntrypoint !== 'src/index.js'
      || provenance.testFixtureId === null
      || provenance.testProvenance === null
      || provenance.testFixtureId !== provenance.testProvenance.fixtureId
      || provenance.testProvenance.solverExecuted !== false
      || provenance.testProvenance.benchmarkExecuted !== false
    ) {
      throw new Error(`${value.caseId}/${value.runId} test-only run provenance is incomplete or internally inconsistent.`);
    }
    if (value.status === 'EXECUTED' || value.engineeringResultHash !== null || !value.reasonCodes.includes('P17_TEST_ONLY_EXECUTION_NOT_QUALIFIABLE')) {
      throw new Error(`${value.caseId}/${value.runId} test-only execution cannot become a terminal qualification record.`);
    }
  }
  assertUniqueBy(value.artifactHashes, (row) => row.path, `${value.caseId}/${value.runId} artifact path`);
  assertUniqueBy(value.artifactHashes, (row) => row.role, `${value.caseId}/${value.runId} artifact role`);
  for (const row of value.artifactHashes) assertRepoRelativePath(row.path, `${value.caseId}/${value.runId}.${row.role}.path`);
  if (value.status === 'EXECUTED') {
    const requiredRoles = [
      'SOURCE_ARTIFACT', 'SOURCE_MANIFEST', 'CANONICAL_INPUT', 'SSTRUCTURES_INPUT', 'MODEL_EQUIVALENCE',
      'REFERENCE_MANIFEST', 'EXPECTED_VALUES', 'TOLERANCE_MANIFEST', 'PROBE_MANIFEST', 'SOLVER_SETTINGS',
      'PRODUCT_SOURCE', 'PRODUCT_BUILD', 'DEPENDENCY_LOCK', 'ENGINEERING_RESULT',
      'EXTRACTED_ACTUAL_VALUES', 'PROBE_EXTRACTOR',
    ];
    const actualRoles = value.artifactHashes.map((row) => row.role);
    if (!requiredRoles.every((role) => actualRoles.includes(role))) throw new Error(`${value.caseId}/${value.runId} executed record lacks a mandatory immutable artifact role.`);
    if (value.execution.exitCode !== 0 || value.execution.signal !== null) throw new Error(`${value.caseId}/${value.runId} executed record requires clean isolated-process completion.`);
    const engineering = value.artifactHashes.find((row) => row.role === 'ENGINEERING_RESULT');
    if (engineering.sha256 !== value.engineeringResultHash) throw new Error(`${value.caseId}/${value.runId} engineeringResultHash must equal the raw engineering-result artifact hash.`);
  }
}

function validateCaseEvidence(value) {
  const core = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'evidenceHash'));
  if (sha256Canonical(core) !== value.evidenceHash) throw new Error(`${value.caseId}/${value.runId} evidenceHash does not match canonical evidence content.`);
  assertUniqueBy(value.hashChain, (row) => row.ordinal, `${value.caseId}/${value.runId} hash-chain ordinal`);
  assertUniqueBy(value.hashChain, (row) => row.role, `${value.caseId}/${value.runId} hash-chain role`);
  if (value.qualification.passedMetricCount > value.qualification.mandatoryMetricCount) throw new Error(`${value.caseId}/${value.runId} passed metrics exceed mandatory metrics.`);
  const capture = value.captures;
  if (capture.status === 'COMPLETE') {
    if (capture.captureIndexPath === null || capture.captureIndexHash === null || capture.contentSha256 === null) throw new Error(`${value.caseId}/${value.runId} complete captures require document and raw-content bindings.`);
  } else if (capture.captureIndexPath === null || capture.captureIndexHash === null || capture.contentSha256 === null || !capture.reasonCodes.length) throw new Error(`${value.caseId}/${value.runId} blocked captures require an immutable blocked capture-index binding and a reason code.`);
  const comparison = value.comparison;
  if (comparison.status === 'COMPLETE') {
    if (comparison.path === null || comparison.sha256 === null || comparison.contentSha256 === null) throw new Error(`${value.caseId}/${value.runId} complete comparison requires document and raw-content bindings.`);
  } else if (comparison.path !== null || comparison.sha256 !== null || comparison.contentSha256 !== null || !comparison.reasonCodes.length) {
    throw new Error(`${value.caseId}/${value.runId} absent comparison requires null bindings and a reason code.`);
  }
  const custody = value.runCustodyBinding;
  const custodyBindings = [
    custody.runDirectoryPath, custody.integrityManifestPath, custody.integrityHash, custody.directoryHash,
    custody.custodyPayloadHash, custody.storagePolicyVersion, custody.authority, custody.anchorId, custody.keyId,
  ];
  if (custody.status === 'EXTERNAL_SIGNED_ANCHOR_VERIFIED') {
    if (custodyBindings.some((item) => item === null) || custody.reasonCodes.length) throw new Error(`${value.caseId}/${value.runId} external custody requires every post-commit binding and no blocker reason.`);
  } else if (custodyBindings.some((item) => item !== null) || !custody.reasonCodes.length) {
    throw new Error(`${value.caseId}/${value.runId} non-committed evidence must carry no custody assertions and an explicit reason.`);
  }
  if (value.status === 'QUALIFICATION_CANDIDATE') {
    const qualification = value.qualification;
    if (qualification.mandatoryMetricCount === 0 || qualification.passedMetricCount !== qualification.mandatoryMetricCount) throw new Error(`${value.caseId}/${value.runId} qualification candidate requires every mandatory metric.`);
    if (!qualification.physicsGates.some((row) => row.mandatory)) throw new Error(`${value.caseId}/${value.runId} qualification requires at least one mandatory physics gate.`);
    if (!qualification.mutationGates.some((row) => row.mandatory)) throw new Error(`${value.caseId}/${value.runId} qualification requires at least one mandatory mutation gate.`);
    if (qualification.physicsGates.some((row) => row.mandatory && row.status !== 'PASS')) throw new Error(`${value.caseId}/${value.runId} qualification candidate has an unresolved mandatory physics gate.`);
    if (qualification.mutationGates.some((row) => row.mandatory && !['KILLED', 'NOT_APPLICABLE'].includes(row.status))) throw new Error(`${value.caseId}/${value.runId} qualification candidate has a surviving or blocked mandatory mutation.`);
    if (qualification.mutationGates.some((row) => row.mandatory && row.status === 'NOT_APPLICABLE' && !row.reasonCodes.length)) throw new Error(`${value.caseId}/${value.runId} mandatory non-applicable mutation requires an explicit reason.`);
    if (qualification.determinismHashes.length < 3 || !qualification.determinismHashes.every((hash) => hash === qualification.determinismHashes[0])) throw new Error(`${value.caseId}/${value.runId} qualification candidate requires three declared identical engineering-result hashes; M1 still forbids terminal PASS until M2 independent-run replay is implemented.`);
    if (capture.status !== 'COMPLETE' || comparison.status !== 'COMPLETE' || custody.status !== 'EXTERNAL_SIGNED_ANCHOR_VERIFIED') throw new Error(`${value.caseId}/${value.runId} qualified evidence requires complete comparison/captures and externally verified run custody.`);
  } else if (!value.reasonCodes.length) {
    throw new Error(`${value.caseId}/${value.runId} non-qualified evidence requires a reason code.`);
  }
}

function validateComparison(value) {
  const core = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'comparisonHash'));
  if (sha256Canonical(core) !== value.comparisonHash) throw new Error(`${value.caseId}/${value.runId} comparisonHash does not match canonical comparison content.`);
  assertRepoRelativePath(value.actualValuesBinding.path, `${value.caseId}/${value.runId}.actualValuesBinding.path`);
  assertRepoRelativePath(value.actualValuesBinding.extractorPath, `${value.caseId}/${value.runId}.actualValuesBinding.extractorPath`);
  if (value.actualValuesBinding.probeHash !== value.comparisonPolicy.probeHash) throw new Error(`${value.caseId}/${value.runId} comparison probe hash differs from extracted actual-values provenance.`);
  assertUniqueBy(value.metrics, (row) => row.metricId, `${value.caseId}/${value.runId} comparison metricId`);
  for (const row of value.metrics) {
    const relative = row.comparisonMode === 'SIGNED_RELATIVE';
    if (relative && (row.tolerance.relativePct === null || row.tolerance.absolute === null)) throw new Error(`${value.caseId}/${value.runId}/${row.metricId} signed-relative comparison lacks its relative or near-zero absolute tolerance.`);
    if (!relative && (row.tolerance.relativePct !== null || row.tolerance.absolute === null || row.signedErrorPct !== null)) throw new Error(`${value.caseId}/${value.runId}/${row.metricId} absolute comparison has an invalid tolerance/error shape.`);
    if (row.comparisonMode === 'UNSIGNED_ABSOLUTE' && row.signedDifference !== null) throw new Error(`${value.caseId}/${value.runId}/${row.metricId} unsigned comparison must not carry a signed difference.`);
  }
  const summary = value.summary;
  const mandatory = value.metrics.filter((row) => row.mandatory);
  const exactCounts = {
    passedMetricCount: mandatory.filter((row) => row.status === 'PASS').length,
    failedMetricCount: mandatory.filter((row) => row.status === 'FAIL').length,
    blockedMetricCount: mandatory.filter((row) => row.status === 'BLOCKED_REFERENCE').length,
  };
  if (summary.mandatoryMetricCount !== mandatory.length || Object.entries(exactCounts).some(([key, count]) => summary[key] !== count)) throw new Error(`${value.caseId}/${value.runId} comparison summary does not exactly match mandatory metric rows.`);
  if (value.status === 'PASS') {
    if (!mandatory.length || mandatory.some((row) => row.status !== 'PASS') || summary.passedMetricCount !== summary.mandatoryMetricCount || summary.failedMetricCount || summary.blockedMetricCount) {
      throw new Error(`${value.caseId}/${value.runId} comparison PASS requires every mandatory metric to pass.`);
    }
  } else if (!value.reasonCodes.length) {
    throw new Error(`${value.caseId}/${value.runId} non-PASS comparison requires a reason code.`);
  }
}

function validateCaptureIndex(value, { m1Scaffold = false } = {}) {
  const core = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'captureIndexHash'));
  if (sha256Canonical(core) !== value.captureIndexHash) throw new Error(`${value.caseId} captureIndexHash does not match canonical capture content.`);
  assertUniqueBy(value.captures, (row) => row.ordinal, `${value.caseId} capture ordinal`);
  assertUniqueBy(value.captures, (row) => row.kind, `${value.caseId} capture kind`);
  if (value.status === 'COMPLETE' && (!sameSet(value.captures.map((row) => row.kind), CAPTURE_KINDS) || value.runId === null || value.modelHash === null || value.browser !== 'CHROME')) throw new Error(`${value.caseId} complete capture index requires all four Chrome captures and non-null bindings.`);
  if (value.status === 'COMPLETE' && (value.parityStatus !== 'PASS' || value.captures.some((row) => !row.caseIdVisible || !row.runIdVisible || !row.modelHashVisible || !row.unitsVisible || row.sourceValueParity === 'FAIL'))) {
    throw new Error(`${value.caseId} complete capture index requires visible provenance and successful parity.`);
  }
  if (m1Scaffold && (value.status !== 'NOT_RUN_M1_FRAMEWORK_ONLY' || value.runId !== null || value.modelHash !== null || value.captures.length || value.parityStatus !== 'NOT_RUN_M1_FRAMEWORK_ONLY')) throw new Error(`${value.caseId} M1 capture index must contain no capture artifacts.`);
}

function validateReportManifest(value, { m1Scaffold = false } = {}) {
  const core = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'reportManifestHash'));
  if (sha256Canonical(core) !== value.reportManifestHash) throw new Error(`${value.caseId} reportManifestHash does not match canonical report content.`);
  const bindings = [
    value.evidenceBinding.path,
    value.evidenceBinding.sha256,
    value.comparisonBinding.path,
    value.comparisonBinding.sha256,
    value.captureIndexBinding.path,
    value.captureIndexBinding.sha256,
    value.outputs.markdownPath,
    value.outputs.markdownHash,
    value.outputs.pdfPath,
    value.outputs.pdfHash,
    value.reportSnapshotHash,
  ];
  if (value.status === 'NOT_GENERATED') {
    if (value.runId !== null || bindings.some((item) => item !== null) || !value.reasonCodes.length) {
      throw new Error(`${value.caseId} non-generated report must have null bindings and an explicit reason code.`);
    }
  } else if (value.runId === null || bindings.some((item) => item === null)) {
    throw new Error(`${value.caseId}/${value.runId || 'NO_RUN'} generated report requires immutable input and output bindings.`);
  }
  if (value.solverExecutionAllowed || value.comparisonCalculationAllowed || value.mode !== 'IMMUTABLE_EVIDENCE_ONLY') {
    throw new Error(`${value.caseId} report renderer must remain immutable-evidence-only.`);
  }
  if (m1Scaffold && value.status !== 'NOT_GENERATED') throw new Error(`${value.caseId} M1 report manifest must remain NOT_GENERATED.`);
}

function validateReviewSignoff(value, { m1Scaffold = false } = {}) {
  if (!sameSet(value.reviewerApprovals.map((row) => row.role), REVIEW_ROLES)) throw new Error(`${value.caseId} signoff must contain the five required reviewer roles exactly once.`);
  for (const approval of value.reviewerApprovals) validateApproval(approval, `${value.caseId}.signoff.${approval.role}`);
  if (value.status === 'APPROVED') {
    const requiredRoles = ['SOURCE_MANIFEST', 'CANONICAL_INPUT', 'SSTRUCTURES_INPUT', 'MODEL_EQUIVALENCE', 'REFERENCE_MANIFEST', 'EXPECTED_VALUES', 'TOLERANCE_MANIFEST', 'PROBE_MANIFEST', 'PRODUCT_BUILD', 'RUN_RECORD', 'COMPARISON', 'CASE_EVIDENCE', 'CAPTURE_INDEX', 'REPORT_MANIFEST', 'REPORT_MARKDOWN', 'REPORT_PDF'];
    if (value.reviewerApprovals.some((row) => row.status !== 'APPROVED') || new Set(value.reviewerApprovals.map((row) => row.assignment)).size !== REVIEW_ROLES.length || value.reviewerApprovals.some((row) => row.assignment === 'UNASSIGNED') || new Set(value.reviewerApprovals.map((row) => row.approvalHash)).size !== REVIEW_ROLES.length || value.runId == null || value.terminalStatus !== 'PASS' || !Array.isArray(value.approvedArtifacts) || !sameSet(value.approvedArtifacts.map((row) => row.role), requiredRoles)) throw new Error(`${value.caseId} approved signoff requires five independent scoped approvals, terminal PASS and the complete post-report artifact set.`);
    assertUniqueBy(value.approvedArtifacts, (row) => row.path, `${value.caseId} approved artifact path`);
    if (!sameSet(value.approvedArtifactHashes, value.approvedArtifacts.map((row) => row.sha256))) throw new Error(`${value.caseId} approvedArtifactHashes must exactly match approvedArtifacts.`);
    if (!value.signoffHash) throw new Error(`${value.caseId} approved signoff requires signoffHash.`);
    const core = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'signoffHash'));
    if (sha256Canonical(core) !== value.signoffHash) throw new Error(`${value.caseId} signoffHash does not match canonical signoff content.`);
  } else if (value.releaseAllowed) throw new Error(`${value.caseId} releaseAllowed must remain false before approved signoff.`);
  if (value.releaseAllowed && (value.status !== 'APPROVED' || value.terminalStatus !== 'PASS')) throw new Error(`${value.caseId} releaseAllowed requires an approved terminal PASS signoff.`);
  if (m1Scaffold && (value.status !== 'NOT_STARTED' || value.releaseAllowed || value.approvedArtifactHashes.length || value.reviewerApprovals.some((row) => row.status !== 'NOT_STARTED') || value.runId !== undefined || value.terminalStatus !== undefined || value.approvedArtifacts !== undefined || value.signoffHash !== undefined)) throw new Error(`${value.caseId} M1 signoff must remain unsigned and fail-closed.`);
}

function validateApproval(value, label) {
  if (value.status === 'APPROVED' && value.approvalHash === null) throw new Error(`${label} APPROVED requires approvalHash.`);
  if (value.status !== 'APPROVED' && value.approvalHash !== null) throw new Error(`${label} must not carry approvalHash before approval.`);
}

function assertUniqueBy(values, selector, label) {
  const keys = values.map(selector);
  if (new Set(keys).size !== keys.length) throw new Error(`${label} contains duplicates.`);
}

function requireReason(values, reason, label) {
  if (!values.includes(reason)) throw new Error(`${label} must include reason code ${reason}.`);
}

function sameOrder(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value)) && right.every((value) => left.includes(value));
}

function loadSchema(fileName) {
  if (!schemaCache.has(fileName)) {
    const schema = readJson(path.join(SCHEMA_DIR, fileName));
    const definitionErrors = validateSchemaDefinition(schema);
    if (definitionErrors.length) {
      const detail = definitionErrors.map((error) => `${error.schemaPath || '/'} [${error.keyword}] ${error.message}`).join('\n');
      throw new Error(`${fileName} failed strict schema-definition validation:\n${detail}`);
    }
    schemaCache.set(fileName, schema);
  }
  return schemaCache.get(fileName);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function assertExactCaseInventory(caseDirectory, caseId) {
  const expectedFiles = new Set(REQUIRED_CASE_RELATIVE_FILES);
  const expectedDirectories = new Set();
  for (const relativePath of expectedFiles) {
    const segments = relativePath.split('/');
    for (let index = 1; index < segments.length; index += 1) expectedDirectories.add(segments.slice(0, index).join('/'));
  }
  const actualFiles = [];
  const actualDirectories = [];
  const unsafe = [];
  const visit = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const target = path.join(directory, entry.name);
      const info = lstatSync(target);
      if (info.isSymbolicLink()) unsafe.push(relativePath);
      else if (info.isDirectory()) {
        actualDirectories.push(relativePath);
        visit(target, relativePath);
      } else if (info.isFile()) actualFiles.push(relativePath);
      else unsafe.push(relativePath);
    }
  };
  visit(caseDirectory);
  const extraFiles = actualFiles.filter((item) => !expectedFiles.has(item));
  const extraDirectories = actualDirectories.filter((item) => !expectedDirectories.has(item));
  if (unsafe.length || extraFiles.length || extraDirectories.length) {
    throw new Error(`${caseId} M1 scaffold contains undeclared entries: ${[...unsafe, ...extraFiles, ...extraDirectories].sort().join(', ')}`);
  }
}

function assertExactCaseLane(laneDirectory, expectedCaseIds, label) {
  const laneInfo = lstatSync(laneDirectory);
  if (!laneInfo.isDirectory() || laneInfo.isSymbolicLink()) throw new Error(`${label} must be a real directory.`);
  const entries = readdirSync(laneDirectory, { withFileTypes: true });
  const unsafe = [];
  const actual = [];
  for (const entry of entries) {
    const info = lstatSync(path.join(laneDirectory, entry.name));
    if (!info.isDirectory() || info.isSymbolicLink()) unsafe.push(entry.name);
    else actual.push(entry.name);
  }
  if (unsafe.length || !sameSet(actual, expectedCaseIds)) throw new Error(`${label} does not exactly match its declared cases.`);
}

function assertSafeDirectoryInside(repoRoot, directory, label) {
  const root = realpathSync(path.resolve(repoRoot));
  const target = path.resolve(directory);
  const info = lstatSync(target);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} must be a real directory, not a link/reparse point.`);
  const realTarget = realpathSync(target);
  if (realTarget !== root && !realTarget.startsWith(`${root}${path.sep}`)) throw new Error(`${label} resolves outside the repository root.`);
}

function assertRegularFileInside(repoRoot, filePath, label) {
  const root = realpathSync(path.resolve(repoRoot));
  const target = path.resolve(filePath);
  const info = lstatSync(target);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a regular file, not a link/reparse point.`);
  const realTarget = realpathSync(target);
  if (!realTarget.startsWith(`${root}${path.sep}`)) throw new Error(`${label} resolves outside the repository root.`);
}
