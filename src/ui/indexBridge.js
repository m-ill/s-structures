import {
  analyzeModel as analyzeCoreModel,
  createHtmlReport,
  migrateToV3,
  runPushover as runCorePushover,
  validateModel as validateCoreModel,
} from '../index.js';
import {
  buildIndexResultViewModel,
  installIndexResultsPanel,
} from './indexResultsPanel.js';
import { installIndexPushoverPanel } from './indexPushoverPanel.js';
import {
  buildIndexResultVisuals,
  summarizeIndexResultVisuals,
} from './indexResultVisuals.js';
import { installIndexResultOverlay } from './indexResultOverlay.js';
import { getNativeUiState, installIndexNativeRibbon } from './indexNativeRibbon.js';
import { installIndexRuntimeAdapter } from './indexRuntimeAdapter.js';
import { buildAgentManifest } from './agentManifest.js';
import {
  executeModelingAction,
  ensureAgentState,
  MODELING_ACTIONS,
  summarizeAgentModelState,
} from './indexAgentActions.js';

export const INDEX_BRIDGE_VERSION = 'm9-index-engine-bridge';

export function analyzeForIndex(inputModel, options = {}) {
  const model = migrateToV3(inputModel);
  const result = analyzeCoreModel(model);
  return normalizeIndexResult(result, {
    requestedAt: options.requestedAt || new Date().toISOString(),
  });
}

export function validateForIndex(inputModel) {
  return validateCoreModel(migrateToV3(inputModel));
}

export function normalizeIndexResult(result, metadata = {}) {
  if (!result || typeof result !== 'object') return result;
  const bridge = {
    version: INDEX_BRIDGE_VERSION,
    ui: 'index',
    source: 'src-engine',
    requestedAt: metadata.requestedAt || null,
  };
  Object.defineProperty(result, 'bridge', {
    configurable: true,
    enumerable: true,
    value: bridge,
  });

  if (result.byCombo && typeof result.byCombo === 'object') {
    for (const [comboId, comboResult] of Object.entries(result.byCombo)) {
      normalizeResultSet(comboResult, comboId);
    }
  }
  normalizeResultSet(result.envelope, 'ENV');
  if (result.pDelta?.envelope) normalizeResultSet(result.pDelta.envelope, 'PDELTA_ENV');

  return result;
}

export function installIndexEngineBridge(target = globalThis) {
  if (!target || target.__SStructuresIndexBridgeInstalled) {
    return target?.SStructuresEngine || null;
  }

  const legacy = {
    analyzeModel: typeof target.analyzeModel === 'function' ? target.analyzeModel : null,
    validateModel: typeof target.validateModel === 'function' ? target.validateModel : null,
    installedAt: new Date().toISOString(),
  };

  let lastResult = null;
  const bridge = {
    version: INDEX_BRIDGE_VERSION,
    legacy,
    analyzeModel(model, options) {
      lastResult = analyzeForIndex(model, options);
      return lastResult;
    },
    validateModel: validateForIndex,
    migrateToV3,
    getLastResult() {
      return lastResult;
    },
    getResultVisuals(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildIndexResultVisuals(model, lastResult || analyzeForIndex(model), options);
    },
    getReport(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return createHtmlReport(model, lastResult || analyzeForIndex(model), options);
    },
    runPushover(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return target.SStructuresPushoverPanel?.run?.(options) || runCorePushover(model, options);
    },
    getCapabilities() {
      return buildAgentManifest({
        bridgeVersion: INDEX_BRIDGE_VERSION,
        availableActions: availableAgentActions(),
        controls: target.document ? listAgentControls(target.document) : [],
      });
    },
    getRuntimeDiagnostics() {
      return target.SStructuresRuntimeAdapter?.getDiagnostics?.() || null;
    },
    getCurrentModel() {
      return typeof target.model === 'function' ? target.model() : null;
    },
    getAgentState() {
      return ensureAgentState(target);
    },
    reanalyze() {
      if (typeof target.reanalyze === 'function') target.reanalyze(true);
      return lastResult;
    },
  };

  target.analyzeModel = bridge.analyzeModel;
  target.validateModel = bridge.validateModel;
  target.SStructuresEngine = bridge;
  target.SStructuresAgent = createIndexAgentApi(target, bridge);
  target.__SStructuresIndexBridgeInstalled = true;
  bridge.experimentalUi = isExperimentalIndexUiEnabled(target);

  if (target.document) {
    bridge.runtimeAdapter = installIndexRuntimeAdapter(target, { bridge });
    bridge.nativeRibbon = installIndexNativeRibbon(target, { bridge });
    decorateAgentControls(target.document);
    if (bridge.experimentalUi) {
      bridge.resultsPanel = installIndexResultsPanel(target, bridge);
      bridge.resultOverlay = installIndexResultOverlay(target, bridge);
      bridge.pushoverPanel = installIndexPushoverPanel(target, bridge, {
        runPushover: (model, options) => runCorePushover(model, options),
      });
    } else {
      bridge.resultsPanel = null;
      bridge.resultOverlay = null;
      bridge.pushoverPanel = null;
    }
    queueMicrotask(() => {
      try {
        if (typeof target.reanalyze === 'function') target.reanalyze(true);
      } catch (error) {
        console.warn('[S-Structures] Engine bridge reanalysis failed.', error);
      }
    });
  }

  return bridge;
}

