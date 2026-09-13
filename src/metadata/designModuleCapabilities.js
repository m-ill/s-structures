import {getSectionRepairCapabilities} from './sectionRepairCapabilities.js';
import {getSteelTestEvidenceCapabilities} from './steelTestEvidencePolicy.js';
import {getRcLapDesignCapabilities} from './rcLapDesignCapabilities.js';
import {getRcSpliceCapabilities} from './rcSpliceCapabilities.js';
import {getRcDirectCapabilities} from './rcDirectCapabilities.js';
// Product/UI/WebMCP share this inventory. It intentionally imports no solver.
import {getKcscRuleSources} from './kcscRuleSources.js';
export const DESIGN_MODULES_VERSION = 'p25-design-modules-v35-scoped-joint-discovery';
const definitions = [
  ['materials', 'M1', 'steel-concrete-timber-masonry-input', ['material-kind', 'units', 'material-source'], []],
  ['sections', 'M1', 'explicit-section-geometry', ['geometry', 'local-axis', 'derived-properties'], []],
  ['reinforcement', 'M4', 'rc-rectangular-beam-column', ['provided-reinforcement', 'cover', 'spacing', 'anchorage'], []],
  ['member-review', 'M3', 'existing-elastic-preliminary-review', ['flexure', 'axial-biaxial-flexure', 'shear', 'serviceability'], ['plan_design_review', 'start_design_review', 'cancel_design_review', 'get_design_result']],
  ['optimization', 'M5', 'bounded-rc-candidates', ['constraints', 'coverage', 'change-impact'], []],
  ['connections', 'M6', 'rc-orthogonal-joint-anchorage', ['joint-shear', 'anchorage', 'confinement', 'stiffness-consistency'], []],
  ['foundations', 'M7', 'rc-rectangular-isolated-footing', ['bearing', 'contact', 'sliding', 'overturning', 'flexure', 'one-way-shear', 'punching', 'anchorage', 'settlement'], []],
  ['drawings', 'M8', 'rc-beam-column-joint-footing-vector', ['detail-identity', 'bar-marks', 'quantities', 'cut-lengths'], []],
];
export const DESIGN_MODULE_IDS = Object.freeze(definitions.map(row => row[0]));
const inputs={'member-review':['design-profile-record'],materials:['material-record'],sections:['section-record'],reinforcement:['reinforcement-record','splice-record'],connections:['connection-record'],foundations:['ground-record','foundation-record']};
const evaluationTools=['release_practical_design_result','get_practical_design_context','evaluate_practical_design','cancel_practical_design_evaluation','get_practical_design_result','get_practical_design_check'];
const addedTools={reinforcement:evaluationTools,'member-review':[...evaluationTools,'get_design_dependencies','reuse_design_analysis'],connections:evaluationTools,foundations:evaluationTools,optimization:['release_design_candidates','plan_design_candidates','start_design_candidates','get_design_candidates','get_design_candidate_detail','get_design_candidate_basis','cancel_design_candidates','apply_design_candidate','apply_design_candidate_and_review'],drawings:['export_design_drawings','get_design_drawing_artifact','list_design_drawing_artifacts','release_design_drawing_artifact','cancel_design_drawing_export']};
const limitations={materials:['ks-edition-ductility-and-mill-certificate-qualification'],sections:[],reinforcement:['whole-code-qualification','seismic-and-additional-tie-confinement','independent-qualification-of-cracked-stiffness-and-direct-local-stability','torsion-full-detailing-and-special-crack-width'], 'member-review':['whole-code-qualification','required-combination-coverage'],optimization:['product-substitution-and-dependent-cage-repair-candidates'],connections:['slab-participation-and-panel-demand-method-review','through-bar-lightweight-and-general-anchorage','complete-hoop-cage-fabrication'],foundations:['eccentric-punching-independent-method-review-and-boundary-columns','column-moment-shear-dowel-lap-transfer','geotechnical-evidence-authentication'],drawings:['complete-cage-congestion','splice-piece-and-stirrup-cut-schedules','fabrication-approval']};
const implementedClauses={reinforcement:['KDS 14 20 20:2022 4.1.1, 4.1.2','KDS 14 20 20:2022 4.2.2, 4.3.2 (minimum flexural and column steel)','KDS 14 20 20:2022 4.4.2(2), 4.4.4, 4.4.6 (braced first-order or refined specified-inertia Direct; method review pending)','KDS 14 20 20:2022 4.2.3 (ordinary crack spacing)','KDS 14 20 30:2021 Appendix 4.1.1–4.1.3 (sustained uniaxial crack width; method review pending)','KDS 14 20 22:2022 4.4.1, 4.5 (threshold and scoped reinforcement demand; detailing separate)','KDS 14 20 10:2021 4.2.3','KDS 14 20 22:2022 4.1–4.3 (scoped member shear)','KDS 14 20 30:2021 4.2.1 (single/regional instant live and supplied sustained/post-attachment deflection)','KDS 14 20 52:2024 4.1.2, 4.1.3, 4.1.5, 4.5.2','KDS 14 20 50:2022 4.2.2, 4.3.1, 4.3.6, 4.4.2(3) (scoped cover/spacing/ordinary four-corner ties)'],connections:['KDS 14 20 80:2021 4.6 (scoped special-frame joint shear)'],foundations:['KDS 14 20 70:2021 4.2.1, 4.2.2 (weight ledger and net-load cuts)','KDS 14 20 20:2022 4.1.1, 4.1.2 (provided bottom/top flexure)','KDS 14 20 22:2022 4.11 (centered punching; eccentric method review pending)','KDS 14 20 20:2022 4.2.2 and KDS 14 20 50:2022 4.6.2 (footing minimum steel)','KDS 14 20 70:2021 4.2.2.3 and KDS 14 20 52:2024 4.1 (straight footing-bar anchorage)'],drawings:['KDS 14 20 50:2022 4.1.1, 4.1.2 (hook geometry only)']};
const sourceIds={reinforcement:['142010','142020','142022','142030','142050','142052','412000'],'member-review':['142010','142020','142022','142030','412000'],connections:['142050','142052','142080','412000'],foundations:['142010','142020','142022','142050','142052','142070','412000'],drawings:['142050','142052']};

