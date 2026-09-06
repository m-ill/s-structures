import assert from 'node:assert/strict';
import {
  createModel,
  PUSHOVER_VERSION,
  runPushover,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';
import {
  buildPushoverView,
  createDefaultPushoverOptions,
  INDEX_PUSHOVER_PANEL_VERSION,
  renderPushoverMarkup,
} from '../src/ui/indexPushoverPanel.js';

const model = createColumnModel();
const options = createDefaultPushoverOptions({
  controlNodeId: 'N2',
  referenceBaseShear: 20,
  maxLoadFactor: 4,
  steps: 4,
  plasticMomentScale: 0.2,
});
const pushover = runPushover(model, options);
assert.equal(pushover.version, PUSHOVER_VERSION);
assert.equal(pushover.ok, true, JSON.stringify(pushover.warnings, null, 2));

const view = buildPushoverView(model, pushover, options);
assert.equal(view.version, INDEX_PUSHOVER_PANEL_VERSION);
assert.equal(view.available, true);
assert.equal(view.summary.controlNodeId, 'N2');
assert.equal(view.curve.length, 5);
assert.ok(view.summary.maxBaseShear > 0);
assert.ok(view.hingeRows.some((row) => row.memberId === 'M1'));

const markup = renderPushoverMarkup(view);
assert.match(markup, /Pushover capacity curve/);
assert.match(markup, /engine-run-pushover/);
assert.match(markup, /engine-pushover-close/);
assert.match(markup, /M1/);

const panelState = { ...options };
const uiState = { open: false };
let lastResult = null;
const target = {
  model: () => model,
  reanalyze: () => {},
  SStructuresPushoverPanel: {
    setOpen(open) {
      uiState.open = !!open;
    },
    getPanelState() {
      return { open: uiState.open };
    },
    setOption(key, value) {
      panelState[key] = value;
    },
    run(runOptions = {}) {
      lastResult = runPushover(model, { ...panelState, ...runOptions });
      uiState.open = true;
      return lastResult;
    },
    getView() {
      return buildPushoverView(model, lastResult, panelState);
    },
  },
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => null,
});

const configured = agent.execute('setPushoverOption', { key: 'steps', value: 2 });
assert.equal(panelState.steps, 2);
assert.equal(configured.pushover.available, true);
assert.equal(configured.panels.pushoverOpen, false);
const opened = agent.execute('setPushoverPanelOpen', { open: true });
assert.equal(opened.panels.pushoverOpen, true);
assert.ok(opened.availableActions.includes('setPushoverPanelOpen'));
const closed = agent.execute('setPushoverPanelOpen', { open: false });
assert.equal(closed.panels.pushoverOpen, false);

const executed = agent.execute('runPushover', {
  controlNodeId: 'N2',
  plasticMomentScale: 0.2,
});
assert.equal(executed.pushover.version, PUSHOVER_VERSION);
assert.equal(executed.pushover.summary.stepCount, 3);
assert.equal(executed.pushover.controlNodeId, 'N2');
assert.equal(agent.getSnapshot().panels.pushoverOpen, true);
assert.equal(agent.getSnapshot().pushover.stepCount, 3);

console.log(JSON.stringify({
  ok: true,
  steps: view.curve.length,
  maxBaseShear: view.summary.maxBaseShear,
  hingeRows: view.hingeRows.length,
}, null, 2));

function createColumnModel() {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null, mass: [10, 10, 10] },
  ];
  model.members = [{
    id: 'M1',
    type: 'frame',
    n1: 'N1',
    n2: 'N2',
    matId: 'steel',
    secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' },
    releases: { i: 'rigid', j: 'rigid' },
  }];
  model.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }];
  model.loadCombinations = [{ id: 'CO1', name: 'D', type: 'strength', factors: { D: 1 } }];
  model.loads = [
    { id: 'P1', type: 'nodal', node: 'N2', P: 100, dir: '-z', case: 'D' },
  ];
  return model;
}
