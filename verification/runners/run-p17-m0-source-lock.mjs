import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { constants as fsConstants } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REPOSITORY_ROOT,
  VERIFICATION_PATHS,
  VERIFICATION_REPOSITORY_PATHS,
} from '../workspace-paths.mjs';

export const P17_M0_AUDIT_DATE = '2026-08-28';
export const P17_M0_STATUS = 'COMPLETE_WITH_SOURCE_BLOCKERS';
export const P17_M0_SOURCE_REVISION = 'a44eb98601e4fbcd2913bbb34a809d126452f793';

const DEFAULT_SOURCE_ROOT = path.resolve(REPOSITORY_ROOT, '..', 'STRIX-verification-21');
const SOURCE_ROOT = process.env.P17_SOURCE_ROOT
  ? path.resolve(process.env.P17_SOURCE_ROOT)
  : DEFAULT_SOURCE_ROOT;
const SOURCE_BUNDLE_ID = 'STRIX-verification-21';
const OFFICIAL_CASES = Object.freeze([
  ['SB1', 1, 2, 'R1_R2_EXTERNAL'],
  ['SB2', 3, 2, 'R1_R2_EXTERNAL'],
  ['SB3', 5, 2, 'R1_R2_EXTERNAL'],
  ['SB5', 7, 3, 'R1_R2_EXTERNAL'],
  ['SB6', 10, 3, 'R1_R2_EXTERNAL'],
  ['SB7', 13, 3, 'R1_R2_EXTERNAL'],
  ['SB8', 16, 3, 'R1_R2_EXTERNAL'],
  ['SB9', 19, 3, 'R1_R2_EXTERNAL'],
  ['SB10', 22, 2, 'R1_R2_EXTERNAL'],
  ['SB12', 24, 4, 'R3_INDEPENDENT_RECONSTRUCTION_REQUIRED'],
  ['PD1', 28, 3, 'R1_R2_EXTERNAL'],
  ['SM5', 31, 2, 'R1_R2_EXTERNAL'],
  ['SM5b', 33, 3, 'R3_INDEPENDENT_RECONSTRUCTION_REQUIRED'],
  ['SM6', 36, 3, 'R3_INDEPENDENT_RECONSTRUCTION_REQUIRED'],
  ['SR1', 39, 3, 'R1_R2_EXTERNAL'],
  ['SR2', 42, 3, 'R1_R2_EXTERNAL'],
  ['SR2b', 45, 4, 'R1_R2_EXTERNAL'],
  ['P3S2', 49, 3, 'R5_INTERNAL_SPEC'],
  ['SP1', 52, 4, 'R3_INDEPENDENT_RECONSTRUCTION_REQUIRED'],
  ['SH1', 56, 4, 'MIXED_EXTERNAL_INTERNAL_SPEC'],
  ['TH1', 60, 5, 'R3_INDEPENDENT_RECONSTRUCTION_REQUIRED'],
]);

const PROVENANCE_CONFLICT_CASES = new Set(['SB9', 'SB12', 'PD1', 'SP1', 'SH1', 'TH1']);
const KNOWN_UNLISTED = Object.freeze({
  'checksums.sha256': 'SOURCE_MANIFEST_SELF',
  'S-Structures-1차실행결과.md': 'LOCAL_PHASE15_RESULT_EXCLUDED_FROM_SOURCE',
  '__pycache__/extract_benchmark_catalog.cpython-312.pyc': 'GENERATED_CACHE_EXCLUDED',
});

const SUPERSEDED_OUTPUTS = Object.freeze({
  registry: path.join(REPOSITORY_ROOT, 'verification', 'benchmarks', 'strix21', 'suite-source-registry.json'),
  locks: path.join(VERIFICATION_PATHS.strix21References, 'source-locks'),
  discrepancies: path.join(VERIFICATION_PATHS.strix21References, 'source-version-discrepancies.json'),
  evidence: path.join(VERIFICATION_PATHS.phase17Evidence, 'p17-m0-baseline-source-lock.json'),
});

const OUTPUTS = Object.freeze({
  registry: path.join(REPOSITORY_ROOT, 'verification', 'benchmarks', 'strix21', 'suite-source-registry-r2.json'),
  locks: VERIFICATION_PATHS.strix21SourceLocks,
  discrepancies: path.join(VERIFICATION_PATHS.strix21References, 'source-version-discrepancies-r2.json'),
  evidence: path.join(VERIFICATION_PATHS.phase17Evidence, 'p17-m0-baseline-source-lock-r2.json'),
  archive: path.join(REPOSITORY_ROOT, 'verification', 'archive', 'phase17-m0', 'phase15-current-snapshot'),
});
const CLAIM_QUALIFICATION_PATH = path.join(
  REPOSITORY_ROOT,
  'verification',
  'evidence',
  'validation',
  'phase17',
  'p17-m0-r2-claim-qualification-r1.json',
);

function slash(value) {
  return value.replaceAll('\\', '/');
}

function repoRelative(value) {
  return slash(path.relative(REPOSITORY_ROOT, value));
}

