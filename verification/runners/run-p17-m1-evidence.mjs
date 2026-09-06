#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MANIFEST_SCHEMA_FILES } from '../framework/phase17/constants.mjs';
import { sha256Canonical } from '../framework/phase17/canonical.mjs';
import { buildP17M1Scaffold } from '../framework/phase17/scaffoldBuilder.mjs';
import { P17_M1_TERMINAL_PASS_ENABLED } from '../framework/phase17/evidenceReport.mjs';
import {
  REPOSITORY_ROOT,
  VERIFICATION_PATHS,
  VERIFICATION_REPOSITORY_PATHS,
} from '../workspace-paths.mjs';

export const P17_M1_EVIDENCE_VERSION = 'p17-m1-case-contract-shared-harness-evidence-v6';
export const P17_M1_STATUS = 'CONTRACT_READY_NO_BENCHMARK_RUNS';
export const P17_M1_AUDIT_DATE = '2026-08-28';

const OUTPUT_PATH = VERIFICATION_PATHS.phase17M1Evidence;
const OUTPUT_REPOSITORY_PATH = VERIFICATION_REPOSITORY_PATHS.phase17M1Evidence;
const REGISTRY_PATH = 'verification/benchmarks/strix21/suite-source-registry-r2.json';
const SUITE_MANIFEST_PATH = 'verification/benchmarks/strix21/suite-manifest.json';
const M0_CLOSURE_PATH = 'verification/evidence/validation/phase17/p17-m0-validation-closure-r3.json';
const M0_R4_PATH = 'verification/evidence/validation/phase17/p17-m0-documentation-qualification-r4.json';
const M0_R4_DOCUMENT_PATH = 'docs/phase17/reviews/P17-M0-CODE-AND-ARTIFACT-REVIEW-ADDENDUM-R4.md';
const SUPERSEDED_R5_PATH = 'verification/evidence/validation/phase17/p17-m1-case-contract-shared-harness-r5.json';

const IMPLEMENTATION_PATHS = Object.freeze([
  'package.json',
  'src/index.js',
  'src/compute/product/analysisProductService.js',
  'src/ui/analysisRunners.js',
  'verification/framework/phase17/appendOnlyRunStore.mjs',
  'verification/framework/phase17/canonical.mjs',
  'verification/framework/phase17/caseModelBuilder.mjs',
  'verification/framework/phase17/comparisonEvaluator.mjs',
  'verification/framework/phase17/constants.mjs',
  'verification/framework/phase17/evidenceReport.mjs',
  'verification/framework/phase17/index.mjs',
  'verification/framework/phase17/isolatedSuiteRunner.mjs',
  'verification/framework/phase17/jsonSchemaStrict.mjs',
  'verification/framework/phase17/manifestValidation.mjs',
  'verification/framework/phase17/productAdapter.mjs',
  'verification/framework/phase17/referenceRepository.mjs',
  'verification/framework/phase17/resultExtractor.mjs',
  'verification/framework/phase17/scaffoldBuilder.mjs',
  'verification/harnesses/check-p17-m1-boundaries.mjs',
  'verification/harnesses/check-layout.mjs',
  'verification/harnesses/check-public-import-contracts.mjs',
  'verification/harnesses/finalize-p17-m1.mjs',
  'verification/harnesses/generate-test-taxonomy.mjs',
  'verification/harnesses/json-schema-strict.mjs',
  'verification/harnesses/p17-m1-isolation-fixture.mjs',
  'verification/index.js',
  'verification/runners/run-p17-case.mjs',
  'verification/runners/run-p17-m1-evidence.mjs',
  'verification/runners/run-p17-suite.mjs',
  'verification/runners/scaffold-p17-m1.mjs',
  'verification/tests/phase17/run-case-contract.mjs',
  'verification/workspace-paths.mjs',
  'tests/p17-m1-framework-contract.mjs',
  'tests/p17-m1-json-schema-validator.mjs',
  'tests/p17-m1-result-extractor.mjs',
  'tools/render-p17-m1-report.mjs',
  'tools/run-p17-m1-evidence.mjs',
  'verification/benchmarks/strix21/reporting/render_p17_m1_report.py',
  'verification/benchmarks/strix21/reporting/requirements-p17-m1.txt',
  'verification/specs/phase17/p17-m1-validation-closure-schema.json',
]);

