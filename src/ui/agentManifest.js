import { INDEX_AGENT_ACTIONS_VERSION } from './indexAgentActions.js';
import { INDEX_DESIGN_WORKFLOW_VERSION } from './indexDesignWorkflow.js';
import { INDEX_PUSHOVER_PANEL_VERSION } from './indexPushoverPanel.js';
import { INDEX_RESULT_OVERLAY_VERSION } from './indexResultOverlay.js';
import { INDEX_RESULT_VISUALS_VERSION } from './indexResultVisuals.js';
import { INDEX_RESULTS_PANEL_VERSION } from './indexResultsPanel.js';
import { NATIVE_RIBBON_VERSION } from './indexNativeRibbon.js';
import { INDEX_NATIVE_RESULT_CONTROLS_VERSION } from './indexNativeResultControls.js';
import { INDEX_NATIVE_MODELER_VERSION } from './indexNativeModeler.js';
import { INDEX_NATIVE_PERSISTENCE_VERSION } from './indexNativePersistence.js';
import { INDEX_RUNTIME_ADAPTER_VERSION } from './indexRuntimeAdapter.js';

export const AGENT_MANIFEST_VERSION = 'm16-agent-capability-manifest';
export const MANIFEST_LEGACY_RESULT_SHAPE_VERSION = 'm24-legacy-result-shape';

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
      nativeRibbon: NATIVE_RIBBON_VERSION,
      nativeResultControls: INDEX_NATIVE_RESULT_CONTROLS_VERSION,
      nativeModeler: INDEX_NATIVE_MODELER_VERSION,
      nativePersistence: INDEX_NATIVE_PERSISTENCE_VERSION,
      runtimeAdapter: INDEX_RUNTIME_ADAPTER_VERSION,
      legacyResultShape: MANIFEST_LEGACY_RESULT_SHAPE_VERSION,
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
      'getRuntimeDiagnostics',
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
      'nativeRibbonState',
      'nativeResultControls',
      'nativeModelerWorkflow',
      'nativePersistenceBook',
      'originalIndexRuntimeDiagnostics',
      'legacyResultShapeCompatibility',
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
      { id: 'M22', status: 'available', feature: 'native index mode tabs and ribbon contract' },
      { id: 'M23', status: 'available', feature: 'original index runtime adapter and diagnostics' },
      { id: 'M24', status: 'available', feature: 'legacy result shape compatibility for original result UI' },
      { id: 'M25', status: 'available', feature: 'native result controls through original toolbar and property panel' },
      { id: 'M26', status: 'available', feature: 'existing modeler workflow E2E contract' },
      { id: 'M27', status: 'available', feature: 'index example save import and autosave unification' },
    ],
    limitations: [
      'Pushover is currently preliminary and does not yet rebuild tangent stiffness with hinge degradation.',
      'Report output is a calculation aid and not a certified final structural calculation package.',
      'Unsupported design checks must be reviewed separately.',
      'Large models still use the current in-browser dense solver path.',
    ],
  };
}
