import {
  analyzeModel as analyzeCoreModel,
  applyDesignBasisLoads as applyDesignBasisLoadsToModel,
  buildAdvancedElasticTrace,
  buildBaselineContract,
  buildLibraryAudit,
  buildCombinationEnvelopeContract,
  buildDesignDemandPackage,
  buildEccentricStoryLoadDistribution,
  buildDiaphragmSummary,
  buildMemberReleaseSummary,
  buildNonlinearAnalysisTrace,
  buildPracticePlatformReadiness,
  buildPracticeValidationReport,
  buildPilotProjectValidation,
  buildStoryMassSummary,
  buildStorySummary,
  buildDesignBasisInputState,
  buildKdsLoadStandardAudit,
  buildConnectionFoundationReport,
  buildMemberDesignTraceReport,
  buildWallSlabEquivalentTrace,
  buildP3DetailedDesignReport,
  buildP3IntegratedResults,
  buildLaunchReadinessReport,
  buildPhase3DesignMilestoneReview,
  buildPhase3DrawingImportValidationReview,
  buildPhase3EngineeringValidationReview,
  buildPhase3ElasticMilestoneReview,
  buildPhase3ImportMilestoneReview,
  buildPhase3NonlinearMilestoneReview,
  buildPhase3PlanAlignmentReport,
  buildPhase3PointCloudValidationReview,
  buildPhase3PracticeValidationReview,
  buildPhase3ProductizationMilestoneReview,
  buildPhase3OwnerSignoffReview,
  buildPhase3CompletionAuditReview,
  buildPhase3EvidenceRegister,
  buildRcDetailedDesignReport,
  buildRcDetailingReport,
  getLibraryItem as getCoreLibraryItem,
  buildResultPostprocessing,
  buildServiceabilityDriftReport,
  buildSteelDetailingReport,
  listLibrary as listCoreLibrary,
  buildLoadsV2Trace,
  buildCqcCombinationReport,
  createCalculationPackageHtml,
  createDetailedHtmlReport,
  createHtmlReport,
  createKdsLoadCombinations,
  createKdsRuleBasedLoadCombinations,
  estimateModelLoads,
  estimateMemberEulerBuckling,
  estimateModelBucklingTrace,
  expandAdvancedLoads,
  getKdsLoadStandardRegistry as getCoreKdsLoadStandardRegistry,
  migrateToV3,
  runMemberReleaseBenchmark,
  runLinearSdofTha,
  runModalSuperpositionTha,
  runRigidDiaphragmBenchmark,
  runPushover as runCorePushover,
  setDesignBasisInput,
  summarizeSemiRigidDiaphragm,
  summarizeKdsLoadCombinationCoverage,
  summarizeKdsLoadCombinationRules,
  upsertMaterial as upsertCoreMaterial,
  upsertSection as upsertCoreSection,
} from '../index.js';
import { buildAgentManifest } from './agentManifest.js';
import {
  executeModelingAction,
  ensureAgentState,
  MODELING_ACTIONS,
} from './indexAgentActions.js';
import {
  buildIndexResultViewModel,
} from './indexResultsPanel.js';
import {
  buildIndexResultVisuals,
} from './indexResultVisuals.js';
import { listAgentControls } from './indexAgentControlsDom.js';
import { availableAgentActions } from './indexAgentActionCatalog.js';
import {
  buildAgentScreenState,
  buildAgentSnapshot,
} from './indexAgentSnapshot.js';
import {
  openNativeCalculationPackage,
  openNativeDetailedReport,
} from './indexReportHooks.js';
import { normalizeIndexResult } from './indexResultCompatibility.js';

const DEFAULT_BRIDGE_VERSION = 'm9-index-engine-bridge';