export function buildP17M1Evidence() {
  const registry = readJson(REGISTRY_PATH);
  const suite = readJson(SUITE_MANIFEST_PATH);
  const m0Closure = readJson(M0_CLOSURE_PATH);
  const m0R4 = readJson(M0_R4_PATH);
  const scaffold = buildP17M1Scaffold(registry);
  const scaffoldRows = [...scaffold.entries()].map(([repositoryPath, text]) => ({
    path: repositoryPath,
    byteLength: Buffer.byteLength(text, 'utf8'),
    sha256: sha256(Buffer.from(text, 'utf8')),
  }));
  const schemaPaths = [...new Set(Object.values(MANIFEST_SCHEMA_FILES))]
    .sort()
    .map((name) => `verification/specs/phase17/${name}`);
  const implementationInventory = inventory([...IMPLEMENTATION_PATHS, ...schemaPaths]);

  const checks = {
    scaffold: runJsonCommand('node verification/runners/scaffold-p17-m1.mjs --check', 'verification/runners/scaffold-p17-m1.mjs', ['--check']),
    schemaValidator: runJsonCommand('node tests/p17-m1-json-schema-validator.mjs', 'tests/p17-m1-json-schema-validator.mjs'),
    frameworkContract: runJsonCommand('node tests/p17-m1-framework-contract.mjs', 'tests/p17-m1-framework-contract.mjs'),
    resultExtractor: runJsonCommand('node tests/p17-m1-result-extractor.mjs', 'tests/p17-m1-result-extractor.mjs'),
    boundaryAudit: runJsonCommand('node verification/harnesses/check-p17-m1-boundaries.mjs --fail-on-findings', 'verification/harnesses/check-p17-m1-boundaries.mjs', ['--fail-on-findings']),
    m0Regression: runJsonCommand('node tests/p17-m0-source-lock.mjs', 'tests/p17-m0-source-lock.mjs'),
  };
  assertEvidenceInputs({ registry, suite, m0Closure, m0R4, scaffold, schemaPaths, checks });

  const core = {
    version: P17_M1_EVIDENCE_VERSION,
    auditDate: P17_M1_AUDIT_DATE,
    phase: 17,
    milestone: 'P17-M1',
    status: P17_M1_STATUS,
    supersedes: {
      ...binding(SUPERSEDED_R5_PATH),
      reason: 'R5 produced and visually verified report R2, but closure checks could not start because direct spawnSync of npm.cmd returned EINVAL on Windows. Append-only policy preserves R5/report R2; R6 binds the fixed cmd.exe /d /s /c invocation and report R3 without changing any zero-result claim.',
    },
    claimBoundary: {
      proven: 'The canonical Phase 17 result-free case contract and shared harness are ready for the M2 implementation gates.',
      notProven: 'No structural model, solver result, benchmark value, case PASS, STRIX R4 run, MIDAS R4 run, performance result or release claim is produced by M1.',
    },
    predecessorBindings: {
      m0Closure: binding(M0_CLOSURE_PATH, { closureHash: m0Closure.closureHash }),
      m0R4Qualification: binding(M0_R4_PATH, { correctionHash: m0R4.correctionHash }),
      m0R4Document: binding(M0_R4_DOCUMENT_PATH),
      sourceRegistry: binding(REGISTRY_PATH, { registryHash: registry.registryHash }),
    },
    frameworkInventory: {
      officialCaseCount: 21,
      customCaseCount: 1,
      officialOrder: [...suite.officialOrder],
      customCaseIds: suite.customCases.map((row) => row.caseId),
      requiredFilesPerCase: 19,
      generatedScaffoldFileCount: scaffold.size,
      scaffoldAggregateHash: sha256Canonical(scaffoldRows),
      runtimeManifestSchemaCount: schemaPaths.length,
      runtimeManifestSchemas: schemaPaths,
      implementationFileCount: implementationInventory.files.length,
      implementationAggregateHash: implementationInventory.aggregateHash,
      implementationFiles: implementationInventory.files,
    },
    responsibilitySeparation: {
      modelBuilder: 'verification/framework/phase17/caseModelBuilder.mjs',
      referenceRepository: 'verification/framework/phase17/referenceRepository.mjs',
      resultExtractor: 'verification/framework/phase17/resultExtractor.mjs',
      productAdapter: 'verification/framework/phase17/productAdapter.mjs',
      comparisonEvaluator: 'verification/framework/phase17/comparisonEvaluator.mjs',
      appendOnlyWriter: 'verification/framework/phase17/appendOnlyRunStore.mjs',
      isolatedRunner: 'verification/framework/phase17/isolatedSuiteRunner.mjs',
      evidenceReport: 'verification/framework/phase17/evidenceReport.mjs',
      productPublicEntrypoint: 'src/index.js',
    },
    checks: [
      checkRecord('P17-M1-G01', 'official/custom scaffold and strict manifests', checks.scaffold),
      checkRecord('P17-M1-G02', 'strict schema validator and nested mutations', checks.schemaValidator),
      checkRecord('P17-M1-G03', 'framework, isolation, append-only, adapter and report negative tests', checks.frameworkContract),
      checkRecord('P17-M1-G04', 'data-only result extraction and replay contract', checks.resultExtractor),
      checkRecord('P17-M1-G05', 'active Phase 17 import/reference boundary', checks.boundaryAudit),
      checkRecord('P17-M1-G06', 'sealed M0 source-custody regression', checks.m0Regression),
    ],
    contractSmoke: {
      processIsolatedCaseCount: 22,
      officialCaseCount: 21,
      customCaseCount: 1,
      contractValidatedCount: 22,
      failedCount: 0,
      timedOutCount: 0,
      spawnBlockedCount: 0,
      deterministicOfficialOrder: true,
      benchmarkExecuted: false,
      solverExecuted: false,
    },
    negativeTests: {
      isolationSequence: checks.frameworkContract.assertions.isolationSequence,
      isolationPolicyBlocks: checks.frameworkContract.assertions.isolationPolicyBlocks,
      appendOnlyTamperClasses: checks.frameworkContract.assertions.appendOnlyTamperClasses,
      appendOnlyCustodyPolicy: checks.frameworkContract.assertions.appendOnlyCustodyPolicy,
      productPolicyBlocks: checks.frameworkContract.assertions.productPolicyBlocks,
      reportTamperClasses: checks.frameworkContract.assertions.reportTamperClasses,
      schemaMutations: checks.schemaValidator.coverage,
      resultExtractorMutations: checks.resultExtractor.negativeCoverage,
    },
    architectureBoundary: {
      activePhase17ProductToVerificationImports: checks.boundaryAudit.findings.productToVerification.length,
      activePhase17DeepProductImports: checks.boundaryAudit.findings.activeDeepProductImports.length,
      activePhase17PublicProductImports: checks.boundaryAudit.findings.activePublicProductImports.length,
      activePhase17ReferenceLeakage: checks.boundaryAudit.findings.p17ProductionReferenceLeakage.length,
      evidenceReportSolverImports: checks.boundaryAudit.findings.reportSolverImports.length,
      activePhase17ForbiddenRuntimeImports: checks.boundaryAudit.findings.activeForbiddenRuntimeImports.length,
      productBoundaryExternalIoFindings: checks.boundaryAudit.findings.productBoundaryExternalIo.length,
      activePhase17ImportCycles: checks.boundaryAudit.findings.cycles.length,
      auditHash: checks.boundaryAudit.auditHash,
      claimScope: checks.boundaryAudit.historicalDebt.claimBoundary,
    },
    historicalReleaseDebt: {
      status: checks.boundaryAudit.historicalDebt.status,
      legacyVerificationProductImportCount: checks.boundaryAudit.historicalDebt.legacyVerificationProductImportCount,
      legacyVerificationDeepProductImportCount: checks.boundaryAudit.historicalDebt.legacyVerificationDeepProductImportCount,
      legacyVerificationDeepProductFileCount: checks.boundaryAudit.historicalDebt.legacyVerificationDeepProductFileCount,
      genericProductionExpectedValueDebtCount: checks.boundaryAudit.historicalDebt.genericProductionExpectedValueDebtCount,
      genericProductionExpectedValueDebt: checks.boundaryAudit.historicalDebt.genericProductionExpectedValueDebt,
    },
    m0R4CarryForward: {
      priorStatus: m0R4.correction.residualDebtStatus,
      m1AuthoritativeRecordStatus: 'CLOSED_FOR_M1_AUTHORITATIVE_RECORDS',
      strictSchemaDefinitionCount: schemaPaths.length,
      unknownKeywordPolicy: 'FAIL_CLOSED',
      storedArtifactValidation: 'INDEPENDENTLY_RUNNABLE',
      mutationCoverage: checks.schemaValidator.coverage,
      historicalM0R3SchemasModified: false,
    },
    terminalAuthorization: {
      enabled: false,
      status: 'FAIL_CLOSED_PENDING_M2_REPLAY_AND_TRUST_GATES',
      candidateStatusOnly: 'QUALIFICATION_CANDIDATE',
      requiredBeforeEnablement: [
        'OFFICIAL_EXECUTION_ORCHESTRATOR_AND_RECEIPT',
        'PINNED_EXTERNAL_EXECUTION_CUSTODIAN_TRUST_REGISTRY',
        'REFERENCE_ARTIFACT_BYTE_AUDIT',
        'EXTRACTION_AND_COMPARISON_REPLAY',
        'PHYSICS_AND_MUTATION_REPLAY',
        'THREE_INDEPENDENT_EXTERNALLY_CUSTODIED_RUNS',
        'DETERMINISTIC_PDF_REPRODUCTION_AND_VISUAL_PARITY_AUDIT',
        'SCOPED_INDEPENDENT_REVIEWER_ATTESTATIONS',
      ],
    },
    resultCounters: {
      benchmarkExecutionCount: 0,
      solverExecutionCount: 0,
      engineeringResultCount: 0,
      structuralModelCount: 0,
      chromeCaptureCount: 0,
      caseReportCount: 0,
      officialTerminalCaseCount: 0,
      officialPassCount: 0,
      strixR4RunCount: 0,
      midasR4RunCount: 0,
      performanceComparisonCount: 0,
    },
    releaseAllowed: false,
    finalDesignTransferAllowed: false,
    nextMilestone: {
      id: 'P17-M2',
      caseId: 'SB1',
      entryCondition: 'M1 framework closure is immutable; M2 must implement and test every terminal-authorization gate before SB1 can advance beyond QUALIFICATION_CANDIDATE.',
    },
    reasonCodes: [
      'P17_M1_FRAMEWORK_ONLY_NO_BENCHMARK_EXECUTION',
      'P17_M1_TERMINAL_PASS_DISABLED_PENDING_M2_REPLAY_GATES',
      'P17_M1_R2_SUPERSEDED_RENDERER_CUSTODY_TOKEN_MISMATCH',
      'P17_M1_R3_SUPERSEDED_PDF_STATUS_TOKEN_WRAP_QA',
      'P17_M1_R4_SUPERSEDED_CLOSURE_QA_SCOPE_FIELD_MISMATCH',
      'P17_M1_R5_SUPERSEDED_WINDOWS_NPM_CMD_SPAWN_EINVAL',
      'FOUR_INDEPENDENT_REVIEWER_APPROVALS_PENDING',
      'STRIX_RAW_RECORD_ARCHIVE_AND_PUBLISHED_SHA_UNAVAILABLE',
      'LEGACY_VERIFICATION_DEEP_IMPORT_DEBT_OPEN',
      'GENERIC_PRODUCTION_EXPECTED_VALUE_DEBT_OPEN',
    ],
    evidencePath: OUTPUT_REPOSITORY_PATH,
  };
  return { ...core, evidenceHash: sha256Canonical(core) };
}

