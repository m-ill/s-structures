import assert from 'node:assert/strict';
import { stableHash } from '../src/core/stableHash.js';
import { renderBilingualReportPair } from '../src/report/phase11/bilingualReport.js';
import { createReportSnapshot } from '../src/report/phase11/reportSnapshot.js';
import {
  P11_REQUIRED_SCENES,
  assertFigureManifestComplete,
  buildRequiredSceneFrames,
  createFigureManifest,
  createRequiredScenePlan,
  validateFigureManifest,
} from '../src/report/phase11/sceneEvidence.js';

const model = fixtureModel();
const analysis = fixtureAnalysis();
const snapshot = createReportSnapshot(model, analysis, {
  sourceRevision: 'p11-m4-test',
  qualityAudit: { ok: true, items: [{ name: 'audit', status: 'OK' }] },
  phase10Eligibility: { eligible: true, status: 'qualified-local-profile' },
});
const plans = Array.from({ length: 10 }, () => createRequiredScenePlan(snapshot, model, analysis, { deformScale: 25 }));
assert.equal(new Set(plans.map((row) => row.scenePlanHash)).size, 1);
const plan = plans[0];
const frames = buildRequiredSceneFrames(snapshot, model, analysis, plan);
assert.equal(plan.scenes.length, 7);
assert.equal(frames.length, 7);
assert.equal(frames.find((row) => row.kind === 'model-plan-elevation').projection, 'plan-elevation');
assert.equal(frames.find((row) => row.kind === 'load-gravity').overlay.loadArrows.length, 2);
assert.equal(frames.find((row) => row.kind === 'load-lateral').overlay.loadArrows.length, 1);
assert.ok(frames.find((row) => row.kind === 'deformed-governing').overlay.deformedMembers.length > 0);
assert.ok(frames.find((row) => row.kind === 'reactions-governing').overlay.reactionArrows.length > 0);
assert.ok(frames.find((row) => row.kind === 'utilization-governing').overlay.utilizationMembers.length > 0);
assert.deepEqual(plan.scenes.map((row) => row.kind), P11_REQUIRED_SCENES.map((row) => row.kind));
assert.deepEqual(plan.scenes.find((row) => row.kind === 'load-gravity').sourceIds, ['D', 'L']);
assert.deepEqual(plan.scenes.find((row) => row.kind === 'load-lateral').sourceIds, ['EX']);
assert.equal(plan.scenes.find((row) => row.kind === 'deformed-governing').comboId, 'KDS-ST-05-EX-N');
assert.equal(plan.scenes.find((row) => row.kind === 'deformed-governing').deformScale, 25);
assert.equal(plan.scenes.find((row) => row.kind === 'utilization-governing').memberId, 'M32');
const staleFrameModel = structuredClone(model);
staleFrameModel.nodes[0].x += 0.25;
assert.throws(
  () => buildRequiredSceneFrames(snapshot, staleFrameModel, analysis, plan),
  hasCode('P11_REPORT_SNAPSHOT_STALE'),
);

const captures = plan.scenes.map(captureFor);
const manifest = createFigureManifest({ snapshot, scenePlan: plan, captures, sourceRevision: 'test' });
assert.deepEqual(validateFigureManifest(manifest, snapshot), { ok: true, errors: [] });
assert.equal(assertFigureManifestComplete(manifest, snapshot), true);
assert.equal(manifest.requiredCount, 7);
assert.equal(manifest.figureCount, 7);
assert.equal(new Set(manifest.figures.map((row) => row.figureId)).size, 7);
assert.equal(new Set(manifest.figures.map((row) => row.sceneKind)).size, 7);
assert.equal(new Set(manifest.figures.map((row) => row.assetPath)).size, 7);
assert.ok(manifest.figures.every((row) => row.assetPath.endsWith(`${row.sha256.slice(0, 16)}.png`)));

const pair = renderBilingualReportPair(snapshot, {
  projectName: 'PILOT-OFFICE-01',
  figureManifest: manifest,
  requireFigures: true,
});
assert.equal(pair.manifest.figureCount, 7);
assert.equal(pair.manifest.figureAssetParity, true);
assert.equal(pair.manifest.figureManifestHash, manifest.figureManifestHash);
assert.deepEqual(pair.reports['ko-KR'].figureAssets, pair.reports['en-US'].figureAssets);
for (const locale of ['ko-KR', 'en-US']) {
  const report = pair.reports[locale];
  assert.equal(count(report.html, '<figure '), 7);
  assert.equal(count(report.html, '<figcaption>'), 7);
  assert.equal(count(report.html, '<img '), 7);
  for (const row of manifest.figures) {
    assert.equal(count(report.html, `id="${row.figureId}"`), 1);
    assert.equal(count(report.html, `src="${row.assetPath}"`), 1);
    assert.equal(count(report.html, `data-asset-sha256="${row.sha256}"`), 1);
    if (row.comboId) assert.ok(report.html.includes(row.comboId));
    for (const sourceId of row.sourceIds) assert.ok(report.html.includes(sourceId));
  }
}
assert.ok(pair.reports['ko-KR'].html.includes('해석 모델의 3차원 등각 보기'));
assert.ok(pair.reports['en-US'].html.includes('Isometric view of the analysis model'));

