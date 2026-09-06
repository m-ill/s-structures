import assert from 'node:assert/strict';
import {
  analyzeModel,
  createCantileverTipLoad,
  parseCombinationFactors,
} from '../src/index.js';
import {
  addLoadCombination,
  factorText,
  formatCombinationFactors,
  removeLoadCombination,
  updateLoadCombination,
} from '../src/core/combinations.js';
import {
  addCombination,
  createM3State,
  deleteActiveCombination,
  saveActiveCombination,
  setActiveCombo,
} from '../src/ui/m3State.js';

const EPS = 1e-9;
const fixture = createCantileverTipLoad({ L: 4, P: 10 });
const model = fixture.model;
model.loadCases = [
  { id: 'D', name: 'Dead', type: 'dead' },
  { id: 'L', name: 'Live', type: 'live' },
];
model.loads.push({ id: 'P2', type: 'nodal', node: 'N2', P: 5, dir: '-z', case: 'L' });
model.loadCombinations = [
  { id: 'D_ONLY', name: '1.0D', type: 'service', factors: { D: 1, L: 0 } },
  { id: 'L_ONLY', name: '1.0L', type: 'service', factors: { D: 0, L: 1 } },
  { id: 'ULS1', name: '1.2D + 1.6L', type: 'strength', factors: { D: 1.2, L: 1.6 } },
];

const parsed = parseCombinationFactors('D=1.2, L=1.6', model.loadCases);
assert.deepEqual(parsed, { D: 1.2, L: 1.6 }, 'factor parser should preserve load case factors');
assert.equal(formatCombinationFactors(parsed), '1.2D + 1.6L');
assert.equal(factorText(parsed), 'D=1.2, L=1.6');

const temp = addLoadCombination(model, { type: 'user', factors: { D: 0.9, L: 0.5 } });
assert.equal(temp.id, 'CO1', 'new combination id should fill the next CO slot');
updateLoadCombination(model, temp.id, { name: 'Temp', factors: { D: 0.8, L: 0.4 } });
assert.equal(model.loadCombinations.at(-1).name, 'Temp');
assert.equal(removeLoadCombination(model, temp.id), true);
assert.equal(model.loadCombinations.some((combo) => combo.id === temp.id), false);

const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
assert.equal(analysis.byCombo.D_ONLY.combo.id, 'D_ONLY');
close(analysis.byCombo.D_ONLY.summary.totalLoad[2], -10, EPS, 'D_ONLY total load');
close(analysis.byCombo.L_ONLY.summary.totalLoad[2], -5, EPS, 'L_ONLY total load');
close(analysis.byCombo.ULS1.summary.totalLoad[2], -20, EPS, 'ULS total load');

assert.equal(analysis.envelope.sources.length, 3, 'envelope should preserve source combinations');
assert.equal(analysis.envelope.governing.maxUtilization.comboId, 'ULS1', 'largest factor combo should govern utilization');
assert.equal(analysis.envelope.memberResults.M1.governing.utilization.comboId, 'ULS1');
assert.equal(analysis.envelope.memberResults.M1.governing.quantities.Mzmax.comboId, 'ULS1');
assert.ok(Number.isFinite(analysis.envelope.memberResults.M1.governing.utilization.x), 'governing station should be tracked');

const state = createM3State(model);
setActiveCombo(state, 'D_ONLY');
const saved = saveActiveCombination(state, {
  name: 'Service Edited',
  type: 'service',
  factorsText: 'D=0.9, L=0.25',
});
assert.equal(saved.factors.D, 0.9);
assert.equal(saved.factors.L, 0.25);
assert.equal(state.analysis.byCombo.D_ONLY.summary.totalLoad[2], -(10 * 0.9 + 5 * 0.25));

const beforeAdd = state.model.loadCombinations.length;
const added = addCombination(state);
assert.equal(state.model.loadCombinations.length, beforeAdd + 1);
assert.equal(state.activeComboId, added.id);
assert.equal(deleteActiveCombination(state), true);
assert.equal(state.model.loadCombinations.length, beforeAdd);

console.log(JSON.stringify({
  ok: true,
  combinations: analysis.combos.length,
  governingCombo: analysis.envelope.governing.maxUtilization.comboId,
  sourceCount: analysis.envelope.sources.length,
}, null, 2));

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`,
  );
}
