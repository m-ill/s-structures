import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Canonical } from '../verification/framework/phase17/canonical.mjs';
import {
  assertExtractedActualValuesArtifact,
  extractActualValues,
  P17_EXTRACTED_ACTUAL_VALUES_SCHEMA_VERSION,
  P17_RESULT_EXTRACTION_OPERATION,
  P17_RESULT_EXTRACTOR_SOURCE_PATH,
  verifyExtractedActualValuesArtifact,
} from '../verification/framework/phase17/resultExtractor.mjs';
import { evaluateLockedComparison } from '../verification/framework/phase17/comparisonEvaluator.mjs';
import { validateManifestDocument } from '../verification/framework/phase17/manifestValidation.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPROVAL_HASH = 'a'.repeat(64);
const ENGINEERING_RESULT_PATH = 'verification/fixtures/p17-m1-synthetic-engineering-result.json';

const probeManifest = lockedProbeManifest([
  probe('NODE_UX', '/nodes/0/displacements/UX', 'm'),
  probe('ESCAPED_KEY', '/escaped/a~1b/M~0z', 'kN'),
  probe('MATRIX_VALUE', '/matrix/1/0', 'MPa'),
]);
validateManifestDocument('probeManifest', probeManifest);

const resultObject = {
  nodes: [{ displacements: { UX: 0.125 } }],
  escaped: { 'a/b': { 'M~z': -42.5 } },
  matrix: [[1, 2], [3.75, 4]],
};
const rawBytes = Buffer.from(`${JSON.stringify(resultObject, null, 2)}\n`, 'utf8');
const artifact = extractActualValues({
  engineeringResult: rawBytes,
  engineeringResultPath: ENGINEERING_RESULT_PATH,
  probeManifest,
});

assert.equal(artifact.schemaVersion, P17_EXTRACTED_ACTUAL_VALUES_SCHEMA_VERSION);
assert.equal(artifact.caseId, 'SYNTHETIC');
assert.equal(artifact.status, 'EXTRACTED');
assert.equal(artifact.dataOnly, true);
assert.equal(artifact.transformationPolicy, 'NO_TRANSFORM_NO_UNIT_CONVERSION');
assert.equal(artifact.extractorExecutedSolver, false);
assert.equal(artifact.extractorExecutedBenchmark, false);
assert.equal(artifact.engineeringResult.inputKind, 'RAW_UTF8_JSON_BYTES');
assert.equal(artifact.engineeringResult.rawByteLength, rawBytes.byteLength);
assert.equal(artifact.engineeringResult.rawSha256, createHash('sha256').update(rawBytes).digest('hex'));
assert.equal(artifact.probeManifest.canonicalHash, sha256Canonical(probeManifest));
assert.equal(artifact.extractor.sourcePath, P17_RESULT_EXTRACTOR_SOURCE_PATH);
assert.equal(
  artifact.extractor.sourceSha256,
  createHash('sha256').update(await readFile(path.join(REPOSITORY_ROOT, ...P17_RESULT_EXTRACTOR_SOURCE_PATH.split('/')))).digest('hex'),
);
assert.deepEqual(artifact.values.map((row) => [row.metricId, row.sourcePointer, row.value]), [
  ['NODE_UX', '/nodes/0/displacements/UX', 0.125],
  ['ESCAPED_KEY', '/escaped/a~1b/M~0z', -42.5],
  ['MATRIX_VALUE', '/matrix/1/0', 3.75],
]);
assert.ok(artifact.values.every((row) => row.extractionOperation === P17_RESULT_EXTRACTION_OPERATION));
assert.equal(Object.isFrozen(artifact), true);
assert.equal(Object.isFrozen(artifact.values), true);
assert.equal(Object.isFrozen(artifact.values[0]), true);

const verified = verifyExtractedActualValuesArtifact(artifact, {
  engineeringResult: rawBytes,
  probeManifest,
});
assert.deepEqual(verified, { ok: true, errors: [] });
assert.equal(assertExtractedActualValuesArtifact(artifact, { engineeringResult: rawBytes, probeManifest }), artifact);

