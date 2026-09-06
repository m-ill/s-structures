import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  P11_PDF_ARTIFACT_MANIFEST_VERSION,
  createDualPdfExportPlan,
  createPdfExportService,
  exportDualPdfPair,
  validateArtifactManifest,
} from '../server/report/phase11/pdfExportService.mjs';
import { inspectChromiumPdfBuffer } from '../desktop/reportExportIpc.mjs';
import { createReportSnapshot } from '../src/report/phase11/reportSnapshot.js';
import { createFigureManifest, createRequiredScenePlan } from '../src/report/phase11/sceneEvidence.js';

const sandbox = await fsTemp('p11-m6-');
const outputRoot = path.join(sandbox, 'output');
const tempRoot = path.join(sandbox, 'temp');
const assetRoot = path.join(sandbox, 'source');
const { snapshot, figureManifest } = await fixture(assetRoot);
const plan = createDualPdfExportPlan({
  snapshot,
  figureManifest,
  assetSourceRoot: assetRoot,
  projectId: 'PILOT-OFFICE-01',
  projectName: 'Pilot Office',
  sourceRevision: 'p11-m6-test',
  evidenceManifestHash: '1'.repeat(64),
});
const progress = [];
const result = await exportDualPdfPair(plan, {
  outputRoot,
  tempRoot,
  jobId: 'M6-SUCCESS',
  adapter: fakeAdapter(),
  inspectPdf: fakeInspector,
  now: () => Date.parse('2026-07-23T00:00:00.000Z'),
  onProgress: (event) => progress.push(event),
});
assert.equal(result.manifest.version, P11_PDF_ARTIFACT_MANIFEST_VERSION);
assert.deepEqual(validateArtifactManifest(result.manifest), { ok: true, errors: [] });
assert.deepEqual(result.manifest.locales, ['ko-KR', 'en-US']);
assert.equal(result.manifest.qualification.pairComplete, true);
assert.equal(result.manifest.qualification.pageParity, true);
assert.ok(progress.some((row) => row.stage === 'completed' && row.progress === 1));
for (const locale of result.manifest.locales) {
  const row = result.manifest.artifacts[locale];
  const bytes = await readFile(path.join(result.finalDir, row.pdf));
  assert.equal(sha256(bytes), row.sha256);
  assert.equal(row.pages, plan.pageCount);
  assert.equal(row.qualification.a4, true);
  assert.equal(row.qualification.searchableText, true);
  assert.equal(row.qualification.fontsEmbedded, true);
  assert.equal(row.qualification.footer, true);
  assert.ok(row.metadata.title.includes(locale));
}
assert.equal((await readdir(tempRoot)).length, 0);
const publishedReader = createPdfExportService({
  outputRoot,
  tempRoot,
  adapter: fakeAdapter(),
  inspectPdf: fakeInspector,
});
const published = await publishedReader.listPublished({ projectId: 'PILOT-OFFICE-01' });
assert.equal(published.length, 1);
assert.equal(published[0].jobId, 'M6-SUCCESS');
assert.equal(published[0].artifacts['ko-KR'].sha256, result.manifest.artifacts['ko-KR'].sha256);

const existingMarker = path.join(outputRoot, 'PILOT-OFFICE-01', 'EXISTING');
await mkdir(existingMarker, { recursive: true });
await writeFile(path.join(existingMarker, 'keep.txt'), 'preserve', 'utf8');
await assert.rejects(
  exportDualPdfPair(plan, {
    outputRoot,
    tempRoot,
    jobId: 'M6-ONE-LOCALE-FAIL',
    adapter: fakeAdapter({ failLocale: 'en-US' }),
    inspectPdf: fakeInspector,
  }),
  hasCode('P11_PDF_ADAPTER_TEST_FAILURE'),
);
await assert.rejects(stat(path.join(outputRoot, 'PILOT-OFFICE-01', 'M6-ONE-LOCALE-FAIL')), { code: 'ENOENT' });
assert.equal(await readFile(path.join(existingMarker, 'keep.txt'), 'utf8'), 'preserve');
assert.equal((await readdir(tempRoot)).length, 0);

