import assert from 'node:assert/strict';
import {
  ELASTIC_EXPANSION_VERSION,
  analyzeModel,
  createModel,
  expandAdvancedLoads,
  validateModel,
} from '../src/index.js';

const model = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, support: 'spring', spring: { kz: 1000000 } },
  ],
  members: [{ id: 'M1', n1: 'A', n2: 'B', matId: 'steel', secId: 'h300' }],
  loads: [{ id: 'L1', type: 'udl-partial', member: 'M1', w: 10, dir: '-z', from: 0.25, to: 0.75, case: 'D' }],
});

assert.equal(validateModel(model).ok, true);
const expanded = expandAdvancedLoads(model.loads, model);
assert.equal(expanded.trace.version, ELASTIC_EXPANSION_VERSION);
assert.equal(expanded.loads.length, 8);
assert.equal(expanded.loads[0].type, 'point');
assert.equal(expanded.loads.reduce((sum, load) => sum + load.P, 0), 20);

const result = analyzeModel(model);
assert.equal(result.ok, true);
assert.equal(result.byCombo.CO1.elasticExpansion.version, ELASTIC_EXPANSION_VERSION);
assert.ok(result.byCombo.CO1.reactions.B);

console.log(JSON.stringify({ ok: true, version: 'p3-m11-elastic-expansion' }, null, 2));