// Contract-only integration: no solver or benchmark is invoked. The official-shaped
// run record is a synthetic in-memory object used solely to reach the evaluator's
// production provenance boundary; it is never committed as qualification evidence.
const comparisonFixture = comparisonContractFixture(artifact);
validateManifestDocument('runRecord', comparisonFixture.runRecord);
const comparison = evaluateLockedComparison({
  referenceBundle: comparisonFixture.referenceBundle,
  runId: comparisonFixture.runRecord.runId,
  runRecord: comparisonFixture.runRecord,
  actualValuesArtifact: artifact,
  actualValuesPath: comparisonFixture.actualValuesPath,
});
validateManifestDocument('comparison', comparison);
assert.equal(comparison.status, 'PASS');
assert.equal(comparison.summary.mandatoryMetricCount, artifact.metricCount);
assert.equal(comparison.summary.passedMetricCount, artifact.metricCount);
assert.equal(comparison.actualValuesBinding.sha256, artifact.artifactHash);
assert.equal(comparison.actualValuesBinding.contentSha256, sha256Canonical(artifact));
assert.equal(comparison.actualValuesBinding.engineeringResultHash, artifact.engineeringResult.rawSha256);
assert.equal(comparison.actualValuesBinding.probeHash, artifact.probeManifest.canonicalHash);
assert.equal(comparison.actualValuesBinding.extractorPath, artifact.extractor.sourcePath);
assert.equal(comparison.actualValuesBinding.extractorHash, artifact.extractor.sourceSha256);

const artifactHashTamper = structuredClone(artifact);
artifactHashTamper.artifactHash = differentSha256(artifactHashTamper.artifactHash);
assertThrowsCode(
  () => evaluateComparisonFixture(comparisonFixture, artifactHashTamper),
  'P17_ACTUAL_VALUES_ARTIFACT_INVALID',
);

const contentHashTamper = structuredClone(comparison);
contentHashTamper.actualValuesBinding.contentSha256 = differentSha256(contentHashTamper.actualValuesBinding.contentSha256);
assert.throws(
  () => validateManifestDocument('comparison', contentHashTamper),
  /comparisonHash does not match canonical comparison content/u,
);

const probeBindingTamper = rehashExtractedArtifact(artifact, (value) => {
  value.probeManifest.canonicalHash = differentSha256(value.probeManifest.canonicalHash);
});
assertThrowsCode(
  () => evaluateComparisonFixture(comparisonFixture, probeBindingTamper),
  'P17_ACTUAL_VALUES_ARTIFACT_INVALID',
);

const extractorBindingTamper = rehashExtractedArtifact(artifact, (value) => {
  value.extractor.sourceSha256 = differentSha256(value.extractor.sourceSha256);
});
assertThrowsCode(
  () => evaluateComparisonFixture(comparisonFixture, extractorBindingTamper),
  'P17_ACTUAL_VALUES_ARTIFACT_INVALID',
);

const rootManifest = lockedProbeManifest([probe('ROOT_SCALAR', '', 'ratio')]);
const rootArtifact = extractActualValues({
  engineeringResult: 7.25,
  engineeringResultPath: ENGINEERING_RESULT_PATH,
  probeManifest: rootManifest,
});
assert.equal(rootArtifact.engineeringResult.inputKind, 'CANONICAL_JSON_OBJECT_SNAPSHOT');
assert.equal(rootArtifact.values[0].sourcePointer, '');
assert.equal(rootArtifact.values[0].value, 7.25);

const tamperedArtifact = structuredClone(artifact);
tamperedArtifact.values[0].value = 999;
const tamperedAudit = verifyExtractedActualValuesArtifact(tamperedArtifact, {
  engineeringResult: rawBytes,
  probeManifest,
});
assert.equal(tamperedAudit.ok, false);
assert.ok(tamperedAudit.errors.includes('P17_EXTRACTED_ARTIFACT_HASH_MISMATCH'));
assert.ok(tamperedAudit.errors.includes('P17_EXTRACTED_VALUES_REPLAY_MISMATCH'));
assertThrowsCode(
  () => assertExtractedActualValuesArtifact(tamperedArtifact),
  'P17_EXTRACTED_ACTUAL_VALUES_INVALID',
);

const alteredBytes = Buffer.from(rawBytes);
alteredBytes[alteredBytes.indexOf(Buffer.from('0.125'))] = '9'.charCodeAt(0);
const alteredSourceAudit = verifyExtractedActualValuesArtifact(artifact, {
  engineeringResult: alteredBytes,
  probeManifest,
});
assert.equal(alteredSourceAudit.ok, false);
assert.ok(alteredSourceAudit.errors.includes('P17_ENGINEERING_RESULT_BINDING_MISMATCH'));
assert.ok(alteredSourceAudit.errors.includes('P17_EXTRACTED_VALUES_REPLAY_MISMATCH'));