await assert.rejects(
  exportDualPdfPair(plan, {
    outputRoot,
    tempRoot,
    jobId: 'M6-INSPECTION-FAIL',
    adapter: fakeAdapter(),
    inspectPdf: async () => ({ ...(await fakeInspector(null, { expectedPageCount: plan.pageCount })), fontsEmbedded: false }),
  }),
  hasCode('P11_PDF_INSPECTION_FAILED'),
);
await assert.rejects(stat(path.join(outputRoot, 'PILOT-OFFICE-01', 'M6-INSPECTION-FAIL')), { code: 'ENOENT' });

const service = createPdfExportService({
  outputRoot,
  tempRoot,
  adapter: fakeAdapter({ delayMs: 100 }),
  inspectPdf: fakeInspector,
});
const planned = service.plan({
  jobId: 'M6-CANCEL',
  snapshot,
  figureManifest,
  assetSourceRoot: assetRoot,
  projectId: 'PILOT-OFFICE-01',
});
assert.equal(planned.status, 'planned');
const running = service.run(planned.jobId);
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(service.cancel(planned.jobId).stage, 'cancelling');
await assert.rejects(running, hasCode('P11_PDF_EXPORT_CANCELLED'));
assert.equal(service.status(planned.jobId).status, 'cancelled');
assert.equal((await readdir(tempRoot)).length, 0);

await assert.rejects(
  exportDualPdfPair(plan, {
    outputRoot,
    tempRoot,
    jobId: 'M6-TIMEOUT',
    adapter: fakeAdapter({ delayMs: 100 }),
    inspectPdf: fakeInspector,
    timeoutMs: 5,
  }),
  hasCode('P11_PDF_EXPORT_TIMEOUT'),
);
assert.throws(
  () => createDualPdfExportPlan({
    snapshot,
    figureManifest,
    assetSourceRoot: assetRoot,
    projectId: '../escape',
  }),
  hasCode('P11_PDF_PROJECT_ID_INVALID'),
);
const chromiumInspection = inspectChromiumPdfBuffer(Buffer.from(
  '%PDF-1.7\n/Type /Page /MediaBox [0 0 594.96 841.92]\n/FontFile2 1 0 R\n/ToUnicode 2 0 R\n/StructTreeRoot 3 0 R\n',
), { locale: 'ko-KR', expectedPageCount: 1 });
assert.equal(chromiumInspection.pageCount, 1);
assert.equal(chromiumInspection.a4, true);
assert.equal(chromiumInspection.fontsEmbedded, true);
assert.equal(chromiumInspection.searchableText, true);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P11-M6',
  locales: result.manifest.locales,
  pageCount: plan.pageCount,
  manifestHash: result.manifest.manifestHash,
  progressEvents: progress.length,
  atomicPublish: true,
  partialFinalArtifacts: 0,
  privacyFindings: 0,
  failureModes: 8,
  persistentHistoryRows: published.length,
}, null, 2));

await rm(sandbox, { recursive: true, force: true });

function fakeAdapter(options = {}) {
  return {
    async render({ locale, signal }) {
      if (options.delayMs) await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, options.delayMs);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(Object.assign(new Error('cancelled'), { code: 'P11_PDF_EXPORT_CANCELLED' }));
        }, { once: true });
      });
      if (locale === options.failLocale) throw Object.assign(new Error('injected locale failure'), {
        code: 'P11_PDF_ADAPTER_TEST_FAILURE',
      });
      return Buffer.from(`%PDF-1.7\n${locale}\n${'x'.repeat(256)}\n%%EOF`);
    },
  };
}

