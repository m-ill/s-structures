import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertJsonSchema } from './json-schema-lite.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_ROOT = path.resolve(process.env.P17_SOURCE_ROOT || path.join(ROOT, '..', 'STRIX-verification-21'));
const AUDIT_DATE = '2026-08-28';
const REPORT_STEM = 'P17-M0-BASELINE-SOURCE-LOCK-REPORT-R2';
const REPORT_DIR = path.join(ROOT, 'output', 'verification', 'phase17');
const REPORT_MANIFEST_R3 = path.join(REPORT_DIR, `${REPORT_STEM}.manifest-r3.json`);
const CLOSURE_R3 = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase17', 'p17-m0-validation-closure-r3.json');

const slash = (value) => value.replaceAll('\\', '/');
const relative = (value) => slash(path.relative(ROOT, value));
const readJson = (value) => JSON.parse(readFileSync(value, 'utf8'));
const sha256Buffer = (value) => createHash('sha256').update(value).digest('hex');
const sha256File = (value) => sha256Buffer(readFileSync(value));
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};
const canonicalHash = (value) => sha256Buffer(Buffer.from(JSON.stringify(canonicalize(value)), 'utf8'));
const without = (value, key) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
const fileRecord = (absolute, logicalPath = relative(absolute)) => ({
  path: logicalPath,
  byteLength: statSync(absolute).size,
  sha256: sha256File(absolute),
});

function assertCanonicalHash(value, key, label) {
  const actual = canonicalHash(without(value, key));
  if (value[key] !== actual) throw new Error(`${label} ${key} mismatch: ${value[key]} != ${actual}`);
}

function writeImmutableJson(target, value) {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  if (existsSync(target)) {
    if (readFileSync(target, 'utf8') !== payload) throw new Error(`Refusing to overwrite immutable artifact: ${relative(target)}`);
    return;
  }
  writeFileSync(target, payload, { encoding: 'utf8', flag: 'wx' });
}

