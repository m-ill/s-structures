import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAnalysisCaseResult,
  createAnalysisProductService,
} from '../src/index.js';
import {
  createAppendOnlyRunCustodyPayload,
  createExternalCustodySignaturePayload,
  commitAppendOnlyRun,
  P17_APPEND_ONLY_ASSURANCE_POLICY,
  P17_EXTERNAL_SIGNED_ANCHOR,
  P17_LOCAL_FRAMEWORK_FIXTURE_ANCHOR,
  verifyAppendOnlyRun,
} from '../verification/framework/phase17/appendOnlyRunStore.mjs';
import { prepareCaseModel } from '../verification/framework/phase17/caseModelBuilder.mjs';
import { sha256Canonical } from '../verification/framework/phase17/canonical.mjs';
import { evaluateLockedComparison } from '../verification/framework/phase17/comparisonEvaluator.mjs';
import {
  buildEvidenceOnlyReportSnapshot,
  createCaptureIndex,
  createReportManifest,
  P17_M1_TERMINAL_PASS_ENABLED,
  renderEvidenceOnlyMarkdown,
} from '../verification/framework/phase17/evidenceReport.mjs';
import { runIsolatedSuite } from '../verification/framework/phase17/isolatedSuiteRunner.mjs';
import {
  assertSuiteScaffold,
  validateManifestDocument,
} from '../verification/framework/phase17/manifestValidation.mjs';
import {
  P17_PRODUCT_ADAPTER_MODES,
  assertP17ProductExecutionPolicy,
  createP17ProductAdapter,
  validateP17ProductRequest,
} from '../verification/framework/phase17/productAdapter.mjs';
import { prepareReferenceBundle } from '../verification/framework/phase17/referenceRepository.mjs';
import { buildP17M1Scaffold } from '../verification/framework/phase17/scaffoldBuilder.mjs';
import {
  qualifyP17M1ContractRows,
  runP17M1ContractSuite,
} from '../verification/runners/run-p17-suite.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS_ROOT = path.join(REPOSITORY_ROOT, 'verification', 'harnesses');
const ISOLATION_FIXTURE = path.join(HARNESS_ROOT, 'p17-m1-isolation-fixture.mjs');
const THIS_TEST = fileURLToPath(import.meta.url);

const readJson = async (relativePath) => JSON.parse(await readFile(path.join(REPOSITORY_ROOT, ...relativePath.split('/')), 'utf8'));

await verifyScaffoldAndResultFreeSuite();
await verifyIsolatedFailureContainment();
await verifyAppendOnlyRunStore();
await verifyPublicProductAdapter();
await verifyM1FailClosedReferenceAndModelContracts();
await verifyEvidenceOnlyReportTamperDetection();

process.stdout.write(`${JSON.stringify({
  suite: 'P17-M1 production framework contract',
  status: 'PASS',
  benchmarkExecuted: false,
  solverExecuted: false,
  engineeringResultCount: 0,
  assertions: {
    officialCases: 21,
    customCases: 1,
    generatedScaffoldFiles: 419,
    isolationSequence: ['CHILD_SUCCEEDED_UNQUALIFIED', 'FAILED', 'CHILD_SUCCEEDED_UNQUALIFIED', 'TIMED_OUT', 'CHILD_SUCCEEDED_UNQUALIFIED'],
    isolationPolicyBlocks: ['P17_ENTRYPOINT_PATH_ESCAPE', 'P17_CHILD_POLICY_ENV_RESERVED'],
    appendOnlyTamperClasses: ['CONTENT', 'UNDECLARED_FILE', 'UNDECLARED_DIRECTORY', 'SYMLINK_OR_JUNCTION', 'CHAIN_SCHEMA', 'CUSTODY_SIGNATURE'],
    appendOnlyCustodyPolicy: ['LOCAL_FIXTURE_NOT_TERMINAL', 'EXTERNAL_SIGNED_ANCHOR_REQUIRED', 'NO_AUTOMATIC_TOMBSTONE_REUSE', 'LOCAL_FS_NOT_WORM'],
    productPolicyBlocks: ['VERSION', 'REFERENCE_PAYLOAD', 'FALLBACK', 'EXTERNAL_RUNTIME', 'RUNTIME_OBSERVATION', 'NETWORK_FALLBACK', 'NETWORK_OBSERVATION', 'OFFICIAL_INJECTION', 'TEST_PROVENANCE', 'PUBLIC_RUNNER_PROVENANCE', 'TEST_ONLY_QUALIFICATION'],
    reportTamperClasses: ['EVIDENCE_HASH', 'CAPTURE_INDEX_HASH', 'CAPTURE_BINDING', 'CAPTURE_BOOLEAN_COERCION', 'M1_TERMINAL_PASS_DISABLED'],
  },
  releaseAllowed: false,
}, null, 2)}\n`);

async function verifyScaffoldAndResultFreeSuite() {
  const registry = await readJson('verification/benchmarks/strix21/suite-source-registry-r2.json');
  const generated = buildP17M1Scaffold(registry);
  assert.equal(generated.size, 419, 'M1 scaffold must remain exactly 21*19 + 1*19 + 1 suite manifest files');

  const validation = assertSuiteScaffold(REPOSITORY_ROOT, { m1Scaffold: true });
  assert.equal(validation.cases.length, 21);
  assert.equal(validation.customCases.length, 1);
  assert.equal(validation.customCases[0].caseId, 'P3S2-SS');
  assert.deepEqual(validation.suite.resultSummary, {
    benchmarkExecutionCount: 0,
    terminalCaseCount: 0,
    passCount: 0,
    failCount: 0,
    blockedCount: 0,
  });
  assert.equal(validation.suite.officialDenominator.count, 21);
  assert.equal(validation.suite.officialDenominator.customIncluded, false);

  for (const entry of [...validation.suite.cases, ...validation.suite.customCases]) {
    const expectedValues = await readJson(`${entry.folder}/reference/expected-values.json`);
    const canonicalInput = await readJson(`${entry.folder}/model/canonical-input.json`);
    const nativeInput = await readJson(`${entry.folder}/model/sstructures-input.json`);
    const runEntries = await readdir(path.join(REPOSITORY_ROOT, ...entry.folder.split('/'), 'runs'));
    const figureEntries = await readdir(path.join(REPOSITORY_ROOT, ...entry.folder.split('/'), 'figures'));
    const reportEntries = await readdir(path.join(REPOSITORY_ROOT, ...entry.folder.split('/'), 'report'));
    assert.equal(expectedValues.status, 'NOT_LOCKED');
    assert.equal(expectedValues.payloadAbsent, true);
    assert.deepEqual(expectedValues.values, []);
    assert.equal(canonicalInput.payloadAbsent, true);
    assert.ok(Object.values(canonicalInput.entities).every((rows) => Array.isArray(rows) && rows.length === 0));
    assert.equal(nativeInput.payloadAbsent, true);
    assert.deepEqual(nativeInput.payload, {});
    assert.deepEqual(runEntries, ['README.md']);
    assert.deepEqual(figureEntries, ['README.md']);
    assert.deepEqual(reportEntries, ['README.md']);
  }

  // These child processes execute the contract validator only. They never call
  // the product adapter, a solver, a benchmark evaluator, or an evidence writer.
  const suite = await runP17M1ContractSuite({ includeCustom: true, timeoutMs: 10_000 });
  assert.equal(suite.results.length, 22);
  assert.equal(suite.summary.contractValidated, 22);
  assert.equal(suite.summary.childSucceededUnqualified, 0);
  assert.equal(suite.summary.failed, 0);
  assert.equal(suite.summary.timedOut, 0);
  assert.equal(suite.summary.spawnBlocked, 0);
  assert.equal(suite.officialCaseCount, 21);
  assert.equal(suite.includeCustom, true);
  assert.equal(suite.benchmarkExecuted, false);
  assert.equal(suite.officialBenchmarkExecuted, false);
  assert.equal(suite.solverExecuted, false);
  assert.equal(suite.releaseAllowed, false);
  for (const row of suite.results) {
    assert.equal(row.processIsolated, true);
    assert.equal(row.status, 'CONTRACT_VALIDATED');
    assert.equal(row.benchmarkExecuted, false);
    assert.equal(row.solverExecuted, false);
    assert.equal(row.parsedOutput?.benchmarkExecuted, false);
    assert.equal(row.parsedOutput?.solverExecuted, false);
    assert.equal(row.parsedOutput?.releaseAllowed, false);
  }
}

