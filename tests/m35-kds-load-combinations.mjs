import assert from 'node:assert/strict';
import {
  createKdsLoadCombinations,
  createModel,
  KDS_LOAD_COMBINATION_VERSION,
  summarizeKdsLoadCombinationCoverage,
} from '../src/index.js';
import { analyzeForIndex, createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createModel();
model.loadCases = [
  { id: 'D', name: 'Dead', type: 'dead' },
  { id: 'L', name: 'Live', type: 'live' },
  { id: 'WX', name: 'Wind X', type: 'wind' },
  { id: 'WY', name: 'Wind Y', type: 'wind' },
  { id: 'EX', name: 'Seismic X', type: 'seismic' },
  { id: 'S', name: 'Snow', type: 'snow' },
  { id: 'R', name: 'Rain', type: 'rain' },
];

const combos = createKdsLoadCombinations(model);
assert.ok(combos.length >= 8);
assert.ok(combos.every((combo) => combo.generatedBy === KDS_LOAD_COMBINATION_VERSION));
assert.ok(combos.some((combo) => combo.id === 'KDS-ST-04-WX' && combo.factors.WX === 1));
assert.ok(combos.some((combo) => combo.id === 'KDS-ST-04-WY' && combo.factors.WY === 1));
assert.ok(combos.some((combo) => combo.id === 'KDS-ST-05-EX' && combo.factors.EX === 1));
assert.ok(combos.some((combo) => combo.id === 'KDS-SVC-02' && combo.type === 'service'));
assert.ok(combos.every((combo) => Object.keys(combo.factors).includes('D')));
const roofCombos = combos.filter((combo) => combo.id.startsWith('KDS-ST-03'));
assert.equal(roofCombos.length, 2);
assert.ok(roofCombos.every((combo) => ['S', 'R'].filter((caseId) => combo.factors[caseId] > 0).length === 1));

const coverage = summarizeKdsLoadCombinationCoverage(model);
assert.equal(coverage.version, KDS_LOAD_COMBINATION_VERSION);
assert.equal(coverage.available.W.length, 2);
assert.equal(coverage.available.E.length, 1);
assert.ok(coverage.missing.includes('H'));
assert.equal(coverage.generatedCount, combos.length);

const target = {
  model: () => model,
  reanalyze: () => {
    target.result = analyzeForIndex(model);
    return target.result;
  },
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => target.result,
  analyzeModel: (nextModel) => {
    target.result = analyzeForIndex(nextModel);
    return target.result;
  },
});
const applied = agent.execute('applyKdsLoadCombinations', { replace: true });
assert.equal(applied.kdsLoadCombinations.appliedCount, combos.length);
assert.equal(model.loadCombinations.length, combos.length);
assert.ok(applied.kdsLoadCombinations.combinationIds.includes('KDS-ST-04-WX'));

const agentCoverage = agent.getKdsLoadCombinationCoverage();
assert.equal(agentCoverage.generatedCount, combos.length);

console.log(JSON.stringify({
  ok: true,
  version: KDS_LOAD_COMBINATION_VERSION,
  generated: combos.length,
  windCases: coverage.available.W,
}, null, 2));
