import {
  analyzeModel as analyzeCoreModel,
  applyDesignBasisLoads as applyDesignBasisLoadsToModel,
  buildEccentricStoryLoadDistribution,
  buildDiaphragmSummary,
  buildMemberReleaseSummary,
  buildStoryMassSummary,
  buildStorySummary,
  buildDesignBasisInputState,
  buildKdsLoadStandardAudit,
  buildConnectionFoundationReport,
  buildMemberDesignTraceReport,
  buildRcDetailingReport,
  buildResultPostprocessing,
  buildServiceabilityDriftReport,
  buildSteelDetailingReport,
  createCalculationPackageHtml,
  createDetailedHtmlReport,
  createHtmlReport,
  estimateModelLoads,
  getKdsLoadStandardRegistry as getCoreKdsLoadStandardRegistry,
  migrateToV3,
  runMemberReleaseBenchmark,
  runRigidDiaphragmBenchmark,
  runPushover as runCorePushover,
  summarizeKdsLoadCombinationCoverage,
  summarizeKdsLoadCombinationRules,
  validateModel as validateCoreModel,
} from '../index.js';
import { installIndexResultsPanel } from './indexResultsPanel.js';
import { installIndexPushoverPanel } from './indexPushoverPanel.js';
import { buildIndexResultVisuals } from './indexResultVisuals.js';
import { installIndexResultOverlay } from './indexResultOverlay.js';
import { installIndexNativeRibbon } from './indexNativeRibbon.js';
import { installIndexNativeResultControls } from './indexNativeResultControls.js';
import { installIndexNativeModeler } from './indexNativeModeler.js';
import { installIndexNativePersistence } from './indexNativePersistence.js';
import { installIndexNativeAgentControls } from './indexNativeAgentControls.js';
import { installIndexNativeAdvancedAnalysis } from './indexNativeAdvancedAnalysis.js';
import { installIndexProductHardening } from './indexProductHardening.js';
import { installIndexAgentCommandBridge } from './indexAgentCommandBridge.js';
import { installIndexRuntimeAdapter } from './indexRuntimeAdapter.js';
import { buildAgentManifest } from './agentManifest.js';
import { normalizeIndexResult } from './indexResultCompatibility.js';
import { decorateAgentControls, listAgentControls } from './indexAgentControlsDom.js';
import {
  applyKdsLoadCombinationsToModel,
  availableAgentActions,
  createIndexAgentApi,
} from './indexAgentApi.js';
import {
  installCalculationPackageMenuHook,
  installDetailedReportMenuHook,
} from './indexReportHooks.js';

export const INDEX_BRIDGE_VERSION = 'm9-index-engine-bridge';
export { INDEX_LEGACY_RESULT_SHAPE_VERSION, normalizeIndexResult } from './indexResultCompatibility.js';
export { decorateAgentControls, listAgentControls } from './indexAgentControlsDom.js';
export { createIndexAgentApi } from './indexAgentApi.js';

export function analyzeForIndex(inputModel, options = {}) {
  const model = migrateToV3(inputModel);
  const result = analyzeCoreModel(model);
  return normalizeIndexResult(
    result,
    { requestedAt: options.requestedAt || new Date().toISOString() },
    { bridgeVersion: INDEX_BRIDGE_VERSION },
  );
}

export function validateForIndex(inputModel) {
  return validateCoreModel(migrateToV3(inputModel));
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
    getDesignBasisInput(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildDesignBasisInputState(model, options.designBasis || options);
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
    getMemberDesignTraceReport(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildMemberDesignTraceReport(model, lastResult || analyzeForIndex(model), options);
    },
    getServiceabilityDriftReport(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildServiceabilityDriftReport(model, lastResult || analyzeForIndex(model), options);
    },
    getResultPostprocessing(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildResultPostprocessing(model, lastResult || analyzeForIndex(model), options);
    },
    getStorySummary() {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildStorySummary(model);
    },
    getStoryMassSummary() {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildStoryMassSummary(model);
    },
    getEccentricStoryLoadDistribution(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildEccentricStoryLoadDistribution(model, options);
    },
    getMemberReleaseSummary() {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildMemberReleaseSummary(model);
    },
    getMemberReleaseBenchmark() {
      return runMemberReleaseBenchmark();
    },
    getDiaphragmSummary() {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildDiaphragmSummary(model);
    },
    getRigidDiaphragmBenchmark() {
      return runRigidDiaphragmBenchmark();
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
      return target.__SStructuresAgentState || null;
    },
    reanalyze() {
      if (typeof target.reanalyze === 'function') target.reanalyze(true);
      return lastResult;
    },
  };

  target.analyzeModel = bridge.analyzeModel;
  target.validateModel = bridge.validateModel;
  target.SStructuresEngine = bridge;
  target.SStructuresAgent = createIndexAgentApi(target, bridge, {
    bridgeVersion: INDEX_BRIDGE_VERSION,
    analyzeForIndex,
  });
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

if (typeof window !== 'undefined') {
  installIndexEngineBridge(window);
}