async function verifyIsolatedFailureContainment() {
  const sequence = await runIsolatedSuite([
    fixtureCase('SEQ-PASS-1', 1, 'pass', 3_000),
    fixtureCase('SEQ-FAIL', 2, 'fail', 3_000),
    fixtureCase('SEQ-PASS-2', 3, 'pass', 3_000),
    fixtureCase('SEQ-TIMEOUT', 4, 'timeout', 100),
    fixtureCase('SEQ-PASS-3', 5, 'pass', 3_000),
  ], {
    allowedEntrypointRoot: HARNESS_ROOT,
    cwd: HARNESS_ROOT,
    timeoutMs: 3_000,
    maxOutputBytes: 16_384,
  });
  assert.deepEqual(sequence.results.map((row) => row.status), [
    'CHILD_SUCCEEDED_UNQUALIFIED',
    'FAILED',
    'CHILD_SUCCEEDED_UNQUALIFIED',
    'TIMED_OUT',
    'CHILD_SUCCEEDED_UNQUALIFIED',
  ]);
  assert.deepEqual(sequence.results.map((row) => row.reasonCodes), [
    [],
    ['P17_CHILD_NONZERO_EXIT'],
    [],
    ['P17_CASE_TIMEOUT'],
    [],
  ]);
  assert.equal(sequence.summary.childSucceededUnqualified, 3);
  assert.equal(sequence.summary.failed, 1);
  assert.equal(sequence.summary.timedOut, 1);
  assert.equal(sequence.summary.terminalCount, sequence.summary.total);
  assert.equal(sequence.summary.continuedAfterFailure, true);
  assert.equal(sequence.officialBenchmarkExecuted, null);
  assert.equal(sequence.benchmarkExecuted, null);
  assert.equal(sequence.solverExecuted, null);
  assert.ok(sequence.results.every((row) => row.solverExecuted === null && row.benchmarkExecuted === null));

  const outputProtocol = await runIsolatedSuite([
    fixtureCase('OUTPUT-MISSING', 1, 'missing-output', 3_000),
    fixtureCase('OUTPUT-MALFORMED', 2, 'malformed-output', 3_000),
    fixtureCase('OUTPUT-INVALID', 3, 'invalid-contract', 3_000),
    fixtureCase('OUTPUT-VALID', 4, 'canonical-contract', 3_000),
  ], {
    allowedEntrypointRoot: HARNESS_ROOT,
    cwd: HARNESS_ROOT,
    timeoutMs: 3_000,
    maxOutputBytes: 16_384,
  });
  assert.deepEqual(outputProtocol.results.map((row) => row.status), Array(4).fill('CHILD_SUCCEEDED_UNQUALIFIED'));
  assert.deepEqual(outputProtocol.results.map((row) => row.parsedOutput === null), [true, true, false, false]);
  assert.equal(outputProtocol.summary.childSucceededUnqualified, 4);
  assert.equal(outputProtocol.summary.terminalCount, 4);

  const staticContracts = outputProtocol.results.map((row) => ({
    caseId: row.caseId,
    officialSuiteMember: false,
    manifestHash: 'a'.repeat(64),
    requiredFileCount: 19,
  }));
  const qualifiedProtocol = qualifyP17M1ContractRows(outputProtocol.results, staticContracts);
  assert.deepEqual(qualifiedProtocol.results.map((row) => row.status), [
    'FAILED',
    'FAILED',
    'FAILED',
    'CONTRACT_VALIDATED',
  ]);
  assert.deepEqual(qualifiedProtocol.results.slice(0, 3).map((row) => row.reasonCodes), [
    ['P17_CHILD_CONTRACT_OUTPUT_INVALID'],
    ['P17_CHILD_CONTRACT_OUTPUT_INVALID'],
    ['P17_CHILD_CONTRACT_OUTPUT_INVALID'],
  ]);
  assert.ok(qualifiedProtocol.results.slice(0, 3).every((row) => row.solverExecuted === null && row.benchmarkExecuted === null));
  assert.equal(qualifiedProtocol.results[3].solverExecuted, false);
  assert.equal(qualifiedProtocol.results[3].benchmarkExecuted, false);
  assert.deepEqual(qualifiedProtocol.summary, {
    total: 4,
    contractValidated: 1,
    childSucceededUnqualified: 0,
    failed: 3,
    timedOut: 0,
    spawnBlocked: 0,
    terminalCount: 4,
    continuedAfterFailure: true,
  });

  const pathEscape = await runIsolatedSuite([
    {
      caseId: 'ESCAPE-BLOCK',
      ordinal: 1,
      entrypoint: THIS_TEST,
      cwd: HARNESS_ROOT,
      args: [],
      timeoutMs: 3_000,
    },
    fixtureCase('ESCAPE-NEXT', 2, 'pass', 3_000),
  ], {
    allowedEntrypointRoot: HARNESS_ROOT,
    cwd: HARNESS_ROOT,
    timeoutMs: 3_000,
    maxOutputBytes: 16_384,
  });
  assert.deepEqual(pathEscape.results.map((row) => row.status), ['SPAWN_BLOCKED', 'CHILD_SUCCEEDED_UNQUALIFIED']);
  assert.deepEqual(pathEscape.results[0].reasonCodes, ['P17_ENTRYPOINT_PATH_ESCAPE']);
  assert.equal(pathEscape.summary.continuedAfterFailure, true);

  const reservedEnvironment = await runIsolatedSuite([
    {
      ...fixtureCase('ENV-BLOCK', 1, 'pass', 3_000),
      env: { P17_EXTERNAL_RUNTIME_ALLOWED: '1' },
    },
    fixtureCase('ENV-NEXT', 2, 'pass', 3_000),
  ], {
    allowedEntrypointRoot: HARNESS_ROOT,
    cwd: HARNESS_ROOT,
    timeoutMs: 3_000,
    maxOutputBytes: 16_384,
  });
  assert.deepEqual(reservedEnvironment.results.map((row) => row.status), ['SPAWN_BLOCKED', 'CHILD_SUCCEEDED_UNQUALIFIED']);
  assert.deepEqual(reservedEnvironment.results[0].reasonCodes, ['P17_CHILD_POLICY_ENV_RESERVED']);
  assert.equal(reservedEnvironment.summary.continuedAfterFailure, true);
  assert.ok([sequence, outputProtocol, pathEscape, reservedEnvironment].every((result) => (
    result.officialBenchmarkExecuted === null && result.benchmarkExecuted === null && result.solverExecuted === null
  )));
}

