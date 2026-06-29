import { summarizeIndexResultVisuals } from './indexResultVisuals.js';
import { getNativeUiState } from './indexNativeRibbon.js';
import { listAgentControls } from './indexAgentControlsDom.js';
import { summarizeAgentModelState } from './indexAgentActions.js';
import { availableAgentActions } from './indexAgentActionCatalog.js';

export function buildAgentSnapshot(target, context) {
  const {
    version,
    model,
    analysis,
    resultView,
    resultVisuals,
    agentState,
  } = context;
  return {
    version,
    model: summarizeModel(model),
    analysis: summarizeAnalysis(analysis),
    resultView: summarizeResultView(resultView),
    resultVisuals: summarizeIndexResultVisuals(resultVisuals),
    overlay: summarizeOverlay(target),
    panels: summarizePanels(target),
    pushover: summarizePushover(target),
    nativeUi: getNativeUiState(target),
    nativeResultControls: target.SStructuresNativeResultControls?.getState?.() || null,
    nativeModeler: target.SStructuresNativeModeler?.getState?.() || null,
    nativePersistence: target.SStructuresNativePersistence?.getState?.() || null,
    nativeAgentControls: target.SStructuresNativeAgentControls?.getState?.() || null,
    nativeAdvancedAnalysis: target.SStructuresNativeAdvancedAnalysis?.getState?.() || null,
    productHardening: target.SStructuresProductHardening?.getState?.() || null,
    agentCommandBridge: target.SStructuresAgentCommandBridge?.getState?.() || null,
    runtime: target.SStructuresRuntimeAdapter?.getDiagnostics?.() || null,
    agent: model ? summarizeAgentModelState(model, agentState) : { selection: { type: null, id: null, exists: false } },
    controls: target.document ? listAgentControls(target.document) : [],
    availableActions: availableAgentActions(),
  };
}

export function buildAgentScreenState(target) {
  return {
    resultView: target.SStructuresAgentResultView || null,
    overlay: {
      state: target.SStructuresResultVisuals?.getState?.() || null,
      scene: target.SStructuresOverlayScene || null,
    },
    panels: summarizePanels(target),
    nativeUi: getNativeUiState(target),
    nativeResultControls: target.SStructuresNativeResultControls?.getState?.() || null,
    nativeModeler: target.SStructuresNativeModeler?.getState?.() || null,
    nativePersistence: target.SStructuresNativePersistence?.getState?.() || null,
    nativeAgentControls: target.SStructuresNativeAgentControls?.getState?.() || null,
    nativeAdvancedAnalysis: target.SStructuresNativeAdvancedAnalysis?.getState?.() || null,
    productHardening: target.SStructuresProductHardening?.getState?.() || null,
    agentCommandBridge: target.SStructuresAgentCommandBridge?.getState?.() || null,
    runtime: target.SStructuresRuntimeAdapter?.getDiagnostics?.() || null,
    controls: target.document ? listAgentControls(target.document) : [],
  };
}

function summarizeModel(model) {
  if (!model) {
    return {
      available: false,
      nodeCount: 0,
      memberCount: 0,
      loadCount: 0,
      loadCaseCount: 0,
      combinationCount: 0,
    };
  }
  return {
    available: true,
    schemaVersion: model.schemaVersion || null,
    nodeCount: model.nodes?.length || 0,
    memberCount: model.members?.length || 0,
    loadCount: model.loads?.length || 0,
    loadCaseCount: model.loadCases?.length || 0,
    combinationCount: model.loadCombinations?.length || 0,
    analysisSettings: {
      includeSelfWeight: !!model.analysisSettings?.includeSelfWeight,
      includeGeometricStiffness: !!model.analysisSettings?.includeGeometricStiffness,
      responseSpectrumEnabled: model.analysisSettings?.responseSpectrum?.enabled !== false,
    },
  };
}

function summarizeAnalysis(analysis) {
  if (!analysis) return { available: false, ok: false };
  const firstCombo = analysis.combos?.[0]?.id || null;
  const firstResult = firstCombo ? analysis.byCombo?.[firstCombo] : null;
  return {
    available: true,
    ok: !!analysis.ok,
    empty: !!analysis.empty,
    comboCount: analysis.combos?.length || 0,
    firstCombo,
    errorCount: analysis.validation?.errors?.length || 0,
    warningCount: analysis.validation?.warnings?.length || 0,
    maxDisplacement: analysis.envelope?.dmax ?? firstResult?.dmax ?? null,
    maxRatio: analysis.design?.summary?.maxRatio ?? analysis.envelope?.maxRatio ?? null,
    pDeltaEnabled: !!analysis.pDelta,
    modalModeCount: analysis.dynamics?.modes?.length || 0,
  };
}

function summarizeResultView(view) {
  return {
    version: view.version,
    activeTab: view.activeTab,
    status: view.status,
    summaryMetricCount: view.summary?.metrics?.length || 0,
    pDeltaEnabled: !!view.pDelta?.enabled,
    pDeltaMaxStep: view.pDelta?.maxStep || 0,
    modalModeCount: view.modal?.modes?.length || 0,
    designRows: view.design?.rows?.length || 0,
    designWorkflowStatus: view.design?.workflow?.status || null,
    designNextActionCount: view.design?.workflow?.nextActions?.length || 0,
  };
}

function summarizeOverlay(target) {
  const state = target.SStructuresResultVisuals?.getState?.() || null;
  const scene = target.SStructuresOverlayScene || null;
  return {
    available: !!target.SStructuresResultVisuals,
    state,
    commandCounts: scene ? {
      baseMembers: scene.baseMembers?.length || 0,
      utilizationMembers: scene.utilizationMembers?.length || 0,
      deformedMembers: scene.deformedMembers?.length || 0,
      modalMembers: scene.modalMembers?.length || 0,
      loadArrows: scene.loadArrows?.length || 0,
      reactionArrows: scene.reactionArrows?.length || 0,
    } : null,
  };
}

function summarizePanels(target) {
  return {
    resultsOpen: getPanelOpen(target.SStructuresResultsPanel),
    pushoverOpen: getPanelOpen(target.SStructuresPushoverPanel),
  };
}

function getPanelOpen(panel) {
  const panelState = panel?.getPanelState?.();
  if (typeof panelState?.open === 'boolean') return panelState.open;
  if (typeof panel?.state?.open === 'boolean') return panel.state.open;
  if (typeof panel?.panelState?.open === 'boolean') return panel.panelState.open;
  return false;
}

function summarizePushover(target) {
  const view = target.SStructuresPushoverPanel?.getView?.() || target.SStructuresPushoverView || null;
  return {
    available: !!target.SStructuresPushoverPanel,
    open: getPanelOpen(target.SStructuresPushoverPanel),
    status: view?.status || 'Unavailable',
    controlNodeId: view?.summary?.controlNodeId || null,
    direction: view?.summary?.direction || null,
    stepCount: view?.summary?.stepCount || 0,
    maxBaseShear: view?.summary?.maxBaseShear || 0,
    maxControlDisplacement: view?.summary?.maxControlDisplacement || 0,
    plasticMemberCount: view?.summary?.plasticMemberCount || 0,
  };
}
