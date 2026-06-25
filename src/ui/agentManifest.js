import { INDEX_AGENT_ACTIONS_VERSION } from './indexAgentActions.js';
import { INDEX_DESIGN_WORKFLOW_VERSION } from './indexDesignWorkflow.js';
import { INDEX_PUSHOVER_PANEL_VERSION } from './indexPushoverPanel.js';
import { INDEX_RESULT_OVERLAY_VERSION } from './indexResultOverlay.js';
import { INDEX_RESULT_VISUALS_VERSION } from './indexResultVisuals.js';
import { INDEX_RESULTS_PANEL_VERSION } from './indexResultsPanel.js';

export const AGENT_MANIFEST_VERSION = 'm16-agent-capability-manifest';

export function buildAgentManifest(options = {}) {
  return {
    version: AGENT_MANIFEST_VERSION,
    product: 'S-Structures',
    bridgeVersion: options.bridgeVersion || null,
    modules: {
      agentActions: INDEX_AGENT_ACTIONS_VERSION,
      resultPanel: INDEX_RESULTS_PANEL_VERSION,
      resultVisuals: INDEX_RESULT_VISUALS_VERSION,
      resultOverlay: INDEX_RESULT_OVERLAY_VERSION,
      pushoverPanel: INDEX_PUSHOVER_PANEL_VERSION,
      designWorkflow: INDEX_DESIGN_WORKFLOW_VERSION,
    },
    readApis: [
      'getSnapshot',
      'getModel',
      'getResults',
      'getResultView',
      'getResultVisuals',
      'getScreenState',
      'getReport',
      'runPushover',
      'getCapabilities',
    ],
    executeActions: options.availableActions || [],
    uiContract: {
      stableAttribute: 'data-agent-id',
      controlCount: options.controls?.length || 0,
      controls: options.controls || [],
    },
    dataContracts: [
      'schemaVersionedModel',
      'linear3dAnalysis',
      'loadCombinations',
      'designSummary',
      'resultVisuals',
      'resultOverlayScene',
      'htmlReport',
      'preliminaryPushover',
      'pushoverPanel',
      'designWorkflow',
    ],
    milestones: [
      { id: 'M9', status: 'available', feature: 'existing index UI engine bridge' },
      { id: 'M10', status: 'available', feature: 'result dock and charts' },
      { id: 'M11', status: 'available', feature: 'atomic modeling actions' },
      { id: 'M12', status: 'available', feature: 'grid/story/load/mass productivity actions' },
      { id: 'M13', status: 'available', feature: 'result visualization data API' },
      { id: 'M14', status: 'available', feature: 'report data and HTML export' },
      { id: 'M15', status: 'preliminary', feature: 'pushover curve and hinge state tracking' },
      { id: 'M18', status: 'available', feature: 'canvas result overlay controls' },
      { id: 'M19', status: 'available', feature: 'agent screen control actions' },
      { id: 'M20', status: 'available', feature: 'pushover panel and capacity curve UI' },
      { id: 'M21', status: 'available', feature: 'design workflow status and next actions' },
    ],
    limitations: [
      'Pushover is currently preliminary and does not yet rebuild tangent stiffness with hinge degradation.',
      'Report output is a calculation aid and not a certified final structural calculation package.',
      'Unsupported design checks must be reviewed separately.',
      'Large models still use the current in-browser dense solver path.',
    ],
  };
}
