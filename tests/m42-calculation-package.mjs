import assert from 'node:assert/strict';
import {
  analyzeModel,
  applyDesignBasisLoads,
  CALCULATION_PACKAGE_VERSION,
  createCalculationPackageHtml,
  createKdsRuleBasedLoadCombinations,
  createTwoStoryElasticFrameModel,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createTwoStoryElasticFrameModel();
model.meta = { name: 'Calculation Package Test' };
model.loads = [];
applyDesignBasisLoads(model, { occupancy: 'office' });
model.loadCombinations = createKdsRuleBasedLoadCombinations(model, { includeService: true });

const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const pkg = createCalculationPackageHtml(model, analysis, {
  title: 'Calculation Package Test Report',
  engineer: 'S-Structures',
  reviewer: 'Review',
  generatedAt: '2026-06-27T00:00:00.000Z',
});
assert.equal(pkg.data.version, CALCULATION_PACKAGE_VERSION);
assert.equal(pkg.data.sections.length, 8);
assert.ok(pkg.data.sections.some((section) => section.id === 'phase3'));
assert.equal(pkg.data.qualityAudit.items.find((item) => item.name === 'Load derivation attached').status, 'OK');
assert.match(pkg.html, /Table of Contents/);
assert.match(pkg.html, /@page/);
assert.match(pkg.html, /Appendix/);
assert.match(pkg.html, /Phase 3 Integrated Results/);
assert.match(pkg.html, /Calculation Package Test Report/);

const target = {
  model: () => model,
  reanalyze: () => {},
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => analysis,
});
const agentPackage = agent.getCalculationPackage({ title: 'Agent Package' });
assert.equal(agentPackage.data.version, CALCULATION_PACKAGE_VERSION);
assert.match(agentPackage.html, /Agent Package/);

console.log(JSON.stringify({
  ok: true,
  version: CALCULATION_PACKAGE_VERSION,
  htmlLength: pkg.html.length,
  auditOk: pkg.data.qualityAudit.ok,
}, null, 2));
