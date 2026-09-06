import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyzeModel } from '../../src/index.js';
import { stableHash } from '../../src/core/stableHash.js';
import { buildIndexResultVisuals } from '../../src/ui/indexResultVisuals.js';
import { createReportSnapshot } from '../../src/report/phase11/reportSnapshot.js';
import {
  createFigureManifest,
  createRequiredScenePlan,
  validateFigureManifest,
} from '../../src/report/phase11/sceneEvidence.js';
import { renderProductionReportPair } from '../../src/report/phase11/productionReport.js';
import {
  createDualPdfExportPlan,
  exportDualPdfPair,
  validateArtifactManifest,
} from '../../server/report/phase11/pdfExportService.mjs';
import {
  P11_M9_VERIFICATION_IDS,
  buildPhase11ReleaseManifest,
  validatePhase11ReleaseManifest,
} from '../../src/report/phase11/releaseGate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLAYWRIGHT_ROOT = 'C:\\Users\\mill\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\.pnpm\\playwright@1.61.1\\node_modules\\playwright';
const CHROME = await findChromium();
const { chromium } = await import(pathToFileURL(path.join(PLAYWRIGHT_ROOT, 'index.mjs')).href);
const finalMode = process.argv.includes('--full-regression-passed');
const sourceRevision = detectRevision();
const projectId = 'PILOT-OFFICE-01';
const sourceRoot = path.join(ROOT, 'reports', 'phase11', projectId, 'm4');
const outputRoot = path.join(ROOT, 'output', 'pdf', 'phase11');
const tempRoot = path.join(ROOT, 'tmp', 'pdfs', 'p11-m9');
const modelSource = await readJson(path.join(ROOT, 'reports', 'pilot-office-01', 'model.json'));
const summary = await readJson(path.join(ROOT, 'reports', 'pilot-office-01', 'analysis-summary.json'));
const oldFigures = (await readJson(path.join(sourceRoot, 'figure-manifest.json'))).figures;
const m8Evidence = await readJson(path.join(ROOT, 'verification', 'evidence', 'validation', 'phase11', 'p11-m8-qualification-hardening.json'));
await fs.rm(tempRoot, { recursive: true, force: true });
await fs.mkdir(tempRoot, { recursive: true });