export function getDesignModules({ moduleId } = {}) {
  if (moduleId !== undefined && !DESIGN_MODULE_IDS.includes(moduleId)) {
    throw Object.assign(new Error('Unknown design module'), { code: 'DESIGN_MODULE_NOT_FOUND' });
  }
  return { ok: true, version: DESIGN_MODULES_VERSION, designTransferAllowed: false,
    modules: definitions.filter(row => !moduleId || row[0] === moduleId).map(([id, milestone, scope, requiredChecks, currentTools]) => ({
      id, milestone, scope, implementation: ['materials','sections'].includes(id)?'input-implemented':'partial-implemented', productionQualified: false,
      ruleStatus: implementedClauses[id]?'CLAUSE_PARTIAL_IMPLEMENTED':sourceIds[id]?'SOURCE_CAPTURED_NOT_IMPLEMENTED':'NOT_APPLICABLE',
      ruleSource: { edition: null, clauses: [...(implementedClauses[id]||[])], verification: 'independent-review-pending' },
      ruleSources: getKcscRuleSources(sourceIds[id]||[]),
      ...(['reinforcement','member-review'].includes(id)?{analysisCapabilities:{rcSplice:getRcSpliceCapabilities(),...(id==='member-review'?{rcDirect:getRcDirectCapabilities()}:{})}}:{}),
      ...(['reinforcement','member-review','optimization','connections','foundations'].includes(id)?{designCapabilities:{...(['reinforcement','member-review','optimization'].includes(id)?{rcLap:getRcLapDesignCapabilities(),offsetRc:{version:'p25-offset-rc-v1',scope:'parallel-flexible-member-section-checks',checks:['rc-section-strength','rc-shear-y','rc-shear-z'],coordinateEquation:'x_design = x_analysis + startOffset',nativeGeometryValidation:true,reinforcementBoundaryRecovery:true,limits:{maxStations:600,maxReinforcementRegions:100,maxSpanLoads:100,maxWitnesses:12},productionQualified:false,rigidRegionsReviewed:false,pending:['rotated-section-axes','splice-mapping','taper-mapping','rigid-end-region-design','global-stability-and-serviceability']},segmentedRc:{version:'p25-segmented-rc-v1',profile:'explicit-rectangular-segments',checks:['rc-section-strength','rc-shear-y','rc-shear-z'],limits:{maxSegments:16,maxStations:600,maxSpanLoads:100},boundarySides:['left','right'],nativeSourceValidation:true,productionQualified:false,sectionTransitionShearQualified:false,pending:['section-transition-disturbed-regions','offset-station-mapping','continuous-taper','splice-mapping','global-stability-and-serviceability']}}:{}),...(['optimization','connections','foundations'].includes(id)?{sectionRepair:getSectionRepairCapabilities({jointRepair:id==='optimization'})}:{sectionRepairRef:{moduleId:'optimization',path:'designCapabilities.sectionRepair'}})}}:{}),
      ...(id==='materials'?{inputCapabilities:{steelTestEvidence:getSteelTestEvidenceCapabilities()}}:{}),
      ...(id==='drawings'?{exportCapabilities:{formats:['pdf','pdf-bundle','svg','json','csv'],csv:{scope:'all-prepared-quantity-rows',encoding:'utf-8-bom',maxBytes:32*1024**2,includesSourceHashes:true,includesKdsReferences:true,fabricationApproved:false}}}:{}),
      requiredChecks: [...requiredChecks], inputTypes:[...(inputs[id]||[])],
      currentTools: [...new Set(['get_design_rule_catalog',...(inputs[id]?['get_design_input_schema','get_design_records','preview_design_changes','apply_design_changes',...currentTools]:currentTools),...(addedTools[id]||[]),...(['reinforcement','member-review'].includes(id)?[...getRcSpliceCapabilities().tools,...getRcDirectCapabilities().tools]:[]),...(['reinforcement','member-review','optimization'].includes(id)?getRcLapDesignCapabilities().tools:[]),...(['reinforcement','member-review','optimization','connections','foundations'].includes(id)?getSectionRepairCapabilities().tools:[])])],
      missingControls: [...limitations[id]],
    })),
  };
}