async function verifyAppendOnlyRunStore() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'p17-m1-store-'));
  const runsRoot = path.join(temporaryRoot, 'runs');
  await mkdir(runsRoot);
  const createdAt = '2026-08-28T00:00:00.000Z';
  const commit = async (runId, documents = { 'run-record.json': { status: 'FRAMEWORK_FIXTURE', values: [] } }, extra = {}) => {
    const options = {
      runsRoot,
      allowedRoot: temporaryRoot,
      runId,
      documents,
      status: 'FRAMEWORK_FIXTURE',
      createdAt,
      ...extra,
    };
    const custody = createAppendOnlyRunCustodyPayload(options);
    return commitAppendOnlyRun({
      ...options,
      custodyAnchor: {
        type: P17_LOCAL_FRAMEWORK_FIXTURE_ANCHOR,
        scope: P17_APPEND_ONLY_ASSURANCE_POLICY.fixtureScope,
        payloadHash: custody.payloadHash,
        terminalQualificationAllowed: false,
      },
    });
  };
  try {
    const valid = await commit('P17TEST01', {
      'run-record.json': { status: 'FRAMEWORK_FIXTURE', values: [], solverExecuted: false },
      'notes/contract.txt': 'result-free fixture\n',
    }, {
      chain: [{ name: 'm0-source-lock', sha256: 'a'.repeat(64) }],
    });
    assert.equal(valid.integrity.runId, 'P17TEST01');
    assert.equal(valid.integrity.fileCount, 2);
    assert.equal(valid.integrity.custodyAnchor.type, P17_LOCAL_FRAMEWORK_FIXTURE_ANCHOR);
    assert.equal(valid.durability.contentFilesSynced, 2);
    assert.equal(valid.durability.integrityManifestSynced, true);
    assert.equal(valid.durability.atomicRenameCompleted, true);
    assert.equal(valid.durability.commitLockSynced, true);
    assert.equal(valid.seal.filesSealed, 3);
    if (process.platform !== 'win32') assert.equal(valid.seal.fullyReadOnly, true);
    assert.equal(valid.assurance.officialTerminalQualificationAnchorEligible, false);
    assert.equal(valid.assurance.externalSignatureVerified, false);
    assert.equal(valid.assurance.localFilesystemWormGuaranteed, false);
    assert.equal(valid.assurance.localRehashResistanceGuaranteed, false);
    const validAudit = await verifyAppendOnlyRun(valid.target);
    assert.equal(validAudit.ok, true);
    assert.equal(validAudit.assurance.fixtureAnchorValid, true);
    assert.equal(validAudit.assurance.officialTerminalQualificationAnchorEligible, false);
    await assertRejectCode(() => commit('P17TEST01'), 'P17_RUN_ALREADY_EXISTS');
    assert.ok(path.resolve(valid.target).startsWith(`${path.resolve(temporaryRoot)}${path.sep}`));
    await makeTestDirectoriesWritable(valid.target);
    await rm(valid.target, { recursive: true, force: true });
    await assertRejectCode(() => commit('P17TEST01'), 'P17_RUN_ALREADY_EXISTS');

    const racingCommits = await Promise.allSettled([
      commit('P17RACE01'),
      commit('P17RACE01'),
    ]);
    assert.equal(racingCommits.filter((row) => row.status === 'fulfilled').length, 1);
    const rejectedRace = racingCommits.find((row) => row.status === 'rejected');
    assert.equal(rejectedRace?.reason?.code, 'P17_RUN_ALREADY_EXISTS');
    assert.equal((await readdir(runsRoot)).some((name) => name.startsWith('.p17-staging-P17RACE01-')), false);

    assert.equal(P17_APPEND_ONLY_ASSURANCE_POLICY.localFilesystemWormGuaranteed, false);
    assert.equal(P17_APPEND_ONLY_ASSURANCE_POLICY.localRehashResistanceGuaranteed, false);
    assert.equal(P17_APPEND_ONLY_ASSURANCE_POLICY.tombstonePolicy.automaticStaleReclaimAllowed, false);
    assert.equal(P17_APPEND_ONLY_ASSURANCE_POLICY.officialTerminalQualificationRequires, P17_EXTERNAL_SIGNED_ANCHOR);

    await assertRejectCode(() => commitAppendOnlyRun({ runsRoot, allowedRoot: temporaryRoot, runId: null, documents: { 'x.json': {} } }), 'P17_RUN_ID_INVALID');
    await assertRejectCode(() => commit('short'), 'P17_RUN_ID_INVALID');
    await assertRejectCode(() => commit('../escape'), 'P17_RUN_ID_INVALID');
    await assertRejectCode(() => commit('P17PATH01', { '../escape.json': {} }), 'P17_RUN_DOCUMENT_PATH_INVALID');
    await assertRejectCode(() => commitAppendOnlyRun({ runsRoot, allowedRoot: temporaryRoot, runId: 'P17NULL01', documents: null }), 'P17_RUN_DOCUMENTS_REQUIRED');
    await assertRejectCode(() => commit('P17NAN001', { 'value.json': { value: Number.NaN } }), 'P17_NONFINITE_JSON_FORBIDDEN');
    await assertRejectCode(() => commit('P17DATE01', { 'value.json': { value: new Date(createdAt) } }), 'P17_RUN_DOCUMENT_VALUE_INVALID');
    await assertRejectCode(() => commitAppendOnlyRun({ runsRoot, allowedRoot: temporaryRoot, runId: 'P17TIME01', documents: { 'x.json': {} }, createdAt: 'not-a-date' }), 'P17_RUN_CREATED_AT_INVALID');
    await assertRejectCode(() => commitAppendOnlyRun({ runsRoot, allowedRoot: temporaryRoot, runId: 'P17STAT01', documents: { 'x.json': {} }, status: 'invalid status' }), 'P17_RUN_STATUS_INVALID');
    await assertRejectCode(() => commitAppendOnlyRun({
      runsRoot,
      allowedRoot: temporaryRoot,
      runId: 'P17NOANC1',
      documents: { 'x.json': {} },
      status: 'FRAMEWORK_FIXTURE',
      createdAt,
    }), 'P17_LOCAL_FIXTURE_ANCHOR_REQUIRED');
    await assertRejectCode(() => commit('P17CHAIN1', { 'x.json': {} }, {
      chain: [{ name: 'bad chain name', sha256: 'a'.repeat(64) }],
    }), 'P17_RUN_CHAIN_INVALID');

    const allowedRoot = path.join(temporaryRoot, 'allowed');
    const outsideRuns = path.join(temporaryRoot, 'outside-runs');
    await mkdir(allowedRoot);
    await mkdir(outsideRuns);
    const outsideOptions = {
      runsRoot: outsideRuns,
      allowedRoot,
      runId: 'P17ROOT01',
      documents: { 'x.json': {} },
      status: 'FRAMEWORK_FIXTURE',
      createdAt,
    };
    const outsideCustody = createAppendOnlyRunCustodyPayload(outsideOptions);
    await assertRejectCode(() => commitAppendOnlyRun({
      ...outsideOptions,
      custodyAnchor: localFixtureAnchor(outsideCustody.payloadHash),
    }), 'P17_RUNS_ROOT_OUTSIDE_ALLOWED_ROOT');

    const crashRunId = 'P17CRASH1';
    const crashLock = path.join(runsRoot, `.p17-committed-${crashRunId}.lock`);
    await writeFile(crashLock, 'orphaned-crash-tombstone\n', { flag: 'wx' });
    await assertRejectCode(() => commit(crashRunId), 'P17_RUN_ALREADY_EXISTS');
    assert.equal(await readFile(crashLock, 'utf8'), 'orphaned-crash-tombstone\n', 'stale/crash tombstones must never be reclaimed automatically');

    const externalDocuments = { 'contract-record.json': { status: 'CONTRACT_RECORD', solverExecuted: false, engineeringResultCount: 0 } };
    const externalOptions = {
      runsRoot,
      allowedRoot: temporaryRoot,
      runId: 'P17EXT001',
      documents: externalDocuments,
      status: 'CONTRACT_RECORD',
      createdAt,
      chain: [{ name: 'm0-source-lock', sha256: 'b'.repeat(64) }],
    };
    const externalPayload = createAppendOnlyRunCustodyPayload(externalOptions);
    await assertRejectCode(() => commitAppendOnlyRun(externalOptions), 'P17_EXTERNAL_CUSTODY_ANCHOR_REQUIRED');
    await assertRejectCode(() => commitAppendOnlyRun({
      ...externalOptions,
      custodyAnchor: localFixtureAnchor(externalPayload.payloadHash),
    }), 'P17_EXTERNAL_CUSTODY_ANCHOR_REQUIRED');
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const keyId = 'test-external-custody-key';
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
    const externalAnchorStatement = {
      type: P17_EXTERNAL_SIGNED_ANCHOR,
      authority: 'P17-CONTRACT-TEST-CUSTODIAN',
      anchorId: 'P17-EXTERNAL-ANCHOR-001',
      keyId,
      algorithm: 'Ed25519',
      issuedAt: createdAt,
      payloadHash: externalPayload.payloadHash,
    };
    const externalSignaturePayload = createExternalCustodySignaturePayload(externalAnchorStatement);
    const externalAnchor = {
      ...externalAnchorStatement,
      signatureBase64: sign(null, Buffer.from(externalSignaturePayload.canonical, 'utf8'), privateKey).toString('base64'),
    };
    await assertRejectCode(() => commitAppendOnlyRun({
      ...externalOptions,
      custodyAnchor: externalAnchor,
    }), 'P17_EXTERNAL_ANCHOR_TRUST_REQUIRED');
    await assertRejectCode(() => commitAppendOnlyRun({
      ...externalOptions,
      custodyAnchor: { ...externalAnchor, signatureBase64: Buffer.alloc(64, 1).toString('base64') },
      trustedExternalAnchorKeys: { [keyId]: publicKeyPem },
    }), 'P17_EXTERNAL_ANCHOR_SIGNATURE_INVALID');
    const external = await commitAppendOnlyRun({
      ...externalOptions,
      custodyAnchor: externalAnchor,
      trustedExternalAnchorKeys: { [keyId]: publicKeyPem },
    });
    assert.equal(external.assurance.externalSignatureVerified, true);
    assert.equal(external.assurance.officialTerminalQualificationAnchorEligible, true);
    const untrustedExternalAudit = await verifyAppendOnlyRun(external.target);
    assert.equal(untrustedExternalAudit.ok, false);
    assert.ok(untrustedExternalAudit.errors.includes('P17_EXTERNAL_ANCHOR_TRUST_REQUIRED'));
    const trustedExternalAudit = await verifyAppendOnlyRun(external.target, {
      trustedExternalAnchorKeys: { [keyId]: publicKeyPem },
    });
    assert.equal(trustedExternalAudit.ok, true);
    assert.equal(trustedExternalAudit.assurance.externalSignatureVerified, true);
    assert.equal(trustedExternalAudit.assurance.officialTerminalQualificationAnchorEligible, true);
    const externalManifestPath = path.join(external.target, 'integrity-manifest.json');
    const externalManifest = JSON.parse(await readFile(externalManifestPath, 'utf8'));
    externalManifest.custodyAnchor.authority = 'FORGED-CUSTODIAN';
    const forgedExternalCore = { ...externalManifest };
    delete forgedExternalCore.integrityHash;
    externalManifest.integrityHash = sha256Canonical(forgedExternalCore);
    await chmod(externalManifestPath, 0o644);
    await writeFile(externalManifestPath, `${JSON.stringify(externalManifest, null, 2)}\n`);
    await chmod(externalManifestPath, 0o444);
    const forgedExternalAudit = await verifyAppendOnlyRun(external.target, {
      trustedExternalAnchorKeys: { [keyId]: publicKeyPem },
    });
    assert.equal(forgedExternalAudit.ok, false);
    assert.ok(forgedExternalAudit.errors.includes('P17_EXTERNAL_ANCHOR_SIGNATURE_INVALID'));

    const contentTamper = await commit('P17TAMP01');
    await chmod(path.join(contentTamper.target, 'run-record.json'), 0o644);
    await writeFile(path.join(contentTamper.target, 'run-record.json'), '{"tampered":true}\n');
    await chmod(path.join(contentTamper.target, 'run-record.json'), 0o444);
    const contentAudit = await verifyAppendOnlyRun(contentTamper.target);
    assert.equal(contentAudit.ok, false);
    assert.ok(contentAudit.errors.includes('P17_INTEGRITY_FILE_HASH_MISMATCH'));

    // A local writer can replace both a fixture payload and every local digest.
    // The store reports this limitation explicitly and never treats a locally
    // rehashed fixture as eligible for official terminal qualification.
    const localRehash = await commit('P17REHSH');
    const localRehashRecordPath = path.join(localRehash.target, 'run-record.json');
    const localRehashManifestPath = path.join(localRehash.target, 'integrity-manifest.json');
    const replacementBytes = Buffer.from('{"locallyRehashed":true,"solverExecuted":false}\n', 'utf8');
    await chmod(localRehashRecordPath, 0o644);
    await writeFile(localRehashRecordPath, replacementBytes);
    await chmod(localRehashRecordPath, 0o444);
    const localRehashManifest = JSON.parse(await readFile(localRehashManifestPath, 'utf8'));
    localRehashManifest.files[0].byteLength = replacementBytes.byteLength;
    localRehashManifest.files[0].sha256 = createHash('sha256').update(replacementBytes).digest('hex');
    const localCustodyCore = {
      version: localRehashManifest.version,
      runId: localRehashManifest.runId,
      status: localRehashManifest.status,
      createdAt: localRehashManifest.createdAt,
      fileCount: localRehashManifest.fileCount,
      files: localRehashManifest.files,
      chain: localRehashManifest.chain,
    };
    localRehashManifest.custodyAnchor.payloadHash = sha256Canonical(localCustodyCore);
    const localRehashCore = { ...localRehashManifest };
    delete localRehashCore.integrityHash;
    localRehashManifest.integrityHash = sha256Canonical(localRehashCore);
    await chmod(localRehashManifestPath, 0o644);
    await writeFile(localRehashManifestPath, `${JSON.stringify(localRehashManifest, null, 2)}\n`);
    await chmod(localRehashManifestPath, 0o444);
    const localRehashAudit = await verifyAppendOnlyRun(localRehash.target);
    assert.equal(localRehashAudit.ok, true, 'self-consistent local rehash is outside local-hash threat resistance');
    assert.equal(localRehashAudit.assurance.localRehashResistanceGuaranteed, false);
    assert.equal(localRehashAudit.assurance.officialTerminalQualificationAnchorEligible, false);

    const undeclaredFile = await commit('P17EXTR01');
    await chmod(undeclaredFile.target, 0o755);
    await writeFile(path.join(undeclaredFile.target, 'undeclared.json'), '{}\n');
    await chmod(path.join(undeclaredFile.target, 'undeclared.json'), 0o444);
    await chmod(undeclaredFile.target, 0o555);
    const undeclaredFileAudit = await verifyAppendOnlyRun(undeclaredFile.target);
    assert.equal(undeclaredFileAudit.ok, false);
    assert.ok(undeclaredFileAudit.errors.includes('P17_INTEGRITY_UNDECLARED_FILE'));

    const undeclaredDirectory = await commit('P17DIR001');
    await chmod(undeclaredDirectory.target, 0o755);
    await mkdir(path.join(undeclaredDirectory.target, 'undeclared-directory'));
    await chmod(path.join(undeclaredDirectory.target, 'undeclared-directory'), 0o555);
    await chmod(undeclaredDirectory.target, 0o555);
    const undeclaredDirectoryAudit = await verifyAppendOnlyRun(undeclaredDirectory.target);
    assert.equal(undeclaredDirectoryAudit.ok, false);
    assert.ok(undeclaredDirectoryAudit.errors.includes('P17_INTEGRITY_UNDECLARED_DIRECTORY'));

    const unsafeEntry = await commit('P17LINK01');
    const linkTarget = path.join(temporaryRoot, 'junction-target');
    await mkdir(linkTarget);
    await chmod(unsafeEntry.target, 0o755);
    await symlink(linkTarget, path.join(unsafeEntry.target, 'unsafe-link'), process.platform === 'win32' ? 'junction' : 'dir');
    await chmod(unsafeEntry.target, 0o555);
    const unsafeEntryAudit = await verifyAppendOnlyRun(unsafeEntry.target);
    assert.equal(unsafeEntryAudit.ok, false);
    assert.ok(unsafeEntryAudit.errors.includes('P17_INTEGRITY_UNSAFE_ENTRY'));

    const chainTamper = await commit('P17CHNTM', undefined, {
      chain: [{ name: 'm0-source-lock', sha256: 'c'.repeat(64) }],
    });
    const chainManifestPath = path.join(chainTamper.target, 'integrity-manifest.json');
    const chainManifest = JSON.parse(await readFile(chainManifestPath, 'utf8'));
    chainManifest.chain = [
      { name: 'duplicate', sha256: 'd'.repeat(64) },
      { name: 'duplicate', sha256: 'e'.repeat(64) },
      { name: 'bad chain name', sha256: 'not-a-sha256' },
      { name: 'schema-row', sha256: 'f'.repeat(64), unexpected: true },
    ];
    const chainCore = { ...chainManifest };
    delete chainCore.integrityHash;
    chainManifest.integrityHash = sha256Canonical(chainCore);
    await chmod(chainManifestPath, 0o644);
    await writeFile(chainManifestPath, `${JSON.stringify(chainManifest, null, 2)}\n`);
    await chmod(chainManifestPath, 0o444);
    const chainAudit = await verifyAppendOnlyRun(chainTamper.target);
    assert.equal(chainAudit.ok, false);
    assert.ok(chainAudit.errors.includes('P17_INTEGRITY_CHAIN_DUPLICATE_NAME'));
    assert.ok(chainAudit.errors.includes('P17_INTEGRITY_CHAIN_ROW_SCHEMA_INVALID'));
    assert.ok(chainAudit.errors.includes('P17_INTEGRITY_CHAIN_NAME_INVALID'));
    assert.ok(chainAudit.errors.includes('P17_INTEGRITY_CHAIN_SHA256_INVALID'));
  } finally {
    // Sealed fixtures use mode 0555 on POSIX. Restore directory write access
    // only for this test-owned tree, without following the adversarial symlink.
    await makeTestDirectoriesWritable(temporaryRoot);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function makeTestDirectoriesWritable(directory) {
  await chmod(directory, 0o755);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      await makeTestDirectoriesWritable(path.join(directory, entry.name));
    }
  }
}