const missingPointerManifest = structuredClone(probeManifest);
delete missingPointerManifest.probes[0].jsonPointer;
assertThrowsCode(
  () => extractWith({}, missingPointerManifest),
  'P17_PROBE_MANIFEST_INVALID',
);

const invalidEscapeManifest = structuredClone(probeManifest);
invalidEscapeManifest.probes[0].jsonPointer = '/nodes~2bad';
assertThrowsCode(
  () => extractWith({}, invalidEscapeManifest),
  'P17_PROBE_MANIFEST_INVALID',
);

const transformManifest = structuredClone(probeManifest);
transformManifest.probes[0].extractionOperation = 'MULTIPLY_BY_1000';
assertThrowsCode(
  () => extractWith({}, transformManifest),
  'P17_PROBE_MANIFEST_INVALID',
);

const duplicateMetricManifest = structuredClone(probeManifest);
duplicateMetricManifest.probes[1].metricId = duplicateMetricManifest.probes[0].metricId;
assertThrowsCode(
  () => extractWith({}, duplicateMetricManifest),
  'P17_PROBE_MANIFEST_INVALID',
);

const duplicatePointerManifest = structuredClone(probeManifest);
duplicatePointerManifest.probes[1].jsonPointer = duplicatePointerManifest.probes[0].jsonPointer;
assertThrowsCode(
  () => extractWith({}, duplicatePointerManifest),
  'P17_PROBE_MANIFEST_INVALID',
);

const approvalMismatchManifest = structuredClone(probeManifest);
approvalMismatchManifest.probes[0].approvalHash = 'b'.repeat(64);
assertThrowsCode(
  () => extractWith({}, approvalMismatchManifest),
  'P17_PROBE_MANIFEST_INVALID',
);

assertThrowsCode(
  () => extractWith({ nodes: [] }, lockedProbeManifest([probe('MISSING', '/nodes/0/value', 'm')])),
  'P17_JSON_POINTER_MISSING',
);
assertThrowsCode(
  () => extractWith({ value: '12.0' }, lockedProbeManifest([probe('STRING_VALUE', '/value', 'm')])),
  'P17_EXTRACTED_VALUE_NOT_NUMBER',
);
assertThrowsCode(
  () => extractWith({ value: Number.POSITIVE_INFINITY }, lockedProbeManifest([probe('NONFINITE', '/value', 'm')])),
  'P17_ENGINEERING_RESULT_JSON_INVALID',
);
assertThrowsCode(
  () => extractWith({ rows: [10] }, lockedProbeManifest([probe('LEADING_ZERO', '/rows/01', 'm')])),
  'P17_JSON_POINTER_ARRAY_INDEX_INVALID',
);
assertThrowsCode(
  () => extractWith({ rows: [10] }, lockedProbeManifest([probe('ARRAY_APPEND', '/rows/-', 'm')])),
  'P17_JSON_POINTER_ARRAY_INDEX_INVALID',
);
assertThrowsCode(
  () => extractActualValues({
    engineeringResult: Buffer.from('{not-json', 'utf8'),
    engineeringResultPath: ENGINEERING_RESULT_PATH,
    probeManifest: rootManifest,
  }),
  'P17_ENGINEERING_RESULT_JSON_INVALID',
);
assertThrowsCode(
  () => extractActualValues({
    engineeringResult: 1,
    engineeringResultPath: '../escape.json',
    probeManifest: rootManifest,
  }),
  'P17_ENGINEERING_RESULT_PATH_INVALID',
);

let getterExecutionCount = 0;
const accessorResult = {};
Object.defineProperty(accessorResult, 'value', {
  enumerable: true,
  get() {
    getterExecutionCount += 1;
    return 1;
  },
});
assertThrowsCode(
  () => extractWith(accessorResult, lockedProbeManifest([probe('ACCESSOR', '/value', 'm')])),
  'P17_ENGINEERING_RESULT_JSON_INVALID',
);
assert.equal(getterExecutionCount, 0, 'data-only extraction must not execute accessors');

