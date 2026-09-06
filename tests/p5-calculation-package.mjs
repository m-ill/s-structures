import assert from 'node:assert/strict';
import {
  analyzeModel,
  createAnalysisCase,
  createCalculationPackageHtml,
  createTwoStoryElasticFrameModel,
  validateModel,
} from '../src/index.js';
import { runAnalysisCase } from '../src/ui/analysisRunners.js';
import { buildAgentManifest } from '../src/ui/agentManifest.js';

const model = createTwoStoryElasticFrameModel();
model.meta = { name: 'Phase 5 Calculation Package' };
for (const node of model.nodes) {
  if (!node.support) node.mass = [5, 5, 5];
}

model.analysisCases = [
  { id: 'AC_STATIC_PKG', name: 'Static package', kind: 'static', status: 'not-run', settings: { pDelta: false } },
  { id: 'AC_MODAL_PKG', name: 'Modal package', kind: 'modal', status: 'not-run', settings: { modalModeCount: 3 } },
  { id: 'AC_RSA_PKG', name: 'RSA package', kind: 'responseSpectrum', status: 'not-run', settings: { modalModeCount: 3, spectrum: { method: 'SRSS', directions: ['x', 'y'] } } },
  { id: 'AC_BUCKLING_PKG', name: 'Buckling package', kind: 'buckling', status: 'not-run', settings: { referenceAxialForces: { M1: 80 } } },
  { id: 'AC_PUSH_PKG', name: 'Pushover package', kind: 'pushover', status: 'not-run', settings: { steps: 3, referenceBaseShear: 50 } },
  { id: 'AC_NLTH_PKG', name: 'NLTH package', kind: 'nlth', status: 'not-run', settings: { record: 'sample-a', scale: 1, dt: 0.02, accelerations: [0, 0.05, -0.05, 0.04], mass: 1, stiffness: 80, yieldForce: 0.08 } },
  { id: 'AC_NOT_RUN_PKG', name: 'Not run package', kind: 'modal', status: 'not-run', settings: { modalModeCount: 2 } },
].map((item) => createAnalysisCase(item));

const analysisResults = {};
for (const item of model.analysisCases.filter((row) => row.id !== 'AC_NOT_RUN_PKG')) {
  const result = runAnalysisCase(model, item);
  analysisResults[item.id] = result;
  item.status = result.status === 'failed' ? 'failed' : 'ok';
  item.lastRun = {
    status: result.status,
    completedAt: result.completedAt,
    summary: result.summary,
  };
}

const validation = validateModel(model);
assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));

const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const pkg = createCalculationPackageHtml(model, analysis, {
  title: 'Phase 5 Calculation Package',
  generatedAt: '2026-07-09T00:00:00.000Z',
  analysisResults,
});

const cases = pkg.data.detailed.analysisCases;
assert.equal(cases.caseCount, 7);
assert.equal(cases.resultCount, 6);
assert.equal(cases.notRunCount, 1);

const byId = Object.fromEntries(cases.rows.map((row) => [row.id, row]));
assert.equal(byId.AC_NOT_RUN_PKG.detail.status, 'not-run');
assert.match(byId.AC_NOT_RUN_PKG.detail.headline, /not run/);
assert.ok(byId.AC_MODAL_PKG.detail.rows.some((row) => row[0].startsWith('Mode')));
assert.ok(byId.AC_RSA_PKG.detail.rows.length > 0);
assert.ok(byId.AC_BUCKLING_PKG.detail.rows.some((row) => row[0] === 'Critical load factor'));
assert.ok(byId.AC_PUSH_PKG.detail.limitations.some((item) => item.includes('Pushover case is preliminary')));
assert.ok(byId.AC_NLTH_PKG.detail.limitations.some((item) => item.includes('NLTH case uses')));
assert.equal(byId.AC_PUSH_PKG.engineId, 'legacy-preliminary-stepwise-secant');
assert.equal(byId.AC_PUSH_PKG.qualification, 'legacy-preliminary');
assert.equal(byId.AC_NLTH_PKG.engineId, 'legacy-sdof-bilinear-newmark');

assert.match(pkg.html, /Analysis Case Result Details/);
assert.match(pkg.html, /AC_NOT_RUN_PKG/);
assert.match(pkg.html, /not run/);
assert.match(pkg.html, /Critical load factor/);
assert.match(pkg.html, /Pushover case is preliminary/);
assert.match(pkg.html, /NLTH case uses/);

const capabilities = buildAgentManifest();
assert.ok(capabilities.milestones.some((item) => item.id === 'P5-M11'));
assert.ok(capabilities.dataContracts.includes('phase5AnalysisCaseCalculationPackage'));

console.log(JSON.stringify({
  ok: true,
  caseCount: cases.caseCount,
  resultCount: cases.resultCount,
  notRunCount: cases.notRunCount,
  htmlLength: pkg.html.length,
}, null, 2));
