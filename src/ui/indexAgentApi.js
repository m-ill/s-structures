import { createWorkflowInputIdentity } from '../core/workflowIdentity.js';
import { stableHash } from '../core/stableHash.js';
import { installResultViewCache, COMPUTED_RESULT_VIEWS } from './resultViewCache.js';
import { migrateToV3 } from '../core/model.js';
import { buildBaselineContract } from '../core/baselineContract.js';
import { buildStorySummary } from '../core/storySummary.js';
import { buildStoryMassSummary } from '../core/storyMassSummary.js';
import { buildDiaphragmSummary } from '../core/diaphragmSummary.js';
import { buildMemberReleaseSummary } from '../core/memberReleaseSummary.js';
import {
  buildKdsLoadStandardAudit,
  createKdsLoadCombinations,
  createKdsRuleBasedLoadCombinations,
  getKdsLoadStandardRegistry as getCoreKdsLoadStandardRegistry,
  summarizeKdsLoadCombinationCoverage,
  summarizeKdsLoadCombinationRules,
} from '../core/kdsLoadCombinations.js';
import {
  applyDesignBasisLoads as applyDesignBasisLoadsToModel,
  buildDesignBasisInputState,
  buildEccentricStoryLoadDistribution,
  estimateModelLoads,
  setDesignBasisInput,
} from '../design/loadEstimation.js';
import { buildConnectionFoundationReport } from '../design/connectionFoundation.js';
import { buildMemberDesignTraceReport } from '../design/memberDesignTrace.js';
import { buildDesignDemandPackage } from '../design/designDemandPackage.js';
import { buildRcDetailedDesignReport } from '../design/rc/detailedReport.js';
import { buildRcDetailingReport } from '../design/rcDetailing.js';
import { buildServiceabilityDriftReport } from '../design/serviceability.js';
import { buildSteelDetailingReport } from '../design/steelDetailing.js';
import { buildP3DetailedDesignReport } from '../design/p3DetailedDesignReport.js';
import { buildAdvancedElasticTrace } from '../results/advancedElasticTrace.js';
import { buildCombinationEnvelopeContract } from '../results/combinationEnvelopeContract.js';
import { buildP3IntegratedResults } from '../results/p3IntegratedResults.js';
import { buildResultPostprocessing } from '../results/resultPostprocessing.js';
import { buildLoadsV2Trace } from '../loads/loadsV2.js';
import {
  buildCqcCombinationReport,
  estimateMemberEulerBuckling,
  estimateModelBucklingTrace,
  runLinearSdofTha,
  runModalSuperpositionTha,
} from '../dynamics/elasticCompleteness.js';
import { buildNonlinearAnalysisTrace } from '../nonlinear/trace.js';
import { assignMemberHinges } from '../nonlinear/hinges/hingeAssign.js';
import { expandAdvancedLoads } from '../solver/elasticExpansion.js';
import {
  buildWallSlabEquivalentTrace,
  summarizeSemiRigidDiaphragm,
} from '../solver/wallSlabEquivalent.js';
import { buildPracticePlatformReadiness } from '../platform/practicePlatformReadiness.js';
import { buildPracticeValidationReport } from '../platform/practiceValidationReport.js';
import { buildPilotProjectValidation } from '../platform/pilotProjectValidation.js';
import { buildLaunchReadinessReport } from '../platform/launchReadiness.js';
import { buildFinalUseReleaseReview } from '../platform/finalUseReleaseReview.js';
import { buildPhase3PlanAlignmentReport } from '../platform/phase3PlanAlignment.js';
import { buildPhase3ImportMilestoneReview } from '../platform/phase3ImportMilestoneReview.js';
import { buildPhase3ElasticMilestoneReview } from '../platform/phase3ElasticMilestoneReview.js';
import { buildPhase3NonlinearMilestoneReview } from '../platform/phase3NonlinearMilestoneReview.js';
import { buildPhase3DesignMilestoneReview } from '../platform/phase3DesignMilestoneReview.js';
import { buildPhase3DrawingImportValidationReview } from '../platform/phase3DrawingImportValidationReview.js';
import { buildPhase3EngineeringValidationReview } from '../platform/phase3EngineeringValidationReview.js';
import { buildPhase3ProductizationMilestoneReview } from '../platform/phase3ProductizationMilestoneReview.js';
import { buildPhase3OwnerSignoffReview } from '../platform/phase3OwnerSignoffReview.js';
import { buildPhase3CompletionAuditReview } from '../platform/phase3CompletionAuditReview.js';
import {
  buildPhase3EvidenceRegister,
  buildPhase3FinalApprovalReview,
  buildPhase3FinalApprovals,
  validatePhase3EvidenceRecord,
} from '../platform/phase3EvidenceRegister.js';
import { buildPhase3PracticeValidationReview } from '../platform/phase3PracticeValidationReview.js';
import { buildPhase3PointCloudValidationReview } from '../platform/phase3PointCloudValidationReview.js';
import { createCalculationPackageHtml } from '../report/calculationPackage.js';
import { createDetailedHtmlReport } from '../report/detailedReport.js';
import { createHtmlReport } from '../report/htmlReport.js';
import {
  getLibraryItem as getCoreLibraryItem,
  listLibrary as listCoreLibrary,
  upsertMaterial as upsertCoreMaterial,
  upsertSection as upsertCoreSection,
} from '../materials/libraryEdit.js';
import { buildLibraryAudit } from '../materials/registry.js';
import {
  getViewerState as getCoreViewerState,
  setViewerSlice as setCoreViewerSlice,
} from '../viewer/viewerState.js';
import { runMemberReleaseBenchmark } from '../diagnostics/memberReleaseBenchmark.js';
import { runRigidDiaphragmBenchmark } from '../diagnostics/rigidDiaphragmBenchmark.js';
import {
  buildPhase10ProductIntegrationContract,
  buildPhase10ReleaseGate,
} from '../platform/phase10ReleaseReadiness.js';
import {
  analyzeLegacyUiSnapshot,
  runLegacyUiPushover,
} from '../compute/product/legacyUiCompatibility.js';
import {
  createAnalysisCase,
  normalizeAnalysisCase,
} from '../core/analysisCase.js';
import {
  runAnalysisCase as runCoreAnalysisCase,
  runAnalysisCases as runCoreAnalysisCases,
} from './analysisRunners.js';
import {
  markAnalysisCenterCasesStale,
} from './indexAnalysisCenter.js';
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
  confirmIndexImport,
  listIndexImportCandidates,
  rejectIndexImport,
  resolveIndexImportCandidate,
} from './indexImportAgentState.js';
import {
  openNativeCalculationPackage,
  openNativeDetailedReport,
} from './indexReportHooks.js';
import { createReportExportWorkflow } from './indexReportExportWorkflow.js';
import { normalizeIndexResult } from './indexResultCompatibility.js';
import {
  getPhase7AnalysisRunStore,
  getPhase7LatestAttempts,
  phase7ModelHash,
  recordPhase7AnalysisAttempt,
} from './phase7AnalysisRecords.js';

