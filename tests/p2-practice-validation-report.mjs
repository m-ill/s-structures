import assert from 'node:assert/strict';
import {
  analyzeModel,
  applyDesignBasisLoads,
  buildPracticeValidationReport,
  createCalculationPackageHtml,
  createDetailedHtmlReport,
  createKdsRuleBasedLoadCombinations,
  createTwoStoryElasticFrameModel,
  PRACTICE_VALIDATION_REPORT_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createTwoStoryElasticFrameModel();
model.meta = { name: 'P2 Practice Validation Test' };
model.loads = [];
model.analysisSettings.includeGeometricStiffness = true;
model.analysisSettings.pDeltaMaxIterations = 10;
applyDesignBasisLoads(model, { occupancy: 'office', windPressureX: 0.8, windPressureY: 0.6 });
model.loadCombinations = createKdsRuleBasedLoadCombinations(model, { includeService: true });

const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const report = buildPracticeValidationReport(model, analysis);
assert.equal(report.version, PRACTICE_VALIDATION_REPORT_VERSION);
assert.deepEqual(report.tickets, ['T25', 'T26', 'T30', 'T31', 'T41', 'T42', 'T43']);
assert.notEqual(report.pDelta.status, 'NG');
assert.equal(report.resultTables.status, 'OK');
assert.ok(report.calculation.checks.some((row) => row.id === 'issue-registry'));
assert.ok(report.issues.version);

const detailed = createDetailedHtmlReport(model, analysis);
assert.equal(detailed.data.practiceValidation.version, PRACTICE_VALIDATION_REPORT_VERSION);
assert.match(detailed.html, /Practice Validation Report/);

const pkg = createCalculationPackageHtml(model, analysis);
assert.equal(pkg.data.detailed.practiceValidation.version, PRACTICE_VALIDATION_REPORT_VERSION);
assert.match(pkg.html, /Practice Validation/);

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, {
  getLastResult: () => analysis,
});
assert.equal(agent.prepareResultView('getPracticeValidationReport').version, PRACTICE_VALIDATION_REPORT_VERSION);
assert.equal(agent.getCapabilities().modules.practiceValidationReport, PRACTICE_VALIDATION_REPORT_VERSION);
assert.ok(agent.getCapabilities().readApis.includes('getPracticeValidationReport'));

console.log(JSON.stringify({
  ok: true,
  version: PRACTICE_VALIDATION_REPORT_VERSION,
  status: report.status,
  openIssues: report.issues.summary.openCount,
}, null, 2));