function sourceLogicalPath(value, sourceRoot = SOURCE_ROOT) {
  const relative = path.relative(sourceRoot, value);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Source path escaped bundle: ${value}`);
  return slash(path.join(SOURCE_BUNDLE_ID, relative));
}

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function sha256File(filePath) {
  return sha256Buffer(readFileSync(filePath));
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalHash(value) {
  return sha256Buffer(Buffer.from(JSON.stringify(canonicalize(value))));
}

function withHash(value, field) {
  const base = { ...value };
  delete base[field];
  return { ...base, [field]: canonicalHash(base) };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readHashValidatedJson(filePath, hashField) {
  const value = readJson(filePath);
  const expected = canonicalHash(Object.fromEntries(Object.entries(value).filter(([key]) => key !== hashField)));
  if (value[hashField] !== expected) {
    throw new Error(`Superseded artifact hash mismatch: ${repoRelative(filePath)} (${hashField})`);
  }
  return value;
}

function isWithinRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function fileRecord(filePath, extra = {}) {
  const info = statSync(filePath);
  return {
    path: repoRelative(filePath),
    byteLength: info.size,
    sha256: sha256File(filePath),
    ...extra,
  };
}

function sourceFileRecord(filePath, extra = {}, sourceRoot = SOURCE_ROOT) {
  const info = statSync(filePath);
  return {
    path: sourceLogicalPath(filePath, sourceRoot),
    byteLength: info.size,
    sha256: sha256File(filePath),
    ...extra,
  };
}

function walkFiles(root, current = root, files = []) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) walkFiles(root, target, files);
    else if (entry.isFile()) files.push(slash(path.relative(root, target)));
    else if (entry.isSymbolicLink()) files.push(slash(path.relative(root, target)));
  }
  return files.sort();
}

export function verifyChecksumManifest(sourceRoot = SOURCE_ROOT) {
  const sourceRootReal = realpathSync(sourceRoot);
  const manifestPath = path.join(sourceRoot, 'checksums.sha256');
  const lines = readFileSync(manifestPath, 'utf8').split(/\r?\n/).filter(Boolean);
  const entries = [];
  const seen = new Set();
  const failures = [];
  let byteLength = 0;

  for (const [index, line] of lines.entries()) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (!match) {
      failures.push({ code: 'MALFORMED_MANIFEST_LINE', line: index + 1 });
      continue;
    }
    const [, expected, relative] = match;
    const normalized = slash(path.posix.normalize(relative));
    if (normalized.startsWith('../') || path.isAbsolute(relative)) {
      failures.push({ code: 'PATH_ESCAPE', path: relative });
      continue;
    }
    if (seen.has(normalized)) {
      failures.push({ code: 'DUPLICATE_ENTRY', path: normalized });
      continue;
    }
    seen.add(normalized);
    const absolute = path.resolve(sourceRoot, normalized);
    if (!existsSync(absolute)) {
      failures.push({ code: 'MISSING_FILE', path: normalized });
      continue;
    }
    if (lstatSync(absolute).isSymbolicLink()) {
      failures.push({ code: 'SYMLINK_OR_JUNCTION_ENTRY', path: normalized });
      continue;
    }
    const targetReal = realpathSync(absolute);
    if (!isWithinRoot(sourceRootReal, targetReal)) {
      failures.push({ code: 'REALPATH_ESCAPE', path: normalized });
      continue;
    }
    const actual = sha256File(absolute);
    const size = statSync(absolute).size;
    byteLength += size;
    if (actual !== expected) failures.push({ code: 'HASH_MISMATCH', path: normalized, expected, actual });
    entries.push({ path: normalized, byteLength: size, sha256: actual });
  }

  const allFiles = walkFiles(sourceRoot);
  const unlisted = allFiles
    .filter((relative) => !seen.has(relative))
    .map((relative) => {
      const absolute = path.join(sourceRoot, relative);
      if (lstatSync(absolute).isSymbolicLink()) {
        return {
          path: sourceLogicalPath(absolute, sourceRoot),
          relativePath: relative,
          byteLength: null,
          sha256: null,
          classification: 'SYMLINK_OR_JUNCTION_EXCLUDED',
        };
      }
      return {
        ...sourceFileRecord(absolute, {}, sourceRoot),
        relativePath: relative,
        classification: KNOWN_UNLISTED[relative] || 'UNKNOWN_UNLISTED',
      };
    });
  const unknownUnlisted = unlisted.filter((entry) => entry.classification === 'UNKNOWN_UNLISTED');
  if (unknownUnlisted.length) failures.push({ code: 'UNKNOWN_UNLISTED_FILES', paths: unknownUnlisted.map((x) => x.relativePath) });
  const unlistedLinks = unlisted.filter((entry) => entry.classification === 'SYMLINK_OR_JUNCTION_EXCLUDED');
  if (unlistedLinks.length) failures.push({ code: 'UNLISTED_SYMLINK_OR_JUNCTION', paths: unlistedLinks.map((x) => x.relativePath) });

  return {
    manifest: sourceFileRecord(manifestPath, { role: 'CUSTODY_MANIFEST' }, sourceRoot),
    declaredCount: lines.length,
    verifiedCount: entries.length - failures.filter((x) => x.code === 'HASH_MISMATCH').length,
    declaredByteLength: byteLength,
    entries,
    unlisted,
    failures,
  };
}

export function extractHtmlEvidence(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const scopes = [...html.matchAll(/<dl\b[^>]*\bclass=["'][^"']*\bbm-evidence\b[^"']*["'][^>]*>([\s\S]*?)<\/dl>/gi)];
  if (scopes.length !== 1) {
    throw new Error(`Expected exactly one bm-evidence block in ${htmlPath}; found ${scopes.length}`);
  }
  const evidenceHtml = scopes[0][1];
  const valueFor = (label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = [...evidenceHtml.matchAll(new RegExp(`<dt\\b[^>]*>\\s*${escaped}\\s*<\\/dt>\\s*<dd\\b[^>]*>([\\s\\S]*?)<\\/dd>`, 'gi'))];
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one ${label} field in bm-evidence for ${htmlPath}; found ${matches.length}`);
    }
    return matches[0][1].replace(/<[^>]+>/g, '').replace(/&middot;/g, '·').trim();
  };
  const engine = valueFor('Engine');
  const runDate = valueFor('Run date');
  const record = valueFor('Record');
  const archive = valueFor('Evidence archive');
  const sha256 = valueFor('sha256');
  return {
    engine,
    engineVersion: engine?.match(/v(\d+\.\d+\.\d+)/)?.[1] || null,
    runDate,
    record,
    archive,
    archiveVersion: archive?.match(/eng(\d+\.\d+\.\d+)/)?.[1] || null,
    sha256,
  };
}

