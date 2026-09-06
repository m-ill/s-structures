import assert from 'node:assert/strict';
import { stableHash } from '../src/core/stableHash.js';
import { createReportSnapshot } from '../src/report/phase11/reportSnapshot.js';
import { createFigureManifest, createRequiredScenePlan } from '../src/report/phase11/sceneEvidence.js';
import {
  P11_PRODUCTION_REPORT_VERSION,
  renderProductionReport,
  renderProductionReportPair,
} from '../src/report/phase11/productionReport.js';

const model = fixtureModel();
const analysis = fixtureAnalysis();
const snapshot = createReportSnapshot(model, analysis, {
  sourceRevision: 'p11-m5-test',
  qualityAudit: { ok: true, items: [{ status: 'OK' }, { status: 'Not applicable' }] },
  phase10Eligibility: { eligible: true, status: 'qualified-local-profile' },
});
const scenePlan = createRequiredScenePlan(snapshot, model, analysis, { deformScale: 40 });
const captures = scenePlan.scenes.map((row) => ({
  kind: row.kind,
  captureSpecHash: row.captureSpec.captureSpecHash,
  reportSnapshotHash: snapshot.reportSnapshotHash,
  modelDomainHash: snapshot.sourceBinding.modelDomainHash,
  resultHash: snapshot.sourceBinding.resultHash,
  width: 1600,
  height: 900,
  bytes: 50000 + row.ordinal,
  sha256: stableHash({ kind: row.kind, fixture: 'p11-m5' }),
}));
const figureManifest = createFigureManifest({ snapshot, scenePlan, captures, sourceRevision: 'test' });
const pairs = Array.from({ length: 10 }, () => renderProductionReportPair(snapshot, {
  projectName: 'PILOT-OFFICE-01',
  figureManifest,
}));
const pair = pairs[0];
assert.equal(pair.manifest.version, P11_PRODUCTION_REPORT_VERSION);
assert.equal(pair.manifest.pageCount, 13);
assert.equal(new Set(pairs.map((row) => stableHash(row.manifest.sectionOrder))).size, 1);
assert.deepEqual(pair.reports['ko-KR'].sectionOrder, pair.reports['en-US'].sectionOrder);
assert.equal(pair.reports['ko-KR'].pageCount, pair.reports['en-US'].pageCount);
assert.deepEqual(pair.reports['ko-KR'].figureAssets, pair.reports['en-US'].figureAssets);

for (const locale of ['ko-KR', 'en-US']) {
  const report = pair.reports[locale];
  const firstPage = report.html.slice(report.html.indexOf('data-page="1"'), report.html.indexOf('data-page="2"'));
  for (const marker of report.firstPageMarkers) {
    assert.ok(firstPage.includes(`data-marker="${marker}"`), `${locale} first page missing ${marker}`);
  }
  for (const text of [
    snapshot.verdict.overall,
    'INDEPENDENT_REFERENCE_NOT_AVAILABLE',
    'M1',
    'C-EX',
    snapshot.reportSnapshotHash.slice(0, 12),
  ]) assert.ok(report.html.includes(text), `${locale} report missing ${text}`);
  assert.equal(count(report.html, 'class="report-page"'), report.pageCount);
  assert.equal(count(report.html, '<footer>'), report.pageCount);
  assert.equal(count(report.html, '<figure '), 7);
  assert.equal(count(report.html, '<figcaption>'), 7);
  assert.equal(count(report.html, '<thead>'), count(report.html, '<table>'));
  assert.equal(count(report.html, 'data-page-kind="figure-'), 7);
  assert.ok(report.html.includes('@page{size:A4;margin:0}'));
  assert.ok(report.html.includes('width:210mm;height:297mm'));
  assert.ok(report.html.includes('overflow:hidden'));
  assert.ok(report.html.includes('display:table-header-group'));
  assert.ok(report.html.includes('orphans:3;widows:3'));
  assert.ok(!report.html.includes('<script'));
  assert.ok(!report.html.includes('\u2011'));
  for (let page = 1; page <= report.pageCount; page += 1) {
    const label = locale === 'ko-KR' ? `페이지 ${page} 중 ${report.pageCount}` : `Page ${page} of ${report.pageCount}`;
    assert.ok(report.html.includes(label), `${locale} footer missing ${label}`);
  }
  for (const figure of figureManifest.figures) {
    assert.equal(count(report.html, `id="${figure.figureId}"`), 1);
    assert.equal(count(report.html, `src="${figure.assetPath}"`), 1);
    assert.ok(report.html.includes(`alt="`));
  }
}

