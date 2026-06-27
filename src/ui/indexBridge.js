import {
  analyzeModel as analyzeCoreModel,
  applyDesignBasisLoads as applyDesignBasisLoadsToModel,
  buildKdsLoadStandardAudit,
  buildConnectionFoundationReport,
  buildRcDetailingReport,
  buildSteelDetailingReport,
  createCalculationPackageHtml,
  createDetailedHtmlReport,
  createHtmlReport,
  createKdsLoadCombinations,
  createKdsRuleBasedLoadCombinations,
  estimateModelLoads,
  getKdsLoadStandardRegistry as getCoreKdsLoadStandardRegistry,
  migrateToV3,
  runPushover as runCorePushover,
  summarizeKdsLoadCombinationCoverage,
  summarizeKdsLoadCombinationRules,
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
import { installIndexNativeResultControls } from './indexNativeResultControls.js';
import { installIndexNativeModeler, NATIVE_MODELER_ACTIONS } from './indexNativeModeler.js';
import { installIndexNativePersistence } from './indexNativePersistence.js';
import { installIndexNativeAgentControls, NATIVE_AGENT_CONTROL_ACTIONS } from './indexNativeAgentControls.js';
import { installIndexNativeAdvancedAnalysis, NATIVE_ADVANCED_ACTIONS } from './indexNativeAdvancedAnalysis.js';
import { installIndexProductHardening } from './indexProductHardening.js';
import { installIndexAgentCommandBridge } from './indexAgentCommandBridge.js';
import { installIndexRuntimeAdapter } from './indexRuntimeAdapter.js';
import { buildAgentManifest } from './agentManifest.js';
import {
  executeModelingAction,
  ensureAgentState,
  MODELING_ACTIONS,
  summarizeAgentModelState,
} from './indexAgentActions.js';

export const INDEX_BRIDGE_VERSION = 'm9-index-engine-bridge';
export const INDEX_LEGACY_RESULT_SHAPE_VERSION = 'm24-legacy-result-shape';

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
  result.legacyResultShape = buildLegacyResultShapeSummary(result);

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
    getDetailedReport(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return createDetailedHtmlReport(model, lastResult || analyzeForIndex(model), options);
    },
    getCalculationPackage(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return createCalculationPackageHtml(model, lastResult || analyzeForIndex(model), options);
    },
    getKdsLoadCombinationCoverage(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return summarizeKdsLoadCombinationCoverage(model, options);
    },
    getKdsLoadCombinationRules(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return summarizeKdsLoadCombinationRules(model, options);
    },
    getKdsLoadStandardRegistry() {
      return getCoreKdsLoadStandardRegistry();
    },
    getKdsLoadStandardAudit(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildKdsLoadStandardAudit(model, options);
    },
    getDesignBasisLoadEstimation(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return model.loadEstimation || estimateModelLoads(model, options.designBasis || options, { generateLoads: false });
    },
    getRcDetailingReport(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildRcDetailingReport(model, lastResult || analyzeForIndex(model), options);
    },
    getSteelDetailingReport(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildSteelDetailingReport(model, lastResult || analyzeForIndex(model), options);
    },
    getConnectionFoundationReport(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildConnectionFoundationReport(model, lastResult || analyzeForIndex(model), options);
    },
    applyDesignBasisLoads(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      const estimation = applyDesignBasisLoadsToModel(model, options.designBasis || options, options);
      lastResult = analyzeForIndex(model);
      if (typeof target?.reanalyze === 'function') target.reanalyze(true);
      return estimation;
    },
    applyKdsLoadCombinations(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      const applied = applyKdsLoadCombinationsToModel(target, bridge, model, options);
      lastResult = analyzeForIndex(model);
      return applied;
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
    bridge.nativeResultControls = installIndexNativeResultControls(target, { bridge });
    bridge.nativeModeler = installIndexNativeModeler(target, { bridge });
    bridge.nativePersistence = installIndexNativePersistence(target, { bridge });
    bridge.nativeAgentControls = installIndexNativeAgentControls(target, { bridge });
    bridge.nativeAdvancedAnalysis = installIndexNativeAdvancedAnalysis(target, { bridge });
    bridge.productHardening = installIndexProductHardening(target, { bridge });
    bridge.agentCommandBridge = installIndexAgentCommandBridge(target, target.SStructuresAgent);
    bridge.detailedReportMenu = installDetailedReportMenuHook(target, bridge);
    bridge.calculationPackageMenu = installCalculationPackageMenuHook(target, bridge);
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
        nativeResultControls: target.SStructuresNativeResultControls?.getState?.() || null,
        nativeModeler: target.SStructuresNativeModeler?.getState?.() || null,
        nativePersistence: target.SStructuresNativePersistence?.getState?.() || null,
        nativeAgentControls: target.SStructuresNativeAgentControls?.getState?.() || null,
        nativeAdvancedAnalysis: target.SStructuresNativeAdvancedAnalysis?.getState?.() || null,
        productHardening: target.SStructuresProductHardening?.getState?.() || null,
        agentCommandBridge: target.SStructuresAgentCommandBridge?.getState?.() || null,
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
    getDetailedReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(createDetailedHtmlReport(
        model,
        bridge?.getLastResult?.() || analyzeForIndex(model),
        options,
      ));
    },
    getCalculationPackage(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(createCalculationPackageHtml(
        model,
        bridge?.getLastResult?.() || analyzeForIndex(model),
        options,
      ));
    },
    getKdsLoadCombinationCoverage(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(summarizeKdsLoadCombinationCoverage(model, options));
    },
    getKdsLoadCombinationRules(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(summarizeKdsLoadCombinationRules(model, options));
    },
    getKdsLoadStandardRegistry() {
      return cloneJson(getCoreKdsLoadStandardRegistry());
    },
    getKdsLoadStandardAudit(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildKdsLoadStandardAudit(model, options));
    },
    getDesignBasisLoadEstimation(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(model.loadEstimation || estimateModelLoads(model, options.designBasis || options, { generateLoads: false }));
    },
    getRcDetailingReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildRcDetailingReport(
        model,
        bridge?.getLastResult?.() || analyzeForIndex(model),
        options,
      ));
    },
    getSteelDetailingReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildSteelDetailingReport(
        model,
        bridge?.getLastResult?.() || analyzeForIndex(model),
        options,
      ));
    },
    getConnectionFoundationReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildConnectionFoundationReport(
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
        case 'applyKdsLoadCombinations': {
          const model = getCurrentModel(target);
          if (!model) throw new Error('Current UI model is not available.');
          const kdsLoadCombinations = applyKdsLoadCombinationsToModel(target, bridge, model, payload);
          return {
            ...api.getSnapshot(),
            kdsLoadCombinations,
          };
        }
        case 'applyKdsRuleBasedLoadCombinations': {
          const model = getCurrentModel(target);
          if (!model) throw new Error('Current UI model is not available.');
          const kdsLoadCombinations = applyKdsLoadCombinationsToModel(target, bridge, model, {
            ...payload,
            ruleBased: true,
          });
          return {
            ...api.getSnapshot(),
            kdsLoadCombinations,
          };
        }
        case 'applyDesignBasisLoads': {
          const model = getCurrentModel(target);
          if (!model) throw new Error('Current UI model is not available.');
          const loadEstimation = applyDesignBasisLoadsToModel(model, payload.designBasis || payload, payload);
          runUiAnalysis(target);
          return {
            ...api.getSnapshot(),
            loadEstimation,
          };
        }
        case 'openNativeDetailedReport':
          return openNativeDetailedReport(target, bridge, api, payload);
        case 'openNativeCalculationPackage':
          return openNativeCalculationPackage(target, bridge, api, payload);
        case 'setNativeMode':
          return setNativeMode(target, payload.mode || payload.value || payload, api);
        case 'setNativePDeltaEnabled':
          return setNativePDeltaEnabled(target, payload.enabled ?? payload.value ?? true, api);
        case 'setNativePDeltaStep':
          return setNativePDeltaStep(target, payload.step, api);
        case 'setNativeResultScale':
          return setNativeResultScale(target, payload.scale ?? payload.value, api);
        case 'showNativeMemberResult':
          return showNativeMemberResult(target, payload.memberId || payload.id, api);
        case 'nativeClearPage':
        case 'nativeSelectTool':
        case 'nativeDrawMember':
        case 'nativeAddColumn':
        case 'nativeSetSupport':
        case 'nativeAddUdl':
        case 'nativeAddNodalLoad':
        case 'nativeMoveNode':
        case 'nativeSelectMember':
        case 'nativeDeleteElement':
          return executeNativeModelerAction(target, action, payload, api);
        case 'loadNativeExample':
          return loadNativeExample(target, api);
        case 'exportNativeBook':
          return exportNativeBook(target, payload, api);
        case 'importNativeBook':
          return importNativeBook(target, payload.book || payload.model || payload, api);
        case 'saveNativeAutosave':
          return saveNativeAutosave(target, payload, api);
        case 'restoreNativeAutosave':
          return restoreNativeAutosave(target, api);
        case 'clickNativeControl':
        case 'setNativeResultToggle':
        case 'setNativeCombo':
        case 'openNativeLoadCombinations':
        case 'openNativeDesignReport':
        case 'runNativeValidation':
          return executeNativeAgentControl(target, action, payload, api);
        case 'runNativePushoverReport':
        case 'showNativeModalReport':
          return executeNativeAdvancedAnalysis(target, action, payload, api);
        case 'runNativeProductAudit':
          return runNativeProductAudit(target, api);
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
    'applyKdsLoadCombinations',
    'applyKdsRuleBasedLoadCombinations',
    'applyDesignBasisLoads',
    'openNativeDetailedReport',
    'openNativeCalculationPackage',
    'setNativeMode',
    'setNativePDeltaEnabled',
    'setNativePDeltaStep',
    'setNativeResultScale',
    'showNativeMemberResult',
    ...NATIVE_MODELER_ACTIONS,
    'loadNativeExample',
    'exportNativeBook',
    'importNativeBook',
    'saveNativeAutosave',
    'restoreNativeAutosave',
    ...NATIVE_AGENT_CONTROL_ACTIONS,
    ...NATIVE_ADVANCED_ACTIONS,
    'runNativeProductAudit',
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
  if (!resultSet.id) resultSet.id = comboId;
  if (resultSet.disp && !resultSet.nodeDisplacements) resultSet.nodeDisplacements = resultSet.disp;
  if (!resultSet.disp && resultSet.nodeDisplacements) resultSet.disp = resultSet.nodeDisplacements;
  if (resultSet.nodeDisplacements && !resultSet.displacements) resultSet.displacements = resultSet.nodeDisplacements;
  if (!resultSet.memberResults) resultSet.memberResults = {};
  if (!resultSet.reactions) resultSet.reactions = {};
  if (!resultSet.unstableMembers) resultSet.unstableMembers = new Set();
  if (Array.isArray(resultSet.unstableMembers)) resultSet.unstableMembers = new Set(resultSet.unstableMembers);
  for (const [memberId, memberResult] of Object.entries(resultSet.memberResults)) {
    normalizeMemberResult(memberResult, memberId, comboId);
  }
  for (const [nodeId, reaction] of Object.entries(resultSet.reactions)) {
    resultSet.reactions[nodeId] = normalizeReactionResult(reaction, nodeId);
  }
  if (resultSet.dmax == null) resultSet.dmax = maxResultDisplacement(resultSet);
  if (resultSet.maxRatio == null) resultSet.maxRatio = maxResultRatio(resultSet);
  if (resultSet.okCount == null || resultSet.ngCount == null) {
    const counts = countMemberChecks(resultSet.memberResults);
    if (resultSet.okCount == null) resultSet.okCount = counts.ok;
    if (resultSet.ngCount == null) resultSet.ngCount = counts.ng;
  }
  if (!resultSet.summary) resultSet.summary = {};
  if (resultSet.summary.maxDisplacement == null) resultSet.summary.maxDisplacement = resultSet.dmax || 0;
  if (resultSet.summary.maxRatio == null) resultSet.summary.maxRatio = resultSet.maxRatio || 0;
  if (resultSet.summary.maxUtilization == null) resultSet.summary.maxUtilization = resultSet.maxRatio || 0;
  resultSet.envelopeSummary = resultSet.summary;
  resultSet.legacyShape = summarizeResultSetCompatibility(resultSet);
}