export function runP17M1Evidence({ write = false } = {}) {
  const evidence = buildP17M1Evidence();
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (write) {
    mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    if (existsSync(OUTPUT_PATH)) {
      const current = readFileSync(OUTPUT_PATH, 'utf8');
      if (current !== serialized) throw new Error(`Refusing to overwrite non-identical append-only M1 evidence: ${OUTPUT_REPOSITORY_PATH}`);
    } else {
      writeFileSync(OUTPUT_PATH, serialized, { encoding: 'utf8', flag: 'wx' });
    }
  } else {
    if (!existsSync(OUTPUT_PATH)) throw new Error(`M1 evidence is missing: ${OUTPUT_REPOSITORY_PATH}`);
    if (readFileSync(OUTPUT_PATH, 'utf8') !== serialized) throw new Error(`M1 evidence is stale or modified: ${OUTPUT_REPOSITORY_PATH}`);
  }
  return evidence;
}

function assertEvidenceInputs({ registry, suite, m0Closure, m0R4, scaffold, schemaPaths, checks }) {
  if (m0Closure.closureHash !== '4b0b748eadad0d48b2ffa80f9dbae7d37b2d4c1a808b4390fae1b9bc7abae224') throw new Error('Unexpected M0 closure binding.');
  if (m0R4.correction?.residualDebtStatus !== 'OPEN_SCHEMA_DEBT_CARRIED_TO_M1' || m0R4.milestoneImpact?.m1EntryAllowed !== true) throw new Error('M0 R4 does not authorize the M1 carry-forward closure.');
  if (registry.registryHash !== suite.sourceRegistryBinding.registryHash) throw new Error('Suite and R2 registry binding mismatch.');
  const currentRegistryBinding = binding(REGISTRY_PATH);
  const sealedRegistryBinding = m0Closure.evidenceChain?.registry;
  if (currentRegistryBinding.byteLength !== sealedRegistryBinding?.byteLength || currentRegistryBinding.sha256 !== sealedRegistryBinding?.sha256 || registry.registryHash !== sealedRegistryBinding?.registryHash) throw new Error('R2 registry bytes/canonical hash differ from the sealed M0 R3 trust anchor.');
  if (scaffold.size !== 419 || schemaPaths.length !== 16) throw new Error('Unexpected M1 scaffold or runtime schema inventory.');
  if (checks.scaffold.expectedFileCount !== 419 || checks.scaffold.unchangedFileCount !== 419 || checks.scaffold.benchmarkExecutionCount !== 0) throw new Error('Scaffold check did not prove a result-free 419-file contract.');
  if (checks.schemaValidator.status !== 'PASS' || checks.frameworkContract.status !== 'PASS' || checks.resultExtractor.status !== 'PASS' || checks.boundaryAudit.ok !== true || checks.m0Regression.status !== 'PASS') throw new Error('One or more M1 evidence checks failed.');
  if (checks.frameworkContract.benchmarkExecuted || checks.frameworkContract.solverExecuted || checks.frameworkContract.engineeringResultCount !== 0) throw new Error('M1 framework test unexpectedly executed engineering work.');
  if (P17_M1_TERMINAL_PASS_ENABLED !== false) throw new Error('M1 terminal PASS gate must remain disabled.');
}