function localFixtureAnchor(payloadHash) {
  return {
    type: P17_LOCAL_FRAMEWORK_FIXTURE_ANCHOR,
    scope: P17_APPEND_ONLY_ASSURANCE_POLICY.fixtureScope,
    payloadHash,
    terminalQualificationAllowed: false,
  };
}

async function verifyPublicProductAdapter() {
  const request = {
    runId: 'P17FAKE01',
    model: { schemaVersion: 'fixture-model-v1', entities: [] },
    analysisCase: { id: 'FIXTURE', kind: 'contract-only' },
    computeTarget: 'cpu',
  };
  const officialAdapter = createP17ProductAdapter();
  const productServiceVersion = officialAdapter.productServiceVersion;
  assert.equal(officialAdapter.mode, P17_PRODUCT_ADAPTER_MODES.official);
  assert.deepEqual(officialAdapter.executionProvenance, {
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
  });
  const publicPreflight = officialAdapter.preflight({
    runId: 'P17PREF01',
    model: { schemaVersion: 'fixture-model-v1', nodes: [], analysisCases: [] },
    analysisCase: { id: 'PREFLIGHT', kind: 'static', settings: {} },
    computeTarget: 'cpu',
  });
  assert.equal(publicPreflight.ok, true, 'default public adapter preflight must succeed without executing a solver');
  assert.equal(publicPreflight.executionProvenance.mode, 'OFFICIAL_PUBLIC_SERVICE');

  const publicRunnerResult = createAnalysisCaseResult(
    { id: 'NO-SOLVE-RESULT-WRAP', kind: 'static' },
    {
      ok: true,
      status: 'ok',
      routing: { requestedTarget: 'cpu', executedTarget: 'cpu', fallbackPolicy: 'forbidden', fallbackUsed: false },
    },
  );
  assert.equal(publicRunnerResult.externalRuntimeUsed, null);
  assert.equal(publicRunnerResult.networkFallbackUsed, null);
  assert.equal(publicRunnerResult.executionProvenance.origin, 'S_STRUCTURES_PUBLIC_ANALYSIS_RUNNER');
  assert.equal(publicRunnerResult.executionProvenance.externalRuntimeUsed, null);
  assert.equal(publicRunnerResult.executionProvenance.networkFallbackUsed, null);
  assert.equal(publicRunnerResult.executionProvenance.observationSource, 'UNOBSERVED_CALLER_SUPPLIED_RESULT');
  assert.throws(
    () => assertP17ProductExecutionPolicy(publicRunnerResult),
    (error) => error?.code === 'P17_EXTERNAL_RUNTIME_OBSERVATION_REQUIRED',
  );
  const externalRuntimeResult = createAnalysisCaseResult(
    { id: 'EXTERNAL-RUNTIME-OBSERVATION', kind: 'static' },
    {
      ok: true,
      status: 'ok',
      externalRuntimeUsed: true,
      routing: { requestedTarget: 'cpu', executedTarget: 'cpu', fallbackPolicy: 'forbidden', fallbackUsed: false },
    },
  );
  assert.equal(externalRuntimeResult.externalRuntimeUsed, true, 'public runner must propagate a positive external-runtime observation');
  assert.equal(externalRuntimeResult.executionProvenance.observationSource, 'ENGINE_PAYLOAD_AND_PUBLIC_RUNNER_BOUNDARY');
  assert.throws(
    () => assertP17ProductExecutionPolicy(externalRuntimeResult),
    (error) => error?.code === 'P17_EXTERNAL_RUNTIME_FORBIDDEN',
  );
  const malformedRuntimeObservation = createAnalysisCaseResult(
    { id: 'MALFORMED-RUNTIME-OBSERVATION', kind: 'static' },
    {
      ok: true,
      status: 'ok',
      externalRuntimeUsed: 'false',
      routing: { requestedTarget: 'cpu', executedTarget: 'cpu', fallbackPolicy: 'forbidden', fallbackUsed: false },
    },
  );
  assert.equal(malformedRuntimeObservation.externalRuntimeUsed, null);
  assert.equal(malformedRuntimeObservation.executionProvenance.observationSource, 'INVALID_ENGINE_PAYLOAD');
  assert.throws(
    () => assertP17ProductExecutionPolicy(malformedRuntimeObservation),
    (error) => error?.code === 'P17_EXTERNAL_RUNTIME_OBSERVATION_REQUIRED',
  );
  const ownedPublicRunnerFixture = {
    ...publicRunnerResult,
    externalRuntimeUsed: false,
    networkFallbackUsed: false,
    executionProvenance: {
      ...publicRunnerResult.executionProvenance,
      externalRuntimeUsed: false,
      networkFallbackUsed: false,
      observationSource: 'OWNED_IN_PROCESS_PUBLIC_RUNNER_BOUNDARY',
    },
  };
  const publicServiceObservationProbe = createAnalysisProductService({
    async caseRunner() { return ownedPublicRunnerFixture; },
  });
  const publicServiceJob = publicServiceObservationProbe.start({
    jobId: 'P17SERVICEOBS01',
    model: { schemaVersion: 'fixture-model-v1', nodes: [], analysisCases: [] },
    analysisCase: { id: 'PREFLIGHT', kind: 'static', settings: {} },
    computeTarget: 'cpu',
  });
  await publicServiceObservationProbe.wait(publicServiceJob.id);
  const publicServiceResult = publicServiceObservationProbe.getResult(publicServiceJob.id);
  assert.equal(publicServiceResult.externalRuntimeUsed, false);
  assert.equal(publicServiceResult.networkFallbackUsed, false);
  assert.equal(publicServiceResult.productProvenance.externalRuntimeUsed, false);
  assert.equal(publicServiceResult.productProvenance.networkFallbackUsed, false);
  assert.equal(publicServiceResult.productProvenance.executionProvenance.origin, 'S_STRUCTURES_PUBLIC_ANALYSIS_RUNNER');
  assert.deepEqual(assertP17ProductExecutionPolicy(publicServiceResult), {
    externalRuntimeObservation: 'EXPLICIT_FALSE',
    networkFallbackObservation: 'EXPLICIT_FALSE',
  });
  for (const [label, routingPatch, expectedFallback] of [
    ['TRUE', { fallbackUsed: true }, true],
    ['MALFORMED', { fallbackUsed: 'yes' }, null],
    ['POLICY', { fallbackPolicy: 'allowed', fallbackUsed: false }, false],
  ]) {
    const routeProbe = createAnalysisProductService({
      async caseRunner() {
        return {
          ...ownedPublicRunnerFixture,
          routing: { ...ownedPublicRunnerFixture.routing, ...routingPatch },
        };
      },
    });
    const routeJob = routeProbe.start({
      jobId: `P17ROUTE${label}01`,
      model: { schemaVersion: 'fixture-model-v1', nodes: [], analysisCases: [] },
      analysisCase: { id: 'PREFLIGHT', kind: 'static', settings: {} },
      computeTarget: 'cpu',
    });
    await routeProbe.wait(routeJob.id);
    const routeResult = routeProbe.getResult(routeJob.id);
    assert.equal(routeResult.routing.fallbackUsed, expectedFallback, `${label} fallback observation must not be masked`);
    if (label === 'POLICY') assert.equal(routeResult.routing.fallbackPolicy, 'allowed', 'reported fallback policy must not be overwritten');
    assert.throws(
      () => assertP17ProductExecutionPolicy(routeResult),
      (error) => error?.code === 'P17_PRODUCT_FALLBACK_POLICY_VIOLATION',
    );
    routeProbe.dispose();
  }
  const missingPublicRunnerProvenance = structuredClone(publicServiceResult);
  delete missingPublicRunnerProvenance.executionProvenance;
  missingPublicRunnerProvenance.productProvenance.executionProvenance = null;
  assert.throws(
    () => assertP17ProductExecutionPolicy(missingPublicRunnerProvenance),
    (error) => error?.code === 'P17_PUBLIC_RUNNER_PROVENANCE_REQUIRED',
  );
  publicServiceObservationProbe.dispose();

  const healthyService = makeFakeService(productServiceVersion);
  assert.throws(
    () => createP17ProductAdapter({ service: healthyService }),
    (error) => error?.code === 'P17_OFFICIAL_SERVICE_INJECTION_FORBIDDEN',
  );
  assert.throws(
    () => createP17ProductAdapter({ serviceFactory: () => healthyService }),
    (error) => error?.code === 'P17_OFFICIAL_SERVICE_INJECTION_FORBIDDEN',
  );
  assert.throws(
    () => createP17ProductAdapter({ serviceOptions: { caseRunner() {} } }),
    (error) => error?.code === 'P17_OFFICIAL_SERVICE_INJECTION_FORBIDDEN',
  );
  assert.throws(
    () => createP17ProductAdapter({ caseRunner() {} }),
    (error) => error?.code === 'P17_OFFICIAL_SERVICE_INJECTION_FORBIDDEN',
  );
  assert.throws(
    () => createP17ProductAdapter({ mode: P17_PRODUCT_ADAPTER_MODES.testOnly, service: healthyService }),
    (error) => error?.code === 'P17_TEST_PROVENANCE_REQUIRED',
  );
  assert.throws(
    () => createP17ProductAdapter({
      mode: P17_PRODUCT_ADAPTER_MODES.testOnly,
      service: healthyService,
      testProvenance: makeTestProvenance('P17-FORBIDDEN-EXEC', { solverExecuted: true }),
    }),
    (error) => error?.code === 'P17_TEST_EXECUTION_FORBIDDEN',
  );

  const adapter = createTestOnlyAdapter(healthyService, 'P17-HEALTHY-FAKE');
  const testFactoryAdapter = createP17ProductAdapter({
    mode: P17_PRODUCT_ADAPTER_MODES.testOnly,
    serviceFactory: () => makeFakeService(productServiceVersion),
    serviceOptions: { caseRunner() {} },
    testProvenance: makeTestProvenance('P17-FACTORY-FAKE'),
  });
  assert.equal(testFactoryAdapter.executionProvenance.serviceOrigin, 'TEST_ONLY_SERVICE_FACTORY');
  assert.equal(testFactoryAdapter.executionProvenance.callerServiceFactoryInjected, true);
  assert.equal(testFactoryAdapter.executionProvenance.callerCaseRunnerInjected, true);
  assert.equal(testFactoryAdapter.executionProvenance.caseRunnerBinding, 'TEST_ONLY_CALLER_CASE_RUNNER');
  assert.equal(testFactoryAdapter.preflight(request).ok, true);
  assert.deepEqual(validateP17ProductRequest(request), []);
  const preflight = adapter.preflight(request);
  assert.equal(preflight.ok, true);
  assert.equal(preflight.executionProvenance.mode, P17_PRODUCT_ADAPTER_MODES.testOnly);
  assert.equal(preflight.executionProvenance.terminalQualificationEligible, false);
  const result = await adapter.execute(request);
  assert.equal(result.runId, request.runId);
  assert.equal(result.status.status, 'completed');
  assert.equal(result.requestedComputeTarget, 'cpu');
  assert.equal(result.fallbackPolicy, 'forbidden');
  assert.equal(result.externalRuntimePolicy, 'FORBIDDEN');
  assert.equal(result.externalRuntimeObservation, 'EXPLICIT_FALSE');
  assert.equal(result.networkFallbackObservation, 'EXPLICIT_FALSE');
  assert.equal(result.executionProvenance.mode, 'TEST_ONLY_INJECTED');
  assert.equal(result.executionProvenance.terminalQualificationEligible, false);
  assert.equal(result.executionProvenance.testFixtureId, 'P17-HEALTHY-FAKE');
  assert.deepEqual(healthyService.calls, ['validate', 'validate', 'start', 'wait', 'getStatus', 'getResult']);

  const wrongVersion = createTestOnlyAdapter(makeFakeService('wrong-product-service-version'), 'P17-WRONG-VERSION');
  assert.throws(() => wrongVersion.preflight(request), (error) => error?.code === 'P17_PRODUCT_SERVICE_VERSION_MISMATCH');

  const leakedRequest = { ...request, expectedValues: [] };
  assert.ok(validateP17ProductRequest(leakedRequest).includes('P17_PRODUCT_REFERENCE_PAYLOAD_FORBIDDEN'));
  await assertRejectCode(() => adapter.execute(leakedRequest), 'P17_PRODUCT_REQUEST_INVALID');
  const nestedLeak = { ...request, model: { ...request.model, metadata: { oracle: { values: [] } } } };
  assert.ok(validateP17ProductRequest(nestedLeak).includes('P17_PRODUCT_REFERENCE_PAYLOAD_FORBIDDEN'));
  await assertRejectCode(() => adapter.execute(nestedLeak), 'P17_PRODUCT_REQUEST_INVALID');

  const fallbackAdapter = createTestOnlyAdapter(
    makeFakeService(productServiceVersion, {
      routing: { requestedTarget: 'cpu', executedTarget: 'cpu', fallbackPolicy: 'forbidden', fallbackUsed: true },
    }),
    'P17-FALLBACK-FAKE',
  );
  await assertRejectCode(() => fallbackAdapter.execute(request), 'P17_PRODUCT_FALLBACK_POLICY_VIOLATION');

  const externalRuntimeAdapter = createTestOnlyAdapter(
    makeFakeService(productServiceVersion, { externalRuntimeUsed: true }),
    'P17-EXTERNAL-FAKE',
  );
  await assertRejectCode(() => externalRuntimeAdapter.execute(request), 'P17_EXTERNAL_RUNTIME_FORBIDDEN');
  const missingRuntimeObservation = createTestOnlyAdapter(
    makeFakeService(productServiceVersion, { externalRuntimeUsed: undefined }),
    'P17-RUNTIME-MISSING',
  );
  await assertRejectCode(() => missingRuntimeObservation.execute(request), 'P17_EXTERNAL_RUNTIME_OBSERVATION_REQUIRED');
  const networkFallbackAdapter = createTestOnlyAdapter(
    makeFakeService(productServiceVersion, { networkFallbackUsed: true }),
    'P17-NETWORK-FAKE',
  );
  await assertRejectCode(() => networkFallbackAdapter.execute(request), 'P17_NETWORK_FALLBACK_FORBIDDEN');
  const missingNetworkObservation = createTestOnlyAdapter(
    makeFakeService(productServiceVersion, { networkFallbackUsed: undefined }),
    'P17-NETWORK-MISSING',
  );
  await assertRejectCode(() => missingNetworkObservation.execute(request), 'P17_NETWORK_FALLBACK_OBSERVATION_REQUIRED');

  const officialRecord = makeRunRecord(officialAdapter.executionProvenance, {
    runId: 'P17OFFICIAL01',
    reasonCodes: ['P17_ENGINE_NOT_EXECUTED_CONTRACT_TEST'],
  });
  validateManifestDocument('runRecord', officialRecord);
  const hashTamperedOfficial = structuredClone(officialRecord);
  hashTamperedOfficial.reasonCodes.push('P17_TAMPERED_AFTER_HASH');
  assert.throws(
    () => validateManifestDocument('runRecord', hashTamperedOfficial),
    /runRecordHash does not match/u,
  );
  const forgedOfficial = structuredClone(officialRecord);
  forgedOfficial.productBinding.executionProvenance.callerServiceInjected = true;
  rehashRunRecord(forgedOfficial);
  assert.throws(
    () => validateManifestDocument('runRecord', forgedOfficial),
    /official run provenance must prove/u,
  );

  const testOnlyRecord = makeRunRecord(result.executionProvenance, {
    runId: 'P17TESTONLY01',
    reasonCodes: ['P17_TEST_ONLY_EXECUTION_NOT_QUALIFIABLE'],
  });
  validateManifestDocument('runRecord', testOnlyRecord);
  const forgedTerminalTest = structuredClone(testOnlyRecord);
  forgedTerminalTest.status = 'EXECUTED';
  forgedTerminalTest.engineeringResultHash = 'a'.repeat(64);
  rehashRunRecord(forgedTerminalTest);
  assert.throws(
    () => validateManifestDocument('runRecord', forgedTerminalTest),
    /test-only execution cannot become a terminal qualification record/u,
  );
}