function normalizeMemberResult(memberResult, memberId, comboId) {
  if (!memberResult || typeof memberResult !== 'object') return;
  if (!memberResult.id) memberResult.id = memberId;
  if (!memberResult.memberId) memberResult.memberId = memberId;
  for (const key of ['N', 'Vy', 'Vz', 'Tq', 'My', 'Mz']) {
    if (!Array.isArray(memberResult[key])) memberResult[key] = [];
  }
  memberResult.values = {
    N: memberResult.N,
    Vy: memberResult.Vy,
    Vz: memberResult.Vz,
    Tq: memberResult.Tq,
    My: memberResult.My,
    Mz: memberResult.Mz,
  };
  memberResult.shear = { y: memberResult.Vy, z: memberResult.Vz };
  memberResult.moments = { y: memberResult.My, z: memberResult.Mz };
  memberResult.axial = memberResult.N;
  if (memberResult.Nmax == null) memberResult.Nmax = maxAbs(memberResult.N);
  if (memberResult.Vymax == null) memberResult.Vymax = maxAbs(memberResult.Vy);
  if (memberResult.Vzmax == null) memberResult.Vzmax = maxAbs(memberResult.Vz);
  if (memberResult.Tmax == null) memberResult.Tmax = maxAbs(memberResult.Tq);
  if (memberResult.Mymax == null) memberResult.Mymax = maxAbs(memberResult.My);
  if (memberResult.Mzmax == null) memberResult.Mzmax = maxAbs(memberResult.Mz);
  if (memberResult.dmaxM == null) memberResult.dmaxM = maxShapeDisplacement(memberResult.shape);
  memberResult.deflection = {
    ...(memberResult.deflection || {}),
    dmax: memberResult.dmaxM || 0,
    max: memberResult.dmaxM || 0,
  };
  if (!memberResult.check) memberResult.check = {};
  const ratio = finiteNumber(memberResult.check.ratio, memberResult.utilization, 0);
  memberResult.check.ratio = ratio;
  if (memberResult.check.ok == null) memberResult.check.ok = ratio <= 1;
  if (!memberResult.check.status) memberResult.check.status = memberResult.check.ok ? 'OK' : 'NG';
  if (!memberResult.check.comboId) memberResult.check.comboId = comboId;
  memberResult.utilization = ratio;
  memberResult.maxRatio = ratio;
  memberResult.status = memberResult.check.status;
  memberResult.governingRatio = ratio;
  memberResult.governingType = memberResult.check.governing || memberResult.check.id || null;
  memberResult.governingComboId = memberResult.check.comboId || comboId;
}