function buildReportManifest() {
  const baselinePath = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase17', 'p17-m0-baseline-source-lock-r2.json');
  const auditPath = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase17', 'p17-m0-source-value-presence-audit-r3.json');
  const qualificationPath = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase17', 'p17-m0-r2-claim-qualification-r1.json');
  const registryPath = path.join(ROOT, 'verification', 'benchmarks', 'strix21', 'suite-source-registry-r2.json');
  const originalManifestPath = path.join(REPORT_DIR, `${REPORT_STEM}.manifest.json`);
  const qaClosurePath = path.join(REPORT_DIR, `${REPORT_STEM}.qa-closure.json`);
  const visualQaPath = path.join(REPORT_DIR, 'P17-M0-REPORT-VISUAL-QA-R2.json');
  const semanticQaPath = path.join(REPORT_DIR, 'P17-M0-REPORT-SEMANTIC-REPRODUCTION-QA-R3.json');
  const reportPdfPath = path.join(REPORT_DIR, `${REPORT_STEM}.pdf`);
  const reportMdPath = path.join(REPORT_DIR, `${REPORT_STEM}.md`);
  const baseline = readJson(baselinePath);
  const audit = readJson(auditPath);
  const qualification = readJson(qualificationPath);
  const registry = readJson(registryPath);
  const originalManifest = readJson(originalManifestPath);
  const qaClosure = readJson(qaClosurePath);
  const visualQa = readJson(visualQaPath);
  const semanticQa = readJson(semanticQaPath);
  assertCanonicalHash(baseline, 'baselineHash', 'baseline');
  assertCanonicalHash(audit, 'auditHash', 'source value-presence audit');
  assertCanonicalHash(qualification, 'qualificationHash', 'R2 claim qualification');
  assertCanonicalHash(registry, 'registryHash', 'registry');
  assertCanonicalHash(semanticQa, 'qaHash', 'report semantic reproduction QA');
  if (qualification.appliesTo.baselineHash !== baseline.baselineHash
    || qualification.replacementEvidence.auditHash !== audit.auditHash
    || qualification.replacementEvidence.sha256 !== sha256File(auditPath)) {
    throw new Error('R2 claim qualification chain mismatch');
  }

  const expectedPdfHash = originalManifest.pdf.sha256;
  const expectedMdHash = originalManifest.markdown.sha256;
  if (sha256File(reportPdfPath) !== expectedPdfHash || sha256File(reportMdPath) !== expectedMdHash) {
    throw new Error('Final report bytes differ from the original immutable report manifest');
  }
  if (qaClosure.reportQaStatus !== 'PASS' || visualQa.status !== 'PASS') throw new Error('Final report visual QA is not closed');
  if (semanticQa.status !== 'PASS_SEMANTIC_AND_PIXEL_IDENTICAL'
    || semanticQa.renderedPixelIdentity !== 'PASS_9_OF_9'
    || semanticQa.sealedReport.sha256 !== expectedPdfHash) {
    throw new Error('Final report semantic/pixel reproduction QA is not closed');
  }
  if (qaClosure.automatedManifest.sha256 !== sha256File(originalManifestPath)) throw new Error('QA closure no longer binds the original report manifest');
  if (qaClosure.visualQa.sha256 !== sha256File(visualQaPath)) throw new Error('QA closure no longer binds visual QA');

  const locksDir = path.join(ROOT, 'verification', 'benchmarks', 'strix21', 'references', 'source-locks-r2');
  const locks = Object.fromEntries(registry.officialOrder.map((caseId) => [caseId, readJson(path.join(locksDir, `${caseId}.source-lock.json`))]));
  const manualPath = path.join(SOURCE_ROOT, 'documents', 'StrixVerificationManual.pdf');
  const sh1Path = path.join(SOURCE_ROOT, 'reports', 'SH1.pdf');
  const manualExpected = locks.SB1.sourceRoles.archivalNarrative.manual.sha256;
  const sh1Expected = locks.SH1.sourceRoles.archivalNarrative.casePdf.sha256;
  if (sha256File(manualPath) !== manualExpected || sha256File(sh1Path) !== sh1Expected) {
    throw new Error('Screenshot source PDF hash mismatch');
  }

  const screenshots = [
    {
      purpose: 'OFFICIAL_21_MANUAL_CONTENTS',
      artifact: path.join(REPORT_DIR, 'assets', '79e7f15ac82fdef6aeb5d07e70964d4a17bb8ee13599a3822233bd8001571fef.png'),
      source: { path: 'STRIX-verification-21/documents/StrixVerificationManual.pdf', sha256: manualExpected, pdfPageIndex: 1, displayPageNumber: 2 },
    },
    {
      purpose: 'SH1_TWO_ROW_VISUAL_CLIPPING',
      artifact: path.join(REPORT_DIR, 'assets', '78bc71ae3a7a53ff9dd3134d2dc19117ba19930cfa5fea07232e8890195b305e.png'),
      source: { path: 'STRIX-verification-21/reports/SH1.pdf', sha256: sh1Expected, pdfPageIndex: 2, displayPageNumber: 3 },
    },
  ].map((item) => {
    const artifact = fileRecord(item.artifact);
    if (path.basename(item.artifact, '.png') !== artifact.sha256) throw new Error(`Screenshot is not content-addressed: ${artifact.path}`);
    return { purpose: item.purpose, artifact, source: item.source };
  });

  const requirementsPath = path.join(ROOT, 'verification', 'benchmarks', 'strix21', 'reporting', 'requirements-p17-m0.txt');
  const requirements = readFileSync(requirementsPath, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const manifest = {
    version: 'p17-m0-report-final-manifest-v2',
    manifestRevision: 3,
    reportRevision: 2,
    auditDate: AUDIT_DATE,
    status: 'REPORT_QA_PASS_COMPLETE_WITH_SOURCE_BLOCKERS',
    supersedes: {
      path: relative(originalManifestPath),
      sha256: sha256File(originalManifestPath),
      reason: 'The original manifest left visual QA pending and referenced temporary screenshots; R3 binds the closed QA chain, permanent content-addressed PNGs and source PDF locators without altering report R2.',
    },
    baselineEvidence: { ...fileRecord(baselinePath), baselineHash: baseline.baselineHash },
    claimQualification: { ...fileRecord(qualificationPath), qualificationHash: qualification.qualificationHash },
    sourceValuePresenceAudit: { ...fileRecord(auditPath), auditHash: audit.auditHash },
    report: {
      markdown: fileRecord(reportMdPath),
      pdf: { ...fileRecord(reportPdfPath), pageCount: originalManifest.pdf.pageCount },
    },
    qa: {
      originalAutomatedManifest: fileRecord(originalManifestPath),
      visualQa: { ...fileRecord(visualQaPath), status: visualQa.status, reviewedPages: visualQa.render.reviewedPages },
      finalQaClosure: { ...fileRecord(qaClosurePath), status: qaClosure.reportQaStatus },
      semanticReproductionQa: { ...fileRecord(semanticQaPath), status: semanticQa.status, qaHash: semanticQa.qaHash },
    },
    sourceScreenshots: screenshots,
    renderer: {
      script: fileRecord(path.join(ROOT, 'verification', 'benchmarks', 'strix21', 'reporting', 'render_p17_m0_report.py')),
      launcher: fileRecord(path.join(ROOT, 'tools', 'render-p17-m0-report.mjs')),
      requirements: fileRecord(requirementsPath),
      exactPins: requirements,
      sourceRootOverride: 'P17_SOURCE_ROOT',
      draftCommand: 'npm.cmd run report:p17:m0:draft',
      sealedFinalVerificationCommand: 'npm.cmd run report:p17:m0:final',
    },
    claimBoundary: {
      solverExecuted: false,
      strixActualR4Used: false,
      midasActualR4Used: false,
      sStructuresModelScreenshotIncluded: false,
      semanticAndPixelReproduction: 'PASS_9_OF_9',
      exactPdfByteReproduction: 'NOT_CLAIMED_EXISTING_R2_BYTES_ARE_IMMUTABLY_HASHED',
    },
    releaseAllowed: false,
    finalDesignTransferAllowed: false,
  };
  manifest.manifestHash = canonicalHash(manifest);
  assertJsonSchema(readJson(path.join(ROOT, 'verification', 'specs', 'phase17', 'p17-m0-report-final-manifest-schema.json')), manifest, 'P17-M0 report final manifest');
  return manifest;
}

function runCommand(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return { command: [command, ...args].join(' '), status: 'PASS' };
}

function collectFiles(target, records) {
  if (!existsSync(target)) return;
  const state = lstatSync(target);
  if (state.isSymbolicLink()) throw new Error(`Inventory refuses symlink/junction: ${relative(target)}`);
  if (state.isFile()) {
    if (!target.endsWith('.pyc')) records.set(relative(target), fileRecord(target));
    return;
  }
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name === '__pycache__') continue;
    collectFiles(path.join(target, entry.name), records);
  }
}