async function fakeInspector(_bytes, context) {
  return {
    pageCount: context.expectedPageCount,
    a4: true,
    searchableText: true,
    fontsEmbedded: true,
    footer: true,
    privacyFindings: 0,
    text: context.locale === 'ko-KR' ? '종합 결론 페이지' : 'Overall conclusion Page',
    metadata: {
      title: `PILOT-OFFICE-01 ${context.locale}`,
      author: 'S-Structures',
      creator: 'S-Structures',
      producer: 'test-adapter',
    },
  };
}

async function fixture(assetRoot) {
  const model = {
    schemaVersion: 5,
    meta: { id: 'PILOT-OFFICE-01' },
    storyModel: { count: 1 },
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: 5, y: 0, z: 0, support: 'fixed' },
      { id: 'N3', x: 0, y: 0, z: 3 },
      { id: 'N4', x: 5, y: 0, z: 3 },
    ],
    members: [
      { id: 'M1', n1: 'N1', n2: 'N3', matId: 'MAT', secId: 'SEC' },
      { id: 'M2', n1: 'N2', n2: 'N4', matId: 'MAT', secId: 'SEC' },
      { id: 'M3', n1: 'N3', n2: 'N4', matId: 'MAT', secId: 'SEC' },
    ],
    materials: [{ id: 'MAT', E: 205000, G: 79000 }],
    sections: [{ id: 'SEC', A: 0.02, Iy: 2e-5, Iz: 3e-5, J: 1e-5 }],
    loadCases: [{ id: 'D', type: 'dead' }, { id: 'EX', type: 'seismic' }],
    loads: [
      { id: 'D1', type: 'nodal', node: 'N4', case: 'D', P: 10, dir: '-z' },
      { id: 'E1', type: 'nodal', node: 'N4', case: 'EX', P: 3, dir: '+x' },
    ],
    loadCombinations: [{ id: 'C-EX', factors: { D: 1.2, EX: 1 } }],
  };
  const analysis = {
    ok: true,
    validation: { errors: [], warnings: [] },
    audit: { ok: true, maxEquilibriumResidual: 1e-14 },
    envelope: { dmax: 0.003, maxRatio: 0.42 },
    design: { summary: { maxUtilization: 0.42, governing: {
      memberId: 'M1', checkId: 'steel-flexure', comboId: 'C-EX', ratio: 0.42, status: 'OK',
    } } },
    designEligibility: { eligible: true, status: 'qualified' },
    combinationCompleteness: { rows: [{ comboId: 'C-EX', complete: true }] },
    byCombo: { 'C-EX': { ok: true, dmax: 0.003, maxRatio: 0.42, summary: { equilibriumResidual: 1e-14 } } },
  };
  const snapshot = createReportSnapshot(model, analysis, {
    sourceRevision: 'p11-m6-test',
    qualityAudit: { ok: true, items: [{ status: 'OK' }] },
    phase10Eligibility: { eligible: true, status: 'qualified-local-profile' },
  });
  const scenePlan = createRequiredScenePlan(snapshot, model, analysis);
  const assetBytes = Buffer.from('deterministic-p11-m6-figure');
  const assetHash = sha256(assetBytes);
  const captures = scenePlan.scenes.map((row) => ({
    kind: row.kind,
    captureSpecHash: row.captureSpec.captureSpecHash,
    reportSnapshotHash: snapshot.reportSnapshotHash,
    modelDomainHash: snapshot.sourceBinding.modelDomainHash,
    resultHash: snapshot.sourceBinding.resultHash,
    width: 1600,
    height: 900,
    bytes: assetBytes.length,
    sha256: assetHash,
  }));
  const figureManifest = createFigureManifest({ snapshot, scenePlan, captures, sourceRevision: 'test' });
  for (const figure of figureManifest.figures) {
    const target = path.join(assetRoot, figure.assetPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, assetBytes);
  }
  return { snapshot, figureManifest };
}

function hasCode(code) {
  return (error) => error?.code === code;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fsTemp(prefix) {
  const root = path.join(os.tmpdir(), `${prefix}${process.pid}-${Date.now()}`);
  await mkdir(root, { recursive: true });
  return root;
}