export function createIndexAgentApi(target = globalThis, bridge = target?.SStructuresEngine, options = {}) {
  const bridgeVersion = options.bridgeVersion || DEFAULT_BRIDGE_VERSION;
  const analyzeForIndex = options.analyzeForIndex || ((model) => normalizeIndexResult(
    analyzeCoreModel(migrateToV3(model)),
    { requestedAt: new Date().toISOString() },
    { bridgeVersion },
  ));
  const getAnalysis = (model) => bridge?.getLastResult?.() || analyzeForIndex(model);
  const api = {
    version: bridgeVersion,
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
      return buildAgentSnapshot(target, {
        version: bridgeVersion,
        model,
        analysis,
        resultView,
        resultVisuals,
        agentState,
      });
    },
    getScreenState() {
      return cloneJson(buildAgentScreenState(target));
    },
    getResults() {
      const model = getCurrentModel(target);
      return cloneJson(model ? getAnalysis(model) : null);
    },
    getResultView() {
      const model = getCurrentModel(target);
      return cloneJson(buildIndexResultViewModel(
        model,
        model ? getAnalysis(model) : null,
        target.SStructuresResultsPanel?.state || {},
      ));
    },
    getResultVisuals(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildIndexResultVisuals(model, getAnalysis(model), options));
    },
    getReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(createHtmlReport(model, getAnalysis(model), options));
    },
    getDetailedReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(createDetailedHtmlReport(model, getAnalysis(model), options));
    },
    getCalculationPackage(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(createCalculationPackageHtml(model, getAnalysis(model), options));
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
    getCombinationEnvelopeContract(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildCombinationEnvelopeContract(model, getAnalysis(model), options));
    },
    getDesignBasisLoadEstimation(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(model.loadEstimation || estimateModelLoads(model, options.designBasis || options, { generateLoads: false }));
    },
    getDesignBasisInput(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildDesignBasisInputState(model, options.designBasis || options));
    },
    getRcDetailingReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildRcDetailingReport(model, getAnalysis(model), options));
    },
    getRcDetailedDesignReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildRcDetailedDesignReport(model, getAnalysis(model), options));
    },
    getSteelDetailingReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildSteelDetailingReport(model, getAnalysis(model), options));
    },
    getP3DetailedDesignReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildP3DetailedDesignReport(model, getAnalysis(model), options));
    },
    getP3IntegratedResults(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildP3IntegratedResults(model, getAnalysis(model), options));
    },
    getLaunchReadinessReport(options = {}) {
      return cloneJson(buildLaunchReadinessReport(buildLaunchEvidence(target, options)));
    },
    getPhase3PlanAlignment() {
      return cloneJson(buildPhase3PlanAlignmentReport(buildAgentManifest({
        bridgeVersion,
        availableActions: availableAgentActions(),
        controls: target.document ? listAgentControls(target.document) : [],
      })));
    },
    getPhase3ImportMilestoneReview() {
      return cloneJson(buildPhase3ImportMilestoneReview());
    },
    getPhase3ElasticMilestoneReview() {
      return cloneJson(buildPhase3ElasticMilestoneReview());
    },
    getPhase3NonlinearMilestoneReview() {
      return cloneJson(buildPhase3NonlinearMilestoneReview());
    },
    getPhase3DesignMilestoneReview() {
      return cloneJson(buildPhase3DesignMilestoneReview());
    },
    getPhase3DrawingImportValidationReview(options = {}) {
      return cloneJson(buildPhase3DrawingImportValidationReview(options));
    },
    getPhase3EngineeringValidationReview(options = {}) {
      return cloneJson(buildPhase3EngineeringValidationReview(options));
    },
    getPhase3ProductizationMilestoneReview() {
      return cloneJson(buildPhase3ProductizationMilestoneReview());
    },
    getPhase3OwnerSignoffReview(options = {}) {
      return cloneJson(buildPhase3OwnerSignoffReview(options));
    },
    getPhase3CompletionAuditReview() {
      return cloneJson(buildPhase3CompletionAuditReview());
    },
    getPhase3EvidenceRegister(options = {}) {
      return cloneJson(buildPhase3EvidenceRegister(options));
    },
    listProjectEvidence() {
      return cloneJson(getProjectEvidenceState(target));
    },
    submitProjectEvidence(evidence = {}) {
      const state = getProjectEvidenceState(target);
      state.evidence.push({
        ...evidence,
        status: String(evidence.status || (evidence.accepted ? 'accepted' : 'submitted')).toLowerCase(),
        accepted: evidence.accepted === true || String(evidence.status || '').toLowerCase() === 'accepted',
        recordedAt: evidence.recordedAt || new Date().toISOString(),
      });
      state.register = buildPhase3EvidenceRegister({ evidence: state.evidence });
      return cloneJson(state);
    },
    getPhase3PracticeValidationReview() {
      return cloneJson(buildPhase3PracticeValidationReview());
    },
    getPhase3PointCloudValidationReview(options = {}) {
      return cloneJson(buildPhase3PointCloudValidationReview(options));
    },
    getConnectionFoundationReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildConnectionFoundationReport(model, getAnalysis(model), options));
    },
    getMemberDesignTraceReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildMemberDesignTraceReport(model, getAnalysis(model), options));
    },
    getDesignDemandPackage(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildDesignDemandPackage(model, getAnalysis(model), options));
    },
    getPracticePlatformReadiness(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildPracticePlatformReadiness(model, getAnalysis(model), options));
    },
    getPracticeValidationReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildPracticeValidationReport(model, getAnalysis(model), options));
    },
    getPilotProjectValidation(options = {}) {
      return cloneJson(buildPilotProjectValidation(options));
    },
    getServiceabilityDriftReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildServiceabilityDriftReport(model, getAnalysis(model), options));
    },
    getAdvancedElasticTrace() {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildAdvancedElasticTrace(model, getAnalysis(model)));
    },
    getMaterialSectionRegistry() {
      const model = getCurrentModel(target);
      if (!model) return null;
      const audit = buildLibraryAudit(model);
      return cloneJson({
        version: audit.version,
        audit,
        materials: model.materials || [],
        sections: model.sections || [],
      });
    },
    listLibrary(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(listCoreLibrary(model, options));
    },
    getLibraryItem(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(getCoreLibraryItem(model, options));
    },
    upsertMaterial(record = {}, options = {}) {
      const model = getCurrentModel(target);
      if (!model) throw new Error('Current UI model is not available.');
      const result = upsertCoreMaterial(model, record.record || record.material || record, options);
      if (result.changed) runUiAnalysis(target);
      return cloneJson(result);
    },
    upsertSection(record = {}, options = {}) {
      const model = getCurrentModel(target);
      if (!model) throw new Error('Current UI model is not available.');
      const result = upsertCoreSection(model, record.record || record.section || record, options);
      if (result.changed) runUiAnalysis(target);
      return cloneJson(result);
    },
    getElasticExpansionTrace() {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(expandAdvancedLoads(model.loads || [], model).trace);
    },
    getWallSlabEquivalentTrace() {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildWallSlabEquivalentTrace(model, getAnalysis(model)));
    },
    getLoadsV2Trace(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildLoadsV2Trace(model, options));
    },
    getDynamicCompletenessTrace(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      const analysis = getAnalysis(model);
      const firstCombo = Object.keys(analysis?.byCombo || {})[0];
      const memberResults = analysis?.envelope?.memberResults || analysis?.byCombo?.[firstCombo]?.memberResults || {};
      const buckling = (model.members || []).map((member) => estimateMemberEulerBuckling(member, memberResults[member.id] || { section: {}, material: {} }));
      return cloneJson({
        version: buckling[0]?.version || 'p3-m13-dynamic-completeness',
        buckling,
        bucklingTrace: estimateModelBucklingTrace(model, { results: memberResults }),
        cqc: options.cqcResponses ? buildCqcCombinationReport(options.cqcResponses, options.dampingRatio) : null,
        timeHistory: options.timeHistory ? runLinearSdofTha(options.timeHistory) : null,
        modalTimeHistory: options.modalTimeHistory ? runModalSuperpositionTha(options.modalTimeHistory) : null,
      });
    },
    getNonlinearAnalysisTrace(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildNonlinearAnalysisTrace(model, options));
    },
    getResultPostprocessing(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildResultPostprocessing(model, getAnalysis(model), options));
    },
    getStorySummary() {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildStorySummary(model));
    },
    getStoryMassSummary() {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildStoryMassSummary(model));
    },
    getEccentricStoryLoadDistribution(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildEccentricStoryLoadDistribution(model, options));
    },
    getMemberReleaseSummary() {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildMemberReleaseSummary(model));
    },
    getMemberReleaseBenchmark() {
      return cloneJson(runMemberReleaseBenchmark());
    },
    getDiaphragmSummary() {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildDiaphragmSummary(model));
    },
    getRigidDiaphragmBenchmark() {
      return cloneJson(runRigidDiaphragmBenchmark());
    },
    getRuntimeDiagnostics() {
      return cloneJson(target.SStructuresRuntimeAdapter?.getDiagnostics?.() || null);
    },
    getBaselineContract() {
      return cloneJson(buildBaselineContract(getCurrentModel(target)));
    },
    runPushover(options = {}) {
      const model = getCurrentModel(target);
      if (!model) throw new Error('Current UI model is not available.');
      const result = target.SStructuresPushoverPanel?.run?.(options) || runCorePushover(model, options);
      return cloneJson(result);
    },
    getCapabilities() {
      return cloneJson(buildAgentManifest({
        bridgeVersion,
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
        case 'setDesignBasisInput': {
          const model = getCurrentModel(target);
          if (!model) throw new Error('Current UI model is not available.');
          const designBasisInput = setDesignBasisInput(model, payload.designBasis || payload);
          return {
            ...api.getSnapshot(),
            designBasisInput,
          };
        }
        case 'upsertMaterial':
          return { library: api.upsertMaterial(payload.record || payload.material || payload, payload.options || payload) };
        case 'upsertSection':
          return { library: api.upsertSection(payload.record || payload.section || payload, payload.options || payload) };
        case 'listLibrary':
          return { library: api.listLibrary(payload) };
        case 'getLibraryItem':
          return { library: api.getLibraryItem(payload) };
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

export { availableAgentActions } from './indexAgentActionCatalog.js';

export function applyKdsLoadCombinationsToModel(target, bridge, model, options = {}) {
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

function setAnalysisSetting(target, key, value, api) {
  if (!key) throw new Error('setAnalysisSetting requires a key.');
  const model = getCurrentModel(target);
  if (!model) throw new Error('Current UI model is not available.');
  model.analysisSettings = model.analysisSettings || {};
  model.analysisSettings[key] = value;
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

function getProjectEvidenceState(target) {
  target.__SStructuresProjectEvidence ||= {
    evidence: [],
    register: buildPhase3EvidenceRegister(),
  };
  return target.__SStructuresProjectEvidence;
}

function buildLaunchEvidence(target, options = {}) {
  const supplied = options.evidence || options;
  return {
    practiceValidationReview: buildPhase3PracticeValidationReview(),
    ownerSignoffReview: buildPhase3OwnerSignoffReview(),
    evidenceRegister: getProjectEvidenceState(target).register,
    ...supplied,
  };
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