function toleranceDisplay(benchmark) {
  return benchmark.verdict_figures.find((value) => /^tolerance /i.test(value))?.replace(/^tolerance /i, '') || null;
}

function buildSourceLock({ descriptor, benchmark, checksumByPath, manualRecord, catalogRecord }) {
  const [caseId, pageStart, pageCount, referenceClass] = descriptor;
  const htmlRelative = `html/${caseId}.html`;
  const pdfRelative = `reports/${caseId}.pdf`;
  const htmlPath = path.join(SOURCE_ROOT, htmlRelative);
  const pdfPath = path.join(SOURCE_ROOT, pdfRelative);
  const htmlEvidence = extractHtmlEvidence(htmlPath);
  const blockers = ['STRIX_RAW_RECORD_AND_EVIDENCE_ARCHIVE_NOT_PUBLISHED'];
  if (PROVENANCE_CONFLICT_CASES.has(caseId)) blockers.push('HTML_ENGINE_V1_0_4_WITH_V1_0_2_RUN_OR_ARCHIVE_METADATA');
  if (caseId === 'SB10') blockers.push('TOLERANCE_PRECISION_AMBIGUOUS_0_PERCENT_VS_1E_MINUS_6_PERCENT');
  if (caseId === 'SH1') blockers.push('INDIVIDUAL_PDF_RESULT_TABLE_CLIPPED_TWO_ROWS');

  const firstResult = benchmark.results[0];
  const claimRestrictions = [
    'DO_NOT_CLAIM_STRIX_RUNTIME_RERUN_FROM_PUBLISHED_PAGE_HASH',
    'DO_NOT_CLAIM_MIDAS_CROSS_VALIDATION_WITHOUT_ACTUAL_EXPORT',
    'DO_NOT_INHERIT_PHASE15_PASS',
  ];
  if (referenceClass === 'R5_INTERNAL_SPEC') claimRestrictions.push('DO_NOT_USE_INTERNAL_SPEC_AS_EXTERNAL_ACCURACY_TRUTH');
  if (referenceClass === 'MIXED_EXTERNAL_INTERNAL_SPEC') claimRestrictions.push('SEPARATE_EXTERNAL_SURFACE_FROM_INTERNAL_HINGE_IMPLEMENTATION');

  const priorPath = path.join(SUPERSEDED_OUTPUTS.locks, `${caseId}.source-lock.json`);
  const prior = existsSync(priorPath) ? readHashValidatedJson(priorPath, 'sourceLockHash') : null;
  const lock = {
    version: 'p17-source-lock-v1',
    revision: 2,
    supersedes: prior ? {
      path: repoRelative(priorPath),
      sourceLockHash: prior.sourceLockHash,
      reason: 'R2 selects the final evidence Engine field when an HTML page also contains a descriptive Engine field.',
    } : null,
    caseId,
    ordinal: OFFICIAL_CASES.findIndex((item) => item[0] === caseId) + 1,
    official: true,
    family: benchmark.family,
    title: benchmark.title,
    sourceRoles: {
      acceptanceTruth: {
        authority: referenceClass,
        locator: benchmark.reference_source,
        status: referenceClass === 'R5_INTERNAL_SPEC' ? 'INTERNAL_ONLY' : 'REQUIRES_CASE_REVIEW',
      },
      strixPublishedResult: {
        authority: 'CASE_HTML_V1_0_4_PUBLICATION_SNAPSHOT',
        file: { path: sourceLogicalPath(htmlPath), ...checksumByPath.get(htmlRelative) },
      },
      archivalNarrative: {
        authority: 'MANUAL_AND_CASE_PDF_V1_0_2',
        manual: {
          ...manualRecord,
          documentId: 'SVM-2026',
          revision: '2026-07-11',
          engineVersion: '1.0.2',
          pdfPageCount: 66,
          printedPageStart: pageStart,
          printedPageEnd: pageStart + pageCount - 1,
        },
        casePdf: {
          path: sourceLogicalPath(pdfPath),
          ...checksumByPath.get(pdfRelative),
          engineVersion: '1.0.2',
          pdfPageCount: pageCount,
        },
      },
      runtimeProvenance: {
        authority: 'UNAVAILABLE_RAW_R4',
        status: 'BLOCKED_RAW_EVIDENCE_NOT_PUBLISHED',
      },
      catalog: {
        authority: 'DERIVED_FROM_CASE_HTML_NO_ADDITIONAL_AUTHORITY',
        ...catalogRecord,
      },
    },
    publishedAcceptanceDisplay: {
      verdict: benchmark.verdict,
      tolerance: toleranceDisplay(benchmark),
      toleranceStatus: caseId === 'SB10' ? 'BLOCKED_TOLERANCE_PRECISION' : 'OBSERVED_NOT_YET_APPROVED',
      detailedTolerance: caseId === 'SB10' ? '10^-6% stated in detailed section; 0% in badge/conclusion' : null,
      firstResult: {
        quantity: firstResult['Response quantity'],
        probe: firstResult.Probe,
        strix: firstResult.STRIX,
        reference: firstResult.Reference,
        delta: firstResult['Δ'],
      },
      resultRowCount: benchmark.results.length,
    },
    contentAudit: {
      htmlVsCatalog: 'EXACT_21_CASE_EXTRACTION_AUDIT',
      manualPdfVsHtmlCoreFields: 'MATCH_TITLE_VERDICT_TOLERANCE_AND_FIRST_RESULT',
      casePdfResultRows: caseId === 'SH1' ? 'CLIPPED_2_OF_11_ROWS_NOT_VISIBLE' : `VISIBLE_${benchmark.results.length}_OF_${benchmark.results.length}`,
      auditDate: P17_M0_AUDIT_DATE,
      method: 'checksum verification + HTML parse + PDF text/visual review',
    },
    runtimeProvenance: {
      htmlEngineVersion: htmlEvidence.engineVersion,
      htmlRunDate: htmlEvidence.runDate,
      htmlRecordLocator: htmlEvidence.record,
      htmlArchive: htmlEvidence.archive,
      htmlArchiveVersion: htmlEvidence.archiveVersion,
      rawRecordSha256: htmlEvidence.sha256,
      status: 'BLOCKED_RAW_EVIDENCE_NOT_PUBLISHED',
      metadataConflict: PROVENANCE_CONFLICT_CASES.has(caseId),
    },
    referenceLane: {
      class: referenceClass,
      strixPublicationLane: 'R4_PUBLISHED_VALUE_ONLY',
      midasLane: 'NOT_AVAILABLE',
      sStructuresLane: 'NOT_RUN_IN_P17',
    },
    claimRestrictions,
    blockers,
  };
  return withHash(lock, 'sourceLockHash');
}