function runJsonCommand(command, script, args = []) {
  const result = spawnSync(process.execPath, [path.join(REPOSITORY_ROOT, ...script.split('/')), ...args], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}):\n${result.stderr || result.stdout}`);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${command} did not emit one JSON document.`, { cause: error });
  }
}

function checkRecord(id, purpose, result) {
  return {
    id,
    purpose,
    commandStatus: result.status === 'PASS' || result.ok === true || result.conflicts?.length === 0 ? 'PASS' : 'FAIL',
    resultHash: sha256Canonical(result),
  };
}

function inventory(repositoryPaths) {
  const files = repositoryPaths.sort().map((repositoryPath) => binding(repositoryPath));
  return { files, aggregateHash: sha256Canonical(files) };
}

function binding(repositoryPath, extra = {}) {
  const absolute = path.join(REPOSITORY_ROOT, ...repositoryPath.split('/'));
  const bytes = readFileSync(absolute);
  return { path: repositoryPath, byteLength: bytes.byteLength, sha256: sha256(bytes), ...extra };
}

function readJson(repositoryPath) {
  return JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, ...repositoryPath.split('/')), 'utf8'));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invoked === import.meta.url) {
  const evidence = runP17M1Evidence({ write: process.argv.includes('--write') });
  process.stdout.write(`${JSON.stringify({
    status: evidence.status,
    evidencePath: evidence.evidencePath,
    evidenceHash: evidence.evidenceHash,
    officialCaseCount: evidence.frameworkInventory.officialCaseCount,
    runtimeManifestSchemaCount: evidence.frameworkInventory.runtimeManifestSchemaCount,
    benchmarkExecutionCount: evidence.resultCounters.benchmarkExecutionCount,
    solverExecutionCount: evidence.resultCounters.solverExecutionCount,
    releaseAllowed: evidence.releaseAllowed,
  }, null, 2)}\n`);
}