export function isExperimentalIndexUiEnabled(target = globalThis) {
  const search = String(target?.location?.search || '');
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return (
    target?.S_STRUCTURES_EXPERIMENTAL_UI === true ||
    params.get('engine_ui') === '1' ||
    params.get('experimental_ui') === '1' ||
    params.get('legacy_engine_panels') === '1'
  );
}

export function createIndexAgentApi(target = globalThis, bridge = target?.SStructuresEngine) {
  const api = {
    version: INDEX_BRIDGE_VERSION,
    getModel() {
      return cloneJson(getCurrentModel(target));
    },
    setModel(nextModel) {
      const current = getCurrentModel(target);
      if (!current) throw new Error('Current UI model is not available.');
      replaceObject(current, migrateToV3(nextModel));
      runUiAnalysis(target);
      return api.getSnapshot();
    },
    getSnapshot() {
      const model = getCurrentModel(target);
      const analysis = model ? analyzeForIndex(model) : null;
      const resultView = buildIndexResultViewModel(model, analysis, target.SStructuresResultsPanel?.state || {});
      const resultVisuals = model ? buildIndexResultVisuals(model, analysis, target.SStructuresResultVisuals?.state || {}) : null;
      const agentState = ensureAgentState(target);
      return {
        version: INDEX_BRIDGE_VERSION,
        model: summarizeModel(model),
        analysis: summarizeAnalysis(analysis),
        resultView: summarizeResultView(resultView),
        resultVisuals: summarizeIndexResultVisuals(resultVisuals),
        overlay: summarizeOverlay(target),
        panels: summarizePanels(target),
        pushover: summarizePushover(target),
        nativeUi: getNativeUiState(target),
        runtime: target.SStructuresRuntimeAdapter?.getDiagnostics?.() || null,
        agent: model ? summarizeAgentModelState(model, agentState) : { selection: { type: null, id: null, exists: false } },
        controls: target.document ? listAgentControls(target.document) : [],
        availableActions: availableAgentActions(),
      };
    },
    getScreenState() {
      return cloneJson({
        resultView: target.SStructuresAgentResultView || null,
        overlay: {
          state: target.SStructuresResultVisuals?.getState?.() || null,
          scene: target.SStructuresOverlayScene || null,
        },
        panels: summarizePanels(target),
        nativeUi: getNativeUiState(target),
        runtime: target.SStructuresRuntimeAdapter?.getDiagnostics?.() || null,
        controls: target.document ? listAgentControls(target.document) : [],
      });
    },
    getResults() {
      return cloneJson(bridge?.getLastResult?.() || analyzeForIndex(getCurrentModel(target)));
    },
    getResultView() {
      return cloneJson(buildIndexResultViewModel(
        getCurrentModel(target),
        bridge?.getLastResult?.() || analyzeForIndex(getCurrentModel(target)),
        target.SStructuresResultsPanel?.state || {},
      ));
    },
    getResultVisuals(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildIndexResultVisuals(
        model,
        bridge?.getLastResult?.() || analyzeForIndex(model),
        options,
      ));
    },
    getReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(createHtmlReport(
        model,
        bridge?.getLastResult?.() || analyzeForIndex(model),
        options,
      ));
    },
    getRuntimeDiagnostics() {
      return cloneJson(target.SStructuresRuntimeAdapter?.getDiagnostics?.() || null);
    },
    runPushover(options = {}) {
      const model = getCurrentModel(target);
      if (!model) throw new Error('Current UI model is not available.');
      const result = target.SStructuresPushoverPanel?.run?.(options) || runCorePushover(model, options);
      return cloneJson(result);
    },
    getCapabilities() {
      return cloneJson(buildAgentManifest({
        bridgeVersion: INDEX_BRIDGE_VERSION,
        availableActions: availableAgentActions(),
        controls: target.document ? listAgentControls(target.document) : [],
      }));
    },
    runAnalysis() {
      runUiAnalysis(target);
      return api.getSnapshot();
    },
    execute(action, payload = {}) {
      switch (action) {
        case 'runAnalysis':
          return api.runAnalysis();
        case 'setModel':
          return api.setModel(payload.model || payload);
        case 'setAnalysisSetting':
          return setAnalysisSetting(target, payload.key, payload.value, api);
        case 'setNodeMass':
          return executeAgentModelingAction(target, action, payload, api);
        case 'runPushover': {
          const pushover = api.runPushover(payload);
          return {
            ...api.getSnapshot(),
            pushover,
          };
        }
        case 'setNativeMode':
          return setNativeMode(target, payload.mode || payload.value || payload, api);
        case 'setResultTab':
          return setResultTab(target, payload.tab, api);
        case 'setPDeltaStep':
          return setPDeltaStep(target, payload.step, api);
        case 'setResultsPanelOpen':
          return setResultsPanelOpen(target, payload.open ?? payload.value ?? true, api);
        case 'setOverlayOption':
          return setOverlayOption(target, payload.key, payload.value, api);
        case 'setOverlayMode':
          return setOverlayMode(target, payload.modeIndex ?? payload.index, api);
        case 'setOverlayPDeltaStep':
          return setOverlayPDeltaStep(target, payload.step, api);
        case 'focusEntity':
          return focusEntity(target, payload, api);
        case 'setPushoverOption':
          return setPushoverOption(target, payload.key, payload.value, api);
        case 'setPushoverPanelOpen':
          return setPushoverPanelOpen(target, payload.open ?? payload.value ?? true, api);
        default:
          if (MODELING_ACTIONS.includes(action)) {
            return executeAgentModelingAction(target, action, payload, api);
          }
          throw new Error(`Unsupported S-Structures agent action: ${action}`);
      }
    },
  };
  return api;
}