function phase15SnapshotRecords() {
  const phase15BaselinePath = path.join(
    REPOSITORY_ROOT,
    'verification',
    'evidence',
    'validation',
    'phase15',
    'p15-m0-corrective-baseline.json',
  );
  const phase15Baseline = readJson(phase15BaselinePath);
  const recordedPdf = phase15Baseline.preservedArtifacts.find((item) => item.id === 'first-batch-pdf');
  const recordedJson = phase15Baseline.preservedArtifacts.find((item) => item.id === 'first-batch-json');
  const current = {
    json: fileRecord(path.join(VERIFICATION_PATHS.strix21Runs, 'first-batch-results.json')),
    markdown: fileRecord(path.join(VERIFICATION_PATHS.strix21Runs, 'S-Structures_STRIX21_1차_비교보고서.md')),
    pdf: fileRecord(path.join(REPOSITORY_ROOT, 'output', 'pdf', 'S-Structures_STRIX21_1차_비교보고서.pdf')),
  };
  const tmpPdfPath = path.join(REPOSITORY_ROOT, 'tmp', 'pdfs', 'strix21-comparison', 'S-Structures_STRIX21_1차_비교보고서.pdf');
  return {
    baselineEvidence: fileRecord(phase15BaselinePath, {
      version: phase15Baseline.version,
      capturedAt: phase15Baseline.run?.capturedAt,
      baselineHash: phase15Baseline.baselineHash,
      status: phase15Baseline.status,
    }),
    recorded: { json: recordedJson, pdf: recordedPdf, markdown: null },
    current,
    temporaryPdf: existsSync(tmpPdfPath) ? fileRecord(tmpPdfPath, { authoritative: false }) : null,
    provenance: {
      json: current.json.sha256 === recordedJson.sha256 ? 'MATCHES_P15_M0_RECORDED_BINARY' : 'MISMATCH',
      markdown: 'P15_M0_MARKDOWN_NOT_CAPTURED',
      pdf: current.pdf.sha256 === recordedPdf.sha256
        ? 'MATCHES_P15_M0_RECORDED_BINARY'
        : 'CURRENT_PDF_REGENERATED_AFTER_BASELINE_CAPTURE',
      recordedPdfBinaryPresent: false,
    },
  };
}

function discrepancyRegister({ officialIds, catalogOrder, phase15 }) {
  const all = [...officialIds];
  const items = [
    {
      id: 'P17-D001', severity: 'HIGH', status: 'CONTROLLED_BY_ROLE_PRECEDENCE',
      title: 'manual/per-case PDF v1.0.2 versus HTML/catalog v1.0.4', affectedCases: all,
      evidence: 'All 21 PDFs identify v1.0.2; all 21 HTML pages identify engine v1.0.4.',
      disposition: 'Use HTML only for the latest published result, PDF/manual for archival narrative, and independent source for acceptance truth.',
      releaseImpact: 'Raw STRIX runtime provenance remains blocked.',
    },
    {
      id: 'P17-D002', severity: 'HIGH', status: 'OPEN_BLOCKER',
      title: 'HTML engine label conflicts with run/archive v1.0.2 metadata', affectedCases: [...PROVENANCE_CONFLICT_CASES],
      evidence: 'SB9, SB12, PD1, SP1, SH1 and TH1 show v1.0.4 engine but v1.0.2 run date/archive provenance.',
      disposition: 'Do not call these cases v1.0.4 reruns until the raw record and archive are published.',
      releaseImpact: 'Blocks STRIX actual-run R4 claim.',
    },
    {
      id: 'P17-D003', severity: 'HIGH', status: 'OPEN_BLOCKER',
      title: 'Raw record SHA and evidence archives are unavailable', affectedCases: all,
      evidence: 'Every HTML page says sha256=(pending publish); records/*.json and evidence ZIPs are absent.',
      disposition: 'Retain page hash as publication custody only.',
      releaseImpact: 'Blocks runtime reproducibility claim.',
    },
    {
      id: 'P17-D004', severity: 'MEDIUM', status: 'OPEN_BLOCKER',
      title: 'SB10 tolerance precision conflict', affectedCases: ['SB10'],
      evidence: 'Badge/conclusion display 0%; detailed section states 10^-6%.',
      disposition: 'Do not approve a numeric tolerance until owner/raw-record confirmation.',
      releaseImpact: 'Blocks SB10 acceptance-criteria lock.',
    },
    {
      id: 'P17-D005', severity: 'MEDIUM', status: 'CONTROLLED_BY_HTML',
      title: 'SH1 individual PDF result table is clipped', affectedCases: ['SH1'],
      evidence: 'Two PCHIP rows are not visible in the PDF; HTML/catalog contains all 11 rows.',
      disposition: 'Use HTML for published rows and retain PDF only as incomplete archival narrative.',
      releaseImpact: 'Blocks claims that the PDF alone is a complete record.',
    },
    {
      id: 'P17-D006', severity: 'LOW', status: 'RESOLVED_BY_REGISTRY',
      title: 'Catalog array order differs from manual order', affectedCases: ['P3S2', 'SP1', 'SH1', 'TH1'],
      evidence: `catalog=${catalogOrder.join(',')}`,
      disposition: `Official ordinal is frozen to manual order=${officialIds.join(',')}.`,
      releaseImpact: 'None after explicit ordinal lock.',
    },
    {
      id: 'P17-D007', severity: 'CRITICAL', status: 'OPEN_HISTORICAL_PROVENANCE_GAP',
      title: 'P15-M0 recorded PDF binary is missing and current PDF is a later regeneration', affectedCases: [],
      evidence: `recorded=${phase15.recorded.pdf.sha256}/${phase15.recorded.pdf.byteLength}; current=${phase15.current.pdf.sha256}/${phase15.current.pdf.byteLength}`,
      disposition: 'Preserve the current PDF as a P17-observed snapshot only; never relabel it as the P15-M0 binary.',
      releaseImpact: 'Prevents immutable provenance claim for the original Phase15 PDF.',
    },
    {
      id: 'P17-D008', severity: 'HIGH', status: 'OPEN_IMPLEMENTATION_DEBT',
      title: 'Phase15 fixed output paths are writable despite append-only policy', affectedCases: [],
      evidence: 'The existing benchmark/report writers use fixed JSON, Markdown and PDF filenames.',
      disposition: 'P17 snapshots are content-addressed and overwrite-rejecting; legacy writers must not run during M0.',
      releaseImpact: 'Requires P17-M1 append-only writer before case execution.',
    },
    {
      id: 'P17-D009', severity: 'MEDIUM', status: 'USE_RESTRICTED',
      title: 'STRIX PDFs provide no redistribution license', affectedCases: all,
      evidence: 'PDF marking is Internal / All rights reserved; public download is not redistribution permission.',
      disposition: 'Keep local custody references and hashes; do not redistribute source PDFs without permission.',
      releaseImpact: 'No local verification blocker; distribution is restricted.',
    },
  ];
  const prior = existsSync(SUPERSEDED_OUTPUTS.discrepancies)
    ? readHashValidatedJson(SUPERSEDED_OUTPUTS.discrepancies, 'registerHash')
    : null;
  return withHash({
    version: 'p17-source-discrepancy-register-v1',
    revision: 2,
    supersedes: prior ? {
      path: repoRelative(SUPERSEDED_OUTPUTS.discrepancies),
      registerHash: prior.registerHash,
      reason: 'Rebound to corrected R2 case source locks; source discrepancy content is unchanged.',
    } : null,
    phase: 17,
    milestone: 'P17-M0',
    items,
  }, 'registerHash');
}