function normalizeReactionResult(reaction, nodeId) {
  if (!reaction || typeof reaction !== 'object') {
    reaction = {};
  } else if (Array.isArray(reaction)) {
    reaction = {
      rx: reaction[0],
      ry: reaction[1],
      rz: reaction[2],
      rmx: reaction[3],
      rmy: reaction[4],
      rmz: reaction[5],
    };
  }
  if (!reaction.id) reaction.id = nodeId;
  if (!reaction.nodeId) reaction.nodeId = nodeId;
  for (const key of ['rx', 'ry', 'rz', 'rmx', 'rmy', 'rmz']) {
    if (reaction[key] == null) reaction[key] = 0;
  }
  reaction.values = [reaction.rx, reaction.ry, reaction.rz, reaction.rmx, reaction.rmy, reaction.rmz];
  reaction.force = { x: reaction.rx, y: reaction.ry, z: reaction.rz };
  reaction.moment = { x: reaction.rmx, y: reaction.rmy, z: reaction.rmz };
  reaction.RMx = reaction.rmx;
  reaction.RMy = reaction.rmy;
  reaction.RMz = reaction.rmz;
  return reaction;
}

function buildLegacyResultShapeSummary(analysis) {
  const active = analysis?.envelope || Object.values(analysis?.byCombo || {})[0] || null;
  return {
    version: INDEX_LEGACY_RESULT_SHAPE_VERSION,
    compatible: !!active && summarizeResultSetCompatibility(active).compatible,
    resultToggles: ['def', 'M', 'Q', 'N', 'react', 'chk', 'design', 'defl'],
    resultIds: [
      ...(analysis?.envelope ? ['ENV'] : []),
      ...Object.keys(analysis?.byCombo || {}),
      ...(analysis?.pDelta?.envelope ? ['PDELTA_ENV'] : []),
    ],
    fields: {
      displacement: ['disp', 'nodeDisplacements', 'displacements'],
      memberForces: ['memberResults.N', 'memberResults.Vy', 'memberResults.Vz', 'memberResults.My', 'memberResults.Mz'],
      reactions: ['reactions.rx', 'reactions.ry', 'reactions.rz', 'reactions.rmx', 'reactions.rmy', 'reactions.rmz'],
      design: ['design.summary', 'design.steel.memberResults', 'design.concrete.memberResults'],
      validation: ['validation.errors', 'validation.warnings'],
    },
  };
}