const koFirst = pair.reports['ko-KR'].html.slice(
  pair.reports['ko-KR'].html.indexOf('data-page="1"'),
  pair.reports['ko-KR'].html.indexOf('data-page="2"'),
);
assert.ok(koFirst.includes('종합 결론'));
assert.ok(koFirst.includes('독립 구조공학 기준'));
const enFirst = pair.reports['en-US'].html.slice(
  pair.reports['en-US'].html.indexOf('data-page="1"'),
  pair.reports['en-US'].html.indexOf('data-page="2"'),
);
assert.ok(enFirst.includes('Overall conclusion'));
assert.ok(enFirst.includes('Independent engineering reference'));
assert.throws(
  () => renderProductionReportPair(snapshot, { requireFigures: true }),
  (error) => error.code === 'P11_REPORT_FIGURES_REQUIRED',
);
assert.throws(
  () => renderProductionReport(snapshot, 'ko-KR'),
  (error) => error.code === 'P11_REPORT_FIGURES_REQUIRED',
);
assert.throws(
  () => renderProductionReport({ ...snapshot, reportSnapshotHash: '0'.repeat(64) }, 'ko-KR', {
    requireFigures: false,
  }),
  (error) => error.code === 'P11_REPORT_SNAPSHOT_INVALID',
);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P11-M5',
  pageCount: pair.manifest.pageCount,
  firstPageMarkerCoverage: 1,
  figurePages: 7,
  footerNumberingErrors: 0,
  sectionOrderParity: true,
  deterministicRuns: pairs.length,
  layoutVersion: pair.manifest.layoutVersion,
}, null, 2));

function fixtureModel() {
  return {
    schemaVersion: 5,
    meta: { id: 'PILOT-OFFICE-01' },
    storyModel: { count: 1 },
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: 6, y: 0, z: 0, support: 'fixed' },
      { id: 'N3', x: 0, y: 5, z: 0, support: 'fixed' },
      { id: 'N4', x: 6, y: 5, z: 0, support: 'fixed' },
      { id: 'N5', x: 0, y: 0, z: 3.6 },
      { id: 'N6', x: 6, y: 0, z: 3.6 },
      { id: 'N7', x: 0, y: 5, z: 3.6 },
      { id: 'N8', x: 6, y: 5, z: 3.6 },
    ],
    members: [
      ['M1', 'N1', 'N5'], ['M2', 'N2', 'N6'], ['M3', 'N3', 'N7'], ['M4', 'N4', 'N8'],
      ['M5', 'N5', 'N6'], ['M6', 'N6', 'N8'], ['M7', 'N8', 'N7'], ['M8', 'N7', 'N5'],
    ].map(([id, n1, n2]) => ({ id, n1, n2, matId: 'MAT', secId: 'SEC' })),
    materials: [{ id: 'MAT', E: 205000, G: 79000 }],
    sections: [{ id: 'SEC', A: 0.02, Iy: 2e-5, Iz: 3e-5, J: 1e-5 }],
    loadCases: [{ id: 'D', type: 'dead' }, { id: 'L', type: 'live' }, { id: 'EX', type: 'seismic' }],
    loads: [
      { id: 'D1', type: 'nodal', node: 'N8', case: 'D', P: 10, dir: '-z' },
      { id: 'L1', type: 'nodal', node: 'N8', case: 'L', P: 5, dir: '-z' },
      { id: 'E1', type: 'nodal', node: 'N8', case: 'EX', P: 3, dir: '+x' },
    ],
    loadCombinations: [{ id: 'C-EX', factors: { D: 1.2, L: 0.5, EX: 1 } }],
  };
}

function fixtureAnalysis() {
  return {
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
}

function count(value, needle) {
  return value.split(needle).length - 1;
}
