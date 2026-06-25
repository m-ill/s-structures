import assert from 'node:assert/strict';
import { buildAgentManifest, createPortalFrameSample } from '../src/index.js';
import { analyzeForIndex, createIndexAgentApi, INDEX_BRIDGE_VERSION } from '../src/ui/indexBridge.js';

const model = createPortalFrameSample();
const analysis = analyzeForIndex(model);
const overlayState = {
  showDeformed: true,
  showUtilization: true,
  showLoads: false,
  showReactions: false,
  showModal: false,
  showPDelta: false,
  modeIndex: 0,
  pDeltaStep: 0,
  focus: null,
};
const target = {
  model: () => model,
  reanalyze: () => {},
  SStructuresOverlayScene: {
    baseMembers: new Array(model.members.length),
    utilizationMembers: new Array(model.members.length),
    deformedMembers: new Array(model.members.length),
    modalMembers: [],
    loadArrows: [],
    reactionArrows: [],
  },
  SStructuresResultVisuals: {
    state: overlayState,
    getState: () => ({ ...overlayState, focus: overlayState.focus ? { ...overlayState.focus } : null }),
    setOption(key, value) {
      overlayState[key] = value;
      return overlayState;
    },
    setMode(index) {
      overlayState.modeIndex = index;
      overlayState.showModal = true;
      return overlayState;
    },
    setPDeltaStep(step) {
      overlayState.pDeltaStep = step;
      overlayState.showPDelta = true;
      return overlayState;
    },
    focusEntity(type, id) {
      overlayState.focus = { type, id };
      return overlayState;
    },
  },
  SStructuresResultsPanel: {
    state: { open: false },
    setOpen(open) {
      this.state.open = !!open;
    },
  },
  SStructuresPushoverPanel: {
    panelState: { open: false },
    setOpen(open) {
      this.panelState.open = !!open;
    },
    getPanelState() {
      return { open: this.panelState.open };
    },
  },
};

const agent = createIndexAgentApi(target, {
  getLastResult: () => analysis,
});

const initial = agent.getSnapshot();
assert.equal(initial.overlay.available, true);
assert.equal(initial.overlay.commandCounts.baseMembers, model.members.length);
assert.equal(initial.panels.resultsOpen, false);
assert.equal(initial.panels.pushoverOpen, false);
assert.ok(initial.availableActions.includes('setOverlayOption'));
assert.ok(initial.availableActions.includes('focusEntity'));
assert.ok(initial.availableActions.includes('setResultsPanelOpen'));
assert.ok(initial.availableActions.includes('setPushoverPanelOpen'));

const hiddenLoads = agent.execute('setOverlayOption', { key: 'showLoads', value: true });
assert.equal(hiddenLoads.overlay.state.showLoads, true);
const mode = agent.execute('setOverlayMode', { modeIndex: 2 });
assert.equal(mode.overlay.state.showModal, true);
assert.equal(mode.overlay.state.modeIndex, 2);
const step = agent.execute('setOverlayPDeltaStep', { step: 3 });
assert.equal(step.overlay.state.showPDelta, true);
assert.equal(step.overlay.state.pDeltaStep, 3);

const focused = agent.execute('focusEntity', { type: 'member', id: model.members[0].id });
assert.equal(focused.agent.selection.type, 'member');
assert.equal(focused.agent.selection.id, model.members[0].id);
assert.equal(focused.overlay.state.focus.id, model.members[0].id);

const panels = agent.execute('setResultsPanelOpen', { open: true });
assert.equal(panels.panels.resultsOpen, true);
const pushPanel = agent.execute('setPushoverPanelOpen', { open: true });
assert.equal(pushPanel.panels.pushoverOpen, true);

const screen = agent.getScreenState();
assert.equal(screen.overlay.state.focus.type, 'member');
assert.equal(screen.overlay.scene.baseMembers.length, model.members.length);
assert.equal(screen.panels.resultsOpen, true);
assert.equal(screen.panels.pushoverOpen, true);

const manifest = buildAgentManifest({
  bridgeVersion: INDEX_BRIDGE_VERSION,
  availableActions: initial.availableActions,
});
assert.ok(manifest.readApis.includes('getScreenState'));
assert.ok(manifest.executeActions.includes('setOverlayOption'));
assert.ok(manifest.milestones.some((item) => item.id === 'M19'));

assert.throws(() => agent.execute('focusEntity', { type: 'member', id: 'missing' }), /Cannot focus missing member/);

console.log(JSON.stringify({
  ok: true,
  actionCount: initial.availableActions.length,
  focus: focused.overlay.state.focus,
  screenCommands: screen.overlay.scene.baseMembers.length,
}, null, 2));