function summarizeResultSetCompatibility(resultSet) {
  const firstMember = Object.values(resultSet?.memberResults || {})[0] || null;
  const firstReaction = Object.values(resultSet?.reactions || {})[0] || null;
  const checks = {
    displacements: !!(resultSet?.disp && resultSet?.nodeDisplacements && resultSet?.displacements),
    memberForces: !!(
      firstMember
      && Array.isArray(firstMember.N)
      && Array.isArray(firstMember.Vy)
      && Array.isArray(firstMember.Vz)
      && Array.isArray(firstMember.My)
      && Array.isArray(firstMember.Mz)
    ),
    reactions: !!(
      firstReaction
      && firstReaction.values
      && firstReaction.force
      && firstReaction.moment
    ),
    designChecks: !!(firstMember?.check && firstMember.status && firstMember.utilization != null),
    summary: !!(resultSet?.summary && resultSet.summary.maxDisplacement != null && resultSet.summary.maxRatio != null),
  };
  return {
    version: INDEX_LEGACY_RESULT_SHAPE_VERSION,
    comboId: resultSet?.comboId || null,
    compatible: Object.values(checks).every(Boolean),
    checks,
  };
}

function maxResultDisplacement(resultSet) {
  let max = 0;
  for (const value of Object.values(resultSet?.disp || resultSet?.nodeDisplacements || {})) {
    if (Array.isArray(value)) max = Math.max(max, vectorNorm(value.slice(0, 3)));
  }
  for (const memberResult of Object.values(resultSet?.memberResults || {})) {
    max = Math.max(max, finiteNumber(memberResult?.dmaxM, 0));
  }
  return max;
}