async function verifyM1FailClosedReferenceAndModelContracts() {
  const caseRoot = 'verification/benchmarks/strix21/cases/SB1';
  const referenceBundle = prepareReferenceBundle({
    sourceManifest: await readJson(`${caseRoot}/source/source-manifest.json`),
    referenceManifest: await readJson(`${caseRoot}/reference/reference-manifest.json`),
    expectedValues: await readJson(`${caseRoot}/reference/expected-values.json`),
    toleranceManifest: await readJson(`${caseRoot}/reference/tolerance-manifest.json`),
    probeManifest: await readJson(`${caseRoot}/reference/probe-manifest.json`),
  });
  assert.equal(referenceBundle.status, 'BLOCKED_REFERENCE');
  assert.equal(referenceBundle.payloadAbsent, true);
  assert.equal(referenceBundle.expectedValueCount, 0);
  assert.equal(referenceBundle.criterionCount, 0);
  assert.equal(referenceBundle.probeCount, 0);
  assert.ok(!Object.hasOwn(referenceBundle, 'expectedValues'));

  const model = prepareCaseModel({
    canonicalInput: await readJson(`${caseRoot}/model/canonical-input.json`),
    sstructuresInput: await readJson(`${caseRoot}/model/sstructures-input.json`),
    modelEquivalence: await readJson(`${caseRoot}/model/model-equivalence.json`),
  });
  assert.equal(model.status, 'BLOCKED_MODEL');
  assert.equal(model.payloadAbsent, true);
  assert.ok(!Object.hasOwn(model, 'productModel'));
  assert.throws(
    () => evaluateLockedComparison({ referenceBundle }),
    (error) => error?.code === 'P17_COMPARISON_REFERENCE_NOT_READY',
  );
}