const DEFAULT_BRIDGE_VERSION = 'm9-index-engine-bridge';
const SYNC_ANALYSIS_DEPRECATION = Object.freeze({
  code: 'SYNC_PRODUCT_ANALYSIS_DEPRECATED',
  status: 'retained-approved-compatibility',
  reviewedAtMilestone: 'P9-M10',
  removalGate: 'PUBLIC_API_BREAK_APPROVAL_REQUIRED',
  replacement: 'validateAnalysisRun/planAnalysisRun/startAnalysisRun/getAnalysisRunStatus/getAnalysisRunResult',
});

export function createIndexAgentApi(target = globalThis, bridge = target?.SStructuresEngine, options = {}) {
  const bridgeVersion = options.bridgeVersion || DEFAULT_BRIDGE_VERSION;
  const analyzeForIndex = options.analyzeForIndex || ((model) => normalizeIndexResult(
    analyzeLegacyUiSnapshot(migrateToV3(model)),
    { requestedAt: new Date().toISOString() },
    { bridgeVersion },
  ));
  let standaloneResult = null, standaloneIdentity = null;
  const readAnalysis = () => bridge?.getLastResult?.() || (
    standaloneIdentity === createWorkflowInputIdentity({model:getCurrentModel(target)}).inputHash ? standaloneResult : null);
  const getAnalysis = () => {
    const result = readAnalysis();
    if (!result) throw Object.assign(new Error('Current analysis result required.'), { code: 'RESULT_REQUIRED' });
    return result;
  };
  const reportExport = options.reportExportWorkflow
    || target.SStructuresReportExportWorkflow
    || (target.sStructuresReportExport ? createReportExportWorkflow({ transport: target.sStructuresReportExport }) : null);
  if (reportExport && !target.SStructuresReportExportWorkflow) target.SStructuresReportExportWorkflow = reportExport;
  const requireReportExport = () => {
    if (!reportExport) {
      const error = new Error('Product report export workflow is unavailable.');
      error.code = 'P11_REPORT_EXPORT_ADAPTER_UNAVAILABLE';
      throw error;
    }
    return reportExport;
  };
  const api = {
    version: bridgeVersion,
    getWorkflowInputIdentity(input = {}) {
      return bridge?.getWorkflowInputIdentity?.(input) || createWorkflowInputIdentity({ model: getCurrentModel(target), ...input });
    },
    getWorkflowAnalysisResult(id) {
      return bridge?.getWorkflowAnalysisResult?.(id) || { ok: false, code: 'RESULT_REQUIRED' };
    },
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
      const analysis = model ? readAnalysis() : null;
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
    getViewerState() {
      return cloneJson(getCoreViewerState(target));
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
      return cloneJson(bridge?.prepareResultView?.('getReport', options) || createHtmlReport(model, getAnalysis(model), options));
    },
    getDetailedReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(bridge?.prepareResultView?.('getDetailedReport', options) || createDetailedHtmlReport(model, getAnalysis(model), withAnalysisResults(target, options)));
    },
    getCalculationPackage(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(bridge?.prepareResultView?.('getCalculationPackage', options) || createCalculationPackageHtml(model, getAnalysis(model), withAnalysisResults(target, options)));
    },
    getPhase13ModelCheck() {
      return cloneJson(bridge?.getPhase13ModelCheck?.() || null);
    },
    getPhase13IssueWaivers() {
      return cloneJson(bridge?.getPhase13IssueWaivers?.() || []);
    },
    getPhase13MilestoneSnapshot() {
      return cloneJson(bridge?.getPhase13MilestoneSnapshot?.() || null);
    },
    preflightReportExport(input = {}) {
      return cloneJson(requireReportExport().preflight(input));
    },
    planReportExport(input = {}) {
      return requireReportExport().plan({ ...input, source: input.source || 'agent' });
    },
    runReportExport(input = {}) {
      return requireReportExport().run(input);
    },
    getReportExportStatus(input = {}) {
      return requireReportExport().status(input);
    },
    cancelReportExport(input = {}) {
      return requireReportExport().cancel(input);
    },
    listReportExports(input = {}) {
      return requireReportExport().refreshHistory(input).then(cloneJson);
    },
    getReportExportArtifacts(input = {}) {
      return cloneJson(requireReportExport().artifacts(input));
    },
    openReportExportArtifact(input = {}) {
      return requireReportExport().openArtifact(input);
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
    getFinalUseReleaseReview(options = {}) {
      return cloneJson(buildFinalUseReleaseReview(buildLaunchEvidence(target, options)));
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
      if (!hasEvidenceInput(options)) {
        return cloneJson(buildPhase3DrawingImportValidationReview(withProjectEvidence(target, options)));
      }
      return cloneJson(buildPhase3DrawingImportValidationReview(options));
    },
    getPhase3EngineeringValidationReview(options = {}) {
      if (!hasEvidenceInput(options)) {
        return cloneJson(buildPhase3EngineeringValidationReview(withProjectEvidence(target, options)));
      }
      return cloneJson(buildPhase3EngineeringValidationReview(options));
    },
    getPhase3ProductizationMilestoneReview() {
      return cloneJson(buildPhase3ProductizationMilestoneReview());
    },
    getPhase3OwnerSignoffReview(options = {}) {
      return cloneJson(buildPhase3OwnerSignoffReview(withProjectEvidence(target, options)));
    },
    getPhase3CompletionAuditReview() {
      return cloneJson(buildPhase3CompletionAuditReview());
    },
    getPhase3EvidenceRegister(options = {}) {
      if (!hasEvidenceInput(options)) return cloneJson(getProjectEvidenceState(target).register);
      return cloneJson(buildPhase3EvidenceRegister(options));
    },
    listProjectEvidence() {
      return cloneJson(buildProjectEvidenceView(target));
    },
    listImportCandidates() {
      return cloneJson(listIndexImportCandidates(target));
    },
    resolveImportCandidate(payload = {}) {
      return cloneJson(resolveIndexImportCandidate(target, payload));
    },
    confirmImport(payload = {}) {
      return cloneJson(confirmIndexImport(target, payload));
    },
    rejectImport(payload = {}) {
      return cloneJson(rejectIndexImport(target, payload));
    },
    submitProjectEvidence(evidence = {}) {
      const validation = validatePhase3EvidenceRecord(evidence);
      if (!validation.ok) {
        throw new Error(`Unknown Phase 3 evidence id or type: ${evidence.id || evidence.type || 'blank'}`);
      }
      const state = getProjectEvidenceState(target);
      Object.assign(state.finalApprovals, buildPhase3FinalApprovals([evidence]));
      state.evidence.push({
        ...evidence,
        status: String(evidence.status || (evidence.accepted ? 'accepted' : 'submitted')).toLowerCase(),
        accepted: evidence.accepted === true || String(evidence.status || '').toLowerCase() === 'accepted',
        recordedAt: evidence.recordedAt || new Date().toISOString(),
      });
      state.register = buildPhase3EvidenceRegister({ evidence: state.evidence });
      return cloneJson(buildProjectEvidenceView(target));
    },
    getPhase3PracticeValidationReview(options = {}) {
      if (!hasEvidenceInput(options)) {
        return cloneJson(buildPhase3PracticeValidationReview(withProjectEvidence(target, options)));
      }
      return cloneJson(buildPhase3PracticeValidationReview(options));
    },
    getPhase3PointCloudValidationReview(options = {}) {
      if (!hasEvidenceInput(options)) {
        return cloneJson(buildPhase3PointCloudValidationReview(withProjectEvidence(target, options)));
      }
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
      if (typeof bridge?.getDesignDemandPackage === 'function') return cloneJson(bridge.getDesignDemandPackage(options));
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
    setViewerSlice(payload = {}) {
      return cloneJson(setCoreViewerSlice(target, payload));
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
    getHingeAssignments(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildHingeAssignmentView(model, options));
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
      const result = target.SStructuresPushoverPanel?.run?.(options) || runLegacyUiPushover(model, options);
      return cloneJson(result);
    },
    getAnalysisCases() {
      const model = getCurrentModel(target);
      return cloneJson(model?.analysisCases || []);
    },
    listAnalysisCases() {
      return api.getAnalysisCases();
    },
    addAnalysisCase(input = {}) {
      const model = getCurrentModel(target);
      if (!model) throw new Error('Current UI model is not available.');
      model.analysisCases ||= [];
      const analysisCase = createAnalysisCase(input, model.analysisCases);
      model.analysisCases.push(analysisCase);
      return cloneJson(analysisCase);
    },
    updateAnalysisCase(id, patch = {}) {
      const model = getCurrentModel(target);
      if (!model) throw new Error('Current UI model is not available.');
      model.analysisCases ||= [];
      const index = model.analysisCases.findIndex((item) => item.id === id);
      if (index < 0) throw new Error(`Analysis case not found: ${id}`);
      model.analysisCases[index] = normalizeAnalysisCase({ ...model.analysisCases[index], ...patch }, index);
      return cloneJson(model.analysisCases[index]);
    },
    deleteAnalysisCase(id) {
      const model = getCurrentModel(target);
      if (!model) throw new Error('Current UI model is not available.');
      model.analysisCases ||= [];
      const index = model.analysisCases.findIndex((item) => item.id === id);
      if (index < 0) throw new Error(`Analysis case not found: ${id}`);
      const [removed] = model.analysisCases.splice(index, 1);
      if (target.__SStructuresAnalysisResults) delete target.__SStructuresAnalysisResults[id];
      target.SStructuresAnalysisCenter?.refresh?.();
      return cloneJson(removed);
    },
    runAnalysisCase(input = {}) {
      const model = getCurrentModel(target);
      if (!model) throw new Error('Current UI model is not available.');
      if (typeof bridge?.runAnalysisCase === 'function') return cloneJson(bridge.runAnalysisCase(input));
      const analysisCase = resolveAnalysisCase(model, input);
      const result = runCoreAnalysisCase(model, analysisCase, { bridge });
      const stored = storeAnalysisResult(target, model, analysisCase, result);
      target.SStructuresAnalysisCenter?.refresh?.();
      return cloneJson({ ...stored, deprecation: SYNC_ANALYSIS_DEPRECATION });
    },
    runAnalysisCases(input = {}) {
      const model = getCurrentModel(target);
      if (!model) throw new Error('Current UI model is not available.');
      if (typeof bridge?.runAnalysisCases === 'function') return cloneJson(bridge.runAnalysisCases(input));
      const cases = Array.isArray(input) ? input : (input.cases || model.analysisCases || []);
      const results = runCoreAnalysisCases(model, cases, { bridge });
      const stored = results.map((result) => {
        const analysisCase = (model.analysisCases || []).find((item) => item.id === result.caseId) || { id: result.caseId, kind: result.kind };
        return storeAnalysisResult(target, model, analysisCase, result);
      });
      target.SStructuresAnalysisCenter?.refresh?.();
      return cloneJson(stored.map((row) => ({ ...row, deprecation: SYNC_ANALYSIS_DEPRECATION })));
    },
    runAllAnalysisCases(input = {}) {
      return api.runAnalysisCases(input);
    },
    getAnalysisResults() {
      return cloneJson(target.__SStructuresAnalysisResults || {});
    },
    getAnalysisCaseResult(id) {
      return cloneJson((target.__SStructuresAnalysisResults || {})[id] || null);
    },
    getAnalysisCapabilities(input = {}) {
      requireProductBridge(bridge, 'getAnalysisCapabilities');
      return cloneJson(bridge.getAnalysisCapabilities(input));
    },
    validateAnalysisRun(input = {}) {
      requireProductBridge(bridge, 'validateAnalysisRun');
      return cloneJson(bridge.validateAnalysisRun(input));
    },
    planAnalysisRun(input = {}) {
      requireProductBridge(bridge, 'planAnalysisRun');
      return cloneJson(bridge.planAnalysisRun(input));
    },
    startAnalysisRun(input = {}) {
      requireProductBridge(bridge, 'startAnalysisRun');
      return cloneJson(bridge.startAnalysisRun(input));
    },
    getAnalysisRunStatus(input = {}) {
      requireProductBridge(bridge, 'getAnalysisRunStatus');
      return cloneJson(bridge.getAnalysisRunStatus(productJobId(input)));
    },
    listAnalysisRuns(input = {}) {
      requireProductBridge(bridge, 'listAnalysisRuns');
      return cloneJson(bridge.listAnalysisRuns(input));
    },
    getAnalysisRunResult(input = {}) {
      requireProductBridge(bridge, 'getAnalysisRunResult');
      return cloneJson(bridge.getAnalysisRunResult(productJobId(input)));
    },
    getAnalysisResultSlice(input = {}) {
      requireProductBridge(bridge, 'getAnalysisResultSlice');
      return cloneJson(bridge.getAnalysisResultSlice(productJobId(input), input.query || input));
    },
    cancelAnalysisRun(input = {}) {
      requireProductBridge(bridge, 'cancelAnalysisRun');
      return cloneJson(bridge.cancelAnalysisRun(productJobId(input)));
    },
    retryAnalysisRun(input = {}) {
      requireProductBridge(bridge, 'retryAnalysisRun');
      return cloneJson(bridge.retryAnalysisRun(productJobId(input), typeof input === 'object' ? input : {}));
    },
    getAnalysisRunReport(input = {}) {
      requireProductBridge(bridge, 'getAnalysisRunReport');
      return cloneJson(bridge.getAnalysisRunReport(productJobId(input), input));
    },
    exportAnalysisTelemetry(input = {}) {
      requireProductBridge(bridge, 'exportAnalysisTelemetry');
      return cloneJson(bridge.exportAnalysisTelemetry(productJobId(input), input));
    },
    validateNonlinearCase(input = {}) {
      if (typeof bridge?.validateProductionNonlinearCase !== 'function') throw new Error('Production nonlinear service is unavailable.');
      return cloneJson(bridge.validateProductionNonlinearCase(input));
    },
    validateProductionNonlinearCase(input = {}) {
      return api.validateNonlinearCase(input);
    },
    createProductionNonlinearCase(input = {}) {
      if (typeof bridge?.createProductionNonlinearCase !== 'function') throw new Error('Production nonlinear service is unavailable.');
      return cloneJson(bridge.createProductionNonlinearCase(input));
    },
    previewNonlinearAssignments(input = {}) {
      if (typeof bridge?.previewNonlinearAssignments !== 'function') throw new Error('Production nonlinear service is unavailable.');
      return cloneJson(bridge.previewNonlinearAssignments(input));
    },
    applyNonlinearAssignments(input = {}) {
      if (typeof bridge?.applyNonlinearAssignments !== 'function') throw new Error('Production nonlinear service is unavailable.');
      const changeSet = input.changeSet || input.preview || input;
      return cloneJson(bridge.applyNonlinearAssignments(changeSet, input.options || {}));
    },
    startNonlinearRun(input = {}) {
      if (typeof bridge?.startNonlinearRun !== 'function') throw new Error('Production nonlinear service is unavailable.');
      return cloneJson(bridge.startNonlinearRun(input));
    },
    pauseNonlinearRun(input = {}) {
      const jobId = typeof input === 'string' ? input : input.jobId || input.id;
      return cloneJson(bridge.pauseNonlinearRun(jobId));
    },
    cancelNonlinearRun(input = {}) {
      const jobId = typeof input === 'string' ? input : input.jobId || input.id;
      return cloneJson(bridge.cancelNonlinearRun(jobId));
    },
    resumeNonlinearRun(input = {}) {
      const jobId = typeof input === 'string' ? input : input.jobId || input.id;
      return cloneJson(bridge.resumeNonlinearRun(jobId, typeof input === 'object' ? input : {}));
    },
    retryNonlinearRun(input = {}) {
      const jobId = typeof input === 'string' ? input : input.jobId || input.id;
      return cloneJson(bridge.retryNonlinearRun(jobId, typeof input === 'object' ? input : {}));
    },
    getNonlinearRunStatus(input = {}) {
      const jobId = typeof input === 'string' ? input : input.jobId || input.id;
      return cloneJson(bridge.getNonlinearRunStatus(jobId, typeof input === 'object' ? input : {}));
    },
    listNonlinearRuns(input = {}) {
      return cloneJson(bridge.listNonlinearRuns(input));
    },
    getNonlinearRunGraph(input = {}) {
      return cloneJson(bridge.getNonlinearRunGraph(input));
    },
    getNonlinearResult(input = {}) {
      const jobId = typeof input === 'string' ? input : input.jobId || input.id;
      return cloneJson(bridge.getNonlinearResult(jobId));
    },
    getNonlinearResultSlice(input = {}) {
      const jobId = input.jobId || input.id;
      return cloneJson(bridge.getNonlinearResultSlice(jobId, input.query || input));
    },
    explainNonlinearFailure(input = {}) {
      const jobId = typeof input === 'string' ? input : input.jobId || input.id;
      return cloneJson(bridge.explainNonlinearFailure(jobId));
    },
    exportNonlinearHistory(input = {}) {
      return cloneJson(bridge.exportNonlinearHistory(input.jobId || input.id, input));
    },
    getNonlinearReport(input = {}) {
      return cloneJson(bridge.getNonlinearReport(input.jobId || input.id, input));
    },
    markAnalysisCasesStale(reason = 'model-changed') {
      const changed = markAnalysisCenterCasesStale(target, bridge, reason);
      target.SStructuresAnalysisCenter?.refresh?.();
      return cloneJson(changed);
    },
    getCapabilities() {
      return cloneJson(buildAgentManifest({
        bridgeVersion,
        availableActions: availableAgentActions(),
        controls: target.document ? listAgentControls(target.document) : [],
      }));
    },
    getPhase10ReleaseStatus(options = {}) {
      return cloneJson(buildPhase10ReleaseGate({
        ...options,
        integration: options.integration || buildPhase10ProductIntegrationContract(options),
      }));
    },
    runAnalysis() {
      runUiAnalysis(target);
      if (!bridge?.getLastResult?.()) {
        const model = getCurrentModel(target);
        standaloneResult = analyzeForIndex(model);
        standaloneIdentity = createWorkflowInputIdentity({model}).inputHash;
        target.__SStructuresResultRevision = (target.__SStructuresResultRevision || 0) + 1;
      }
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
        case 'setViewerSlice':
          return { viewerState: api.setViewerSlice(payload) };
        case 'setNodeMass':
          return executeAgentModelingAction(target, action, payload, api);
        case 'runPushover': {
          const pushover = api.runPushover(payload);
          return {
            ...api.getSnapshot(),
            pushover,
          };
        }
        case 'addAnalysisCase': {
          const analysisCase = api.addAnalysisCase(payload.analysisCase || payload);
          target.SStructuresAnalysisCenter?.refresh?.();
          return {
            ...api.getSnapshot(),
            analysisCase,
          };
        }
        case 'updateAnalysisCase': {
          const analysisCase = api.updateAnalysisCase(payload.id || payload.caseId, payload.patch || payload);
          target.SStructuresAnalysisCenter?.refresh?.();
          return {
            ...api.getSnapshot(),
            analysisCase,
          };
        }
        case 'deleteAnalysisCase': {
          const analysisCase = api.deleteAnalysisCase(payload.id || payload.caseId);
          return {
            ...api.getSnapshot(),
            analysisCase,
          };
        }
        case 'listAnalysisCases':
          return { analysisCases: api.listAnalysisCases() };
        case 'runAnalysisCase': {
          const analysisResult = api.runAnalysisCase(payload);
          return {
            ...api.getSnapshot(),
            analysisResult,
          };
        }
        case 'runAnalysisCases': {
          const analysisResults = api.runAnalysisCases(payload);
          return {
            ...api.getSnapshot(),
            analysisResults,
          };
        }
        case 'runAllAnalysisCases': {
          const analysisResults = api.runAllAnalysisCases(payload);
          return {
            ...api.getSnapshot(),
            analysisResults,
          };
        }
        case 'getAnalysisCaseResult':
          return { analysisResult: api.getAnalysisCaseResult(payload.id || payload.caseId || payload) };
        case 'getAnalysisCapabilities':
          return { capability: api.getAnalysisCapabilities(payload) };
        case 'validateAnalysisRun':
          return { preflight: api.validateAnalysisRun(payload) };
        case 'planAnalysisRun':
          return { plan: api.planAnalysisRun(payload) };
        case 'startAnalysisRun':
          return { job: api.startAnalysisRun(payload) };
        case 'getAnalysisRunStatus':
          return { job: api.getAnalysisRunStatus(payload) };
        case 'listAnalysisRuns':
          return { jobs: api.listAnalysisRuns(payload) };
        case 'getAnalysisRunResult':
          return { result: api.getAnalysisRunResult(payload) };
        case 'getAnalysisResultSlice':
          return { resultSlice: api.getAnalysisResultSlice(payload) };
        case 'cancelAnalysisRun':
          return { job: api.cancelAnalysisRun(payload) };
        case 'retryAnalysisRun':
          return { job: api.retryAnalysisRun(payload) };
        case 'getAnalysisRunReport':
          return { report: api.getAnalysisRunReport(payload) };
        case 'exportAnalysisTelemetry':
          return { export: api.exportAnalysisTelemetry(payload) };
        case 'validateNonlinearCase':
          return { preflight: api.validateNonlinearCase(payload) };
        case 'createProductionNonlinearCase':
          return { analysisCase: api.createProductionNonlinearCase(payload) };
        case 'previewNonlinearAssignments':
          return { assignmentPreview: api.previewNonlinearAssignments(payload) };
        case 'applyNonlinearAssignments':
          return { assignmentResult: api.applyNonlinearAssignments(payload) };
        case 'startNonlinearRun':
          return { job: api.startNonlinearRun(payload) };
        case 'pauseNonlinearRun':
          return { job: api.pauseNonlinearRun(payload) };
        case 'cancelNonlinearRun':
          return { job: api.cancelNonlinearRun(payload) };
        case 'resumeNonlinearRun':
          return { job: api.resumeNonlinearRun(payload) };
        case 'retryNonlinearRun':
          return { job: api.retryNonlinearRun(payload) };
        case 'getNonlinearRunStatus':
          return { job: api.getNonlinearRunStatus(payload) };
        case 'listNonlinearRuns':
          return { jobs: api.listNonlinearRuns(payload) };
        case 'getNonlinearRunGraph':
          return { graph: api.getNonlinearRunGraph(payload) };
        case 'getNonlinearResult':
          return { result: api.getNonlinearResult(payload) };
        case 'getNonlinearResultSlice':
          return { resultSlice: api.getNonlinearResultSlice(payload) };
        case 'explainNonlinearFailure':
          return { failure: api.explainNonlinearFailure(payload) };
        case 'exportNonlinearHistory':
          return { export: api.exportNonlinearHistory(payload) };
        case 'getNonlinearReport':
          return { report: api.getNonlinearReport(payload) };
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
        case 'listImportCandidates':
          return { importCandidates: api.listImportCandidates(payload) };
        case 'resolveImportCandidate':
          return { importCandidate: api.resolveImportCandidate(payload) };
        case 'confirmImport':
          return { importCandidate: api.confirmImport(payload) };
        case 'rejectImport':
          return { importCandidate: api.rejectImport(payload) };
        case 'openNativeDetailedReport':
          return openNativeDetailedReport(target, bridge, api, payload);
        case 'openNativeCalculationPackage':
          return openNativeCalculationPackage(target, bridge, api, payload);
        case 'preflightReportExport':
          return { preflight: api.preflightReportExport(payload) };
        case 'planReportExport':
          return api.planReportExport(payload).then((job) => ({ job }));
        case 'runReportExport':
          return api.runReportExport(payload).then((job) => ({ job }));
        case 'getReportExportStatus':
          return api.getReportExportStatus(payload).then((job) => ({ job }));
        case 'cancelReportExport':
          return api.cancelReportExport(payload).then((job) => ({ job }));
        case 'listReportExports':
          return api.listReportExports(payload).then((jobs) => ({ jobs }));
        case 'getReportExportArtifacts':
          return { artifacts: api.getReportExportArtifacts(payload) };
        case 'openReportExportArtifact':
          return api.openReportExportArtifact(payload).then((artifact) => ({ artifact }));
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
        case 'nativeSetSpringSupport':
        case 'nativeSetSettlement':
        case 'nativeAddUdl':
        case 'nativeAddPartialLoad':
        case 'nativeAddTemperatureLoad':
        case 'nativeAddNodalLoad':
        case 'nativeSetMemberBehavior':
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
  installResultViewCache(api, COMPUTED_RESULT_VIEWS, () => ({ inputHash: stableHash({
    input: api.getWorkflowInputIdentity().inputHash, revision: target.__SStructuresResultRevision || 0,
  }) }));
  const prepareAgentView = api.prepareResultView;
  for (const name of COMPUTED_RESULT_VIEWS) {
    if (bridge?.prepareResultView && typeof bridge[name] === 'function') api[name] = (...args) => cloneJson(bridge[name](...args));
  }
  api.prepareResultView = (name, input = {}) => bridge?.prepareResultView && typeof bridge[name] === 'function'
    ? cloneJson(bridge.prepareResultView(name, input)) : prepareAgentView(name, input);
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

function buildHingeAssignmentView(model, options = {}) {
  const assignment = assignMemberHinges(model, options);
  const members = (model.members || []).map((member) => ({
    memberId: member.id,
    matId: member.matId || null,
    nonlinear: member.nonlinear ? cloneJson(member.nonlinear) : null,
    hingeCount: member.nonlinear?.hinges?.length || 0,
  }));
  return {
    version: 'p5-m6-hinge-assignment-view',
    assignment,
    members,
    summary: {
      memberCount: members.length,
      assignedMemberCount: members.filter((member) => member.hingeCount > 0).length,
      explicitHingeCount: members.reduce((sum, member) => sum + member.hingeCount, 0),
      engineHingeCount: assignment.summary?.hingeCount || 0,
    },
  };
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
  result = recorded.result;
  const row = (model.analysisCases || []).find((item) => item.id === result.caseId);
  const lastRun = {
    at: result.completedAt,
    status: result.status,
    summary: result.summary,
    resultKey: recorded.record.id,
    qualification: result.qualification || null,
    engineId: result.engine?.id || result.payload?.engine?.id || null,
    modelBound: result.modelBound ?? result.payload?.modelBound ?? null,
    designBlocked: result.designBlocked === true || result.payload?.designBlocked === true,
    designTransferAllowed: recorded.record.designTransferAllowed,
    retainedSuccessfulResult: Boolean(recorded.retainedResult),
  };
  const status = analysisCaseStatus(result);
  if (row) {
    row.status = status;
    row.lastRun = lastRun;
  } else if (analysisCase?.id) {
    model.analysisCases ||= [];
    model.analysisCases.push({
      ...analysisCase,
      status,
      lastRun,
    });
  }
  return result;
}

function analysisCaseStatus(result = {}) {
  if (result.status === 'failed') return 'failed';
  if (['review-required', 'preliminary', 'designBlocked', 'unsupported'].includes(result.status)) return result.status;
  if (result.designBlocked === true || result.payload?.designBlocked === true) return 'designBlocked';
  if (['preliminary', 'legacy-preliminary'].includes(result.qualification)) return 'preliminary';
  if (result.qualification === 'review-required') return 'review-required';
  return 'ok';
}

function withAnalysisResults(target, options = {}) {
  const model = getCurrentModel(target);
  return {
    ...options,
    analysisResults: options.analysisResults || options.analysisCaseResults || target.__SStructuresAnalysisResults || {},
    analysisRunStore: options.analysisRunStore || getPhase7AnalysisRunStore(target),
    analysisLatestAttempts: options.analysisLatestAttempts || getPhase7LatestAttempts(target),
    currentModelHash: options.currentModelHash || (model ? phase7ModelHash(model) : null),
  };
}

function runUiAnalysis(target) {
  markAnalysisCenterCasesStale(target, target?.SStructuresEngine, 'model-changed');
  target.SStructuresAnalysisCenter?.refresh?.();
  if (typeof target?.reanalyze === 'function') target.reanalyze(true);
}

function getCurrentModel(target) {
  return typeof target?.model === 'function' ? target.model() : null;
}

function requireProductBridge(bridge, method) {
  if (typeof bridge?.[method] !== 'function') {
    const error = new Error(`Product analysis API ${method} is unavailable.`);
    error.code = 'PRODUCT_ANALYSIS_API_UNAVAILABLE';
    throw error;
  }
}

function productJobId(input) {
  const value = typeof input === 'string' ? input : input?.jobId || input?.id;
  if (!value) {
    const error = new Error('Product analysis jobId is required.');
    error.code = 'PRODUCT_ANALYSIS_JOB_ID_REQUIRED';
    throw error;
  }
  return value;
}

function getProjectEvidenceState(target) {
  target.__SStructuresProjectEvidence ||= {
    evidence: [],
    finalApprovals: {},
    register: buildPhase3EvidenceRegister(),
  };
  target.__SStructuresProjectEvidence.finalApprovals ||= {};
  return target.__SStructuresProjectEvidence;
}

function buildProjectEvidenceView(target) {
  const state = getProjectEvidenceState(target);
  return {
    ...state,
    finalApprovalReview: buildPhase3FinalApprovalReview({ finalApprovals: state.finalApprovals }),
    ownerSignoffReview: buildPhase3OwnerSignoffReview({
      evidence: state.evidence,
      finalApprovals: state.finalApprovals,
    }),
  };
}

function buildLaunchEvidence(target, options = {}) {
  const supplied = isEvidenceWrapperOnly(options) ? options.evidence : options;
  const projectEvidence = getProjectEvidenceState(target);
  const reviewInput = hasEvidenceInput(options)
    ? options
    : {
        evidence: projectEvidence.evidence,
        finalApprovals: projectEvidence.finalApprovals,
      };
  return {
    practiceValidationReview: buildPhase3PracticeValidationReview(reviewInput),
    ownerSignoffReview: buildPhase3OwnerSignoffReview(reviewInput),
    evidenceRegister: hasEvidenceInput(options)
      ? buildPhase3EvidenceRegister(reviewInput)
      : projectEvidence.register,
    finalApprovals: reviewInput.finalApprovals || reviewInput.approvals || projectEvidence.finalApprovals,
    ...supplied,
  };
}

function isEvidenceWrapperOnly(options = {}) {
  return Object.hasOwn(options, 'evidence') &&
    Object.keys(options).length === 1 &&
    !Array.isArray(options.evidence);
}

function withProjectEvidence(target, options = {}) {
  if (hasEvidenceInput(options)) return options;
  const state = getProjectEvidenceState(target);
  return { evidence: state.evidence, finalApprovals: state.finalApprovals };
}

function hasEvidenceInput(options = {}) {
  return Object.hasOwn(options, 'evidence') ||
    Object.hasOwn(options, 'items') ||
    Object.hasOwn(options, 'signoffEvidence') ||
    Object.hasOwn(options, 'finalApprovals') ||
    Object.hasOwn(options, 'approvals');
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