assert.throws(
  () => renderBilingualReportPair(snapshot, { requireFigures: true }),
  hasCode('P11_REPORT_FIGURES_REQUIRED'),
);
assert.throws(
  () => createFigureManifest({ snapshot, scenePlan: plan, captures: captures.slice(1) }),
  hasCode('P11_FIGURE_REQUIRED_CAPTURE_MISSING'),
);
assert.throws(
  () => createFigureManifest({ snapshot, scenePlan: plan, captures: [...captures, captures[0]] }),
  hasCode('P11_FIGURE_DUPLICATE_CAPTURE'),
);
const staleCapture = { ...captures[0], resultHash: 'f'.repeat(64) };
assert.throws(
  () => createFigureManifest({ snapshot, scenePlan: plan, captures: [staleCapture, ...captures.slice(1)] }),
  hasCode('P11_FIGURE_CAPTURE_STALE'),
);
const corrupt = structuredClone(manifest);
corrupt.figures[0].assetPath = '../escape.png';
assert.equal(validateFigureManifest(corrupt, snapshot).ok, false);
assert.throws(
  () => renderBilingualReportPair(snapshot, { figureManifest: corrupt }),
  hasCode('P11_FIGURE_MANIFEST_INVALID'),
);

const missingLateral = structuredClone(model);
missingLateral.loadCases = missingLateral.loadCases.filter((row) => !['WX', 'WY', 'EX', 'EY'].includes(row.id));
missingLateral.loadCombinations[0].factors = { D: 1 };
const missingLateralAnalysis = fixtureAnalysis();
const missingLateralSnapshot = createReportSnapshot(missingLateral, missingLateralAnalysis, {
  qualityAudit: { ok: true },
  phase10Eligibility: { eligible: true },
});
assert.throws(
  () => createRequiredScenePlan(missingLateralSnapshot, missingLateral, missingLateralAnalysis),
  hasCode('P11_SCENE_LATERAL_SOURCE_MISSING'),
);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P11-M4',
  requiredScenes: plan.scenes.length,
  figureCount: manifest.figureCount,
  deterministicPlanRuns: plans.length,
  assetHashParity: pair.manifest.figureAssetParity,
  brokenReferences: 0,
  missingCaptions: 0,
  metadataDrift: 0,
  figureManifestHash: manifest.figureManifestHash,
}, null, 2));

function captureFor(row) {
  return {
    kind: row.kind,
    captureSpecHash: row.captureSpec.captureSpecHash,
    reportSnapshotHash: snapshot.reportSnapshotHash,
    modelDomainHash: snapshot.sourceBinding.modelDomainHash,
    resultHash: snapshot.sourceBinding.resultHash,
    comboId: row.comboId,
    width: 1600,
    height: 900,
    bytes: 64000 + row.ordinal,
    sha256: stableHash({ kind: row.kind, fixture: 'p11-m4' }),
    content: { blank: false, uniqueColorFloor: 16, opaqueRatio: 1 },
  };
}

function fixtureModel() {
  return {
    schemaVersion: 5,
    meta: { id: 'PILOT-OFFICE-01' },
    storyModel: { count: 4 },
    nodes: Array.from({ length: 45 }, (_row, i) => ({
      id: `N${i + 1}`,
      x: (i % 5) * 3,
      y: (i % 3) * 5,
      z: Math.floor(i / 9) * 3.6,
      support: i < 9 ? 'fixed' : null,
    })),
    members: Array.from({ length: 84 }, (_row, i) => ({
      id: `M${i + 1}`,
      n1: `N${(i % 44) + 1}`,
      n2: `N${(i % 44) + 2}`,
      matId: 'MAT',
      secId: 'SEC',
    })),
    materials: [{ id: 'MAT', E: 205000, G: 79000 }],
    sections: [{ id: 'SEC', A: 0.01, Iy: 1e-5, Iz: 1e-5, J: 1e-5 }],
    loads: [
      { id: 'DL-1', type: 'nodal', node: 'N45', case: 'D', P: 10, dir: '-z' },
      { id: 'LL-1', type: 'nodal', node: 'N45', case: 'L', P: 5, dir: '-z' },
      { id: 'EX-1', type: 'nodal', node: 'N45', case: 'EX', P: 3, dir: '+x' },
    ],
    loadCases: [
      { id: 'D', type: 'dead' },
      { id: 'L', type: 'live' },
      { id: 'WX', type: 'wind' },
      { id: 'WY', type: 'wind' },
      { id: 'EX', type: 'seismic' },
      { id: 'EY', type: 'seismic' },
    ],
    loadCombinations: [{ id: 'KDS-ST-05-EX-N', factors: { D: 1.2, L: 0.5, EX: 1 } }],
  };
}

function fixtureAnalysis() {
  return {
    ok: true,
    validation: { errors: [], warnings: [] },
    audit: { ok: true, maxEquilibriumResidual: 5.5e-15 },
    envelope: { dmax: 0.005749, maxRatio: 0.39436 },
    design: {
      summary: { maxUtilization: 0.39436, governing: {
        memberId: 'M32',
        checkId: 'steel-deflection',
        comboId: 'KDS-ST-05-EX-N',
        ratio: 0.39436,
        status: 'OK',
      } },
      steel: { memberResults: { M32: { utilization: 0.39436 } } },
    },
    designEligibility: { eligible: true, status: 'qualified' },
    combinationCompleteness: { rows: [{ comboId: 'KDS-ST-05-EX-N', complete: true }] },
    byCombo: {
      'KDS-ST-05-EX-N': {
        ok: true,
        dmax: 0.005749,
        maxRatio: 0.39436,
        disp: { N45: [0.005749, 0, 0] },
        reactions: { N1: { rx: -10, ry: 0, rz: 20, rmx: 0, rmy: 0, rmz: 0 } },
        summary: { equilibriumResidual: 5.5e-15 },
      },
    },
  };
}

function count(value, needle) {
  return value.split(needle).length - 1;
}

function hasCode(code) {
  return (error) => error?.code === code;
}
