import {
  analyzeModel as analyzeCoreModel,
  applyDesignBasisLoads as applyDesignBasisLoadsToModel,
  buildAdvancedElasticTrace,
  buildCombinationEnvelopeContract,
  buildDesignDemandPackage,
  buildEccentricStoryLoadDistribution,
  buildDiaphragmSummary,
  buildMemberReleaseSummary,
  buildStoryMassSummary,
  buildStorySummary,
  buildPracticePlatformReadiness,
  buildPracticeValidationReport,
  buildPilotProjectValidation,
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
import {
  createAnalysisCase,
  normalizeAnalysisCase,
} from '../core/analysisCase.js';
import {
  runAnalysisCase as runCoreAnalysisCase,
  runAnalysisCases as runCoreAnalysisCases,
} from './analysisRunners.js';
import {
  ensurePhase7AnalysisState,
  findPhase7AnalysisRun,
  getPhase7AnalysisRunStore,
  getPhase7LatestAttempts,
  phase7DesignTransferDecision,
  phase7ModelHash,
  recordPhase7AnalysisAttempt,
} from './phase7AnalysisRecords.js';
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
import {
  installIndexAnalysisCenter,
  markAnalysisCenterCasesStale,
} from './indexAnalysisCenter.js';
import { installIndexFloatingPanels } from './indexFloatingPanels.js';
import { installIndexProductHardening } from './indexProductHardening.js';
import { installIndexAgentCommandBridge } from './indexAgentCommandBridge.js';
import { installIndexRuntimeAdapter } from './indexRuntimeAdapter.js';
import { installElasticSetupWorkflow } from './indexElasticSetupWorkflow.js';
import { installElasticResultPopup } from './indexElasticResultPopup.js';
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

  ensurePhase7AnalysisState(target);
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
      return createDetailedHtmlReport(model, lastResult || analyzeForIndex(model), withAnalysisResults(target, options));
    },
    getCalculationPackage(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return createCalculationPackageHtml(model, lastResult || analyzeForIndex(model), withAnalysisResults(target, options));
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
    getCombinationEnvelopeContract(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildCombinationEnvelopeContract(model, lastResult || analyzeForIndex(model), options);
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
    getDesignDemandPackage(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      if (options.analysisCaseId || options.caseId || options.runRecordId || options.recordId) {
        const transfer = bridge.transferAnalysisResultToDesign(options);
        return transfer.ok ? transfer.demandPackage : transfer;
      }
      return buildDesignDemandPackage(model, lastResult || analyzeForIndex(model), options);
    },
    getPracticePlatformReadiness(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildPracticePlatformReadiness(model, lastResult || analyzeForIndex(model), options);
    },
    getPracticeValidationReport(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildPracticeValidationReport(model, lastResult || analyzeForIndex(model), options);
    },
    getPilotProjectValidation(options = {}) {
      return buildPilotProjectValidation(options);
    },
    getServiceabilityDriftReport(options = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildServiceabilityDriftReport(model, lastResult || analyzeForIndex(model), options);
    },
    getAdvancedElasticTrace() {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      return buildAdvancedElasticTrace(model, lastResult || analyzeForIndex(model));
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
    getAnalysisCases() {
      const model = bridge.getCurrentModel();
      return model?.analysisCases || [];
    },
    addAnalysisCase(input = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      model.analysisCases ||= [];
      const analysisCase = createAnalysisCase(input, model.analysisCases);
      model.analysisCases.push(analysisCase);
      return analysisCase;
    },
    updateAnalysisCase(id, patch = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      model.analysisCases ||= [];
      const index = model.analysisCases.findIndex((item) => item.id === id);
      if (index < 0) return null;
      model.analysisCases[index] = normalizeAnalysisCase({ ...model.analysisCases[index], ...patch }, index);
      return model.analysisCases[index];
    },
    deleteAnalysisCase(id) {
      const model = bridge.getCurrentModel();
      if (!model?.analysisCases) return null;
      const index = model.analysisCases.findIndex((item) => item.id === id);
      if (index < 0) return null;
      const [removed] = model.analysisCases.splice(index, 1);
      if (target.__SStructuresAnalysisResults) delete target.__SStructuresAnalysisResults[id];
      if (target.SStructuresResultSelection?.getState?.().activeCaseId === id) {
        target.SStructuresResultSelection.set({ activeCaseId: null, activeResultId: null, modeOrStep: null }, 'analysis-case-delete');
      }
      return removed;
    },
    runAnalysisCase(input = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return null;
      const analysisCase = resolveAnalysisCase(model, input);
      const result = runCoreAnalysisCase(model, analysisCase, { bridge });
      return storeAnalysisResult(target, model, analysisCase, result);
    },
    runAnalysisCases(input = {}) {
      const model = bridge.getCurrentModel();
      if (!model) return [];
      const cases = Array.isArray(input) ? input : (input.cases || model.analysisCases || []);
      const results = runCoreAnalysisCases(model, cases, { bridge });
      return results.map((result) => {
        const analysisCase = (model.analysisCases || []).find((item) => item.id === result.caseId) || { id: result.caseId, kind: result.kind };
        return storeAnalysisResult(target, model, analysisCase, result);
      });
    },
    getAnalysisResults() {
      return target.__SStructuresAnalysisResults || {};
    },
    getAnalysisCaseResult(id, options = {}) {
      if (options.latestAttempt || options.attempt === 'latest') {
        return (target.__SStructuresAnalysisLatestAttempts || {})[id] || null;
      }
      if (options.runRecordId || options.recordId) {
        const record = findPhase7AnalysisRun(target, options);
        return record ? {
          ...record.result,
          runRecordId: record.id,
          qualification: record.qualification,
          designTransferAllowed: record.designTransferAllowed,
          analysisProvenance: record.provenance,
        } : null;
      }
      return (target.__SStructuresAnalysisResults || {})[id] || null;
    },
    getAnalysisLatestAttempts() {
      return getPhase7LatestAttempts(target);
    },
    getAnalysisLatestAttempt(id) {
      return (target.__SStructuresAnalysisLatestAttempts || {})[id] || null;
    },
    getAnalysisRunStore() {
      return getPhase7AnalysisRunStore(target);
    },
    getAnalysisRunRecord(input = {}) {
      return findPhase7AnalysisRun(target, input);
    },
    getResultSelectionStore() {
      return target.SStructuresResultSelection;
    },
    getResultSelection() {
      return target.SStructuresResultSelection?.getState?.() || null;
    },
    setResultSelection(patch = {}, source = 'bridge') {
      return target.SStructuresResultSelection?.set?.(patch, source) || null;
    },
    selectResultEntity(type, id, source = 'bridge') {
      return target.SStructuresResultSelection?.selectEntity?.(type, id, source) || null;
    },
    canTransferAnalysisResultToDesign(input = {}) {
      return phase7DesignTransferDecision(target, input);
    },
    transferAnalysisResultToDesign(input = {}) {
      const decision = phase7DesignTransferDecision(target, input);
      if (!decision.allowed) return { ...decision, changed: false, demandPackage: null };
      const model = bridge.getCurrentModel();
      if (!model) return { ok: false, allowed: false, changed: false, code: 'MODEL_NOT_AVAILABLE', demandPackage: null };
      const sourceResult = decision.record.result?.payload || decision.record.result;
      const demandPackage = buildDesignDemandPackage(model, sourceResult, {
        ...(input.options || input),
        analysisRunRecord: decision.record,
      });
      return {
        ...decision,
        ok: true,
        changed: false,
        runRecordId: decision.record.id,
        demandPackage,
      };
    },
    markAnalysisCasesStale(reason = 'model-changed') {
      const changed = markAnalysisCenterCasesStale(target, bridge, reason);
      target.SStructuresAnalysisCenter?.refresh?.();
      return changed;
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
    bridge.analysisCenter = installIndexAnalysisCenter(target, { bridge });
    bridge.elasticSetupWorkflow = installElasticSetupWorkflow(target, { bridge });
    bridge.floatingPanels = installIndexFloatingPanels(target);
    bridge.elasticResultPopup = installElasticResultPopup(target, { bridge });
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

function resolveAnalysisCase(model, input = {}) {
  if (typeof input === 'string') {
    const found = (model.analysisCases || []).find((item) => item.id === input);
    if (!found) throw new Error(`Analysis case not found: ${input}`);
    return found;
  }
  const id = input.id || input.caseId;
  if (id) {
    const found = (model.analysisCases || []).find((item) => item.id === id);
    if (found) return { ...found, ...(input.patch || {}) };
  }
  return normalizeAnalysisCase(input.analysisCase || input);
}

function storeAnalysisResult(target, model, analysisCase, result) {
  const recorded = recordPhase7AnalysisAttempt(target, model, analysisCase, result);
  const published = recorded.result;
  const row = (model.analysisCases || []).find((item) => item.id === result.caseId);
  const status = analysisCaseStatus(published);
  if (row) {
    row.status = status;
    row.lastRun = {
      at: published.completedAt,
      status: published.status,
      summary: published.summary,
      resultKey: recorded.record.id,
      qualification: recorded.record.qualification,
      designTransferAllowed: recorded.record.designTransferAllowed,
      retainedSuccessfulResult: Boolean(recorded.retainedResult),
    };
  } else if (analysisCase?.id) {
    model.analysisCases ||= [];
    model.analysisCases.push({
      ...analysisCase,
      status,
      lastRun: {
        at: published.completedAt,
        status: published.status,
        summary: published.summary,
        resultKey: recorded.record.id,
        qualification: recorded.record.qualification,
        designTransferAllowed: recorded.record.designTransferAllowed,
        retainedSuccessfulResult: Boolean(recorded.retainedResult),
      },
    });
  }
  target.SStructuresAnalysisCenter?.refresh?.();
  return published;
}

function withAnalysisResults(target, options = {}) {
  const currentModel = target.SStructuresEngine?.getCurrentModel?.()
    || (typeof target.model === 'function' ? target.model() : null);
  return {
    ...options,
    analysisResults: options.analysisResults || options.analysisCaseResults || target.__SStructuresAnalysisResults || {},
    analysisRunStore: options.analysisRunStore || getPhase7AnalysisRunStore(target),
    analysisLatestAttempts: options.analysisLatestAttempts || getPhase7LatestAttempts(target),
    resultSelection: options.resultSelection || target.SStructuresResultSelection?.getState?.() || null,
    currentModelHash: options.currentModelHash || (currentModel ? phase7ModelHash(currentModel) : null),
  };
}

function analysisCaseStatus(result = {}) {
  if (result.status === 'failed') return 'failed';
  if (['review-required', 'preliminary', 'designBlocked'].includes(result.status)) return result.status;
  if (result.designBlocked === true || result.payload?.designBlocked === true) return 'designBlocked';
  if (result.qualification === 'preliminary') return 'preliminary';
  return 'ok';
}

if (typeof window !== 'undefined') {
  installIndexEngineBridge(window);
}
