import assert from 'node:assert/strict';
import {
  applyDesignBasisLoads,
  buildLoadDerivationTrace,
  createCalculationPackageHtml,
  createDetailedHtmlReport,
  createKdsRuleBasedLoadCombinations,
  createTwoStoryElasticFrameModel,
  LOAD_DERIVATION_TRACE_VERSION,
} from '../src/index.js';
import { analyzeForIndex, createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createTwoStoryElasticFrameModel();
model.meta = { name: 'Load Derivation Trace Test' };
model.loads = [];
const estimation = applyDesignBasisLoads(model, {
  occupancy: 'office',
  deadLoad: 4.9,
  liveLoad: 2.6,
  roofLiveLoad: 1.1,
  windPressureX: 0.75,
  windPressureY: 0.8,
  seismicCoefficientX: 0.11,
  seismicCoefficientY: 0.12,
});
model.loadCombinations = createKdsRuleBasedLoadCombinations(model, { includeService: true });

assert.equal(estimation.derivationTrace.version, LOAD_DERIVATION_TRACE_VERSION);
assert.ok(estimation.derivationTrace.summary.rowCount > 10);
assert.deepEqual(estimation.derivationTrace.summary.groups, ['basis', 'gravity', 'wind', 'seismic', 'distribution']);
assert.ok(estimation.derivationTrace.summary.distributionRowCount > 0);
assert.ok(estimation.derivationTrace.rows.some((row) => row.id === 'D-ST1' && row.formula === 'A * qD'));
assert.ok(estimation.derivationTrace.rows.some((row) => row.id === 'WX-ST1' && row.caseId === 'WX'));
assert.ok(estimation.derivationTrace.rows.some((row) => row.id === 'EX-BASE' && row.formula === 'CsX * sum(Wi)'));
assert.ok(estimation.derivationTrace.rows.some((row) => row.id === 'D-DIST-ST1' && row.formula === 'Dstory / sum(Lbeam)'));
assert.ok(estimation.derivationTrace.rows.some((row) => row.id === 'EX-NODE-ST1' && row.formula === 'EXstory / nNodes'));
assert.ok(model.loadEstimation.loads.some((load) => load.derivation?.traceRowId === 'D-DIST-ST1'));
assert.ok(model.loadEstimation.loads.some((load) => load.derivation?.traceRowId === 'EX-NODE-ST1'));
assert.ok(estimation.summary.totalSeismicX > 0);
assert.ok(estimation.summary.totalSeismicY > estimation.summary.totalSeismicX);

const rebuilt = buildLoadDerivationTrace(estimation);
assert.equal(rebuilt.version, LOAD_DERIVATION_TRACE_VERSION);
assert.equal(rebuilt.rows.length, estimation.derivationTrace.rows.length);

const partialTrace = buildLoadDerivationTrace({
  basis: { occupancy: 'office' },
  storyLoads: {
    gravity: [{
      story: 1,
      z: 3,
      area: 100,
      deadIntensity: 4,
      deadTotal: 400,
      liveIntensity: 2,
      liveTotal: 200,
      beamLength: 40,
      beamCount: 8,
    }],
  },
});
assert.equal(partialTrace.rows.some((row) => typeof row.result === 'number' && Number.isNaN(row.result)), false);

const analysis = analyzeForIndex(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const detailed = createDetailedHtmlReport(model, analysis, {
  generatedAt: '2026-06-27T00:00:00.000Z',
});
assert.equal(detailed.data.loadDerivation.derivationTrace.version, LOAD_DERIVATION_TRACE_VERSION);
assert.match(detailed.html, /Load Derivation Formula Trace/);
assert.match(detailed.html, /CsX \* sum\(Wi\)/);
assert.match(detailed.html, /Dstory \/ sum\(Lbeam\)/);

const pkg = createCalculationPackageHtml(model, analysis, {
  generatedAt: '2026-06-27T00:00:00.000Z',
});
assert.equal(pkg.data.detailed.loadDerivation.derivationTrace.version, LOAD_DERIVATION_TRACE_VERSION);
assert.match(pkg.html, /Load Derivation Formula Trace/);

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, {
  getLastResult: () => analysis,
});
const capabilities = agent.getCapabilities();
assert.equal(capabilities.modules.loadDerivationTrace, LOAD_DERIVATION_TRACE_VERSION);
assert.ok(capabilities.dataContracts.includes('loadDerivationTrace'));
assert.ok(capabilities.milestones.some((item) => item.id === 'M48'));

console.log(JSON.stringify({
  ok: true,
  version: LOAD_DERIVATION_TRACE_VERSION,
  rows: estimation.derivationTrace.rows.length,
  totalSeismicX: estimation.summary.totalSeismicX,
}, null, 2));
