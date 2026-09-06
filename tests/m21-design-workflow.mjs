import assert from 'node:assert/strict';
import { buildAgentManifest, createPortalFrameSample } from '../src/index.js';
import { analyzeForIndex, createIndexAgentApi, INDEX_BRIDGE_VERSION } from '../src/ui/indexBridge.js';
import {
  buildDesignWorkflow,
  INDEX_DESIGN_WORKFLOW_VERSION,
  renderDesignWorkflowMarkup,
} from '../src/ui/indexDesignWorkflow.js';
import { buildIndexResultViewModel, renderIndexResultsMarkup } from '../src/ui/indexResultsPanel.js';

const model = createPortalFrameSample();
const analysis = analyzeForIndex(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const workflow = buildDesignWorkflow(model, analysis);
assert.equal(workflow.version, INDEX_DESIGN_WORKFLOW_VERSION);
assert.ok(['OK', 'WARN', 'NG'].includes(workflow.status));
assert.equal(workflow.counts.total, workflow.rows.length);
assert.equal(workflow.checks.length, 4);
assert.ok(workflow.nextActions.length > 0);
assert.ok(workflow.checks.some((item) => item.id === 'design'));

const markup = renderDesignWorkflowMarkup(workflow);
assert.match(markup, /Design Workflow/);
assert.match(markup, /engine-design-workflow/);

const designView = buildIndexResultViewModel(model, analysis, { activeTab: 'design' });
assert.equal(designView.activeTab, 'design');
assert.equal(designView.design.workflow.version, INDEX_DESIGN_WORKFLOW_VERSION);
assert.ok(designView.design.workflow.rows.length > 0);
const designMarkup = renderIndexResultsMarkup(designView);
assert.match(designMarkup, /Design Workflow/);
assert.match(designMarkup, /Next/);

const target = {
  model: () => model,
  reanalyze: () => {},
  SStructuresResultsPanel: {
    state: { activeTab: 'design' },
  },
};
const agent = createIndexAgentApi(target, {
  getLastResult: () => analysis,
});
const snapshot = agent.getSnapshot();
assert.equal(snapshot.resultView.designWorkflowStatus, workflow.status);
assert.ok(snapshot.resultView.designNextActionCount > 0);

const manifest = buildAgentManifest({
  bridgeVersion: INDEX_BRIDGE_VERSION,
  availableActions: snapshot.availableActions,
});
assert.ok(manifest.modules.designWorkflow);
assert.ok(manifest.dataContracts.includes('designWorkflow'));
assert.ok(manifest.milestones.some((item) => item.id === 'M21'));

console.log(JSON.stringify({
  ok: true,
  workflowStatus: workflow.status,
  nextActions: workflow.nextActions.length,
  designRows: workflow.rows.length,
}, null, 2));