function availableAgentActions() {
  return [
    'runAnalysis',
    'setModel',
    'setAnalysisSetting',
    'setResultTab',
    'setPDeltaStep',
    'setResultsPanelOpen',
    'setOverlayOption',
    'setOverlayMode',
    'setOverlayPDeltaStep',
    'focusEntity',
    'setPushoverOption',
    'setPushoverPanelOpen',
    'runPushover',
    'setNativeMode',
    ...MODELING_ACTIONS,
  ];
}

export function decorateAgentControls(doc) {
  if (!doc?.querySelectorAll) return [];
  const decorated = [];
  const add = (element, id, label = null) => {
    if (!element || !id) return;
    element.setAttribute('data-agent-id', id);
    if (label && !element.getAttribute('aria-label')) element.setAttribute('aria-label', label);
    decorated.push(id);
  };

  for (const element of doc.querySelectorAll('[id]')) {
    const id = element.getAttribute('id');
    if (isAgentRelevantId(id)) add(element, id, labelForElement(element));
  }
  for (const element of doc.querySelectorAll('[data-mode]')) {
    add(element, `mode-${element.getAttribute('data-mode')}`, labelForElement(element));
  }
  for (const element of doc.querySelectorAll('[data-tool]')) {
    add(element, `tool-${element.getAttribute('data-tool')}`, labelForElement(element));
  }
  for (const element of doc.querySelectorAll('[data-res]')) {
    add(element, `result-${element.getAttribute('data-res')}`, labelForElement(element));
  }
  for (const element of doc.querySelectorAll('[data-view]')) {
    add(element, `view-${element.getAttribute('data-view')}`, labelForElement(element));
  }
  return decorated;
}