function implementationInventory() {
  const records = new Map();
  const targets = [
    'package.json',
    'docs/README.md',
    'docs/phase17',
    'verification/workspace-paths.mjs',
    'verification/specs/phase17',
    'verification/runners/run-p17-m0-source-lock.mjs',
    'verification/harnesses/json-schema-lite.mjs',
    'verification/harnesses/finalize-p17-m0.mjs',
    'verification/benchmarks/strix21/suite-source-registry.json',
    'verification/benchmarks/strix21/suite-source-registry-r2.json',
    'verification/benchmarks/strix21/references',
    'verification/benchmarks/strix21/reporting',
    'verification/benchmarks/strix21/runs/first-batch-results.json',
    'verification/benchmarks/strix21/runs/S-Structures_STRIX21_1차_비교보고서.md',
    'verification/evidence/validation/phase17',
    'verification/archive/phase17-m0',
    'verification/tests/taxonomy.json',
    'tests/p17-m0-source-lock.mjs',
    'tools/run-p17-m0-source-lock.mjs',
    'tools/render-p17-m0-report.mjs',
    'tools/run-p17-m0-content-audit.mjs',
    'output/pdf/S-Structures_STRIX21_1차_비교보고서.pdf',
    'output/verification/phase17',
  ];
  for (const target of targets) collectFiles(path.join(ROOT, target), records);
  records.delete(relative(CLOSURE_R3));
  const files = [...records.values()].sort((left, right) => left.path.localeCompare(right.path));
  return {
    selectionPolicy: 'All P17 plans/reviews, contracts, runners, tests, source locks, Phase15 bound inputs/snapshots, M0 evidence and final report/QA artifacts; generated caches and the closure file itself are excluded.',
    fileCount: files.length,
    aggregateHash: canonicalHash(files),
    files,
  };
}