process.stdout.write(`${JSON.stringify({
  suite: 'P17-M1 data-only result extractor',
  status: 'PASS',
  positiveMetrics: artifact.metricCount + rootArtifact.metricCount,
  pointerCoverage: ['RFC6901_ROOT', 'ESCAPED_SLASH', 'ESCAPED_TILDE', 'ARRAY_INDEX'],
  negativeCoverage: [
    'MISSING_POINTER_FIELD',
    'INVALID_POINTER_ESCAPE',
    'TRANSFORM_FORBIDDEN',
    'DUPLICATE_METRIC',
    'DUPLICATE_POINTER',
    'PROBE_APPROVAL_MISMATCH',
    'UNRESOLVED_POINTER',
    'NON_NUMBER',
    'NONFINITE',
    'NON_CANONICAL_ARRAY_INDEX',
    'INVALID_JSON_BYTES',
    'PATH_ESCAPE',
    'ACCESSOR_CODE_EXECUTION',
    'ARTIFACT_TAMPER',
    'SOURCE_TAMPER',
    'EVALUATOR_ARTIFACT_HASH_TAMPER',
    'COMPARISON_CONTENT_SHA256_TAMPER',
    'EVALUATOR_PROBE_BINDING_TAMPER',
    'EVALUATOR_EXTRACTOR_BINDING_TAMPER',
  ],
  solverExecuted: false,
  benchmarkExecuted: false,
  engineeringResultCount: 0,
  releaseAllowed: false,
}, null, 2)}\n`);

function lockedProbeManifest(probes) {
  return {
    schemaVersion: 'p17-probe-manifest-v1',
    caseId: 'SYNTHETIC',
    status: 'LOCKED',
    payloadAbsent: false,
    releaseAllowed: true,
    signConventionStatus: 'LOCKED',
    probes,
    approval: {
      status: 'APPROVED',
      reviewer: 'P17-M1-SYNTHETIC-CONTRACT',
      approvalHash: APPROVAL_HASH,
    },
    reasonCodes: [],
  };
}

function probe(metricId, jsonPointer, unit) {
  return {
    probeId: `PROBE_${metricId}`,
    metricId,
    resultKind: 'SYNTHETIC_SCALAR',
    entityId: 'SYNTHETIC_ENTITY',
    location: 'LOCKED_JSON_POINTER',
    component: metricId,
    unit,
    signConvention: 'AS_STORED_NO_TRANSFORM',
    mandatory: true,
    jsonPointer,
    extractionOperation: P17_RESULT_EXTRACTION_OPERATION,
    approvalHash: APPROVAL_HASH,
  };
}

function extractWith(engineeringResult, manifest) {
  return extractActualValues({
    engineeringResult,
    engineeringResultPath: ENGINEERING_RESULT_PATH,
    probeManifest: manifest,
  });
}

function assertThrowsCode(action, expectedCode) {
  assert.throws(action, (error) => error?.code === expectedCode);
}

