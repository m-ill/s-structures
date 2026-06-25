import assert from 'node:assert/strict';
import { analyzeModel, createPortalFrameSample } from '../src/index.js';

const model = createPortalFrameSample();
const analysis = analyzeModel(model);

assert.equal(analysis.validation.errors.length, 0, JSON.stringify(analysis.validation.errors, null, 2));
assert.equal(analysis.ok, true, 'sample model should pass validation and analysis');
assert.equal(model.nodes.length, 8, 'sample should contain 8 nodes');
assert.equal(model.members.length, 8, 'sample should contain 8 frame members');

const combo = analysis.byCombo.CO1;
assert.equal(combo.ok, true, 'CO1 should solve');
assert.equal(combo.anyOk, true, 'CO1 should contain at least one solved connected component');
assert.ok(combo.summary.equilibriumResidual < 1e-8, `equilibrium residual too high: ${combo.summary.equilibriumResidual}`);
assert.ok(combo.summary.maxDisplacement > 0, 'sample should have non-zero displacement');
assert.ok(Number.isFinite(combo.summary.maxUtilization), 'sample should have finite utilization');

const totalLoadZ = combo.summary.totalLoad[2];
const totalReactionZ = combo.summary.totalReaction[2];
assert.ok(Math.abs(totalLoadZ + 96) < 1e-8, `expected -96 kN vertical load, got ${totalLoadZ}`);
assert.ok(Math.abs(totalReactionZ - 96) < 1e-8, `expected +96 kN vertical reaction, got ${totalReactionZ}`);

assert.ok(analysis.envelope, 'envelope should be generated');
assert.equal(analysis.envelope.ok, true, 'envelope should be OK');
assert.equal(Object.keys(analysis.envelope.memberResults).length, 8, 'envelope should include all members');

console.log(JSON.stringify({
  ok: analysis.ok,
  nodes: model.nodes.length,
  members: model.members.length,
  combos: analysis.combos.map((comboDef) => comboDef.id),
  equilibriumResidual: combo.summary.equilibriumResidual,
  maxDisplacement: combo.summary.maxDisplacement,
  maxUtilization: combo.summary.maxUtilization,
}, null, 2));