async function verifyEvidenceOnlyReportTamperDetection() {
  assert.equal(P17_M1_TERMINAL_PASS_ENABLED, false, 'M1 must never authorize a terminal benchmark PASS');
  assert.throws(
    () => createCaptureIndex({
      caseId: 'SB1',
      runId: 'P17CAPTURE01',
      modelHash: '1'.repeat(64),
      status: 'COMPLETE',
      browser: 'CHROME',
      parityStatus: 'PASS',
      captures: [{
        ordinal: 1,
        kind: 'MODEL',
        path: 'figures/P17CAPTURE01/01-model.png',
        sha256: '1'.repeat(64),
        byteLength: 24,
        width: 1,
        height: 1,
        caseIdVisible: 'false',
        runIdVisible: true,
        modelHashVisible: true,
        unitsVisible: true,
        sourceValueParity: 'PASS',
      }],
    }),
    (error) => error?.code === 'P17_CAPTURE_BOOLEAN_REQUIRED',
  );
  const captureIndex = createCaptureIndex({
    caseId: 'SB1',
    status: 'NOT_RUN_M1_FRAMEWORK_ONLY',
    reasonCodes: ['P17_NO_UI_CAPTURE_IN_M1'],
  });
  assert.equal(captureIndex.runId, null);
  assert.equal(captureIndex.modelHash, null);
  assert.deepEqual(captureIndex.captures, []);
  const reportManifest = createReportManifest({
    caseId: 'SB1',
    reasonCodes: ['P17_NO_CASE_REPORT_IN_M1'],
  });
  assert.equal(reportManifest.status, 'NOT_GENERATED');
  assert.equal(reportManifest.runId, null);
  assert.equal(reportManifest.solverExecutionAllowed, false);
  assert.equal(reportManifest.comparisonCalculationAllowed, false);
  assert.equal(reportManifest.outputs.markdownPath, null);
  assert.equal(reportManifest.outputs.pdfPath, null);

  const evidenceCore = {
    schemaVersion: 'p17-case-evidence-v1',
    caseId: 'SB1',
    runId: 'P17M1E001',
    status: 'BLOCKED_REFERENCE',
    runRecordBinding: {
      path: 'verification/fixtures/p17-m1-result-free-run-record.json',
      sha256: sha256Canonical({ status: 'NOT_RUN_M1_FRAMEWORK_ONLY' }),
      contentSha256: '2'.repeat(64),
    },
    runCustodyBinding: {
      status: 'NOT_COMMITTED',
      runDirectoryPath: null,
      integrityManifestPath: null,
      integrityHash: null,
      directoryHash: null,
      custodyPayloadHash: null,
      storagePolicyVersion: null,
      authority: null,
      anchorId: null,
      keyId: null,
      reasonCodes: ['P17_NO_RUN_COMMITTED_IN_M1'],
    },
    comparison: {
      status: 'NOT_RUN',
      path: null,
      sha256: null,
      contentSha256: null,
      reasonCodes: ['P17_COMPARISON_NOT_RUN_IN_M1'],
    },
    hashChain: [{ ordinal: 1, role: 'SOURCE_MANIFEST', sha256: '1'.repeat(64) }],
    qualification: {
      mandatoryMetricCount: 0,
      passedMetricCount: 0,
      physicsGates: [],
      mutationGates: [],
      determinismHashes: [],
    },
    captures: {
      status: 'BLOCKED_UI',
      captureIndexPath: 'verification/benchmarks/strix21/cases/SB1/figures/capture-index.json',
      captureIndexHash: captureIndex.captureIndexHash,
      contentSha256: '3'.repeat(64),
      reasonCodes: ['P17_NO_UI_CAPTURE_IN_M1'],
    },
    reasonCodes: ['P17_REFERENCE_NOT_LOCKED'],
  };
  const evidence = { ...evidenceCore, evidenceHash: sha256Canonical(evidenceCore) };
  const snapshot = buildEvidenceOnlyReportSnapshot({ evidence, captureIndex });
  assert.equal(snapshot.caseId, 'SB1');
  assert.equal(snapshot.status, 'BLOCKED_REFERENCE');
  assert.equal(snapshot.captureStatus, 'NOT_RUN_M1_FRAMEWORK_ONLY');
  assert.equal(snapshot.captures.length, 0);
  assert.match(renderEvidenceOnlyMarkdown(snapshot), /BLOCKED_REFERENCE/);

  const forgedEvidence = structuredClone(evidence);
  forgedEvidence.reasonCodes.push('P17_FORGED_EVIDENCE');
  assert.throws(
    () => buildEvidenceOnlyReportSnapshot({ evidence: forgedEvidence, captureIndex }),
    /evidenceHash/u,
  );

  const forgedCaptureIndex = structuredClone(captureIndex);
  forgedCaptureIndex.reasonCodes.push('P17_FORGED_CAPTURE');
  assert.throws(
    () => buildEvidenceOnlyReportSnapshot({ evidence, captureIndex: forgedCaptureIndex }),
    /captureIndexHash/u,
  );

  const forgedBindingCore = {
    ...evidenceCore,
    captures: { ...evidenceCore.captures, captureIndexHash: 'f'.repeat(64) },
  };
  const forgedBinding = { ...forgedBindingCore, evidenceHash: sha256Canonical(forgedBindingCore) };
  assert.throws(
    () => buildEvidenceOnlyReportSnapshot({ evidence: forgedBinding, captureIndex }),
    (error) => error?.code === 'P17_REPORT_CAPTURE_BINDING_MISMATCH',
  );
}

