import assert from 'node:assert/strict';
import {
  analyzeModel,
  applyDesignBasisLoads,
  buildServiceabilityDriftReport,
  createCalculationPackageHtml,
  createDetailedHtmlReport,
  createKdsRuleBasedLoadCombinations,
  createTwoStoryElasticFrameModel,
  SERVICEABILITY_DRIFT_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createTwoStoryElasticFrameModel();
model.meta = { name: 'Serviceability Drift Test' };
model.loads = [];
applyDesignBasisLoads(model, {
  occupancy: 'office',
  windPressureX: 0.8,
  windPressureY: 0.85,
  seismicCoefficientX: 0.12,
  seismicCoefficientY: 0.13,
});
model.loadCombinations = createKdsRuleBasedLoadCombinations(model, { includeService: true });

const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const drift = buildServiceabilityDriftReport(model, analysis, { driftLimitRatio: 1 / 200 });
assert.equal(drift.version, SERVICEABILITY_DRIFT_VERSION);
assert.equal(drift.criteria.limitText, 'H/200');
assert.ok(drift.rows.length >= 2);
assert.ok(drift.rows.some((row) => row.comboId.includes('WX') || row.comboId.includes('EX')));
assert.ok(drift.summary.maxDriftRatio > 0);
assert.ok(['OK', 'WARN', 'NG'].includes(drift.summary.status));
assert.ok(drift.summary.governing.comboId);

const strict = buildServiceabilityDriftReport(model, analysis, { driftLimitRatio: 1 / 5000 });
assert.equal(strict.summary.status, 'NG');

const detailed = createDetailedHtmlReport(model, analysis, {
  generatedAt: '2026-06-27T00:00:00.000Z',
});
assert.equal(detailed.data.serviceability.version, SERVICEABILITY_DRIFT_VERSION);
assert.match(detailed.html, /Serviceability Drift Review/);
assert.match(detailed.html, /H\/200/);

const pkg = createCalculationPackageHtml(model, analysis, {
  generatedAt: '2026-06-27T00:00:00.000Z',
});
assert.equal(pkg.data.detailed.serviceability.version, SERVICEABILITY_DRIFT_VERSION);
assert.match(pkg.html, /Serviceability Drift Review/);

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, {
  getLastResult: () => analysis,
});
const agentDrift = agent.prepareResultView('getServiceabilityDriftReport', { driftLimitRatio: 1 / 200 });
assert.equal(agentDrift.version, SERVICEABILITY_DRIFT_VERSION);
assert.equal(agent.getCapabilities().modules.serviceabilityDrift, SERVICEABILITY_DRIFT_VERSION);
assert.ok(agent.getCapabilities().readApis.includes('getServiceabilityDriftReport'));
assert.ok(agent.getCapabilities().milestones.some((item) => item.id === 'M49'));

console.log(JSON.stringify({
  ok: true,
  version: SERVICEABILITY_DRIFT_VERSION,
  rows: drift.rows.length,
  status: drift.summary.status,
  maxDriftRatio: drift.summary.maxDriftRatio,
}, null, 2));