function gitOutput(args, encoding = 'utf8') {
  const result = spawnSync('git', [
    '-c', `safe.directory=${slash(ROOT)}`,
    ...args,
  ], { cwd: ROOT, encoding, shell: false, maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.error}`);
  return result.stdout;
}

function buildClosure(checks) {
  const baselinePath = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase17', 'p17-m0-baseline-source-lock-r2.json');
  const registryPath = path.join(ROOT, 'verification', 'benchmarks', 'strix21', 'suite-source-registry-r2.json');
  const discrepancyPath = path.join(ROOT, 'verification', 'benchmarks', 'strix21', 'references', 'source-version-discrepancies-r2.json');
  const auditPath = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase17', 'p17-m0-source-value-presence-audit-r3.json');
  const qualificationPath = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase17', 'p17-m0-r2-claim-qualification-r1.json');
  const priorClosurePath = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase17', 'p17-m0-validation-closure-r2.json');
  const baseline = readJson(baselinePath);
  const registry = readJson(registryPath);
  const discrepancies = readJson(discrepancyPath);
  const audit = readJson(auditPath);
  const qualification = readJson(qualificationPath);
  const reportManifest = readJson(REPORT_MANIFEST_R3);
  assertCanonicalHash(baseline, 'baselineHash', 'baseline');
  assertCanonicalHash(registry, 'registryHash', 'registry');
  assertCanonicalHash(discrepancies, 'registerHash', 'discrepancy register');
  assertCanonicalHash(audit, 'auditHash', 'source value-presence audit');
  assertCanonicalHash(qualification, 'qualificationHash', 'R2 claim qualification');
  assertCanonicalHash(reportManifest, 'manifestHash', 'report final manifest');

  const statusBuffer = gitOutput(['status', '--porcelain=v1', '-z', '--untracked-files=all'], null);
  const statusEntries = statusBuffer.length ? statusBuffer.toString('utf8').split('\0').filter(Boolean) : [];
  const baseRevision = String(gitOutput(['rev-parse', 'HEAD'])).trim();
  const inventory = implementationInventory();
  const closure = {
    version: 'p17-m0-validation-closure-v2',
    closureRevision: 3,
    auditDate: AUDIT_DATE,
    phase: 17,
    milestone: 'P17-M0',
    status: 'COMPLETE_WITH_SOURCE_BLOCKERS',
    supersedes: {
      path: relative(priorClosurePath),
      sha256: sha256File(priorClosurePath),
      reason: 'R2 did not bind the dirty P17 implementation inventory or the final report QA/source screenshot chain; R3 adds those controls and semantic blocker classification without changing baseline R2.',
    },
    baseRevision,
    repositoryState: {
      worktreeDirty: statusEntries.length > 0,
      statusEntryCountBeforeClosureWrite: statusEntries.length,
      statusPorcelainV1ZSha256: sha256Buffer(statusBuffer),
      capturedBeforeClosureWrite: true,
    },
    evidenceChain: {
      baseline: { ...fileRecord(baselinePath), baselineHash: baseline.baselineHash },
      registry: { ...fileRecord(registryPath), registryHash: registry.registryHash },
      discrepancyRegister: { ...fileRecord(discrepancyPath), registerHash: discrepancies.registerHash },
      sourceLockCount: registry.officialCaseCount,
      sourceLockAggregateHash: baseline.sourceCustody.sourceLockAggregateHash,
      r2ClaimQualification: { ...fileRecord(qualificationPath), qualificationHash: qualification.qualificationHash },
      sourceValuePresenceAudit: { ...fileRecord(auditPath), auditHash: audit.auditHash },
      reportFinalManifest: { ...fileRecord(REPORT_MANIFEST_R3), manifestHash: reportManifest.manifestHash },
    },
    checks: [
      ...checks,
      {
        command: 'independent source value/order/visual audit',
        status: 'PASS_WITH_KNOWN_SOURCE_PRESENTATION_DEFECT',
        facts: audit.summary,
      },
      {
        command: 'PDF automated render + nine-page visual review',
        status: 'PASS',
        facts: { pageCount: reportManifest.report.pdf.pageCount, permanentSourceScreenshots: reportManifest.sourceScreenshots.length },
      },
    ],
    semanticGateReview: baseline.gates.map((gate) => ({
      id: gate.id,
      baselineStatus: gate.status,
      reviewedStatus: gate.status,
      meaning: {
        'P17-M0-G05': 'Six authority roles are present and their precedence phrases are validated.',
        'P17-M0-G06': 'Exact ordered IDs P17-D001 through P17-D009 are required.',
        'P17-M0-G07': 'Current Phase15 file hashes and byte lengths are recomputed; content-addressed snapshots are checked separately.',
        'P17-M0-G08': 'Five role slots and exact vocabulary are validated; four independent assignments remain governed by G09.',
        'P17-M0-G09': 'Four independent reviewer roles remain pending, so release stays blocked.',
        'P17-M0-G10': 'All raw STRIX record/archive hashes remain unpublished, so STRIX actual R4 claims stay blocked.',
      }[gate.id] || gate.description,
    })),
    blockerClassification: {
      activeReleaseBlockers: [
        'FOUR_INDEPENDENT_REVIEWER_APPROVALS_PENDING',
        'STRIX_RAW_RECORD_ARCHIVE_AND_PUBLISHED_SHA_UNAVAILABLE',
      ],
      caseSpecificAcceptanceBlockers: [
        'SB10_TOLERANCE_PRECISION_UNRESOLVED',
        'CASE_REFERENCE_MODEL_NUMERICAL_TOLERANCE_APPROVALS_NOT_YET_PERFORMED',
        'CASE_REQUIRED_ENGINE_CAPABILITY_MUST_BE_PROVEN_PER_MILESTONE',
      ],
      claimSpecificHistoricalFindings: [
        'P15_M0_RECORDED_PDF_BINARY_MISSING',
        'P15_M0_MARKDOWN_NOT_CAPTURED',
        'CURRENT_PHASE15_PDF_REGENERATED_AFTER_BASELINE',
        'SH1_CASE_PDF_TWO_ROWS_NOT_FULLY_VISIBLE',
      ],
      interpretation: 'Historical findings restrict claims about the old artifact or the SH1 PDF alone; they do not permanently bar a new P17 rerun completed from first principles with new append-only evidence.',
    },
    ciPolicy: {
      hermeticRepositoryRegression: 'npm test',
      externalArtifactVerification: 'npm run test:p17',
      releaseWithExternalArtifact: 'npm run test:release:p17',
      sourceRootOverride: 'P17_SOURCE_ROOT',
      rationale: 'The licensed/local STRIX bundle is intentionally provisioned only in the separate external-artifact job.',
    },
    implementationInventory: inventory,
    notRun: [
      'S-Structures solver benchmark execution',
      'STRIX actual R4 execution',
      'MIDAS actual R4 execution',
      'full product regression (reserved for test:release:p17; M0 scoped checks only)',
      'P17 case modeling or product UI capture',
    ],
    m1EntryAllowed: true,
    releaseAllowed: false,
    finalDesignTransferAllowed: false,
  };
  closure.closureHash = canonicalHash(closure);
  assertJsonSchema(readJson(path.join(ROOT, 'verification', 'specs', 'phase17', 'p17-m0-validation-closure-schema.json')), closure, 'P17-M0 validation closure');
  return closure;
}

const mode = process.argv.includes('--closure') ? 'closure' : 'report-manifest';
if (mode === 'report-manifest') {
  const manifest = buildReportManifest();
  writeImmutableJson(REPORT_MANIFEST_R3, manifest);
  process.stdout.write(`${JSON.stringify({ mode, status: manifest.status, manifestHash: manifest.manifestHash, path: relative(REPORT_MANIFEST_R3) }, null, 2)}\n`);
} else {
  if (!existsSync(REPORT_MANIFEST_R3)) throw new Error(`Missing final report manifest: ${relative(REPORT_MANIFEST_R3)}`);
  const checks = [
    runCommand('npm.cmd', ['run', 'test:p17'], 'P17 source/test/audit'),
    runCommand('npm.cmd', ['run', 'check:verification-layout'], 'verification layout'),
    runCommand('npm.cmd', ['run', 'check:test-taxonomy'], 'test taxonomy'),
    runCommand('npm.cmd', ['run', 'check:public-imports'], 'public import contracts'),
    runCommand('npm.cmd', ['run', 'report:p17:m0:final'], 'sealed report semantic/pixel reproduction'),
    runCommand('node', ['--check', 'verification/harnesses/finalize-p17-m0.mjs'], 'finalizer syntax'),
  ];
  const closure = buildClosure(checks);
  writeImmutableJson(CLOSURE_R3, closure);
  process.stdout.write(`${JSON.stringify({ mode, status: closure.status, fileCount: closure.implementationInventory.fileCount, aggregateHash: closure.implementationInventory.aggregateHash, closureHash: closure.closureHash, path: relative(CLOSURE_R3) }, null, 2)}\n`);
}
