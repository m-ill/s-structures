import assert from 'node:assert/strict';
import {
  buildAgentManifest,
  buildDetailedReportData,
  compareNeutralControlStrategies,
  createNeutralMomentHingeFixture,
  createRectangularPlateMesh,
  createTwoStoryElasticFrameModel,
  qualifyThickPlateRun,
  renderDetailedReportHtml,
  solveRectangularPlate,
} from '../src/index.js';
import { analyzeForIndex } from '../src/ui/indexBridge.js';

const mesh = createRectangularPlateMesh({ id: 'M11-PLATE', width: 4, height: 4, nx: 2, ny: 2 });
const properties = { E: 30e9, nu: 0.3, t: 0.2, density: 0 };
const run = solveRectangularPlate(mesh, properties, { pressure: 1e3 }, { support: 'simply-supported' });
const qualification = qualifyThickPlateRun(mesh, run, properties);
const fixtureComparison = compareNeutralControlStrategies(createNeutralMomentHingeFixture(), [0, 0.005, 0.02, 0.04]);
const reportModel = createTwoStoryElasticFrameModel();
reportModel.meta = { name: 'P14 Integration' };
const reportAnalysis = analyzeForIndex(reportModel);
assert.equal(reportAnalysis.ok, true);
const report = buildDetailedReportData(reportModel, reportAnalysis, {
  generatedAt: '2026-08-27T00:00:00.000Z',
  plateWorkflow: { mesh, run, qualification },
  shellStabilization: { qualification: { version: 'p14-m9-shell-stabilization-v1', qualificationHash: 'a'.repeat(64), status: 'pass', blockers: [], modes: [], claim: { id: 'P3S2-SS', crossSolverEquivalent: false } } },
  pushoverQualification: { fixtureComparison },
});
const html = renderDetailedReportHtml(report);
for (const text of ['4H. Plate Bending and Transverse-Shear Trace', '4I. Shell Stabilization Qualification Trace', '4J. Production Pushover Qualification Trace', 'P3S2-SS', 'NOT RUN']) assert.match(html, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.equal(report.plateWorkflow.analysis.runHash, run.runHash);
assert.equal(report.plateWorkflow.qualification.qualificationHash, qualification.qualificationHash);
assert.equal(report.pushoverQualification.fixtureComparison.comparisonHash, fixtureComparison.comparisonHash);

const manifest = buildAgentManifest();
for (const id of ['P14-M1-M4', 'P14-M5-M8', 'P14-M9', 'P14-M10', 'P14-M11']) assert.ok(manifest.milestones.some((row) => row.id === id), `missing Agent milestone ${id}`);

console.log(JSON.stringify({ ok: true, milestone: 'P14-M11', reportHtmlLength: html.length, plateRunHash: run.runHash, agentMilestones: manifest.milestones.filter((row) => row.id.startsWith('P14-')).map((row) => row.id) }, null, 2));