function buildRegistry({ custody, locks, catalogOrder }) {
  const registry = {
    version: 'p17-suite-source-registry-v1',
    revision: 2,
    supersedes: existsSync(SUPERSEDED_OUTPUTS.registry) ? {
      path: repoRelative(SUPERSEDED_OUTPUTS.registry),
      registryHash: readHashValidatedJson(SUPERSEDED_OUTPUTS.registry, 'registryHash').registryHash,
      reason: 'Corrected evidence Engine extraction for HTML pages containing multiple Engine fields.',
    } : null,
    phase: 17,
    milestone: 'P17-M0',
    auditDate: P17_M0_AUDIT_DATE,
    sourceRoot: SOURCE_BUNDLE_ID,
    originalUrl: 'https://dcr-st.com/verification.html',
    officialCaseCount: 21,
    officialOrder: OFFICIAL_CASES.map((item) => item[0]),
    catalogOrder,
    customExcluded: [{
      id: 'P3S2-SS',
      official: false,
      classification: 'S_STRUCTURES_CUSTOM_QUALIFICATION',
      reason: 'Does not replace official P3S2 and is excluded from the 21-case denominator.',
    }],
    sourceBundle: {
      manifest: custody.manifest,
      declaredCount: custody.declaredCount,
      verifiedCount: custody.verifiedCount,
      declaredByteLength: custody.declaredByteLength,
      failures: custody.failures,
      unlistedFiles: custody.unlisted,
      licenseUseRestriction: 'Internal / All rights reserved; retain local hashes and locators, no redistribution assumption.',
    },
    authorityPolicy: {
      acceptanceTruth: 'R1/R2 external source or approved independent R3; never STRIX alone',
      strixPublishedResult: 'case HTML v1.0.4 publication snapshot',
      archivalNarrative: 'integrated manual and per-case PDF v1.0.2',
      runtimeProvenance: 'BLOCKED until records/*.json, archive and published SHA are available',
      catalog: 'derived HTML index; no additional authority',
      midas: 'separate lane; NOT_AVAILABLE in M0',
    },
    claimVocabulary: {
      milestoneStatus: ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE', 'COMPLETE_WITH_SOURCE_BLOCKERS'],
      terminalCaseStatus: ['PASS', 'FAIL', 'BLOCKED_SOURCE', 'BLOCKED_ENGINE', 'CROSS_CHECK_ONLY', 'ANALOGOUS_ONLY'],
      sourceStatus: ['LOCKED', 'LOCKED_WITH_BLOCKERS', 'BLOCKED_SOURCE'],
      approvalStatus: ['APPROVED', 'TECHNICALLY_COMPLETE', 'PENDING_INDEPENDENT_REVIEW', 'NOT_APPLICABLE'],
      claimLevels: ['R1_R2_EXTERNAL_TRUTH', 'R3_INDEPENDENT_RECONSTRUCTION', 'R4_PROGRAM_EXPORT', 'R5_INTERNAL_SPEC'],
    },
    approvalRoles: [
      { role: 'sourceCustodian', assignment: 'CODEX_AUTOMATED_LOCAL_AUDIT', independent: false, status: 'TECHNICALLY_COMPLETE', approvalHash: null },
      { role: 'referenceReviewer', assignment: null, independent: true, status: 'PENDING_INDEPENDENT_REVIEW', approvalHash: null },
      { role: 'modelReviewer', assignment: null, independent: true, status: 'PENDING_INDEPENDENT_REVIEW', approvalHash: null },
      { role: 'numericalReviewer', assignment: null, independent: true, status: 'PENDING_INDEPENDENT_REVIEW', approvalHash: null },
      { role: 'structuralReleaseReviewer', assignment: null, independent: true, status: 'PENDING_INDEPENDENT_REVIEW', approvalHash: null },
    ],
    cases: locks.map((lock) => ({
      caseId: lock.caseId,
      ordinal: lock.ordinal,
      family: lock.family,
      title: lock.title,
      sourceLockPath: `${VERIFICATION_REPOSITORY_PATHS.strix21References}/source-locks-r2/${lock.caseId}.source-lock.json`,
      sourceLockHash: lock.sourceLockHash,
      sourceStatus: 'LOCKED_WITH_BLOCKERS',
      referenceClass: lock.referenceLane.class,
      blockerCount: lock.blockers.length,
    })),
  };
  return withHash(registry, 'registryHash');
}

