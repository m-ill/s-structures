import assert from 'node:assert/strict';
import { createPortalFrameSample } from '../src/index.js';
import { analyzeForIndex } from '../src/ui/indexBridge.js';
import { buildIndexResultVisuals } from '../src/ui/indexResultVisuals.js';
import {
  buildIndexOverlayScene,
  createDefaultOverlayState,
  INDEX_RESULT_OVERLAY_VERSION,
} from '../src/ui/indexResultOverlay.js';

const model = createPortalFrameSample();
model.analysisSettings.includeGeometricStiffness = true;
for (const node of model.nodes) {
  if (!node.support) node.mass = [5, 5, 5];
}

const analysis = analyzeForIndex(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const visuals = buildIndexResultVisuals(model, analysis);
const state = createDefaultOverlayState({
  showDeformed: true,
  showUtilization: true,
  showLoads: true,
  showReactions: true,
  showModal: true,
  showPDelta: true,
  modeIndex: 0,
  pDeltaStep: 1,
});
const scene = buildIndexOverlayScene(visuals, state, { width: 840, height: 520 });

assert.equal(scene.version, INDEX_RESULT_OVERLAY_VERSION);
assert.equal(scene.size.width, 840);
assert.equal(scene.baseMembers.length, model.members.length);
assert.equal(scene.utilizationMembers.length, model.members.length);
assert.equal(scene.deformedMembers.length, model.members.length);
assert.equal(scene.modalMembers.length, model.members.length);
assert.equal(scene.loadArrows.length, model.loads.length);
assert.ok(scene.reactionArrows.length > 0);
assert.ok(scene.badges.some((badge) => badge.includes('P-Delta step 1')));
assert.ok(scene.legend.some((item) => item.label === 'Mode shape'));
assert.ok(scene.utilizationMembers.some((line) => line.width > 2));

const defaultScene = buildIndexOverlayScene(visuals, createDefaultOverlayState(), { width: 500, height: 360 });
assert.equal(defaultScene.utilizationMembers.length, 0);
assert.equal(defaultScene.deformedMembers.length, 0);
assert.equal(defaultScene.loadArrows.length, 0);
assert.equal(defaultScene.reactionArrows.length, 0);
assert.equal(defaultScene.badges.length, 0);

const focused = buildIndexOverlayScene(visuals, {
  focus: { type: 'member', id: model.members[0].id },
}, { width: 500, height: 360 });
assert.equal(focused.focus.type, 'member');
assert.equal(focused.focus.id, model.members[0].id);

const hidden = buildIndexOverlayScene(visuals, {
  showDeformed: false,
  showUtilization: false,
}, { width: 500, height: 360 });
assert.equal(hidden.deformedMembers.length, 0);
assert.equal(hidden.utilizationMembers.length, 0);

console.log(JSON.stringify({
  ok: true,
  baseMembers: scene.baseMembers.length,
  loadArrows: scene.loadArrows.length,
  reactionArrows: scene.reactionArrows.length,
  modalMembers: scene.modalMembers.length,
}, null, 2));