function maxResultRatio(resultSet) {
  let max = 0;
  for (const memberResult of Object.values(resultSet?.memberResults || {})) {
    max = Math.max(max, finiteNumber(memberResult?.check?.ratio, memberResult?.utilization, 0));
  }
  return max;
}

function countMemberChecks(memberResults) {
  const counts = { ok: 0, ng: 0 };
  for (const memberResult of Object.values(memberResults || {})) {
    if (memberResult?.check?.ok) counts.ok += 1;
    else counts.ng += 1;
  }
  return counts;
}

function maxShapeDisplacement(shape) {
  if (!Array.isArray(shape)) return 0;
  let max = 0;
  for (const point of shape) {
    if (Array.isArray(point)) max = Math.max(max, vectorNorm(point.slice(0, 3)));
    else if (point && typeof point === 'object') max = Math.max(max, vectorNorm([point.x, point.y, point.z]));
  }
  return max;
}

function maxAbs(values) {
  return Math.max(0, ...values.map((value) => Math.abs(Number(value) || 0)));
}

function vectorNorm(values) {
  return Math.hypot(...values.map((value) => Number(value) || 0));
}

function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
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
  target.SStructuresNativeResultControls?.setPDeltaStep?.(step);
  target.SStructuresResultsPanel?.setPDeltaStep?.(step);
  return api.getSnapshot();
}

function setNativePDeltaEnabled(target, enabled, api) {
  if (!target.SStructuresNativeResultControls?.setPDeltaEnabled) throw new Error('Native result controls are not available.');
  target.SStructuresNativeResultControls.setPDeltaEnabled(enabled);
  return api.getSnapshot();
}

function setNativePDeltaStep(target, step, api) {
  if (!target.SStructuresNativeResultControls?.setPDeltaStep) throw new Error('Native result controls are not available.');
  target.SStructuresNativeResultControls.setPDeltaStep(step);
  return api.getSnapshot();
}

function setNativeResultScale(target, scale, api) {
  if (!target.SStructuresNativeResultControls?.setResultScale) throw new Error('Native result controls are not available.');
  target.SStructuresNativeResultControls.setResultScale(scale);
  return api.getSnapshot();
}