function buildEvidence({ custody, registry, locks, discrepancies, phase15 }) {
  const expectedDiscrepancyIds = Array.from({ length: 9 }, (_, index) => `P17-D${String(index + 1).padStart(3, '0')}`);
  const expectedApprovalRoles = [
    ['sourceCustodian', false],
    ['referenceReviewer', true],
    ['modelReviewer', true],
    ['numericalReviewer', true],
    ['structuralReleaseReviewer', true],
  ];
  const authorityPolicyIsExplicit = [
    ['acceptanceTruth', /never STRIX alone/i],
    ['strixPublishedResult', /HTML v1\.0\.4/i],
    ['archivalNarrative', /v1\.0\.2/i],
    ['runtimeProvenance', /BLOCKED/i],
    ['catalog', /no additional authority/i],
    ['midas', /NOT_AVAILABLE/i],
  ].every(([key, pattern]) => pattern.test(registry.authorityPolicy[key] || ''));
  const discrepancyIdsAreExact = JSON.stringify(discrepancies.items.map((item) => item.id)) === JSON.stringify(expectedDiscrepancyIds);
  const phase15ArtifactsMatchCurrentFiles = Object.values(phase15.current).every((item) => {
    const absolute = path.join(REPOSITORY_ROOT, item.path);
    return existsSync(absolute)
      && /^[0-9a-f]{64}$/.test(item.sha256)
      && sha256File(absolute) === item.sha256
      && statSync(absolute).size === item.byteLength;
  });
  const rolesAreExact = registry.approvalRoles.length === expectedApprovalRoles.length
    && expectedApprovalRoles.every(([role, independent], index) => {
      const actual = registry.approvalRoles[index];
      return actual?.role === role
        && actual.independent === independent
        && (independent
          ? ['PENDING_INDEPENDENT_REVIEW', 'APPROVED'].includes(actual.status)
          : actual.status === 'TECHNICALLY_COMPLETE');
    });
  const vocabularyIsComplete = [
    ['milestoneStatus', ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE', 'COMPLETE_WITH_SOURCE_BLOCKERS']],
    ['terminalCaseStatus', ['PASS', 'FAIL', 'BLOCKED_SOURCE', 'BLOCKED_ENGINE', 'CROSS_CHECK_ONLY', 'ANALOGOUS_ONLY']],
    ['sourceStatus', ['LOCKED', 'LOCKED_WITH_BLOCKERS', 'BLOCKED_SOURCE']],
    ['approvalStatus', ['APPROVED', 'TECHNICALLY_COMPLETE', 'PENDING_INDEPENDENT_REVIEW', 'NOT_APPLICABLE']],
    ['claimLevels', ['R1_R2_EXTERNAL_TRUTH', 'R3_INDEPENDENT_RECONSTRUCTION', 'R4_PROGRAM_EXPORT', 'R5_INTERNAL_SPEC']],
  ].every(([key, values]) => JSON.stringify(registry.claimVocabulary[key]) === JSON.stringify(values));
  const gates = [
    ['P17-M0-G01', 'official ID/order is exactly 21', registry.officialCaseCount === 21 && registry.officialOrder.length === 21],
    ['P17-M0-G02', 'custom P3S2-SS excluded', registry.customExcluded.some((item) => item.id === 'P3S2-SS')],
    ['P17-M0-G03', 'source manifest 51/51 verified', custody.declaredCount === 51 && custody.verifiedCount === 51 && custody.failures.length === 0],
    ['P17-M0-G04', '21 per-case source locks hash-valid', locks.length === 21 && locks.every((lock) => lock.sourceLockHash === canonicalHash(Object.fromEntries(Object.entries(lock).filter(([key]) => key !== 'sourceLockHash'))))],
    ['P17-M0-G05', 'version authority precedence is explicit', authorityPolicyIsExplicit],
    ['P17-M0-G06', 'source discrepancies are registered', discrepancyIdsAreExact],
    ['P17-M0-G07', 'Phase15 current artifacts frozen by content hash', phase15ArtifactsMatchCurrentFiles],
    ['P17-M0-G08', 'roles and claim vocabulary defined', rolesAreExact && vocabularyIsComplete],
    ['P17-M0-G09', 'independent approvals complete', registry.approvalRoles.filter((item) => item.independent).every((item) => item.status === 'APPROVED')],
    ['P17-M0-G10', 'STRIX raw runtime provenance available', locks.every((lock) => lock.runtimeProvenance.status !== 'BLOCKED_RAW_EVIDENCE_NOT_PUBLISHED')],
  ].map(([id, description, passed]) => ({
    id,
    description,
    status: passed ? 'PASS' : (['P17-M0-G09', 'P17-M0-G10'].includes(id) ? 'BLOCKED_RELEASE_ONLY' : 'FAIL'),
  }));
  const technicalFailure = gates.some((gate) => gate.status === 'FAIL');
  const evidence = {
    version: 'p17-m0-baseline-source-lock-v1',
    revision: 2,
    supersedes: existsSync(SUPERSEDED_OUTPUTS.evidence) ? {
      path: repoRelative(SUPERSEDED_OUTPUTS.evidence),
      baselineHash: readHashValidatedJson(SUPERSEDED_OUTPUTS.evidence, 'baselineHash').baselineHash,
      reason: 'The R1 HTML parser selected the first descriptive Engine field in five cases; R2 selects the final evidence field and preserves R1 unchanged.',
    } : null,
    phase: 17,
    milestone: 'P17-M0',
    auditDate: P17_M0_AUDIT_DATE,
    sourceRevision: P17_M0_SOURCE_REVISION,
    status: technicalFailure ? 'BLOCKED' : P17_M0_STATUS,
    m1EntryAllowed: !technicalFailure,
    releaseAllowed: false,
    finalDesignTransferAllowed: false,
    phase17InheritedPassCount: 0,
    externalRuntimeUsed: false,
    strixActualR4Used: false,
    midasActualR4Used: false,
    sourceCustody: {
      sourceRoot: registry.sourceRoot,
      manifestSha256: custody.manifest.sha256,
      declaredCount: custody.declaredCount,
      verifiedCount: custody.verifiedCount,
      failureCount: custody.failures.length,
      registryHash: registry.registryHash,
      sourceLockCount: locks.length,
      sourceLockAggregateHash: canonicalHash(locks.map((lock) => ({ caseId: lock.caseId, hash: lock.sourceLockHash }))),
      discrepancyRegisterHash: discrepancies.registerHash,
    },
    phase15HistoricalSnapshot: phase15,
    artifacts: {
      registry: { path: repoRelative(OUTPUTS.registry), hash: registry.registryHash },
      sourceLocks: { path: repoRelative(OUTPUTS.locks), count: locks.length },
      discrepancies: { path: repoRelative(OUTPUTS.discrepancies), hash: discrepancies.registerHash },
      contentAddressedArchive: { path: repoRelative(OUTPUTS.archive), overwritePolicy: 'REJECT_IF_HASH_DIFFERS' },
    },
    gates,
    blockers: [
      'STRIX_RAW_RECORD_AND_EVIDENCE_ARCHIVE_NOT_PUBLISHED',
      'SIX_HTML_PAGES_HAVE_V1_0_4_ENGINE_WITH_V1_0_2_PROVENANCE',
      'SB10_TOLERANCE_PRECISION_UNRESOLVED',
      'SH1_PDF_RESULT_TABLE_CLIPPED',
      'P15_M0_RECORDED_PDF_BINARY_MISSING',
      'CURRENT_PDF_REGENERATED_AFTER_BASELINE_CAPTURE',
      'CURRENT_PDF_NOT_BOUND_TO_P15_M0',
      'P15_M0_MARKDOWN_NOT_CAPTURED',
      'INDEPENDENT_REVIEWER_APPROVALS_PENDING',
    ],
  };
  return withHash(evidence, 'baselineHash');
}

export function buildP17M0Artifacts() {
  const custody = verifyChecksumManifest(SOURCE_ROOT);
  if (custody.failures.length) throw new Error(`Source custody failed: ${JSON.stringify(custody.failures)}`);
  const catalogPath = path.join(SOURCE_ROOT, 'benchmark-catalog.json');
  const manualPath = path.join(SOURCE_ROOT, 'documents', 'StrixVerificationManual.pdf');
  const catalog = readJson(catalogPath);
  const catalogIds = catalog.benchmarks.map((item) => item.id);
  const officialIds = OFFICIAL_CASES.map((item) => item[0]);
  if (catalog.count !== 21 || new Set(catalogIds).size !== 21 || officialIds.some((id) => !catalogIds.includes(id))) {
    throw new Error(`Official catalog mismatch: count=${catalog.count}, ids=${catalogIds.join(',')}`);
  }
  const checksumByPath = new Map(custody.entries.map(({ path: relativePath, ...record }) => [relativePath, record]));
  const manualRecord = sourceFileRecord(manualPath);
  const catalogRecord = sourceFileRecord(catalogPath);
  const byId = new Map(catalog.benchmarks.map((item) => [item.id, item]));
  const locks = OFFICIAL_CASES.map((descriptor) => buildSourceLock({
    descriptor,
    benchmark: byId.get(descriptor[0]),
    checksumByPath,
    manualRecord,
    catalogRecord,
  }));
  const phase15 = phase15SnapshotRecords();
  const discrepancies = discrepancyRegister({ officialIds, catalogOrder: catalogIds, phase15 });
  const registry = buildRegistry({ custody, locks, catalogOrder: catalogIds });
  const evidence = buildEvidence({ custody, registry, locks, discrepancies, phase15 });
  return { custody, locks, discrepancies, registry, evidence };
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeImmutableJson(filePath, value) {
  const content = jsonText(value);
  mkdirSync(path.dirname(filePath), { recursive: true });
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf8');
    if (existing !== content) throw new Error(`Refusing to overwrite changed immutable artifact: ${repoRelative(filePath)}`);
    return 'VERIFIED_EXISTING';
  }
  writeFileSync(filePath, content, { encoding: 'utf8', flag: 'wx' });
  return 'CREATED';
}

export function verifyExactRegularFileInventory(directory, expectedNames, label = 'directory') {
  const entries = readdirSync(directory, { withFileTypes: true });
  const invalidEntries = entries.filter((entry) => !entry.isFile() || entry.isSymbolicLink());
  if (invalidEntries.length) {
    throw new Error(`Unexpected ${label} entries: ${invalidEntries.map((entry) => entry.name).join(',')}`);
  }
  const actualNames = entries.map((entry) => entry.name).sort();
  const expected = [...expectedNames].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expected)) {
    throw new Error(`${label} inventory drift: expected=${expected.join(',')} actual=${actualNames.join(',')}`);
  }
  return { entryCount: actualNames.length, names: actualNames };
}

