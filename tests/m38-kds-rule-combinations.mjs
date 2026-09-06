import assert from 'node:assert/strict';
import {
  applyDesignBasisLoads,
  createDetailedHtmlReport,
  createKdsRuleBasedLoadCombinations,
  createTwoStoryElasticFrameModel,
  KDS_LOAD_COMBINATION_RULE_VERSION,
  summarizeKdsLoadCombinationRules,
} from '../src/index.js';
import { analyzeForIndex, createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createTwoStoryElasticFrameModel();
model.loads = [];
applyDesignBasisLoads(model, { occupancy: 'office' });

const combos = createKdsRuleBasedLoadCombinations(model);
assert.ok(combos.length > 12);
assert.ok(combos.every((combo) => combo.generatedBy === KDS_LOAD_COMBINATION_RULE_VERSION));
assert.ok(combos.some((combo) => combo.id === 'KDS-ST-04-WX-P' && combo.factors.WX > 0));
assert.ok(combos.some((combo) => combo.id === 'KDS-ST-04-WX-N' && combo.factors.WX < 0));
assert.ok(combos.some((combo) => combo.id === 'KDS-ST-05-EX-P' && combo.factors.EX > 0));
assert.ok(combos.some((combo) => combo.id === 'KDS-ST-05-EX-N' && combo.factors.EX < 0));
assert.ok(combos.every((combo) => combo.ruleTrace?.version === KDS_LOAD_COMBINATION_RULE_VERSION));

const rules = summarizeKdsLoadCombinationRules(model);
assert.equal(rules.version, KDS_LOAD_COMBINATION_RULE_VERSION);
assert.equal(rules.includeReverseLateral, true);
assert.equal(rules.generatedCount, combos.length);

model.loadCombinations = combos;
const analysis = analyzeForIndex(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const report = createDetailedHtmlReport(model, analysis);
assert.match(report.html, /KDS-ST-04/);
assert.match(report.html, /positive|negative/);

const agentModel = createTwoStoryElasticFrameModel();
agentModel.loads = [];
applyDesignBasisLoads(agentModel, { occupancy: 'school' });
const target = {
  model: () => agentModel,
  reanalyze: () => {
    target.result = analyzeForIndex(agentModel);
    return target.result;
  },
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => target.result,
});
const snapshot = agent.execute('applyKdsRuleBasedLoadCombinations');
assert.equal(snapshot.kdsLoadCombinations.ruleBased, true);
assert.ok(snapshot.kdsLoadCombinations.appliedCount > 12);
assert.equal(agent.getKdsLoadCombinationRules().version, KDS_LOAD_COMBINATION_RULE_VERSION);

console.log(JSON.stringify({
  ok: true,
  version: KDS_LOAD_COMBINATION_RULE_VERSION,
  generated: combos.length,
  hasReverseWind: combos.some((combo) => combo.factors.WX < 0),
}, null, 2));