function showNativeMemberResult(target, memberId, api) {
  if (!target.SStructuresNativeResultControls?.showMemberResult) throw new Error('Native result controls are not available.');
  target.SStructuresNativeResultControls.showMemberResult(memberId);
  return api.getSnapshot();
}

function executeNativeModelerAction(target, action, payload, api) {
  if (!target.SStructuresNativeModeler?.execute) throw new Error('Native modeler is not available.');
  const nativeResult = target.SStructuresNativeModeler.execute(action, payload);
  return {
    ...api.getSnapshot(),
    nativeActionResult: nativeResult.actionResult,
  };
}

function loadNativeExample(target, api) {
  if (!target.SStructuresNativePersistence?.loadExample) throw new Error('Native persistence is not available.');
  const persistence = target.SStructuresNativePersistence.loadExample();
  return {
    ...api.getSnapshot(),
    persistence,
  };
}

function exportNativeBook(target, payload, api) {
  if (!target.SStructuresNativePersistence?.exportBook) throw new Error('Native persistence is not available.');
  const productBook = target.SStructuresNativePersistence.exportBook(payload);
  return {
    ...api.getSnapshot(),
    productBook,
  };
}

function importNativeBook(target, payload, api) {
  if (!target.SStructuresNativePersistence?.importBook) throw new Error('Native persistence is not available.');
  const persistence = target.SStructuresNativePersistence.importBook(payload);
  return {
    ...api.getSnapshot(),
    persistence,
  };
}

function saveNativeAutosave(target, payload, api) {
  if (!target.SStructuresNativePersistence?.saveAutosave) throw new Error('Native persistence is not available.');
  const persistence = target.SStructuresNativePersistence.saveAutosave(payload);
  return {
    ...api.getSnapshot(),
    persistence,
  };
}

function restoreNativeAutosave(target, api) {
  if (!target.SStructuresNativePersistence?.restoreAutosave) throw new Error('Native persistence is not available.');
  const persistence = target.SStructuresNativePersistence.restoreAutosave();
  return {
    ...api.getSnapshot(),
    persistence,
  };
}

function executeNativeAgentControl(target, action, payload, api) {
  if (!target.SStructuresNativeAgentControls?.execute) throw new Error('Native agent controls are not available.');
  const nativeControl = target.SStructuresNativeAgentControls.execute(action, payload);
  return {
    ...api.getSnapshot(),
    nativeControlResult: nativeControl.actionResult,
  };
}

function executeNativeAdvancedAnalysis(target, action, payload, api) {
  if (!target.SStructuresNativeAdvancedAnalysis) throw new Error('Native advanced analysis is not available.');
  const advanced = action === 'runNativePushoverReport'
    ? target.SStructuresNativeAdvancedAnalysis.runPushoverReport(payload)
    : target.SStructuresNativeAdvancedAnalysis.showModalReport(payload);
  return {
    ...api.getSnapshot(),
    advanced,
  };
}

function runNativeProductAudit(target, api) {
  if (!target.SStructuresProductHardening?.runAudit) throw new Error('Product hardening audit is not available.');
  const audit = target.SStructuresProductHardening.runAudit();
  return {
    ...api.getSnapshot(),
    audit,
  };
}

function applyKdsLoadCombinationsToModel(target, bridge, model, options = {}) {
  const generated = options.ruleBased
    ? createKdsRuleBasedLoadCombinations(model, options)
    : createKdsLoadCombinations(model, options);
  const append = options.append === true && options.replace !== true;
  if (append) {
    model.loadCombinations ||= [];
    const used = new Set(model.loadCombinations.map((combo) => combo.id));
    for (const combo of generated) {
      const copy = { ...combo, factors: { ...combo.factors } };
      copy.id = uniqueCombinationId(copy.id, used);
      used.add(copy.id);
      model.loadCombinations.push(copy);
    }
  } else {
    model.loadCombinations = generated.map((combo) => ({ ...combo, factors: { ...combo.factors } }));
  }
  if (typeof target?.reanalyze === 'function') target.reanalyze(true);
  else bridge?.analyzeModel?.(model);
  return {
    version: 'm35-kds-load-combination-apply',
    ruleBased: !!options.ruleBased,
    mode: append ? 'append' : 'replace',
    appliedCount: generated.length,
    combinationIds: (model.loadCombinations || []).map((combo) => combo.id),
    coverage: options.ruleBased ? summarizeKdsLoadCombinationRules(model, options) : summarizeKdsLoadCombinationCoverage(model),
  };
}