function snapshotTarget(sourceRecord) {
  const sourcePath = path.join(REPOSITORY_ROOT, sourceRecord.path);
  const extension = path.extname(sourcePath).toLowerCase();
  return path.join(OUTPUTS.archive, `${sourceRecord.sha256}${extension}`);
}

function snapshotRecord(sourceRecord, { create = false } = {}) {
  const sourcePath = path.join(REPOSITORY_ROOT, sourceRecord.path);
  const target = snapshotTarget(sourceRecord);
  if (create) mkdirSync(path.dirname(target), { recursive: true });
  if (existsSync(target)) {
    if (sha256File(target) !== sourceRecord.sha256) throw new Error(`Archive collision: ${repoRelative(target)}`);
  } else if (create) {
    copyFileSync(sourcePath, target, fsConstants.COPYFILE_EXCL);
  } else {
    throw new Error(`Missing content-addressed snapshot: ${repoRelative(target)}`);
  }
  const actualHash = sha256File(target);
  if (actualHash !== sourceRecord.sha256) {
    throw new Error(`Content-addressed snapshot hash mismatch after copy: ${repoRelative(target)}`);
  }
  return { path: repoRelative(target), byteLength: statSync(target).size, sha256: actualHash };
}

function writeArtifacts(artifacts) {
  const snapshots = Object.fromEntries(
    Object.entries(artifacts.evidence.phase15HistoricalSnapshot.current).map(([key, record]) => [key, snapshotRecord(record, { create: true })]),
  );
  const evidence = {
    ...artifacts.evidence,
    artifacts: {
      ...artifacts.evidence.artifacts,
      contentAddressedSnapshots: snapshots,
    },
  };
  const finalEvidence = withHash(evidence, 'baselineHash');
  for (const lock of artifacts.locks) writeImmutableJson(path.join(OUTPUTS.locks, `${lock.caseId}.source-lock.json`), lock);
  writeImmutableJson(OUTPUTS.registry, artifacts.registry);
  writeImmutableJson(OUTPUTS.discrepancies, artifacts.discrepancies);
  writeImmutableJson(OUTPUTS.evidence, finalEvidence);
  return { ...artifacts, evidence: finalEvidence };
}

