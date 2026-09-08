import { buildConnectionFoundationReport } from '../../design/connectionFoundation.js';
import { buildMemberDesignTraceReport } from '../../design/memberDesignTrace.js';
import { buildDesignDemandPackage } from '../../design/designDemandPackage.js';
import { buildRcDetailedDesignReport } from '../../design/rc/detailedReport.js';
import { buildRcDetailingReport } from '../../design/rcDetailing.js';
import { buildServiceabilityDriftReport } from '../../design/serviceability.js';
import { buildSteelDetailingReport } from '../../design/steelDetailing.js';
import { buildP3DetailedDesignReport } from '../../design/p3DetailedDesignReport.js';
import { buildAdvancedElasticTrace } from '../../results/advancedElasticTrace.js';
import { buildCombinationEnvelopeContract } from '../../results/combinationEnvelopeContract.js';
import { buildP3IntegratedResults } from '../../results/p3IntegratedResults.js';
import { buildResultPostprocessing } from '../../results/resultPostprocessing.js';
import { buildLoadsV2Trace } from '../../loads/loadsV2.js';
import { buildCqcCombinationReport, estimateMemberEulerBuckling, estimateModelBucklingTrace, runLinearSdofTha, runModalSuperpositionTha } from '../../dynamics/elasticCompleteness.js';
import { buildNonlinearAnalysisTrace } from '../../nonlinear/trace.js';
import { expandAdvancedLoads } from '../../solver/elasticExpansion.js';
import { buildWallSlabEquivalentTrace } from '../../solver/wallSlabEquivalent.js';
import { buildPracticePlatformReadiness } from '../../platform/practicePlatformReadiness.js';
import { buildPracticeValidationReport } from '../../platform/practiceValidationReport.js';
import { buildPilotProjectValidation } from '../../platform/pilotProjectValidation.js';
import { createCalculationPackageHtml } from '../../report/calculationPackage.js';
import { createDetailedHtmlReport } from '../../report/detailedReport.js';
import { createHtmlReport } from '../../report/htmlReport.js';
import { runMemberReleaseBenchmark } from '../../diagnostics/memberReleaseBenchmark.js';
import { runRigidDiaphragmBenchmark } from '../../diagnostics/rigidDiaphragmBenchmark.js';
export function createResultPreparationBuilders(context) {
  const target = null;
  const getCurrentModel = () => structuredClone(context.getModel());
  const getAnalysis = () => structuredClone(context.getAnalysis());
  const withAnalysisResults = (_target, options) => context.getReportOptions?.(options) || options;
  const cloneJson = value => structuredClone(value);
  const decorate = value => context.decorateReport?.(value) || value;
  return {
    getReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return decorate(createHtmlReport(model, getAnalysis(model), options));
    },
    getDetailedReport(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return decorate(createDetailedHtmlReport(model, getAnalysis(model), withAnalysisResults(target, options)));
    },
    getCalculationPackage(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return decorate(createCalculationPackageHtml(model, getAnalysis(model), withAnalysisResults(target, options)));
    },
    getCombinationEnvelopeContract(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildCombinationEnvelopeContract(model, getAnalysis(model), options));
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
      if (context.transferDesign && (options.analysisCaseId || options.caseId || options.runRecordId || options.recordId)) return context.transferDesign(options);
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
    getResultPostprocessing(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildResultPostprocessing(model, getAnalysis(model), options));
    },
    getWallSlabEquivalentTrace() {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildWallSlabEquivalentTrace(model, getAnalysis(model)));
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
    getPilotProjectValidation(options = {}) {
      return cloneJson(buildPilotProjectValidation(options));
    },
    getMemberReleaseBenchmark() {
      return cloneJson(runMemberReleaseBenchmark());
    },
    getRigidDiaphragmBenchmark() {
      return cloneJson(runRigidDiaphragmBenchmark());
    },
    getElasticExpansionTrace() {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(expandAdvancedLoads(model.loads || [], model).trace);
    },
    getLoadsV2Trace(options = {}) {
      const model = getCurrentModel(target);
      if (!model) return null;
      return cloneJson(buildLoadsV2Trace(model, options));
    },
  };
}
