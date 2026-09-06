import assert from 'node:assert/strict';
import { analyzeForIndex, createIndexAgentApi } from '../src/ui/indexBridge.js';
import {
  buildIndexResultViewModel,
  INDEX_RESULTS_PANEL_VERSION,
  renderIndexResultsMarkup,
} from '../src/ui/indexResultsPanel.js';
import { createPortalFrameSample } from '../src/index.js';

const model = createPortalFrameSample();
model.analysisSettings.pDeltaMethod = 'direct';
model.analysisSettings.includeGeometricStiffness = false;
for (const node of model.nodes) {
  if (!node.support) node.mass = [5, 5, 5];
}

const analysis = analyzeForIndex(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
assert.ok(analysis.pDelta?.summary, 'P-Delta summary should be present');
assert.ok(analysis.dynamics?.modes?.length, 'modal modes should be present');
assert.ok(analysis.design?.summary, 'design summary should be present');

const summaryView = buildIndexResultViewModel(model, analysis);
assert.equal(summaryView.version, INDEX_RESULTS_PANEL_VERSION);
assert.equal(summaryView.activeTab, 'summary');
assert.ok(summaryView.summary.metrics.length >= 4, 'summary metrics should be available');
assert.ok(summaryView.summary.memberForces.length > 0, 'member force rows should be available');
assert.ok(summaryView.design.rows.length > 0, 'design rows should be available');

const pDeltaView = buildIndexResultViewModel(model, analysis, { activeTab: 'pdelta', pDeltaStep: 2 });
assert.equal(pDeltaView.activeTab, 'pdelta');
assert.equal(pDeltaView.pDelta.enabled, true);
assert.ok(pDeltaView.pDelta.maxStep >= 1, 'P-Delta step count should be exposed');
assert.ok(pDeltaView.pDelta.rows.every((row) => Number(row.amplification) > 0));
assert.ok(pDeltaView.pDelta.rows.every((row) => Number(row.loadFactor) >= 0));
assert.equal(pDeltaView.pDelta.design.version, 'pdelta-design-summary-v1');
assert.ok(pDeltaView.pDelta.design.rows.length > 0, 'P-Delta design summary rows should be exposed');
assert.ok(Array.isArray(pDeltaView.pDelta.design.storyRows), 'P-Delta story stability rows should be exposed as an array');

const modalView = buildIndexResultViewModel(model, analysis, { activeTab: 'modal' });
assert.equal(modalView.activeTab, 'modal');
assert.ok(modalView.modal.modes.some((mode) => mode.period > 0));
assert.ok(modalView.modal.modes.some((mode) => mode.massX >= 0 || mode.massY >= 0));

const designView = buildIndexResultViewModel(model, analysis, { activeTab: 'design' });
assert.equal(designView.activeTab, 'design');
assert.ok(designView.design.rows[0].utilization >= designView.design.rows.at(-1).utilization);

const markup = renderIndexResultsMarkup(pDeltaView);
assert.match(markup, /engine-tab-pdelta/);
assert.match(markup, /engine-results-close/);
assert.match(markup, /data-pdelta-step/);
assert.match(markup, /Global P-Delta response curve/);
assert.match(markup, /Design P-Delta Summary/);
assert.match(markup, /Story Stability Table/);

const pDeltaOffModel = createPortalFrameSample();
const pDeltaOffAnalysis = analyzeForIndex(pDeltaOffModel);
const pDeltaOffMarkup = renderIndexResultsMarkup(buildIndexResultViewModel(
  pDeltaOffModel,
  pDeltaOffAnalysis,
  { activeTab: 'pdelta' },
));
assert.match(pDeltaOffMarkup, /engine-enable-pdelta/);
assert.match(pDeltaOffMarkup, /Enable P-Delta/);

const modalMarkup = renderIndexResultsMarkup(modalView);
assert.match(modalMarkup, /Modal period chart/);

const target = {
  model: () => model,
  reanalyze: () => {},
  SStructuresResultsPanel: {
    state: { activeTab: 'design', pDeltaStep: 1, open: false },
    setOpen(open) {
      this.state.open = !!open;
    },
    setTab(tab) {
      this.state.activeTab = tab;
      this.state.open = true;
    },
    setPDeltaStep(step) {
      this.state.pDeltaStep = Number(step) || 0;
      this.state.open = true;
    },
  },
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => analysis,
});
const snapshot = agent.getSnapshot();
assert.equal(snapshot.resultView.activeTab, 'design');
assert.equal(snapshot.panels.resultsOpen, false);
assert.equal(snapshot.resultView.modalModeCount > 0, true);
assert.ok(snapshot.availableActions.includes('setResultsPanelOpen'));
agent.execute('setResultsPanelOpen', { open: true });
assert.equal(target.SStructuresResultsPanel.state.open, true);
agent.execute('setResultsPanelOpen', { open: false });
assert.equal(target.SStructuresResultsPanel.state.open, false);
agent.execute('setResultTab', { tab: 'modal' });
assert.equal(target.SStructuresResultsPanel.state.activeTab, 'modal');
assert.equal(target.SStructuresResultsPanel.state.open, true);
agent.execute('setPDeltaStep', { step: 3 });
assert.equal(target.SStructuresResultsPanel.state.pDeltaStep, 3);

console.log(JSON.stringify({
  ok: true,
  pDeltaMaxStep: pDeltaView.pDelta.maxStep,
  modes: modalView.modal.modes.length,
  designRows: designView.design.rows.length,
}, null, 2));