function verifyWrittenArtifacts(artifacts) {
  const expected = [
    [OUTPUTS.registry, artifacts.registry],
    [OUTPUTS.discrepancies, artifacts.discrepancies],
  ];
  for (const lock of artifacts.locks) expected.push([path.join(OUTPUTS.locks, `${lock.caseId}.source-lock.json`), lock]);
  const expectedLockFiles = artifacts.locks.map((lock) => `${lock.caseId}.source-lock.json`).sort();
  verifyExactRegularFileInventory(OUTPUTS.locks, expectedLockFiles, 'source-lock');
  for (const [filePath, value] of expected) {
    if (!existsSync(filePath)) throw new Error(`Missing artifact: ${repoRelative(filePath)}`);
    if (readFileSync(filePath, 'utf8') !== jsonText(value)) throw new Error(`Artifact drift: ${repoRelative(filePath)}`);
  }
  if (!existsSync(OUTPUTS.evidence)) throw new Error(`Missing artifact: ${repoRelative(OUTPUTS.evidence)}`);
  const evidence = readJson(OUTPUTS.evidence);
  const expectedSnapshots = Object.fromEntries(
    Object.entries(artifacts.evidence.phase15HistoricalSnapshot.current).map(([key, record]) => [key, snapshotRecord(record)]),
  );
  const expectedEvidence = withHash({
    ...artifacts.evidence,
    artifacts: {
      ...artifacts.evidence.artifacts,
      contentAddressedSnapshots: expectedSnapshots,
    },
  }, 'baselineHash');
  if (jsonText(evidence) !== jsonText(expectedEvidence)) {
    throw new Error('P17-M0 evidence drift: stored evidence no longer matches current source custody and Phase15 artifacts');
  }
  if (evidence.baselineHash !== canonicalHash(Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== 'baselineHash')))) {
    throw new Error('P17-M0 evidence baselineHash mismatch');
  }
  for (const record of Object.values(evidence.artifacts.contentAddressedSnapshots || {})) {
    const filePath = path.join(REPOSITORY_ROOT, record.path);
    if (!existsSync(filePath) || sha256File(filePath) !== record.sha256) throw new Error(`Snapshot custody failed: ${record.path}`);
  }
  const qualification = readHashValidatedJson(CLAIM_QUALIFICATION_PATH, 'qualificationHash');
  if (qualification.appliesTo.baselineHash !== evidence.baselineHash) {
    throw new Error('P17-M0 claim qualification does not bind the current baselineHash');
  }
  if (qualification.appliesTo.sourceLockAggregateHash !== evidence.sourceCustody.sourceLockAggregateHash) {
    throw new Error('P17-M0 claim qualification does not bind the current source-lock aggregate');
  }
  const replacementPath = path.join(REPOSITORY_ROOT, qualification.replacementEvidence.path);
  const replacement = readHashValidatedJson(replacementPath, 'auditHash');
  if (sha256File(replacementPath) !== qualification.replacementEvidence.sha256
    || replacement.auditHash !== qualification.replacementEvidence.auditHash) {
    throw new Error('P17-M0 claim qualification replacement evidence mismatch');
  }
  return evidence;
}

export function runP17M0({ write = false } = {}) {
  let artifacts = buildP17M0Artifacts();
  if (write) artifacts = writeArtifacts(artifacts);
  const evidence = verifyWrittenArtifacts(artifacts);
  return {
    status: evidence.status,
    m1EntryAllowed: evidence.m1EntryAllowed,
    releaseAllowed: evidence.releaseAllowed,
    officialCases: artifacts.locks.length,
    manifestVerified: `${artifacts.custody.verifiedCount}/${artifacts.custody.declaredCount}`,
    discrepancies: artifacts.discrepancies.items.length,
    releaseBlockers: evidence.blockers.length,
    baselineHash: evidence.baselineHash,
    evidencePath: repoRelative(OUTPUTS.evidence),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = runP17M0({ write: process.argv.includes('--write') });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`[P17-M0] ${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