function fixtureCase(caseId, ordinal, mode, timeoutMs) {
  return {
    caseId,
    ordinal,
    entrypoint: ISOLATION_FIXTURE,
    cwd: HARNESS_ROOT,
    args: [`--mode=${mode}`, `--case=${caseId}`],
    timeoutMs,
  };
}

function makeTestProvenance(fixtureId, patch = {}) {
  return {
    fixtureId,
    source: 'tests/p17-m1-framework-contract.mjs',
    purpose: 'P17_M1_ADAPTER_CONTRACT_TEST',
    solverExecuted: false,
    benchmarkExecuted: false,
    ...patch,
  };
}

function createTestOnlyAdapter(service, fixtureId) {
  return createP17ProductAdapter({
    mode: P17_PRODUCT_ADAPTER_MODES.testOnly,
    service,
    testProvenance: makeTestProvenance(fixtureId),
  });
}

function makeRunRecord(executionProvenance, patch = {}) {
  const hash = '1'.repeat(64);
  const core = {
    schemaVersion: 'p17-run-record-v1',
    caseId: 'SB1',
    runId: patch.runId || 'P17RECORD01',
    status: patch.status || 'BLOCKED_ENGINE',
    appendOnly: true,
    createdAt: '2026-08-28T00:00:00.000Z',
    productBinding: {
      serviceVersion: 'p9-m9-product-analysis-service-v1',
      adapterVersion: 'p17-m1-product-adapter-v1',
      publicEntrypoint: 'src/index.js',
      externalRuntimeUsed: false,
      networkFallbackUsed: false,
      executionProvenance: structuredClone(executionProvenance),
    },
    inputHashes: {
      sourceArtifactHash: hash,
      referenceManifestHash: hash,
      toleranceHash: hash,
      probeHash: hash,
      canonicalCaseHash: hash,
      modelMappingHash: hash,
      nativeModelHash: hash,
      solverSettingsHash: hash,
      productSourceHash: hash,
      buildHash: hash,
      dependencyLockHash: hash,
    },
    execution: {
      isolatedProcess: true,
      timeoutMs: 1_000,
      durationMs: 0,
      exitCode: null,
      signal: null,
      stdoutHash: hash,
      stderrHash: hash,
    },
    engineeringResultHash: patch.engineeringResultHash ?? null,
    artifactHashes: [],
    reasonCodes: patch.reasonCodes || ['P17_ENGINE_NOT_EXECUTED_CONTRACT_TEST'],
  };
  return { ...core, runRecordHash: sha256Canonical(core) };
}

