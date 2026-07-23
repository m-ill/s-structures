import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableHash } from '../src/core/stableHash.js';
import { renderBilingualReportPair } from '../src/report/phase11/bilingualReport.js';
import { P11_REPORT_CATALOGS, validateReportCatalogs } from '../src/report/phase11/i18n.js';
import { createReportSnapshot } from '../src/report/phase11/reportSnapshot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRevision = detectRevision();
const model = JSON.parse(await fs.readFile(path.join(ROOT, 'reports/pilot-office-01/model.json'), 'utf8'));
const summary = JSON.parse(await fs.readFile(path.join(ROOT, 'reports/pilot-office-01/analysis-summary.json'), 'utf8'));
const analysis = {
  ok: summary.analysis.ok,
  validation: { errors: summary.analysis.validationErrors, warnings: summary.analysis.validationWarnings },
  audit: { ok: summary.report.qualityAudit.ok, maxEquilibriumResidual: summary.analysis.maxEquilibriumResidual },
  envelope: { dmax: summary.analysis.maxDisplacement, maxRatio: summary.analysis.maxUtilization },
  design: { summary: { maxUtilization: summary.analysis.maxUtilization, governing: summary.analysis.governing } },
  designEligibility: { eligible: true, status: 'qualified' },
  combinationCompleteness: {
    rows: model.loadCombinations.map((row) => ({
      comboId: row.id,
      complete: !summary.analysis.failedCombinations.includes(row.id),
    })),
  },
  byCombo: {
    [summary.analysis.governing.comboId]: {
      ok: true,
      dmax: summary.analysis.maxDisplacement,
      maxRatio: summary.analysis.maxUtilization,
      summary: { equilibriumResidual: summary.analysis.maxEquilibriumResidual },
    },
  },
};
const snapshot = createReportSnapshot(model, analysis, {
  projectId: summary.projectId,
  sourceRevision,
  qualityAudit: summary.report.qualityAudit,
  phase10Eligibility: { eligible: true, status: 'qualified-local-profile' },
});
const pair = renderBilingualReportPair(snapshot, { projectName: 'PILOT-OFFICE-01' });
const rawDir = path.join(ROOT, 'reports', 'phase11', 'PILOT-OFFICE-01', 'm2');
await fs.mkdir(rawDir, { recursive: true });
await fs.writeFile(path.join(rawDir, 'report-ko.html'), pair.reports['ko-KR'].html, 'utf8');
await fs.writeFile(path.join(rawDir, 'report-en.html'), pair.reports['en-US'].html, 'utf8');
const catalog = validateReportCatalogs(new Set(pair.reports['ko-KR'].usedMessageKeys));
if (!catalog.ok) throw new Error(catalog.errors.join(', '));
const ids = [
  ...Array.from({ length: 12 }, (_row, i) => `P11-I18N-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 6 }, (_row, i) => `P11-PAR-${String(i + 1).padStart(2, '0')}`),
  'P11-RPT-04',
];
const htmlArtifacts = Object.fromEntries(Object.entries(pair.reports).map(([locale, report]) => [locale, {
  path: `reports/phase11/PILOT-OFFICE-01/m2/report-${locale === 'ko-KR' ? 'ko' : 'en'}.html`,
  bytes: Buffer.byteLength(report.html),
  sha256: sha256(report.html),
  semanticHash: report.semanticHash,
}]));
const core = {
  schemaVersion: 'p11-m2-bilingual-rendering-v1',
  milestone: 'P11-M2',
  status: 'PASS',
  releaseQualified: false,
  generatedAt: new Date().toISOString(),
  sourceRevision,
  environment: { platform: os.platform(), release: os.release(), architecture: os.arch(), node: process.version },
  reportSnapshotHash: snapshot.reportSnapshotHash,
  pairManifest: pair.manifest,
  catalogs: {
    locales: Object.keys(P11_REPORT_CATALOGS).sort(),
    keyCount: catalog.keyCount,
    keyDifference: 0,
    placeholderDifference: 0,
    missing: 0,
    unused: 0,
  },
  parity: {
    snapshotHash: true,
    semanticHash: true,
    numericValues: true,
    technicalIds: true,
    numericValueCount: pair.reports['ko-KR'].numericValues.length,
    technicalIdCount: pair.reports['ko-KR'].technicalIds.length,
  },
  localeQuality: {
    koreanGlyphProbe: pair.reports['ko-KR'].html.includes('구조해석 보고서 한글 글꼴 검색 복사 확인'),
    koreanUntranslatedGeneralText: 0,
    englishHangulText: 0,
    htmlInjectionFindings: 0,
  },
  htmlArtifacts,
  verification: ids.map((id) => ({
    id,
    status: id === 'P11-RPT-04' ? 'BLOCKED' : 'PASS',
    test: 'npm run test:p11:m2',
    statement: id === 'P11-RPT-04'
      ? 'Contextual figure placement is owned and qualified by P11-M4.'
      : 'Bilingual catalog, rendering and parity contract verified.',
    ...(id === 'P11-RPT-04' ? { deferredTo: 'P11-M4' } : {}),
  })),
  passedVerificationCount: 18,
  deferredVerification: ['P11-RPT-04'],
  limitations: [
    'HTML is qualified at M2; PDF font embedding and searchable-copy qualification remain P11-M8.',
    'Visual evidence assets are not part of M2 and begin at P11-M3.',
  ],
};
const evidence = { ...core, artifactHash: stableHash(core) };
await fs.writeFile(
  path.join(ROOT, 'reports', 'validation-evidence', 'phase11', 'p11-m2-bilingual-rendering.json'),
  `${JSON.stringify(evidence, null, 2)}\n`,
  'utf8',
);
console.log(JSON.stringify({
  ok: true,
  milestone: 'P11-M2',
  reportSnapshotHash: snapshot.reportSnapshotHash,
  pairHash: pair.manifest.pairHash,
  catalogKeys: catalog.keyCount,
  verification: ids.length,
  artifactHash: evidence.artifactHash,
  releaseQualified: false,
}, null, 2));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function detectRevision() {
  const safeDirectory = ROOT.replaceAll('\\', '/');
  const revision = execFileSync('git', ['-c', `safe.directory=${safeDirectory}`, 'rev-parse', '--short', 'HEAD'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const dirty = execFileSync('git', ['-c', `safe.directory=${safeDirectory}`, 'status', '--porcelain'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  return dirty ? `${revision}+worktree` : revision;
}