export function listAgentControls(doc) {
  if (!doc?.querySelectorAll) return [];
  return [...doc.querySelectorAll('[data-agent-id]')].map((element) => ({
    id: element.getAttribute('data-agent-id'),
    label: labelForElement(element),
    tag: element.tagName?.toLowerCase() || null,
    disabled: !!element.disabled,
  }));
}

function normalizeResultSet(resultSet, comboId) {
  if (!resultSet || typeof resultSet !== 'object') return;
  if (!resultSet.comboId) resultSet.comboId = comboId;
  if (resultSet.disp && !resultSet.nodeDisplacements) resultSet.nodeDisplacements = resultSet.disp;
  if (!resultSet.disp && resultSet.nodeDisplacements) resultSet.disp = resultSet.nodeDisplacements;
  if (!resultSet.memberResults) resultSet.memberResults = {};
  if (!resultSet.reactions) resultSet.reactions = {};
  if (!resultSet.unstableMembers) resultSet.unstableMembers = new Set();
  if (Array.isArray(resultSet.unstableMembers)) resultSet.unstableMembers = new Set(resultSet.unstableMembers);
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

function setAnalysisSetting(target, key, value, api) {
  if (!key) throw new Error('setAnalysisSetting requires a key.');
  const model = getCurrentModel(target);
  if (!model) throw new Error('Current UI model is not available.');
  model.analysisSettings = model.analysisSettings || {};
  model.analysisSettings[key] = value;
  runUiAnalysis(target);
  return api.getSnapshot();
}

function setNodeMass(target, nodeId, mass, api) {
  if (!nodeId) throw new Error('setNodeMass requires nodeId.');
  const model = getCurrentModel(target);
  const node = model?.nodes?.find((item) => item.id === nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  node.mass = Array.isArray(mass) ? mass.slice(0, 6) : Number(mass) || 0;
  runUiAnalysis(target);
  return api.getSnapshot();
}

function executeAgentModelingAction(target, action, payload, api) {
  const model = getCurrentModel(target);
  if (!model) throw new Error('Current UI model is not available.');
  const state = ensureAgentState(target);
  const actionResult = executeModelingAction(model, state, action, payload);
  state.lastAction = {
    action,
    changed: !!actionResult.changed,
    at: new Date().toISOString(),
  };
  if (actionResult.changed) runUiAnalysis(target);
  return {
    ...api.getSnapshot(),
    actionResult,
  };
}

function setResultTab(target, tab, api) {
  target.SStructuresResultsPanel?.setTab?.(tab);
  return api.getSnapshot();
}

function setPDeltaStep(target, step, api) {
  target.SStructuresResultsPanel?.setPDeltaStep?.(step);
  return api.getSnapshot();
}

function setResultsPanelOpen(target, open, api) {
  if (!target.SStructuresResultsPanel?.setOpen) throw new Error('Results panel is not available.');
  target.SStructuresResultsPanel.setOpen(open);
  return api.getSnapshot();
}

function setOverlayOption(target, key, value, api) {
  if (!target.SStructuresResultVisuals?.setOption) throw new Error('Result overlay is not available.');
  target.SStructuresResultVisuals.setOption(key, value);
  return api.getSnapshot();
}

function setOverlayMode(target, modeIndex, api) {
  if (!target.SStructuresResultVisuals?.setMode) throw new Error('Result overlay is not available.');
  target.SStructuresResultVisuals.setMode(modeIndex);
  return api.getSnapshot();
}

function setOverlayPDeltaStep(target, step, api) {
  if (!target.SStructuresResultVisuals?.setPDeltaStep) throw new Error('Result overlay is not available.');
  target.SStructuresResultVisuals.setPDeltaStep(step);
  target.SStructuresResultsPanel?.setPDeltaStep?.(step);
  return api.getSnapshot();
}

function focusEntity(target, payload, api) {
  const type = String(payload.type || '').trim();
  const id = String(payload.id || '').trim();
  if (!type || !id) throw new Error('focusEntity requires type and id.');
  const model = getCurrentModel(target);
  const entity = getEntity(model, type, id);
  if (!entity) throw new Error(`Cannot focus missing ${type}: ${id}`);
  const state = ensureAgentState(target);
  state.selection = { type, id };
  target.SStructuresResultVisuals?.focusEntity?.(type, id);
  return api.getSnapshot();
}

function setPushoverOption(target, key, value, api) {
  if (!target.SStructuresPushoverPanel?.setOption) throw new Error('Pushover panel is not available.');
  target.SStructuresPushoverPanel.setOption(key, value);
  return api.getSnapshot();
}

function setPushoverPanelOpen(target, open, api) {
  if (!target.SStructuresPushoverPanel?.setOpen) throw new Error('Pushover panel is not available.');
  target.SStructuresPushoverPanel.setOpen(open);
  return api.getSnapshot();
}

function setNativeMode(target, mode, api) {
  if (!target.SStructuresNativeUI?.setMode) throw new Error('Native index UI is not available.');
  target.SStructuresNativeUI.setMode(mode);
  return api.getSnapshot();
}

function runUiAnalysis(target) {
  if (typeof target?.reanalyze === 'function') target.reanalyze(true);
}

function getCurrentModel(target) {
  return typeof target?.model === 'function' ? target.model() : null;
}

function replaceObject(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
  return target;
}

function getEntity(model, type, id) {
  const collection = {
    node: model?.nodes,
    member: model?.members,
    load: model?.loads,
    loadCase: model?.loadCases,
    loadCombination: model?.loadCombinations,
  }[type];
  return collection?.find((item) => item.id === id) || null;
}

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (item instanceof Set) return [...item];
    return item;
  }));
}

function isAgentRelevantId(id) {
  return new Set([
    'menuBtn',
    'prevPage',
    'nextPage',
    'newPage',
    'undoBtn',
    'redoBtn',
    'zoomOut',
    'zoomLbl',
    'zoomIn',
    'comboSel',
    'mLoadCombos',
    'mDesignReport',
    'mValidate',
    'mSettings',
    'mHelp',
    'paletteToggle',
    'playerToggle',
    'navZoomIn',
    'navZoomOut',
    'navOrbit',
    'navPan',
    'navFit',
    'propPanel',
    'statusTxt',
    'statusChip',
  ]).has(id);
}

function labelForElement(element) {
  return (
    element.getAttribute?.('aria-label') ||
    element.getAttribute?.('title') ||
    element.textContent?.replace(/\s+/g, ' ').trim() ||
    element.getAttribute?.('id') ||
    element.getAttribute?.('data-agent-id') ||
    ''
  );
}

if (typeof window !== 'undefined') {
  installIndexEngineBridge(window);
}
