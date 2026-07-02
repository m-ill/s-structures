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

const badRange = createModel({
  ...model,
  loads: [{ ...model.loads[0], from: 0.8, to: 0.2 }],
});
assert.equal(validateModel(badRange).ok, false);

const unsupportedEffect = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, support: 'fixed' },
  ],
  members: [{ id: 'M1', n1: 'A', n2: 'B', matId: 'steel', secId: 'h300' }],
  loads: [{ id: 'T1', type: 'temperature', member: 'M1', dT: 20, case: 'D' }],
});
assert.equal(validateModel(unsupportedEffect).ok, true);
const thermalResult = analyzeModel(unsupportedEffect);
assert.equal(thermalResult.ok, true);
assert.ok(Math.abs(thermalResult.byCombo.CO1.reactions.A.rx) > 0);

const trussModel = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 3, y: 0, z: 0 },
  ],
  members: [{ id: 'T1', type: 'truss', n1: 'A', n2: 'B', matId: 'steel', secId: 'h300' }],
  loads: [{ id: 'P1', type: 'nodal', node: 'B', P: 10, dir: '+x', case: 'D' }],
});
const trussResult = analyzeModel(trussModel);
assert.equal(trussResult.ok, true);
assert.ok(trussResult.byCombo.CO1.memberResults.T1.Nmax > 0);

const cantilever = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0 },
  ],
  members: [{ id: 'M1', n1: 'A', n2: 'B', matId: 'steel', secId: 'h300' }],
  loads: [{ id: 'P1', type: 'nodal', node: 'B', P: 10, dir: '-z', case: 'D' }],
});
const clearSpan = createModel({ ...cantilever, members: [{ ...cantilever.members[0], endOffset: { i: 0.5, j: 0.5 } }] });
const cantileverResult = analyzeModel(cantilever);
const clearSpanResult = analyzeModel(clearSpan);
assert.equal(clearSpanResult.ok, true);
assert.ok(clearSpanResult.byCombo.CO1.summary.maxDisplacement < cantileverResult.byCombo.CO1.summary.maxDisplacement);

console.log(JSON.stringify({ ok: true, version: 'p3-m11-elastic-expansion' }, null, 2));
