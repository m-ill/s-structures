import assert from 'node:assert/strict';
import {
  ADVANCED_ELASTIC_TRACE_VERSION,
  analyzeModel,
  buildAdvancedElasticTrace,
  createCalculationPackageHtml,
  createDetailedHtmlReport,
  createModel,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createAdvancedElasticModel();
const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const trace = buildAdvancedElasticTrace(model, analysis);
assert.equal(trace.version, ADVANCED_ELASTIC_TRACE_VERSION);
assert.equal(trace.pDelta.enabled, true);
assert.equal(trace.pDelta.combos[0].converged, true);
assert.ok(trace.pDelta.combos[0].iterationCount > 2);
assert.equal(trace.pDelta.curves.version, 'pdelta-curve-summary-v1');
assert.equal(trace.pDelta.design.version, 'pdelta-design-summary-v1');
assert.ok(trace.pDelta.design.summary.maxTheta > 0);
assert.ok(trace.pDelta.design.storyRows.length > 0);
assert.ok(trace.pDelta.combos[0].curve.global.points.length > 2);
assert.equal(trace.pDelta.combos[0].curve.global.points.at(-1).loadFactor, 1);
assert.ok(trace.pDelta.combos[0].curve.stories[0].points.at(-1).stabilityIndex > 0);
assert.ok(trace.pDelta.combos[0].curve.members.find((item) => item.memberId === 'M1').points.at(-1).pDeltaShear > 0);
assert.ok(trace.modal.modes.length >= 1);
assert.ok(trace.modal.summary.maxMassX > 0.9);
assert.ok(trace.responseSpectrum.directions.some((row) => row.direction === 'x'));

const detailed = createDetailedHtmlReport(model, analysis);
assert.equal(detailed.data.advancedElasticTrace.version, ADVANCED_ELASTIC_TRACE_VERSION);
assert.match(detailed.html, /Advanced Elastic Trace/);

const pkg = createCalculationPackageHtml(model, analysis);
assert.equal(pkg.data.detailed.advancedElasticTrace.version, ADVANCED_ELASTIC_TRACE_VERSION);
assert.match(pkg.html, /Advanced Elastic Trace/);

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, {
  getLastResult: () => analysis,
});
const agentTrace = agent.prepareResultView('getAdvancedElasticTrace');
assert.equal(agentTrace.version, ADVANCED_ELASTIC_TRACE_VERSION);
assert.equal(agent.getCapabilities().modules.advancedElasticTrace, ADVANCED_ELASTIC_TRACE_VERSION);
assert.ok(agent.getCapabilities().readApis.includes('getAdvancedElasticTrace'));

console.log(JSON.stringify({
  ok: true,
  version: ADVANCED_ELASTIC_TRACE_VERSION,
  pDeltaCombos: trace.summary.pDeltaComboCount,
  modes: trace.summary.modeCount,
  rsaDirections: trace.summary.rsaDirectionCount,
}, null, 2));

function createAdvancedElasticModel() {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null, mass: [10, 10, 10] },
  ];
  model.members = [{
    id: 'M1',
    type: 'frame',
    n1: 'N1',
    n2: 'N2',
    matId: 'steel',
    secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' },
    releases: { i: 'rigid', j: 'rigid' },
  }];
  model.loadCases = [
    { id: 'D', name: 'Dead', type: 'dead' },
    { id: 'L', name: 'Lateral', type: 'wind' },
  ];
  model.loadCombinations = [{ id: 'CO1', name: 'D + L', type: 'strength', factors: { D: 1, L: 1 } }];
  model.loads = [
    { id: 'P1', type: 'nodal', node: 'N2', P: 800, dir: '-z', case: 'D' },
    { id: 'H1', type: 'nodal', node: 'N2', P: 20, dir: '+x', case: 'L' },
  ];
  model.analysisSettings.includeGeometricStiffness = true;
  model.analysisSettings.pDeltaMaxIterations = 20;
  model.analysisSettings.pDeltaTolerance = 1e-6;
  model.analysisSettings.modalModeCount = 3;
  model.analysisSettings.responseSpectrum = {
    enabled: true,
    directions: ['x', 'y'],
    points: [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }],
  };
  return model;
}