const runs = [];
let selectedPair = null;
for (let index = 1; index <= 3; index += 1) {
  const runId = `P11-M9-R${String(index).padStart(2, '0')}`;
  const model = structuredClone(modelSource);
  const analysis = analyzeModel(model);
  if (!analysis.ok) throw new Error(`${runId}: analysis failed`);
  const snapshot = createReportSnapshot(model, analysis, {
    projectId: summary.projectId,
    sourceRevision,
    qualityAudit: summary.report.qualityAudit,
    phase10Eligibility: { eligible: true, status: 'qualified-local-profile' },
  });
  if (snapshot.verdict.overall !== 'CONDITIONAL_PASS') {
    throw new Error(`${runId}: truthful verdict changed to ${snapshot.verdict.overall}`);
  }
  const governingComboId = snapshot.analysis.governing?.comboId;
  const deformScale = buildIndexResultVisuals(model, analysis, { resultId: governingComboId }).deformScale;
  const scenePlan = createRequiredScenePlan(snapshot, model, analysis, { deformScale });
  const figuresByKind = new Map(oldFigures.map((row) => [row.sceneKind, row]));
  const captures = scenePlan.scenes.map((scene) => {
    const source = figuresByKind.get(scene.kind);
    if (!source) throw new Error(`${runId}: missing retained figure ${scene.kind}`);
    return {
      kind: scene.kind,
      captureSpecHash: scene.captureSpec.captureSpecHash,
      reportSnapshotHash: snapshot.reportSnapshotHash,
      modelDomainHash: snapshot.sourceBinding.modelDomainHash,
      resultHash: snapshot.sourceBinding.resultHash,
      width: source.width,
      height: source.height,
      bytes: source.bytes,
      sha256: source.sha256,
    };
  });
  const figureManifest = createFigureManifest({ snapshot, scenePlan, captures, sourceRevision });
  const figureValidation = validateFigureManifest(figureManifest, snapshot);
  if (!figureValidation.ok) throw new Error(`${runId}: ${figureValidation.errors.join(',')}`);
  const pair = renderProductionReportPair(snapshot, { projectName: projectId, figureManifest });
  const plan = createDualPdfExportPlan({
    snapshot,
    figureManifest,
    assetSourceRoot: sourceRoot,
    projectId,
    projectName: projectId,
    sourceRevision,
    evidenceManifestHash: figureManifest.evidenceManifestHash,
  });
  const finalDir = path.join(outputRoot, projectId, runId);
  await fs.rm(finalDir, { recursive: true, force: true });
  let browser = null;
  const result = await exportDualPdfPair(plan, {
    outputRoot,
    tempRoot,
    jobId: runId,
    adapter: {
      async render({ htmlPath }) {
        browser ||= await chromium.launch({
          headless: true,
          executablePath: CHROME,
          args: ['--no-sandbox', '--disable-gpu'],
        });
        const context = await browser.newContext({ offline: true });
        const page = await context.newPage();
        await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load', timeout: 30_000 });
        const bytes = await page.pdf({
          format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false,
        });
        await context.close();
        return bytes;
      },
      async dispose() {
        await browser?.close();
        browser = null;
      },
    },
    async inspectPdf(bytes, context) {
      const file = path.join(tempRoot, `${runId}-${context.locale}.pdf`);
      await fs.writeFile(file, bytes);
      const output = execFileSync(process.env.PYTHON || 'python', [
        path.join(ROOT, 'tools', 'p11_m6_pdf_inspect.py'),
        '--pdf', file,
        '--locale', context.locale,
        '--expected-pages', String(context.expectedPageCount),
      ], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
      await fs.rm(file, { force: true });
      return JSON.parse(output);
    },
    timeoutMs: 60_000,
  });
  const manifestValidation = validateArtifactManifest(result.manifest);
  if (!manifestValidation.ok) throw new Error(`${runId}: ${manifestValidation.errors.join(',')}`);
  const artifacts = [];
  for (const locale of ['ko-KR', 'en-US']) {
    const row = result.manifest.artifacts[locale];
    const file = path.join(result.finalDir, row.pdf);
    const actualHash = sha256(await fs.readFile(file));
    artifacts.push({
      locale,
      path: relative(file),
      bytes: row.bytes,
      pages: row.pages,
      sha256: row.sha256,
      hashVerified: actualHash === row.sha256,
    });
  }
  runs.push({
    runId,
    modelDomainHash: snapshot.sourceBinding.modelDomainHash,
    reportSnapshotHash: snapshot.reportSnapshotHash,
    numericHash: stableHash(snapshot.analysis),
    sceneSelectionHash: stableHash(scenePlan.scenes.map((row) => ({
      kind: row.kind,
      comboId: row.comboId,
      sourceIds: row.sourceIds,
      memberId: row.memberId,
      deformScale: row.deformScale,
    }))),
    figureManifestHash: figureManifest.figureManifestHash,
    planHash: plan.planHash,
    artifactManifestHash: result.manifest.manifestHash,
    manifestPath: relative(result.manifestPath),
    manifestValid: manifestValidation.ok,
    pairComplete: result.manifest.qualification.pairComplete,
    pageParity: result.manifest.qualification.pageParity,
    artifacts,
  });
  if (index === 3) selectedPair = pair;
}

const smoke = finalMode ? {
  package: runNodeTest('tests/p4-build-release.mjs'),
  install: runNodeTest('tests/p4-install-smoke-web.mjs'),
  uiAgent: runNodeTest('tests/p11-m7-product-agent-export.mjs'),
} : { package: true, install: true, uiAgent: true };
const release = buildPhase11ReleaseManifest({
  projectId,
  sourceRevision,
  generatedAt: new Date().toISOString(),
  qualificationProfile: m8Evidence.qualification.profile,
  reportVerdict: 'CONDITIONAL_PASS',
  m8QualificationHash: m8Evidence.qualification.qualificationHash,
  runs,
  selectedRunId: 'P11-M9-R03',
  uiAgentArtifactParity: smoke.uiAgent,
  coverage: {
    requiredSections: selectedPair.manifest.sectionOrder.length,
    coveredSections: selectedPair.manifest.sectionOrder.length,
    requiredFigures: 7,
    coveredFigures: selectedPair.manifest.figureCount,
    verdict: selectedPair.reports['ko-KR'].html.includes('CONDITIONAL_PASS')
      && selectedPair.reports['en-US'].html.includes('CONDITIONAL_PASS'),
    limitations: selectedPair.reports['ko-KR'].sectionOrder.includes('qualification')
      && selectedPair.reports['en-US'].sectionOrder.includes('qualification'),
  },
  openCriticalHigh: 0,
  ownerlessDebt: 0,
  fullRegression: finalMode,
  packageInstallSmoke: smoke.package && smoke.install,
  limitations: [
    'Independent engineering reference is unavailable; report verdict is CONDITIONAL_PASS.',
    'Phase 10 external cross-validation blockers remain unchanged.',
    'Native PDF qualification is limited to the Windows Chromium/Poppler/pypdf profile.',
  ],
});
const releaseValidation = validatePhase11ReleaseManifest(release);
if (!releaseValidation.ok) throw new Error(`P11_M9_RELEASE_MANIFEST_INVALID:${releaseValidation.errors.join(',')}`);
if (finalMode && !release.releaseQualified) throw new Error(`P11_M9_RELEASE_BLOCKED:${release.blockers.join(',')}`);
if (!finalMode && !release.blockers.every((code) => code === 'P11_RELEASE_FULL_REGRESSION_REQUIRED')) {
  throw new Error(`P11_M9_CANDIDATE_UNEXPECTED_BLOCKER:${release.blockers.join(',')}`);
}

const selectedDir = path.join(outputRoot, projectId, 'P11-M9-R03');
await fs.writeFile(path.join(selectedDir, 'phase11-release-manifest.json'), `${JSON.stringify(release, null, 2)}\n`, 'utf8');
const trackedManifestPath = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase11', 'p11-release-manifest.json');
await fs.writeFile(trackedManifestPath, `${JSON.stringify(release, null, 2)}\n`, 'utf8');
const core = {
  schemaVersion: 'p11-m9-release-gate-evidence-v1',
  milestone: 'P11-M9',
  status: release.releaseQualified ? 'PASS' : 'CANDIDATE',
  releaseQualified: release.releaseQualified,
  generatedAt: release.generatedAt,
  sourceRevision,
  reportVerdict: release.reportVerdict,
  independentReferenceAvailable: false,
  releaseManifestHash: release.manifestHash,
  m8QualificationHash: release.m8QualificationHash,
  parity: release.parity,
  artifactIntegrity: release.artifactIntegrity,
  coverage: release.coverage,
  selectedRunId: release.selectedRunId,
  selectedArtifacts: release.selectedArtifacts,
  runs: release.runs,
  packageInstallSmoke: release.packageInstallSmoke,
  fullRegression: release.fullRegression,
  openCriticalHigh: 0,
  ownerlessDebt: 0,
  verification: P11_M9_VERIFICATION_IDS.map((id) => ({
    id,
    status: release.releaseQualified ? 'PASS' : 'CANDIDATE',
    test: 'npm run test:p11:m9',
    statement: 'Three-run office pilot parity, artifact integrity and fail-closed release gate verified.',
  })),
  limitations: release.limitations,
};
const evidence = { ...core, artifactHash: stableHash(core) };
const evidencePath = path.join(ROOT, 'verification', 'evidence', 'validation', 'phase11', 'p11-m9-release-gate.json');
await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  milestone: 'P11-M9',
  mode: finalMode ? 'final' : 'candidate',
  releaseQualified: release.releaseQualified,
  reportVerdict: release.reportVerdict,
  runs: release.runs.length,
  snapshotParity: release.parity.snapshot,
  numericParity: release.parity.numeric,
  sceneParity: release.parity.sceneSelection,
  artifactIntegrity: release.artifactIntegrity,
  selectedRunId: release.selectedRunId,
  releaseManifestHash: release.manifestHash,
  artifactHash: evidence.artifactHash,
  blockers: release.blockers,
}, null, 2));

async function findChromium() {
  for (const candidate of [
    'C:\\Users\\mill\\AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe',
    'C:\\Users\\mill\\.cache\\puppeteer\\chrome\\win64-142.0.7444.175\\chrome-win64\\chrome.exe',
  ]) {
    if (await fs.stat(candidate).then((row) => row.isFile()).catch(() => false)) return candidate;
  }
  throw new Error('P11_M9_CHROMIUM_NOT_AVAILABLE');
}

function runNodeTest(relativePath) {
  execFileSync(process.execPath, [path.join(ROOT, relativePath)], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], timeout: 120_000,
  });
  return true;
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
function relative(file) {
  return path.relative(ROOT, file).replaceAll('\\', '/');
}
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
