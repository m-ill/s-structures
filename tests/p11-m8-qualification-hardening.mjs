import assert from 'node:assert/strict';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createDualPdfExportPlan,
  exportDualPdfPair,
} from '../server/report/phase11/pdfExportService.mjs';
import {
  P11_M8_VERIFICATION_IDS,
  qualifyPhase11Reports,
  validatePhase11Qualification,
} from '../src/report/phase11/qualification.js';
import { createReportExportWorkflow } from '../src/ui/indexReportExportWorkflow.js';
import { createReportSnapshot } from '../src/report/phase11/reportSnapshot.js';
import { createFigureManifest, createRequiredScenePlan } from '../src/report/phase11/sceneEvidence.js';
import { createHash } from 'node:crypto';

const passing = qualifyPhase11Reports({
  sourceRevision: 'p11-m8-test',
  environment: { platform: 'win32', browser: 'chrome', pdfInspector: 'pypdf', rasterizer: 'poppler' },
  performance: {
    dualExportDurationsMs: [4100, 3900, 4200, 4000, 4050],
    peakWorkingSetBytes: 300 * 1024 * 1024,
    firstProgressMs: 10,
    cancelAcknowledgementMs: 4,
    pdfBytes: [600_000, 550_000],
  },
  visual: {
    rasterPages: 28,
    expectedRasterPages: 28,
    blankPages: 0,
    edgeInkPages: 0,
    replacementCharacters: 0,
    koreanSearchable: true,
    fontsEmbedded: true,
    a4: true,
    footer: true,
    approvalReason: 'P11-M8 production baseline',
    contactSheets: ['ko.png', 'en.png'],
  },
  security: { privacyFindings: 0, injectionFindings: 0, networkRequests: 0 },
  failures: { total: 8, passed: 8, falseSuccesses: 0, cleanupFailures: 0 },
  smoke: { package: true, install: true, desktopContract: true, browserFallback: true },
});
assert.deepEqual(validatePhase11Qualification(passing), { ok: true, errors: [] });
assert.equal(passing.status, 'PASS');
assert.equal(P11_M8_VERIFICATION_IDS.length, 40);
assert.equal(passing.checks.length, 18);

for (const [field, value] of [
  ['dualExportDurationsMs', [30_001, 30_001, 30_001, 30_001, 30_001]],
  ['peakWorkingSetBytes', 1024 * 1024 * 1024 + 1],
]) {
  const blocked = qualifyPhase11Reports({
    ...baseQualificationInput(),
    performance: { ...baseQualificationInput().performance, [field]: value },
  });
  assert.equal(blocked.status, 'BLOCKED');
}

const workflow = createReportExportWorkflow({ transport: {} });
const qualifiedPreflight = workflow.preflight({
  snapshot: { reportSnapshotHash: '1'.repeat(64) },
  figureManifest: { status: 'complete', reportSnapshotHash: '1'.repeat(64), figureCount: 7 },
  qualification: { status: 'BLOCKED' },
});
assert.equal(qualifiedPreflight.ready, false);
assert.ok(qualifiedPreflight.issues.some((row) => row.code === 'P11_REPORT_EXPORT_QUALIFICATION_BLOCKED'));

const sandbox = path.join(os.tmpdir(), `p11-m8-${process.pid}-${Date.now()}`);
const outputRoot = path.join(sandbox, 'output');
const tempRoot = path.join(sandbox, 'temp');
const assetRoot = path.join(sandbox, 'assets');
const { snapshot, figureManifest } = await fixture(assetRoot);
const plan = createDualPdfExportPlan({
  snapshot, figureManifest, assetSourceRoot: assetRoot, projectId: 'PILOT-OFFICE-01',
});
const scenarios = [
  ['corrupt-pdf', corruptAdapter(), fakeInspector, 'P11_PDF_BYTES_INVALID'],
  ['font-missing', goodAdapter(), async (_bytes, context) => ({ ...(await fakeInspector(null, context)), fontsEmbedded: false }), 'P11_PDF_INSPECTION_FAILED'],
  ['corrupt-asset', goodAdapter(), fakeInspector, 'P11_PDF_ASSET_HASH_MISMATCH', true],
  ['permission-denied', throwingAdapter('P11_PDF_PERMISSION_DENIED'), fakeInspector, 'P11_PDF_PERMISSION_DENIED'],
  ['disk-full', throwingAdapter('ENOSPC'), fakeInspector, 'ENOSPC'],
  ['hidden-window-crash', throwingAdapter('P11_PDF_BROWSER_CRASH'), fakeInspector, 'P11_PDF_BROWSER_CRASH'],
];
let failurePasses = 0;
for (const [jobId, adapter, inspector, expectedCode, corruptAsset] of scenarios) {
  if (corruptAsset) await writeFile(path.join(assetRoot, figureManifest.figures[0].assetPath), 'corrupt');
  await assert.rejects(
    exportDualPdfPair(plan, { outputRoot, tempRoot, jobId, adapter, inspectPdf: inspector }),
    (error) => error?.code === expectedCode,
  );
  if (corruptAsset) await writeFile(path.join(assetRoot, figureManifest.figures[0].assetPath), 'asset');
  assert.equal((await readdir(tempRoot)).length, 0);
  failurePasses += 1;
}
assert.equal(failurePasses, scenarios.length);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P11-M8',
  verificationIds: P11_M8_VERIFICATION_IDS.length,
  qualificationChecks: passing.checks.length,
  dualExportP95Ms: passing.metrics.dualExportP95Ms,
  failureScenarios: failurePasses + 2,
  falseSuccesses: 0,
  qualificationHash: passing.qualificationHash,
}, null, 2));
await rm(sandbox, { recursive: true, force: true });