function installDetailedReportMenuHook(target, bridge) {
  const doc = target?.document;
  const button = doc?.getElementById?.('mDesignReport');
  if (!button?.addEventListener) return null;
  button.addEventListener('click', () => {
    try {
      showDetailedReport(target, bridge, { source: 'native-menu' });
    } catch (error) {
      console.warn('[S-Structures] Detailed report failed.', error);
    }
  });
  return {
    version: 'm36-detailed-report-menu-hook',
    controlId: 'mDesignReport',
  };
}

function installCalculationPackageMenuHook(target, bridge) {
  const doc = target?.document;
  if (!doc?.createElement) return null;
  const menu = doc.getElementById?.('menuDrop');
  if (!menu?.appendChild) return null;
  let button = doc.getElementById?.('mCalculationPackage');
  if (!button) {
    button = doc.createElement('button');
    button.id = 'mCalculationPackage';
    button.setAttribute?.('id', 'mCalculationPackage');
    button.type = 'button';
    button.textContent = 'Calculation Package';
    const after = doc.getElementById?.('mDesignReport');
    if (after?.parentNode === menu && menu.insertBefore) {
      const afterIndex = menu.children?.indexOf?.(after) ?? -1;
      const before = afterIndex >= 0 ? menu.children[afterIndex + 1] : null;
      menu.insertBefore(button, before || null);
    } else {
      menu.appendChild(button);
    }
  }
  button.setAttribute?.('data-agent-id', 'mCalculationPackage');
  if (!button.getAttribute?.('aria-label')) button.setAttribute?.('aria-label', 'Open calculation package');
  button.addEventListener?.('click', () => {
    try {
      showCalculationPackage(target, bridge, { source: 'native-menu' });
    } catch (error) {
      console.warn('[S-Structures] Calculation package failed.', error);
    }
  });
  return {
    version: 'm43-calculation-package-menu-hook',
    controlId: 'mCalculationPackage',
  };
}

function openNativeDetailedReport(target, bridge, api, payload = {}) {
  const detailedReport = showDetailedReport(target, bridge, payload);
  return {
    ...api.getSnapshot(),
    detailedReport,
  };
}

function openNativeCalculationPackage(target, bridge, api, payload = {}) {
  const calculationPackage = showCalculationPackage(target, bridge, payload);
  return {
    ...api.getSnapshot(),
    calculationPackage,
  };
}

function showDetailedReport(target, bridge, options = {}) {
  const report = bridge?.getDetailedReport?.(options);
  if (!report) throw new Error('Detailed report is not available.');
  target.SStructuresDetailedReport = report;
  const doc = target?.document;
  const body = doc?.getElementById?.('reportBody');
  if (body) body.innerHTML = report.html;
  const modal = doc?.getElementById?.('reportModal');
  modal?.classList?.add?.('show');
  return {
    version: report.data?.version || null,
    title: report.data?.title || null,
    htmlLength: report.html?.length || 0,
    memberCheckCount: report.data?.memberChecks?.length || 0,
    actionItemCount: report.data?.actionItems?.length || 0,
    modalOpen: !!modal?.classList?.contains?.('show'),
  };
}

function showCalculationPackage(target, bridge, options = {}) {
  const report = bridge?.getCalculationPackage?.(options);
  if (!report) throw new Error('Calculation package is not available.');
  target.SStructuresCalculationPackage = report;
  const doc = target?.document;
  const body = doc?.getElementById?.('reportBody');
  if (body) body.innerHTML = report.html;
  const modal = doc?.getElementById?.('reportModal');
  modal?.classList?.add?.('show');
  return {
    version: report.data?.version || null,
    title: report.data?.title || null,
    htmlLength: report.html?.length || 0,
    sectionCount: report.data?.sections?.length || 0,
    auditOk: !!report.data?.qualityAudit?.ok,
    modalOpen: !!modal?.classList?.contains?.('show'),
  };
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
  if (type === 'member') target.SStructuresNativeResultControls?.showMemberResult?.(id);
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

function uniqueCombinationId(baseId, usedIds) {
  let id = baseId;
  let index = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }
  return id;
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
    'mCalculationPackage',
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
