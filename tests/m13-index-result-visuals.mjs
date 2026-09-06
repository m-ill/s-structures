import assert from 'node:assert/strict';
import { createPortalFrameSample } from '../src/index.js';
import { analyzeForIndex, createIndexAgentApi } from '../src/ui/indexBridge.js';
import {
  buildIndexResultVisuals,
  INDEX_RESULT_VISUALS_VERSION,
  summarizeIndexResultVisuals,
} from '../src/ui/indexResultVisuals.js';

const model = createPortalFrameSample();
model.analysisSettings.includeGeometricStiffness = true;
for (const node of model.nodes) {
  if (!node.support) node.mass = [5, 5, 5];
}

const analysis = analyzeForIndex(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const visuals = buildIndexResultVisuals(model, analysis);
assert.equal(visuals.version, INDEX_RESULT_VISUALS_VERSION);
assert.equal(visuals.nodes.length, model.nodes.length);
assert.equal(visuals.deformedNodes.length, model.nodes.length);
assert.equal(visuals.members.length, model.members.length);
assert.equal(visuals.loads.length, model.loads.length);
assert.ok(visuals.deformScale > 0);
assert.ok(visuals.maxDisplacement > 0);
assert.ok(visuals.bounds.diagonal > 0);
assert.ok(visuals.reactions.length > 0);
assert.ok(visuals.reactions.every((reaction) => reaction.force.length === 3 && reaction.moment.length === 3));
assert.ok(visuals.members.some((member) => member.ratio > 0));
assert.ok(visuals.members.every((member) => /^#[0-9a-f]{6}$/i.test(member.color)));
assert.ok(visuals.modal.modes.length > 0);
assert.equal(visuals.modal.modes[0].shape.length, model.nodes.length);
assert.ok(visuals.pDelta.series.length > 0);
assert.equal(visuals.pDelta.series[0].kind, 'global-pdelta-response');
assert.equal(visuals.pDelta.series[0].points.at(-1).loadFactor, 1);
assert.ok(visuals.pDelta.series[0].points.at(-1).secondOrderRoofDisplacement >= visuals.pDelta.series[0].points.at(-1).firstOrderRoofDisplacement);

const moved = visuals.deformedNodes.some((node) => {
  const base = visuals.nodes.find((item) => item.id === node.id);
  return Math.hypot(node.x - base.x, node.y - base.y, node.z - base.z) > 0;
});
assert.ok(moved, 'deformed node coordinates should differ from base coordinates');

const comboId = analysis.combos[0].id;
const comboVisuals = buildIndexResultVisuals(model, analysis, {
  resultId: comboId,
  deformScale: 10,
});
assert.equal(comboVisuals.resultId, comboId);
assert.equal(comboVisuals.deformScale, 10);

const summary = summarizeIndexResultVisuals(visuals);
assert.equal(summary.available, true);
assert.equal(summary.nodeCount, model.nodes.length);
assert.equal(summary.memberCount, model.members.length);
assert.equal(summary.modalShapeCount, visuals.modal.modes.length);

const target = {
  model: () => model,
  reanalyze: () => {},
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => analysis,
});
const snapshot = agent.getSnapshot();
assert.equal(snapshot.resultVisuals.available, true);
assert.equal(snapshot.resultVisuals.nodeCount, model.nodes.length);
const agentVisuals = agent.getResultVisuals({ resultId: 'ENVELOPE' });
assert.equal(agentVisuals.nodes.length, model.nodes.length);
assert.equal(agentVisuals.members.length, model.members.length);

console.log(JSON.stringify({
  ok: true,
  nodes: visuals.nodes.length,
  members: visuals.members.length,
  reactions: visuals.reactions.length,
  modes: visuals.modal.modes.length,
  pDeltaSeries: visuals.pDelta.series.length,
}, null, 2));