function comparisonContractFixture(actualArtifact) {
  const actualValuesPath = 'verification/evidence/validation/phase17/synthetic/actual-values.json';
  const criteria = actualArtifact.values.map((row) => ({
    metricId: row.metricId,
    comparisonMode: 'SIGNED_RELATIVE',
    relativeTolerancePct: 0.001,
    absoluteTolerance: 1e-12,
    nearZeroThreshold: 1e-14,
    unit: row.unit,
    mandatory: row.mandatory,
    approvalHash: APPROVAL_HASH,
  }));
  const toleranceManifest = { criteria };
  const referenceBundle = {
    version: 'p17-m1-reference-repository-v1',
    caseId: actualArtifact.caseId,
    status: 'READY',
    payloadAbsent: false,
    expectedValues: {
      values: actualArtifact.values.map((row) => ({
        metricId: row.metricId,
        lane: 'PRIMARY_INDEPENDENT',
        value: row.value,
        unit: row.unit,
      })),
    },
    toleranceManifest,
    documentHashes: {
      toleranceManifest: sha256Canonical(toleranceManifest),
      probeManifest: actualArtifact.probeManifest.canonicalHash,
    },
  };
  const artifactRoles = [
    'SOURCE_ARTIFACT',
    'SOURCE_MANIFEST',
    'CANONICAL_INPUT',
    'SSTRUCTURES_INPUT',
    'MODEL_EQUIVALENCE',
    'REFERENCE_MANIFEST',
    'EXPECTED_VALUES',
    'TOLERANCE_MANIFEST',
    'PROBE_MANIFEST',
    'SOLVER_SETTINGS',
    'PRODUCT_SOURCE',
    'PRODUCT_BUILD',
    'DEPENDENCY_LOCK',
    'ENGINEERING_RESULT',
    'EXTRACTED_ACTUAL_VALUES',
    'PROBE_EXTRACTOR',
  ];
  const artifactHashes = artifactRoles.map((role) => ({
    path: `verification/evidence/validation/phase17/synthetic/${role.toLowerCase().replaceAll('_', '-')}.json`,
    sha256: role === 'ENGINEERING_RESULT'
      ? actualArtifact.engineeringResult.rawSha256
      : role === 'EXTRACTED_ACTUAL_VALUES'
        ? sha256Canonical(actualArtifact)
        : role === 'PROBE_EXTRACTOR'
          ? actualArtifact.extractor.sourceSha256
          : sha256Label(role),
    role,
  }));
  const runRecordCore = {
    schemaVersion: 'p17-run-record-v1',
    caseId: actualArtifact.caseId,
    runId: 'SYNTHETIC-RUN-001',
    status: 'EXECUTED',
    appendOnly: true,
    createdAt: '2026-08-28T00:00:00.000Z',
    productBinding: {
      serviceVersion: 'p9-m9-product-analysis-service-v1',
      adapterVersion: 'p17-m1-product-adapter-v1',
      publicEntrypoint: 'src/index.js',
      externalRuntimeUsed: false,
      networkFallbackUsed: false,
      executionProvenance: {
        mode: 'OFFICIAL_PUBLIC_SERVICE',
        terminalQualificationEligible: true,
        serviceOrigin: 'PUBLIC_FACTORY',
        callerServiceInjected: false,
        callerServiceFactoryInjected: false,
        callerCaseRunnerInjected: false,
        caseRunnerBinding: 'PUBLIC_RUN_ANALYSIS_CASE_ASYNC',
        publicEntrypoint: 'src/index.js',
        testFixtureId: null,
        testProvenance: null,
      },
    },
    inputHashes: {
      sourceArtifactHash: sha256Label('SOURCE_ARTIFACT'),
      referenceManifestHash: sha256Label('REFERENCE_MANIFEST'),
      toleranceHash: referenceBundle.documentHashes.toleranceManifest,
      probeHash: referenceBundle.documentHashes.probeManifest,
      canonicalCaseHash: sha256Label('CANONICAL_INPUT'),
      modelMappingHash: sha256Label('MODEL_EQUIVALENCE'),
      nativeModelHash: sha256Label('SSTRUCTURES_INPUT'),
      solverSettingsHash: sha256Label('SOLVER_SETTINGS'),
      productSourceHash: sha256Label('PRODUCT_SOURCE'),
      buildHash: sha256Label('PRODUCT_BUILD'),
      dependencyLockHash: sha256Label('DEPENDENCY_LOCK'),
    },
    execution: {
      isolatedProcess: true,
      timeoutMs: 1,
      durationMs: 0,
      exitCode: 0,
      signal: null,
      stdoutHash: sha256Label('STDOUT_EMPTY'),
      stderrHash: sha256Label('STDERR_EMPTY'),
    },
    engineeringResultHash: actualArtifact.engineeringResult.rawSha256,
    artifactHashes,
    reasonCodes: [],
  };
  return {
    actualValuesPath,
    referenceBundle,
    runRecord: { ...runRecordCore, runRecordHash: sha256Canonical(runRecordCore) },
  };
}

function evaluateComparisonFixture(fixture, actualValuesArtifact) {
  return evaluateLockedComparison({
    referenceBundle: fixture.referenceBundle,
    runId: fixture.runRecord.runId,
    runRecord: fixture.runRecord,
    actualValuesArtifact,
    actualValuesPath: fixture.actualValuesPath,
  });
}

function rehashExtractedArtifact(source, mutate) {
  const value = structuredClone(source);
  mutate(value);
  const core = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'artifactHash'));
  value.artifactHash = sha256Canonical(core);
  return value;
}

function differentSha256(value) {
  return `${value.startsWith('0') ? '1' : '0'}${value.slice(1)}`;
}

function sha256Label(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