function rehashRunRecord(record) {
  const core = Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'runRecordHash'));
  record.runRecordHash = sha256Canonical(core);
  return record;
}

function makeFakeService(version, resultPatch = {}) {
  const calls = [];
  let currentRequest = null;
  const baseResult = {
    externalRuntimeUsed: false,
    networkFallbackUsed: false,
    routing: {
      requestedTarget: 'cpu',
      executedTarget: 'cpu',
      fallbackPolicy: 'forbidden',
      fallbackUsed: false,
    },
  };
  const result = {
    ...baseResult,
    ...resultPatch,
    routing: resultPatch.routing ? { ...baseResult.routing, ...resultPatch.routing } : baseResult.routing,
  };
  return {
    version,
    calls,
    validate(request) {
      calls.push('validate');
      currentRequest = request;
      return { ok: true, blocking: [] };
    },
    start(request) {
      calls.push('start');
      currentRequest = request;
      return { id: request.jobId };
    },
    async wait() { calls.push('wait'); },
    getStatus() {
      calls.push('getStatus');
      return { id: currentRequest.jobId, status: 'completed' };
    },
    getResult() {
      calls.push('getResult');
      return structuredClone(result);
    },
  };
}

async function assertRejectCode(action, expectedCode) {
  await assert.rejects(action, (error) => error?.code === expectedCode);
}
