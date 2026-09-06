import assert from 'node:assert/strict';
import { createReportSnapshot } from '../src/report/phase11/reportSnapshot.js';
import {
  P11_KOREAN_FONT_STACK,
  P11_REPORT_CATALOGS,
  createReportTranslator,
  validateReportCatalogs,
} from '../src/report/phase11/i18n.js';
import { renderBilingualReportPair } from '../src/report/phase11/bilingualReport.js';

const snapshot = createReportSnapshot(fixtureModel(), fixtureAnalysis(), {
  sourceRevision: 'p11-m2-test',
  qualityAudit: { ok: true, items: [{ name: 'audit', status: 'OK' }] },
  phase10Eligibility: { eligible: true, status: 'qualified' },
});
const pair = renderBilingualReportPair(snapshot, { projectName: '<img src=x onerror=alert(1)>' });
const ko = pair.reports['ko-KR'];
const en = pair.reports['en-US'];

assert.deepEqual(validateReportCatalogs(new Set(ko.usedMessageKeys)), {
  ok: true,
  errors: [],
  keyCount: Object.keys(P11_REPORT_CATALOGS['en-US']).length,
});
assert.equal(pair.manifest.status, 'complete');
assert.equal(pair.manifest.numericParity, true);
assert.equal(pair.manifest.technicalIdParity, true);
assert.equal(ko.reportSnapshotHash, en.reportSnapshotHash);
assert.equal(ko.semanticHash, en.semanticHash);
assert.deepEqual(ko.numericValues, en.numericValues);
assert.deepEqual(ko.technicalIds, en.technicalIds);
assert.match(ko.html, /lang="ko-KR"/);
assert.match(en.html, /lang="en-US"/);
assert.match(ko.html, /구조해석 보고서/);
assert.match(en.html, /Structural Analysis Report/);
assert.match(ko.html, /구조해석 보고서 한글 글꼴 검색 복사 확인/);
assert.match(ko.html, /KDS-ST-05-EX-N/);
assert.match(en.html, /KDS-ST-05-EX-N/);
assert.match(ko.html, /M32/);
assert.match(en.html, /M32/);
assert.ok(P11_KOREAN_FONT_STACK.includes('Noto Sans KR'));
assert.ok(!ko.html.includes('<img src=x'));
assert.ok(!en.html.includes('<img src=x'));
assert.match(ko.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
assert.throws(
  () => createReportTranslator('fr-FR')('report.title'),
  (error) => error.code === 'P11_REPORT_LOCALE_UNSUPPORTED',
);
assert.throws(
  () => createReportTranslator('ko-KR')('footer.generatedFrom'),
  (error) => error.code === 'P11_REPORT_PLACEHOLDER_MISSING',
);
const broken = structuredClone(snapshot);
broken.reportSnapshotHash = '0'.repeat(64);
assert.throws(
  () => renderBilingualReportPair(broken),
  (error) => error.code === 'P11_REPORT_SNAPSHOT_INVALID',
);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P11-M2',
  catalogKeys: Object.keys(P11_REPORT_CATALOGS['en-US']).length,
  locales: pair.manifest.locales,
  snapshotHash: pair.manifest.reportSnapshotHash,
  semanticHash: pair.manifest.semanticHash,
  numericValues: ko.numericValues.length,
  technicalIds: ko.technicalIds.length,
  injectionSafe: true,
  glyphProbe: true,
}, null, 2));

function fixtureModel() {
  return {
    schemaVersion: 5,
    meta: { id: 'PILOT-OFFICE-01' },
    storyModel: { count: 4 },
    nodes: Array.from({ length: 45 }, (_row, i) => ({ id: `N${i + 1}`, x: i % 5, y: i % 3, z: Math.floor(i / 9) * 3.6 })),
    members: Array.from({ length: 84 }, (_row, i) => ({ id: `M${i + 1}`, n1: `N${(i % 44) + 1}`, n2: `N${(i % 44) + 2}`, matId: 'MAT', secId: 'SEC' })),
    materials: [{ id: 'MAT', E: 205000, G: 79000 }],
    sections: [{ id: 'SEC', A: 0.01, Iy: 1e-5, Iz: 1e-5, J: 1e-5 }],
    loads: Array.from({ length: 240 }, (_row, i) => ({ id: `L${i}`, type: 'nodal', node: 'N1', case: 'D', P: 1, dir: '+x' })),
    loadCases: ['D', 'L', 'WX', 'WY', 'EX', 'EY'].map((id) => ({ id })),
    loadCombinations: Array.from({ length: 28 }, (_row, i) => ({ id: i === 4 ? 'KDS-ST-05-EX-N' : `C${i + 1}`, factors: { D: 1 } })),
  };
}

function fixtureAnalysis() {
  return {
    ok: true,
    validation: { errors: [], warnings: [] },
    audit: { ok: true, maxEquilibriumResidual: 5.542148285615899e-15 },
    envelope: { dmax: 0.005749185700252778, maxRatio: 0.3943625474780076 },
    design: { summary: { maxUtilization: 0.3943625474780076, governing: {
      memberId: 'M32', checkId: 'steel-deflection', comboId: 'KDS-ST-05-EX-N', ratio: 0.3943625474780076, status: 'OK',
    } } },
    designEligibility: { eligible: true, status: 'qualified' },
    combinationCompleteness: { rows: [{ comboId: 'KDS-ST-05-EX-N', complete: true }] },
    byCombo: { 'KDS-ST-05-EX-N': { ok: true, dmax: 0.005749185700252778, maxRatio: 0.3943625474780076, summary: { equilibriumResidual: 5.542148285615899e-15 } } },
  };
}
