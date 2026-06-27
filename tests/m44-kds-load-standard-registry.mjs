import assert from 'node:assert/strict';
import {
  analyzeModel,
  applyDesignBasisLoads,
  buildKdsLoadStandardAudit,
  createCalculationPackageHtml,
  createKdsRuleBasedLoadCombinations,
  createTwoStoryElasticFrameModel,
  getKdsLoadStandardRegistry,
  KDS_LOAD_STANDARD_REGISTRY_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const registry = getKdsLoadStandardRegistry();
assert.equal(registry.version, KDS_LOAD_STANDARD_REGISTRY_VERSION);
assert.ok(registry.loadCaseSymbols.some((item) => item.symbol === 'W' && item.projectInputRequired));
assert.ok(registry.designInputs.some((item) => item.id === 'windProcedure'));
assert.ok(registry.combinationPresets.some((item) => item.id === 'KDS-ST-04'));

const model = createTwoStoryElasticFrameModel();
model.meta = { name: 'KDS Standard Registry Test' };
model.loads = [];
applyDesignBasisLoads(model, { occupancy: 'office' });

const audit = buildKdsLoadStandardAudit(model);
assert.equal(audit.version, KDS_LOAD_STANDARD_REGISTRY_VERSION);
assert.equal(audit.symbols.find((item) => item.symbol === 'D').status, 'mapped');
assert.equal(audit.symbols.find((item) => item.symbol === 'S').status, 'missing');
assert.equal(audit.presetAudit.find((item) => item.id === 'KDS-ST-04').status, 'ready');
assert.equal(audit.presetAudit.find((item) => item.id === 'KDS-ST-03').status, 'blocked');

model.loadCombinations = createKdsRuleBasedLoadCombinations(model, { includeService: true });
const windCombo = model.loadCombinations.find((combo) => combo.id === 'KDS-ST-04-WX-P');
assert.ok(windCombo);
assert.equal(windCombo.standardTrace.version, KDS_LOAD_STANDARD_REGISTRY_VERSION);
assert.equal(windCombo.standardTrace.sourcePreset, 'KDS-ST-04');
assert.equal(windCombo.ruleTrace.lateralCaseId, 'WX');

const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
const pkg = createCalculationPackageHtml(model, analysis, {
  title: 'KDS Registry Calculation Package',
});
assert.equal(pkg.data.detailed.codeBasis.loadStandardAudit.version, KDS_LOAD_STANDARD_REGISTRY_VERSION);
assert.match(pkg.html, /KDS-Style Load Standard Audit/);
assert.match(pkg.html, /Mapped cases/);

const target = {
  model: () => model,
  reanalyze: () => {},
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => analysis,
});
assert.equal(agent.getKdsLoadStandardRegistry().version, KDS_LOAD_STANDARD_REGISTRY_VERSION);
assert.equal(agent.getKdsLoadStandardAudit().generatedCombinationCount > 0, true);

console.log(JSON.stringify({
  ok: true,
  version: KDS_LOAD_STANDARD_REGISTRY_VERSION,
  mappedSymbols: audit.mappedSymbolCount,
  generatedCombinations: audit.generatedCombinationCount,
}, null, 2));
