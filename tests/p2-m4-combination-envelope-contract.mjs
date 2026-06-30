import assert from 'node:assert/strict';
import {
  analyzeModel,
  applyDesignBasisLoads,
  buildCombinationEnvelopeContract,
  COMBINATION_ENVELOPE_CONTRACT_VERSION,
  createKdsRuleBasedLoadCombinations,
  createTwoStoryElasticFrameModel,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createTwoStoryElasticFrameModel();
model.loads = [];
applyDesignBasisLoads(model, {
  windPressureX: 0.8,
  windPressureY: 0.6,
  seismicCoefficientX: 0.1,
  seismicCoefficientY: 0.09,
  accidentalEccentricityRatio: 0.05,
});
model.loadCombinations = createKdsRuleBasedLoadCombinations(model, { includeService: true });

const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const contract = buildCombinationEnvelopeContract(model, analysis);
assert.equal(contract.version, COMBINATION_ENVELOPE_CONTRACT_VERSION);
assert.deepEqual(contract.tickets, ['T21', 'T22', 'T23', 'T24']);
assert.ok(contract.combinationGroups.counts.strength > 0);
assert.ok(contract.combinationGroups.counts.service > 0);
assert.ok(contract.combinationGroups.counts.seismic > 0);
assert.equal(contract.summary.t21CombinationGroups, true);
assert.equal(contract.summary.t22RuleGeneration, true);
assert.equal(contract.summary.t23CoverageAudit, true);
assert.equal(contract.summary.t24EnvelopeAudit, true);
assert.ok(contract.envelopeAudit.displacement.comboId);
assert.ok(contract.envelopeAudit.members.governing.memberId);
assert.ok(contract.envelopeAudit.reactions.rowCount > 0);
assert.ok(contract.envelopeAudit.drift.governing.comboId);

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, {
  getLastResult: () => analysis,
});
assert.equal(agent.getCombinationEnvelopeContract().version, COMBINATION_ENVELOPE_CONTRACT_VERSION);
assert.equal(agent.getCapabilities().modules.combinationEnvelopeContract, COMBINATION_ENVELOPE_CONTRACT_VERSION);
assert.ok(agent.getCapabilities().readApis.includes('getCombinationEnvelopeContract'));

console.log(JSON.stringify({
  ok: true,
  version: COMBINATION_ENVELOPE_CONTRACT_VERSION,
  groups: contract.combinationGroups.counts,
  generated: contract.ruleGeneration.generatedCount,
  memberRows: contract.envelopeAudit.members.rowCount,
}, null, 2));
