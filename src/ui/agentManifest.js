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
import { DESIGN_BASIS_INPUT_VERSION, LOAD_DERIVATION_TRACE_VERSION, LOAD_ESTIMATION_VERSION } from '../design/loadEstimation.js';
import { MEMBER_DESIGN_TRACE_VERSION } from '../design/memberDesignTrace.js';
import { RC_DETAILING_VERSION } from '../design/rcDetailing.js';
import { SERVICEABILITY_DRIFT_VERSION } from '../design/serviceability.js';
import { STEEL_DETAILING_VERSION } from '../design/steelDetailing.js';
import { STABILIZATION_HARNESS_VERSION } from '../verification/stabilizationHarness.js';

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
      designBasisLoadEstimation: LOAD_ESTIMATION_VERSION,
      designBasisInput: DESIGN_BASIS_INPUT_VERSION,
      loadDerivationTrace: LOAD_DERIVATION_TRACE_VERSION,
      serviceabilityDrift: SERVICEABILITY_DRIFT_VERSION,
      rcDetailing: RC_DETAILING_VERSION,
      steelDetailing: STEEL_DETAILING_VERSION,
      connectionFoundation: CONNECTION_FOUNDATION_VERSION,
      memberDesignTrace: MEMBER_DESIGN_TRACE_VERSION,
      stabilizationHarness: STABILIZATION_HARNESS_VERSION,
      calculationPackageUi: 'm43-calculation-package-ui',
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
      'getDesignBasisLoadEstimation',
      'getDesignBasisInput',
      'getRcDetailingReport',
      'getSteelDetailingReport',
      'getConnectionFoundationReport',
      'getMemberDesignTraceReport',
      'getServiceabilityDriftReport',
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
      'designBasisLoadEstimation',
      'designBasisInput',
      'loadDerivationTrace',
      'serviceabilityDriftReview',
      'rcReinforcementSchedule',
      'steelMemberReviewSchedule',
      'connectionFoundationPreliminaryReview',
      'memberDesignTraceMatrix',
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
      { id: 'M45', status: 'preliminary', feature: 'member-by-member design formula trace and action matrix' },
      { id: 'M46', status: 'available', feature: 'stabilization harness for modeling, elastic analysis, visuals, and reports' },
      { id: 'M47', status: 'preliminary', feature: 'design-basis load input controls, preview API, and apply workflow' },
      { id: 'M48', status: 'preliminary', feature: 'load derivation formula trace for gravity, wind, and seismic generated loads' },
      { id: 'M49', status: 'preliminary', feature: 'story drift and serviceability review table for elastic analysis results' },
    ],
    limitations: [
      'Pushover is currently preliminary and does not yet rebuild tangent stiffness with hinge degradation.',
      'Report output is a calculation aid and not a certified final structural calculation package.',
      'Unsupported design checks must be reviewed separately.',
      'Large models still use the current in-browser dense solver path.',
    ],
  };
}