function baseQualificationInput() {
  return {
    environment: { platform: 'win32', browser: 'chrome', pdfInspector: 'pypdf', rasterizer: 'poppler' },
    performance: {
      dualExportDurationsMs: [1, 1, 1, 1, 1],
      peakWorkingSetBytes: 1,
      firstProgressMs: 1,
      cancelAcknowledgementMs: 1,
      pdfBytes: [1],
    },
    visual: {
      rasterPages: 2, expectedRasterPages: 2, blankPages: 0, edgeInkPages: 0,
      replacementCharacters: 0, koreanSearchable: true, fontsEmbedded: true, a4: true, footer: true,
    },
    security: { privacyFindings: 0, injectionFindings: 0, networkRequests: 0 },
    failures: { total: 8, passed: 8, falseSuccesses: 0, cleanupFailures: 0 },
    smoke: { package: true, install: true, desktopContract: true, browserFallback: true },
  };
}

function goodAdapter() {
  return { async render() { return Buffer.from(`%PDF-1.7\n${'x'.repeat(100)}\n%%EOF`); } };
}
function corruptAdapter() {
  return { async render() { return Buffer.from('not a pdf'); } };
}
function throwingAdapter(code) {
  return { async render() { throw Object.assign(new Error(code), { code }); } };
}
async function fakeInspector(_bytes, context) {
  return {
    pageCount: context.expectedPageCount, a4: true, searchableText: true, fontsEmbedded: true,
    footer: true, privacyFindings: 0, text: 'qualified', metadata: { title: `Report ${context.locale}` },
  };
}
async function fixture(assetRoot) {
  const model = {
    schemaVersion: 5, meta: { id: 'PILOT-OFFICE-01' }, storyModel: { count: 1 },
    nodes: [{ id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' }, { id: 'N2', x: 1, y: 0, z: 1 }],
    members: [{ id: 'M1', n1: 'N1', n2: 'N2', matId: 'MAT', secId: 'SEC' }],
    materials: [{ id: 'MAT', E: 205000, G: 79000 }],
    sections: [{ id: 'SEC', A: 0.02, Iy: 2e-5, Iz: 3e-5, J: 1e-5 }],
    loadCases: [{ id: 'D', type: 'dead' }, { id: 'EX', type: 'seismic' }],
    loads: [{ id: 'E1', type: 'nodal', node: 'N2', case: 'EX', P: 1, dir: '+x' }],
    loadCombinations: [{ id: 'C1', factors: { D: 1, EX: 1 } }],
  };
  const analysis = {
    ok: true, validation: { errors: [], warnings: [] }, audit: { ok: true, maxEquilibriumResidual: 0 },
    envelope: { dmax: 0.001, maxRatio: 0.1 },
    design: { summary: { maxUtilization: 0.1, governing: {
      memberId: 'M1', checkId: 'steel-flexure', comboId: 'C1', ratio: 0.1, status: 'OK',
    } } },
    designEligibility: { eligible: true }, combinationCompleteness: { rows: [{ comboId: 'C1', complete: true }] },
    byCombo: { C1: { ok: true, dmax: 0, maxRatio: 0, summary: { equilibriumResidual: 0 } } },
  };
  const snapshot = createReportSnapshot(model, analysis, { phase10Eligibility: { eligible: true } });
  const scenePlan = createRequiredScenePlan(snapshot, model, analysis);
  const hash = createHash('sha256').update('asset').digest('hex');
  const captures = scenePlan.scenes.map((row) => ({
    kind: row.kind, captureSpecHash: row.captureSpec.captureSpecHash,
    reportSnapshotHash: snapshot.reportSnapshotHash, modelDomainHash: snapshot.sourceBinding.modelDomainHash,
    resultHash: snapshot.sourceBinding.resultHash, width: 1600, height: 900, bytes: 5, sha256: hash,
  }));
  const figureManifest = createFigureManifest({ snapshot, scenePlan, captures });
  for (const figure of figureManifest.figures) {
    const target = path.join(assetRoot, figure.assetPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'asset');
  }
  return { snapshot, figureManifest };
}
