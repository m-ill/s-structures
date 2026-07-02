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
import { INDEX_NATIVE_AGENT_CONTROLS_VERSION } from './indexNativeAgentControls.js';
import { INDEX_NATIVE_ADVANCED_ANALYSIS_VERSION } from './indexNativeAdvancedAnalysis.js';
import { INDEX_PRODUCT_HARDENING_VERSION } from './indexProductHardening.js';
import { INDEX_AGENT_COMMAND_BRIDGE_VERSION } from './indexAgentCommandBridge.js';
import { INDEX_RUNTIME_ADAPTER_VERSION } from './indexRuntimeAdapter.js';
import { TWO_STORY_ELASTIC_FRAME_VERSION } from '../examples/twoStoryElasticFrame.js';
import { REPRESENTATIVE_BUILDINGS_VERSION } from '../examples/representativeBuildings.js';
import { CALCULATION_PACKAGE_VERSION } from '../report/calculationPackage.js';
import { DETAILED_REPORT_VERSION } from '../report/detailedReport.js';
import { KDS_LOAD_COMBINATION_RULE_VERSION, KDS_LOAD_COMBINATION_VERSION, KDS_LOAD_STANDARD_REGISTRY_VERSION } from '../core/kdsLoadCombinations.js';
import { CONNECTION_FOUNDATION_VERSION } from '../design/connectionFoundation.js';
import { DESIGN_DEMAND_PACKAGE_VERSION } from '../design/designDemandPackage.js';
import { DESIGN_BASIS_INPUT_VERSION, LOAD_DERIVATION_TRACE_VERSION, LOAD_ESTIMATION_VERSION } from '../design/loadEstimation.js';
import { MEMBER_DESIGN_TRACE_VERSION } from '../design/memberDesignTrace.js';
import { P3_DETAILED_DESIGN_GATE_VERSION, P3_DETAILED_DESIGN_REPORT_VERSION } from '../design/p3DetailedDesignReport.js';
import { P3_SERVICEABILITY_EVIDENCE_VERSION } from '../design/p3ServiceabilityEvidence.js';
import { RC_DESIGN_GATE_VERSION, RC_DETAILED_DESIGN_VERSION } from '../design/rc/detailedReport.js';
import { RC_DETAILING_VERSION } from '../design/rcDetailing.js';
import { SERVICEABILITY_DRIFT_VERSION } from '../design/serviceability.js';
import { STEEL_DETAILING_VERSION } from '../design/steelDetailing.js';
import { ADVANCED_ELASTIC_TRACE_VERSION } from '../results/advancedTraceUtils.js';
import { UNILATERAL_MEMBER_TRACE_VERSION } from '../results/unilateralTrace.js';
import { COMBINATION_ENVELOPE_CONTRACT_VERSION } from '../results/combinationEnvelopeVersion.js';
import { RESULT_POSTPROCESSING_VERSION } from '../results/resultUtils.js';
import { PRACTICE_PLATFORM_VERSION } from '../platform/practicePlatformReadiness.js';
import {
  ISSUE_REGISTRY_VERSION,
} from '../platform/issueRegistry.js';
import {
  PDELTA_PRACTICE_VALIDATION_VERSION,
} from '../platform/pDeltaPracticeValidation.js';
import {
  RESULT_TABLE_VALIDATION_VERSION,
} from '../platform/resultTableValidation.js';
import {
  CALC_VALIDATION_VERSION,
} from '../platform/calculationValidation.js';
import {
  PRACTICE_VALIDATION_REPORT_VERSION,
} from '../platform/practiceValidationReport.js';
import {
  PILOT_PROJECT_VALIDATION_VERSION,
} from '../platform/pilotProjectValidation.js';
import { LAUNCH_READINESS_GATE_VERSION, LAUNCH_READINESS_VERSION } from '../platform/launchReadiness.js';
import { PHASE3_DESIGN_MILESTONE_REVIEW_VERSION } from '../platform/phase3DesignMilestoneReview.js';
import { PHASE3_DRAWING_IMPORT_VALIDATION_REVIEW_VERSION } from '../platform/phase3DrawingImportValidationReview.js';
import { PHASE3_ENGINEERING_VALIDATION_REVIEW_VERSION } from '../platform/phase3EngineeringValidationReview.js';
import { PHASE3_ELASTIC_MILESTONE_REVIEW_VERSION } from '../platform/phase3ElasticMilestoneReview.js';
import { PHASE3_IMPORT_MILESTONE_REVIEW_VERSION } from '../platform/phase3ImportMilestoneReview.js';
import { PHASE3_NONLINEAR_MILESTONE_REVIEW_VERSION } from '../platform/phase3NonlinearMilestoneReview.js';
import { PHASE3_PLAN_ALIGNMENT_VERSION } from '../platform/phase3PlanAlignment.js';
import { PHASE3_POINT_CLOUD_VALIDATION_REVIEW_VERSION } from '../platform/phase3PointCloudValidationReview.js';
import { PHASE3_PRACTICE_VALIDATION_REVIEW_VERSION } from '../platform/phase3PracticeValidationReview.js';
import { PHASE3_PRODUCTIZATION_MILESTONE_REVIEW_VERSION } from '../platform/phase3ProductizationMilestoneReview.js';
import { PHASE3_OWNER_SIGNOFF_REVIEW_VERSION } from '../platform/phase3OwnerSignoffReview.js';
import { PHASE3_COMPLETION_AUDIT_REVIEW_VERSION } from '../platform/phase3CompletionAuditReview.js';
import { PHASE3_EVIDENCE_REGISTER_VERSION } from '../platform/phase3EvidenceRegister.js';
import { STABILIZATION_HARNESS_VERSION } from '../verification/stabilizationHarness.js';
import { BENCHMARK_GATE_VERSION } from '../verification/benchmarkGate.js';
import { BASELINE_CONTRACT_VERSION } from '../core/baselineContract.js';
import { VALIDATION_HEALTH_VERSION } from '../core/validationHealth.js';
import { ANALYSIS_AUDIT_VERSION } from '../solver/analysisAudit.js';
import { STORY_MODEL_VERSION } from '../core/storyModel.js';
import { STORY_MASS_SUMMARY_VERSION } from '../core/storyMassSummary.js';
import { STORY_SUMMARY_VERSION } from '../core/storySummary.js';
import { DIAPHRAGM_SUMMARY_VERSION } from '../core/diaphragmSummary.js';
import { DIAPHRAGM_VERSION } from '../core/diaphragmContract.js';
import { MEMBER_RELEASE_VERSION } from '../core/memberReleaseContract.js';
import { MEMBER_RELEASE_SUMMARY_VERSION } from '../core/memberReleaseSummary.js';
import { MEMBER_RELEASE_BENCHMARK_VERSION } from '../verification/memberReleaseBenchmark.js';
import { RIGID_DIAPHRAGM_BENCHMARK_VERSION } from '../verification/rigidDiaphragmBenchmark.js';
import { STORY_ECCENTRIC_DISTRIBUTION_VERSION } from '../design/storyEccentricDistribution.js';
import {
  APP_SHELL_VERSION,
  AUTH_CONTRACT_VERSION,
  PERSISTENCE_ENVELOPE_VERSION,
  PHASE3_BASELINE_VERSION,
  SERVER_API_VERSION,
} from '../platform/platformVersion.js';
import { ROUTES_VERSION } from '../app/routes.js';
import { EVIDENCE_CLIENT_VERSION } from '../app/evidenceClient.js';
import { IMPORT_REVIEW_MODEL_VERSION } from '../app/importReviewModel.js';
import { IMPORT_CANDIDATE_VERSION } from '../import/candidate.js';
import { IMPORT_GEOMETRY_VERSION } from '../import/segmentClean.js';
import { DXF_IMPORT_VERSION } from '../import/dxf/importDxf.js';
import { DXF_PLAN_RECOGNITION_VERSION } from '../import/dxf/planRecognition.js';
import { DWG_ADAPTER_VERSION } from '../import/dwg/adapter.js';
import { PLAN_ASSEMBLY_VERSION } from '../import/planAssembly.js';
import { POINT_CLOUD_IMPORT_PIPELINE_VERSION } from '../import/pointcloud/pipeline.js';
import { POINT_CLOUD_LOADER_VERSION } from '../import/pointcloud/loaders.js';
import { POINT_CLOUD_WORKER_PIPELINE_VERSION } from '../import/pointcloud/worker.js';
import { POINT_CLOUD_IMPORT_SUMMARY_VERSION } from '../import/pointcloud/summary.js';
import { POINT_CLOUD_EXTRACTION_SUMMARY_VERSION, POINT_CLOUD_EXTRACTION_VERSION } from '../import/pointcloud/extract.js';
import { POINT_CLOUD_BENCHMARK_VERSION } from '../import/pointcloud/benchmark.js';
import { POINT_CLOUD_WALL_DETECT_VERSION } from '../import/pointcloud/wallDetect.js';
import { POINT_CLOUD_LAYER_VERSION } from '../viewer/pointCloudLayer.js';
import { MATERIAL_REGISTRY_VERSION } from '../materials/registry.js';
import { MATERIAL_SCHEMA_VERSION } from '../materials/materialSchema.js';
import { SECTION_SCHEMA_VERSION } from '../materials/sectionSchema.js';
import { MATERIAL_LIBRARY_REPORT_VERSION } from '../materials/libraryReport.js';
import { MATERIAL_LIBRARY_EDIT_VERSION } from '../materials/libraryEdit.js';
import { ELASTIC_EXPANSION_VERSION } from '../solver/elasticExpansion.js';
import { WALL_SLAB_EQUIVALENT_VERSION, WALL_SLAB_TRACE_VERSION } from '../solver/wallSlabEquivalent.js';
import { SEMI_RIGID_DIAPHRAGM_VERSION } from '../solver/semiRigidDiaphragm.js';
import { SHELL_QUAD4_VERSION } from '../solver/shell/quad4.js';
import { SHELL_FRAME_ASSEMBLY_VERSION } from '../solver/shell/shellAssembly.js';
import { LOADS_V2_VERSION } from '../loads/loadsV2.js';
import { DYNAMIC_COMPLETENESS_VERSION } from '../dynamics/elasticCompleteness.js';
import { GLOBAL_BUCKLING_TRACE_VERSION } from '../dynamics/globalBuckling.js';
import { NONLINEAR_ASSEMBLY_VERSION } from '../nonlinear/assembly.js';
import { GLOBAL_EQUILIBRIUM_VERSION } from '../nonlinear/control/globalEquilibrium.js';
import { HINGE_ASSIGNMENT_VERSION } from '../nonlinear/hinges/hingeAssign.js';
import { NONLINEAR_FIBER_NLTH_TRACE_VERSION, NONLINEAR_GEOMETRY_TRACE_VERSION, NONLINEAR_HINGE_CONTROL_TRACE_VERSION, NONLINEAR_TRACE_VERSION } from '../nonlinear/trace.js';
import { P3_INTEGRATED_RESULTS_GATE_VERSION, P3_INTEGRATED_RESULTS_VERSION } from '../results/p3IntegratedResults.js';
import { NONLINEAR_BENCHMARK_VERSION } from '../verification/nonlinearBenchmarks.js';
import { DESIGN_FORMULA_REGISTRY_VERSION } from '../standards/designFormulaRegistry.js';

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
      nativeAgentControls: INDEX_NATIVE_AGENT_CONTROLS_VERSION,
      nativeAdvancedAnalysis: INDEX_NATIVE_ADVANCED_ANALYSIS_VERSION,
      productHardening: INDEX_PRODUCT_HARDENING_VERSION,
      agentCommandBridge: INDEX_AGENT_COMMAND_BRIDGE_VERSION,
      runtimeAdapter: INDEX_RUNTIME_ADAPTER_VERSION,
      legacyResultShape: MANIFEST_LEGACY_RESULT_SHAPE_VERSION,
      elastic3dImportWorkflow: TWO_STORY_ELASTIC_FRAME_VERSION,
      representativeBuildingSet: REPRESENTATIVE_BUILDINGS_VERSION,
      detailedDesignReport: DETAILED_REPORT_VERSION,
      calculationPackage: CALCULATION_PACKAGE_VERSION,
      kdsLoadCombinationPresets: KDS_LOAD_COMBINATION_VERSION,
      kdsLoadCombinationRules: KDS_LOAD_COMBINATION_RULE_VERSION,
      kdsLoadStandardRegistry: KDS_LOAD_STANDARD_REGISTRY_VERSION,
      combinationEnvelopeContract: COMBINATION_ENVELOPE_CONTRACT_VERSION,
      designBasisLoadEstimation: LOAD_ESTIMATION_VERSION,
      designBasisInput: DESIGN_BASIS_INPUT_VERSION,
      loadDerivationTrace: LOAD_DERIVATION_TRACE_VERSION,
      serviceabilityDrift: SERVICEABILITY_DRIFT_VERSION,
      phase3ServiceabilityEvidence: P3_SERVICEABILITY_EVIDENCE_VERSION,
      advancedElasticTrace: ADVANCED_ELASTIC_TRACE_VERSION,
      unilateralMemberTrace: UNILATERAL_MEMBER_TRACE_VERSION,
      resultPostprocessing: RESULT_POSTPROCESSING_VERSION,
      rcDetailing: RC_DETAILING_VERSION,
      phase3RcDetailedDesign: RC_DETAILED_DESIGN_VERSION,
      phase3RcDesignGate: RC_DESIGN_GATE_VERSION,
      phase3DetailedDesignIntegration: P3_DETAILED_DESIGN_REPORT_VERSION,
      phase3DetailedDesignGate: P3_DETAILED_DESIGN_GATE_VERSION,
      phase3IntegratedResults: P3_INTEGRATED_RESULTS_VERSION,
      phase3IntegratedResultsGate: P3_INTEGRATED_RESULTS_GATE_VERSION,
      steelDetailing: STEEL_DETAILING_VERSION,
      connectionFoundation: CONNECTION_FOUNDATION_VERSION,
      memberDesignTrace: MEMBER_DESIGN_TRACE_VERSION,
      designDemandPackage: DESIGN_DEMAND_PACKAGE_VERSION,
      practicePlatformReadiness: PRACTICE_PLATFORM_VERSION,
      issueRegistry: ISSUE_REGISTRY_VERSION,
      pDeltaPracticeValidation: PDELTA_PRACTICE_VALIDATION_VERSION,
      resultTableValidation: RESULT_TABLE_VALIDATION_VERSION,
      calculationValidation: CALC_VALIDATION_VERSION,
      practiceValidationReport: PRACTICE_VALIDATION_REPORT_VERSION,
      pilotProjectValidation: PILOT_PROJECT_VALIDATION_VERSION,
      phase3LaunchReadiness: LAUNCH_READINESS_VERSION,
      phase3LaunchReadinessGate: LAUNCH_READINESS_GATE_VERSION,
      phase3DesignMilestoneReview: PHASE3_DESIGN_MILESTONE_REVIEW_VERSION,
      phase3DrawingImportValidationReview: PHASE3_DRAWING_IMPORT_VALIDATION_REVIEW_VERSION,
      phase3EngineeringValidationReview: PHASE3_ENGINEERING_VALIDATION_REVIEW_VERSION,
      phase3ElasticMilestoneReview: PHASE3_ELASTIC_MILESTONE_REVIEW_VERSION,
      phase3ImportMilestoneReview: PHASE3_IMPORT_MILESTONE_REVIEW_VERSION,
      phase3NonlinearMilestoneReview: PHASE3_NONLINEAR_MILESTONE_REVIEW_VERSION,
      phase3PlanAlignment: PHASE3_PLAN_ALIGNMENT_VERSION,
      phase3PointCloudValidationReview: PHASE3_POINT_CLOUD_VALIDATION_REVIEW_VERSION,
      phase3PracticeValidationReview: PHASE3_PRACTICE_VALIDATION_REVIEW_VERSION,
      phase3ProductizationMilestoneReview: PHASE3_PRODUCTIZATION_MILESTONE_REVIEW_VERSION,
      phase3OwnerSignoffReview: PHASE3_OWNER_SIGNOFF_REVIEW_VERSION,
      phase3CompletionAuditReview: PHASE3_COMPLETION_AUDIT_REVIEW_VERSION,
      phase3EvidenceRegister: PHASE3_EVIDENCE_REGISTER_VERSION,
      stabilizationHarness: STABILIZATION_HARNESS_VERSION,
      benchmarkGate: BENCHMARK_GATE_VERSION,
      baselineContract: BASELINE_CONTRACT_VERSION,
      validationHealth: VALIDATION_HEALTH_VERSION,
      analysisAudit: ANALYSIS_AUDIT_VERSION,
      storyModel: STORY_MODEL_VERSION,
      storySummary: STORY_SUMMARY_VERSION,
      storyMassSummary: STORY_MASS_SUMMARY_VERSION,
      eccentricStoryLoadDistribution: STORY_ECCENTRIC_DISTRIBUTION_VERSION,
      diaphragm: DIAPHRAGM_VERSION,
      diaphragmSummary: DIAPHRAGM_SUMMARY_VERSION,
      rigidDiaphragmBenchmark: RIGID_DIAPHRAGM_BENCHMARK_VERSION,
      memberRelease: MEMBER_RELEASE_VERSION,
      memberReleaseSummary: MEMBER_RELEASE_SUMMARY_VERSION,
      memberReleaseBenchmark: MEMBER_RELEASE_BENCHMARK_VERSION,
      calculationPackageUi: 'm43-calculation-package-ui',
      phase3Baseline: PHASE3_BASELINE_VERSION,
      phase3ServerApi: SERVER_API_VERSION,
      phase3Auth: AUTH_CONTRACT_VERSION,
      phase3Persistence: PERSISTENCE_ENVELOPE_VERSION,
      phase3AppShell: APP_SHELL_VERSION,
      phase3AppRoutes: ROUTES_VERSION,
      phase3EvidenceClient: EVIDENCE_CLIENT_VERSION,
      phase3ImportGeometry: IMPORT_GEOMETRY_VERSION,
      phase3ImportCandidate: IMPORT_CANDIDATE_VERSION,
      phase3DxfImport: DXF_IMPORT_VERSION,
      phase3DwgAdapter: DWG_ADAPTER_VERSION,
      phase3PlanRecognition: DXF_PLAN_RECOGNITION_VERSION,
      phase3PlanAssembly: PLAN_ASSEMBLY_VERSION,
      phase3ImportReviewModel: IMPORT_REVIEW_MODEL_VERSION,
      phase3PointCloudPipelineShell: POINT_CLOUD_IMPORT_PIPELINE_VERSION,
      phase3PointCloudLoader: POINT_CLOUD_LOADER_VERSION,
      phase3PointCloudWorker: POINT_CLOUD_WORKER_PIPELINE_VERSION,
      phase3PointCloudImportSummary: POINT_CLOUD_IMPORT_SUMMARY_VERSION,
      phase3PointCloudExtraction: POINT_CLOUD_EXTRACTION_VERSION,
      phase3PointCloudExtractionSummary: POINT_CLOUD_EXTRACTION_SUMMARY_VERSION,
      phase3PointCloudBenchmark: POINT_CLOUD_BENCHMARK_VERSION,
      phase3PointCloudWallDetection: POINT_CLOUD_WALL_DETECT_VERSION,
      phase3PointCloudLayer: POINT_CLOUD_LAYER_VERSION,
      phase3MaterialRegistry: MATERIAL_REGISTRY_VERSION,
      phase3MaterialSchema: MATERIAL_SCHEMA_VERSION,
      phase3SectionSchema: SECTION_SCHEMA_VERSION,
      phase3MaterialLibraryReport: MATERIAL_LIBRARY_REPORT_VERSION,
      phase3MaterialLibraryEdit: MATERIAL_LIBRARY_EDIT_VERSION,
      phase3ElasticExpansion: ELASTIC_EXPANSION_VERSION,
      phase3WallSlabEquivalent: WALL_SLAB_EQUIVALENT_VERSION,
      phase3WallSlabTrace: WALL_SLAB_TRACE_VERSION,
      semiRigidDiaphragmRedistribution: SEMI_RIGID_DIAPHRAGM_VERSION,
      phase3ShellQuad4: SHELL_QUAD4_VERSION,
      shellFrameAssembly: SHELL_FRAME_ASSEMBLY_VERSION,
      phase3LoadsV2: LOADS_V2_VERSION,
      phase3DynamicCompleteness: DYNAMIC_COMPLETENESS_VERSION,
      globalBucklingTrace: GLOBAL_BUCKLING_TRACE_VERSION,
      phase3NonlinearAssembly: NONLINEAR_ASSEMBLY_VERSION,
      phase3NonlinearGlobalEquilibrium: GLOBAL_EQUILIBRIUM_VERSION,
      phase3NonlinearHingeAssignment: HINGE_ASSIGNMENT_VERSION,
      phase3NonlinearGeometryTrace: NONLINEAR_GEOMETRY_TRACE_VERSION,
      phase3NonlinearHingeControlTrace: NONLINEAR_HINGE_CONTROL_TRACE_VERSION,
      phase3NonlinearFiberNlthTrace: NONLINEAR_FIBER_NLTH_TRACE_VERSION,
      phase3NonlinearTrace: NONLINEAR_TRACE_VERSION,
      phase3NonlinearBenchmark: NONLINEAR_BENCHMARK_VERSION,
      phase3DesignFormulaRegistry: DESIGN_FORMULA_REGISTRY_VERSION,
    },
    readApis: [
      'getSnapshot',
      'getModel',
      'getResults',
      'getResultView',
      'getResultVisuals',
      'getScreenState',
      'getReport',
      'getDetailedReport',
      'getCalculationPackage',
      'getKdsLoadCombinationCoverage',
      'getKdsLoadCombinationRules',
      'getKdsLoadStandardRegistry',
      'getKdsLoadStandardAudit',
      'getCombinationEnvelopeContract',
      'getDesignBasisLoadEstimation',
      'getDesignBasisInput',
      'getRcDetailingReport',
      'getRcDetailedDesignReport',
      'getSteelDetailingReport',
      'getP3DetailedDesignReport',
      'getP3IntegratedResults',
      'getLaunchReadinessReport',
      'getPhase3DesignMilestoneReview',
      'getPhase3DrawingImportValidationReview',
      'getPhase3EngineeringValidationReview',
      'getPhase3ElasticMilestoneReview',
      'getPhase3ImportMilestoneReview',
      'getPhase3NonlinearMilestoneReview',
      'getPhase3PlanAlignment',
      'getPhase3PointCloudValidationReview',
      'getPhase3PracticeValidationReview',
      'getPhase3ProductizationMilestoneReview',
      'getPhase3OwnerSignoffReview',
      'getPhase3CompletionAuditReview',
      'getPhase3EvidenceRegister',
      'getConnectionFoundationReport',
      'getMemberDesignTraceReport',
      'getDesignDemandPackage',
      'getPracticePlatformReadiness',
      'getPracticeValidationReport',
      'getPilotProjectValidation',
      'getServiceabilityDriftReport',
      'getAdvancedElasticTrace',
      'getMaterialSectionRegistry',
      'listLibrary',
      'getLibraryItem',
      'upsertMaterial',
      'upsertSection',
      'getElasticExpansionTrace',
      'getWallSlabEquivalentTrace',
      'getLoadsV2Trace',
      'getDynamicCompletenessTrace',
      'getNonlinearAnalysisTrace',
      'listImportCandidates',
      'resolveImportCandidate',
      'confirmImport',
      'listProjectEvidence',
      'submitProjectEvidence',
      'getResultPostprocessing',
      'getStorySummary',
      'getStoryMassSummary',
      'getEccentricStoryLoadDistribution',
      'getMemberReleaseSummary',
      'getMemberReleaseBenchmark',
      'getDiaphragmSummary',
      'getRigidDiaphragmBenchmark',
      'getBaselineContract',
      'runPushover',
      'getRuntimeDiagnostics',
      'getCapabilities',
      'DOM event: sstructures:agent-command',
      'window.postMessage: sstructures:agent-command',
      'URL hash: #sstructures-command=',
    ],
    executeActions: options.availableActions || [],
    uiContract: {
      stableAttribute: 'data-agent-id',
      controlCount: options.controls?.length || 0,
      controls: options.controls || [],
    },
    qaCommands: {
      phase3Full: 'npm.cmd run test:p3',
      phase3List: 'npm.cmd run test:p3:list',
      phase3M6ToM20: 'node tools/run-milestone-tests.mjs --phase3 --from=P3-M6 --to=P3-M20',
      phase3RunnerContract: 'node tests/p3-runner-contract.mjs',
      phase3PlanAlignment: 'node tests/p3-plan-alignment.mjs',
      phase3DocReferences: 'node tests/p3-doc-reference-integrity.mjs',
      phase3DesignMilestoneReview: 'node tests/p3-design-milestone-review.mjs',
      phase3DrawingImportValidation: 'node tests/p3-drawing-import-validation-review.mjs',
      phase3ElasticMilestoneReview: 'node tests/p3-elastic-milestone-review.mjs',
      phase3EngineeringValidation: 'node tests/p3-engineering-validation-review.mjs',
      phase3ImportMilestoneReview: 'node tests/p3-import-milestone-review.mjs',
      phase3NonlinearMilestoneReview: 'node tests/p3-nonlinear-milestone-review.mjs',
      phase3PointCloudValidation: 'node tests/p3-pointcloud-validation-review.mjs',
      phase3PracticeValidation: 'node tests/p3-practice-validation-review.mjs',
      phase3ProductizationMilestoneReview: 'node tests/p3-productization-milestone-review.mjs',
      phase3OwnerSignoffReview: 'node tests/p3-owner-signoff-review.mjs',
      phase3CompletionAuditReview: 'node tests/p3-completion-audit-review.mjs',
      phase3EvidenceRegister: 'node tests/p3-evidence-register.mjs',
      phase3EvidenceClient: 'node tests/p3-evidence-client.mjs',
      phase3ServerRoutes: 'node tests/p3-server-route-contract.mjs',
    },
    reviewGates: {
      nonlinearGeometry: {
        readApi: 'getNonlinearAnalysisTrace',
        path: 'geometryGate.solverReview',
        readyDecision: 'm14-ready-for-m15-review',
        finalApprovalField: 'productionEquilibriumSolver',
      },
      nonlinearHingeControl: {
        readApi: 'getNonlinearAnalysisTrace',
        path: 'hingeControlGate.controlReview',
        readyDecision: 'm15-ready-for-m16-review',
        finalApprovalField: 'productionHingeEquilibriumLoop',
      },
      nonlinearFiberNlth: {
        readApi: 'getNonlinearAnalysisTrace',
        path: 'fiberNlthGate.fiberNlthReview',
        readyDecision: 'm16-ready-for-integrated-results-review',
        finalApprovalField: 'productionSeismicQualification',
      },
      rcDetailedDesign: {
        readApi: 'getRcDetailedDesignReport',
        path: 'rcDesignGate.rcReview',
        readyDecision: 'm17-ready-for-m18-integration-review',
        finalApprovalField: 'finalPermitDesign',
      },
      detailedDesignIntegration: {
        readApi: 'getP3DetailedDesignReport',
        path: 'designGate.designReview',
        readyDecision: 'm18-ready-for-m19-integrated-results-review',
        finalApprovalField: 'finalPermitDesign',
      },
      integratedResults: {
        readApi: 'getP3IntegratedResults',
        path: 'integratedGate.integratedReview',
        readyDecision: 'm19-ready-for-m20-launch-review',
        finalApprovalField: 'finalStructuralSignoff',
      },
      launchReadiness: {
        readApi: 'getLaunchReadinessReport',
        path: 'releaseGate.releaseReview',
        readyDecision: 'ready-for-owner-release-signoff',
        finalApprovalField: 'productionDeploymentApproved',
      },
    },
    manualReferences: {
      launchManual: 'docs/user-manual/PHASE3_LAUNCH_MANUAL.md',
      remainingReview: 'docs/user-manual/PHASE3_REMAINING_REVIEW.md',
      agentContract: 'docs/user-manual/agent-contract.json',
      completionAudit: 'docs/phase3/P3_COMPLETION_AUDIT_2026-07-02.md',
      planAlignmentVerification: 'docs/verification/P3_PLAN_ALIGNMENT_VERIFICATION.md',
    },
    dataContracts: [
      'schemaVersionedModel',
      'linear3dAnalysis',
      'loadCombinations',
      'designSummary',
      'resultVisuals',
      'resultOverlayScene',
      'htmlReport',
      'detailedDesignReport',
      'calculationPackageHtml',
      'kdsLoadCombinationPreset',
      'kdsLoadCombinationRuleSet',
      'kdsLoadStandardAudit',
      'combinationEnvelopeContract',
      'designBasisLoadEstimation',
      'designBasisInput',
      'loadDerivationTrace',
      'serviceabilityDriftReview',
      'phase3ServiceabilityEvidence',
      'advancedElasticTrace',
      'unilateralMemberTrace',
      'resultPostprocessingTables',
      'rcReinforcementSchedule',
      'phase3RcDetailedDesignReport',
      'phase3RcDesignGate',
      'phase3DetailedDesignIntegration',
      'phase3DetailedDesignGate',
      'phase3IntegratedResults',
      'phase3IntegratedResultsGate',
      'phase3LaunchReadiness',
      'phase3LaunchReadinessGate',
      'phase3FinalUseReview',
      'phase3DesignMilestoneReview',
      'phase3DrawingImportValidationReview',
      'phase3EngineeringValidationReview',
      'phase3ElasticMilestoneReview',
      'phase3ImportMilestoneReview',
      'phase3NonlinearMilestoneReview',
      'phase3PlanAlignment',
      'phase3PointCloudValidationReview',
      'phase3PracticeValidationReview',
      'phase3ProductizationMilestoneReview',
      'phase3OwnerSignoffReview',
      'phase3CompletionAuditReview',
      'phase3EvidenceRegister',
      'phase3EvidenceClient',
      'steelMemberReviewSchedule',
      'connectionFoundationPreliminaryReview',
      'memberDesignTraceMatrix',
      'designDemandPackage',
      'practicePlatformReadiness',
      'practiceValidationReport',
      'issueRegistry',
      'pilotProjectValidation',
      'nativeCalculationPackageMenu',
      'preliminaryPushover',
      'pushoverPanel',
      'designWorkflow',
      'nativeRibbonState',
      'nativeResultControls',
      'nativeModelerWorkflow',
      'nativePersistenceBook',
      'nativeAgentScreenControls',
      'nativeAdvancedAnalysisReport',
      'productHardeningAudit',
      'agentCommandBridge',
      'originalIndexRuntimeDiagnostics',
      'legacyResultShapeCompatibility',
      'elastic3dImportWorkflow',
      'representativeBuildingReportSet',
      'stabilizationHarnessReportSet',
      'phase2BenchmarkGate',
      'phase2BaselineContract',
      'phase2ValidationHealth',
      'phase2AnalysisAudit',
      'phase2StoryModel',
      'phase2StorySummary',
      'phase2StoryMassSummary',
      'phase2EccentricStoryLoadDistribution',
      'phase2RigidDiaphragm',
      'phase2DiaphragmSummary',
      'phase2RigidDiaphragmBenchmark',
      'phase2MemberRelease',
      'phase2MemberReleaseSummary',
      'phase2MemberReleaseBenchmark',
      'phase3ServerApi',
      'phase3AuthSession',
      'phase3PersistenceEnvelope',
      'phase3AppShellRoutes',
      'phase3ProjectBrowser',
      'phase3ImportCandidate',
      'phase3WireframeImport',
      'phase3DxfImport',
      'phase3DwgAdapter',
      'phase3PlanRecognition',
      'phase3PlanAssembly',
      'phase3ImportReviewUi',
      'phase3PointCloudPipelineShell',
      'phase3PointCloudLoader',
      'phase3PointCloudViewerBuffer',
      'phase3PointCloudImportSummary',
      'phase3PointCloudExtraction',
      'phase3PointCloudExtractionSummary',
      'phase3PointCloudBenchmark',
      'phase3PointCloudWallDetectionTrace',
      'phase3MaterialSectionRegistry',
      'phase3MaterialSchema',
      'phase3SectionSchema',
      'phase3MaterialLibraryReport',
      'phase3MaterialLibraryEdit',
      'phase3ElasticExpansionTrace',
      'phase3WallSlabEquivalentTrace',
      'phase3WallSlabTrace',
      'semiRigidDiaphragmRedistribution',
      'phase3ShellQuad4Trace',
      'shellFrameAssembly',
      'phase3LoadsV2Trace',
      'phase3DynamicCompletenessTrace',
      'globalBucklingTrace',
      'phase3NonlinearAssemblyTrace',
      'phase3NonlinearGlobalEquilibriumTrace',
      'phase3NonlinearHingeAssignmentTrace',
      'phase3FiberMaterialBackboneTrace',
      'phase3NonlinearGeometryTrace',
      'phase3NonlinearHingeControlTrace',
      'phase3NonlinearFiberNlthTrace',
      'phase3NonlinearAnalysisTrace',
      'phase3NonlinearBenchmarkTrace',
      'phase3DesignFormulaRegistry',
      'phase3DesignFormulaTrace',
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
      { id: 'M28', status: 'available', feature: 'agent control on native UI contracts' },
      { id: 'M29', status: 'available', feature: 'advanced analysis native report UX' },
      { id: 'M30', status: 'available', feature: 'integrated product hardening audit' },
      { id: 'M31', status: 'available', feature: 'DOM event API for AI and browser automation control' },
      { id: 'M32', status: 'available', feature: 'two-story 3D elastic workflow for drawing and MGT import readiness' },
      { id: 'M33', status: 'available', feature: 'representative 10-building elastic analysis report set' },
      { id: 'M34', status: 'available', feature: 'detailed report data contract for analysis and member check traceability' },
      { id: 'M35', status: 'preliminary', feature: 'KDS-style load combination preset generator and coverage API' },
      { id: 'M36', status: 'available', feature: 'native report menu opens detailed report view' },
      { id: 'M37', status: 'preliminary', feature: 'design-basis load estimation and generated model loads' },
      { id: 'M38', status: 'preliminary', feature: 'rule-expanded KDS-style load combinations with signed lateral cases' },
      { id: 'M39', status: 'preliminary', feature: 'RC member detailing schedule from preliminary design checks' },
      { id: 'M40', status: 'preliminary', feature: 'steel member detailed review schedule from preliminary checks' },
      { id: 'M41', status: 'preliminary', feature: 'connection force and foundation reaction preliminary review' },
      { id: 'M42', status: 'available', feature: 'print-ready calculation package with cover, contents, and appendix' },
      { id: 'M43', status: 'available', feature: 'native menu and agent action for opening calculation packages' },
      { id: 'M44', status: 'preliminary', feature: 'structured KDS-style load standard registry and audit trace' },
      { id: 'P2-M4', status: 'preliminary', feature: 'T21-T24 combination groups, rules, coverage, and envelope contract' },
      { id: 'M45', status: 'preliminary', feature: 'member-by-member design formula trace and action matrix' },
      { id: 'M46', status: 'available', feature: 'stabilization harness for modeling, elastic analysis, visuals, and reports' },
      { id: 'M47', status: 'preliminary', feature: 'design-basis load input controls, preview API, and apply workflow' },
      { id: 'M48', status: 'preliminary', feature: 'load derivation formula trace for gravity, wind, and seismic generated loads' },
      { id: 'M49', status: 'preliminary', feature: 'story drift and serviceability review table for elastic analysis results' },
      { id: 'P2-MVP-S1', status: 'available', feature: 'unit, sign, and schema baseline contract' },
      { id: 'P2-MVP-S2', status: 'available', feature: 'validation health score and analysis audit contract' },
      { id: 'P2-MVP-S3', status: 'available', feature: 'ten-case solver benchmark gate' },
      { id: 'P2-MVP-S4', status: 'available', feature: 'story object, member release, and rigid diaphragm contracts' },
      { id: 'P2-MVP-S5', status: 'available', feature: 'story mass center and eccentric lateral distribution contracts' },
      { id: 'P2-M5', status: 'preliminary', feature: 'P-Delta, modal, and response spectrum trace contract' },
      { id: 'P2-M6', status: 'preliminary', feature: 'story, member station, and foundation reaction result postprocessing' },
      { id: 'P2-DESIGN-DEMAND', status: 'preliminary', feature: 'shared demand package for member and foundation design modules' },
      { id: 'P2-PLATFORM', status: 'preliminary', feature: 'project workflow, AI QA, and import/export readiness contracts' },
      { id: 'P2-T25-T50', status: 'preliminary', feature: 'practice validation report and 10-building pilot gate' },
      { id: 'P3-M0', status: 'available', feature: 'phase 3 baseline, folders, version contracts, and documentation map' },
      { id: 'P3-M1', status: 'available', feature: 'node server, REST envelope, project, revision, file, import, and approval APIs' },
      { id: 'P3-M2', status: 'available', feature: 'account, login, token, role guard, and lockout contracts' },
      { id: 'P3-M3', status: 'available', feature: 'three-layer persistence, revisions, autosave, and lineage warning' },
      { id: 'P3-M4', status: 'available', feature: 'app shell, routes, project browser, session restore, and viewer core' },
      { id: 'P3-M5', status: 'available', feature: 'input geometry core, member classification, and import candidate contract' },
      { id: 'P3-M6', status: 'available', feature: 'ASCII DXF v1 parser, line entity mapping, layer audit, and import candidate output' },
      { id: 'P3-M7', status: 'preliminary', feature: 'DWG converter contract, 2D plan recognition, two-story plan assembly, and import review UI core' },
      { id: 'P3-M8', status: 'preliminary', feature: 'point-cloud XYZ/PLY/PCD loading, preprocessing, worker contract, and viewer buffer core' },
      { id: 'P3-M9', status: 'preliminary', feature: 'synthetic point-cloud generation, story/column extraction, benchmark gate, and import-to-analysis e2e' },
      { id: 'P3-M10', status: 'preliminary', feature: 'versioned material and section registry with parametric properties' },
      { id: 'P3-M11', status: 'preliminary', feature: 'spring supports, settlement, truss axial stiffness, member offsets, member moments, and temperature load paths' },
      { id: 'P3-M12', status: 'preliminary', feature: 'wall mid-pier model merge, pier force recovery, and semi-rigid diaphragm trace' },
      { id: 'P3-M13', status: 'preliminary', feature: 'loads v2, CQC, buckling trace, and linear time-history helpers' },
      { id: 'P3-M14', status: 'preliminary', feature: 'nonlinear state snapshot, corotational geometry trace, Newton convergence log, and B1/B2 benchmark gate' },
      { id: 'P3-M15', status: 'preliminary', feature: 'moment hinge state trace, displacement and arc-length control traces, and formal pushover result contract' },
      { id: 'P3-M16', status: 'preliminary', feature: 'PMM hinge interpolation, fiber moment-curvature, Newmark NLTH, and ground-motion scaling trace' },
      { id: 'P3-M17', status: 'preliminary', feature: 'RC beam, column, wall, and slab detailed design schedules with formula trace' },
      { id: 'P3-M18', status: 'preliminary', feature: 'steel member, connection, base plate, foundation, and integrated design trace schedules' },
      { id: 'P3-M19', status: 'preliminary', feature: 'integrated nonlinear and detailed-design result package with workflow lock trace' },
      { id: 'P3-M20', status: 'preliminary', feature: 'launch readiness gate, packaging, manual, agent contract, and pilot report evidence' },
    ],
    limitations: [
      'Pushover is preliminary: previous-step hinge secant stiffness degradation is traced, but a simultaneous hinge-controlled global equilibrium loop is not production-certified.',
      'Report output is a calculation aid and not a certified final structural calculation package.',
      'Unsupported design checks must be reviewed separately.',
      'Large models still use the current in-browser dense solver path.',
    ],
  };
}
