import {REBAR_CATALOG_SOURCE} from '../materials/rebarProductCatalog.js';
import {stableHash} from '../core/stableHash.js';
import {getKcscRuleSources} from './kcscRuleSources.js';
// Declarative implementation registry: no numerical module imports at startup.
const rows=[
 ['plan-clearance',['foundation-plan-clearance'],'foundation/footingPlanClearance.js',['142070'],'explicit minimum plan clearance among registered rectangular footing projections; not 3D/cadastral/excavation qualification'],
 ['footprint-fit',['foundation-footprint-fit'],'foundation/footprintFit.js',['142070'],'explicit project dimension limits at current location/orientation; cadastral, clearance and source suitability remain unverified'],
 ['differential-settlement',['foundation-differential-settlement'],'foundation/differentialSettlement.js',['115005'],'explicit independent footing pairs; same combination and comparison time; criteria and interaction qualification pending'],
 ['ground-settlement',['foundation-settlement'],'foundation/groundSettlement.js',['115005'],'local Winkler, prescribed layer compression or uniform full-contact gross 2V:1H layer stress; optional staged independent-layer primary consolidation and reference-strain secondary compression; general drainage/load history and differential settlement qualification pending'],
 ['joint-congestion',['joint-bar-congestion'],'connection/jointCongestion.js',['142050','142080'],'longitudinal 3D path clearance with conservative arc error; geometric review only'],
 ['joint-strength-relation',['joint-member-strength-ratio'],'connection/jointStrengthRelation.js',['142080','142020','142010'],'column lower/design versus beam upper/nominal strength bound; method review pending'],
 ['joint-hook-anchorage',['joint-anchorage'],'connection/jointHookAnchorage.js',['142080','142050'],'ordinary-weight special-frame 90-degree hooks, explicit matched straight through-bars, or an explicit through axis with perpendicular hooks; KDS 4.6.1(4) depth; physical continuity and independent review remain distinct'],
 ['splices',['rc-splices'],'rc/spliceGeometry.js',['142052','142050','142001'],'explicit ordinary same-size single-bar tension B and analysis-proven uniaxial single-layer A lap, no extra strength credit'],
 ['section-strength',['rc-section-strength'],'rc/kdsStrength.js',['142010','142020'],'rectangular-tied-section; tabulated blocks or explicit parabolic law at intermediate strengths'],
 ['local-stability',['rc-stability'],'rc/kdsStability.js',['142020'],'explicit braced first-order column or KDS specified-inertia refined Direct member check with current stiffness, cut equilibrium, mesh convergence and full-interval moment comparison; independent method qualification pending'],
 ['shear',['rc-shear-y','rc-shear-z'],'rc/kdsShear.js',['142010','142022'],'provided ordinary rectangular transverse reinforcement'],
 ['minimum-steel',['rc-reinforcement-ratio'],'rc/kdsDetailing.js',['142020','142030'],'tied column or uniaxial flexural member'],
 ['cover',['rc-cover'],'rc/kdsCover.js',['142050'],'explicit exposure and external cover requirements'],
 ['spacing',['rc-spacing'],'rc/kdsSpacing.js',['142050','142001'],'single bars, aggregate, aligned layers; no bundles or splices'],
 ['confinement',['rc-confinement'],'rc/kdsConfinement.js',['142050'],'ordinary tied column and closed-tie flexural member; nominal/spatial support and separate closure qualification'],
 ['anchorage',['rc-anchorage'],'rc/providedAnchorage.js',['142052'],'provided development and explicit both-end tension geometry'],
 ['deflection',['rc-deflection'],'rc/kdsServiceability.js',['142030'],'instant live or sustained post-attachment uniaxial curvature; instantaneous total-minus-dead splice or specified-inertia refined Direct frame displacement with separate method qualification'],
 ['crack-control',['rc-serviceability'],'rc/kdsCrackControl.js',['142020','142030'],'ordinary uniaxial flexural spacing or explicit sustained-load appendix crack width; compression/tension and single-axis bending; method review separate'],
 ['torsion-threshold',['rc-torsion'],'rc/kdsTorsion.js',['142010','142022'],'solid rectangular neglect threshold or 45-degree reinforced demand with shared steel allocation; full detailing separate'],
 ['joint-outer-support',['joint-hoop-detail'],'connection/jointHoopSupport.js',['142050','142080'],'actual closure, distinct corner supports and straight-face membership; seismic qualification separate'],
 ['joint-cross-tie-support',['joint-hoop-detail'],'connection/jointCrossTieSupport.js',['142050','142080'],'actual repeated straight column path hook contact; seismic credit separate'],
 ['joint-transverse-paths',['joint-hoop-detail'],'connection/jointTransverseLongitudinalAssembly.js',['142050','142080'],'physical prepared transverse/longitudinal intersections; support and aggregate qualification separate'],
 ['joint-hoops',['joint-confinement','joint-hoop-detail'],'connection/kdsJointHoops.js',['142001','142050','142080'],'special frame full rectangular hoop amount and spacing; physical detailing separate'],
 ['joint-longitudinal-support',['joint-hoop-detail'],'connection/jointLongitudinalSupport.js',['142050','142080'],'actual spatial perimeter and existing conservative lateral-support policy; interpretation review remains'],
 ['joint-detail-readiness',['joint-hoop-detail'],'connection/finalizeJointHoopDetail.js',['142050','142080'],'independent current dimensions, support and assembly aggregation; whole-design qualification separate'],
 ['joint-tie-credit',['joint-confinement'],'connection/jointCrossTieCredit.js',['142050','142080'],'current opposite-face contact, alternate phases and assembly eligibility; method and whole-design qualification separate'],
 ['joint-tie-topology',['joint-confinement'],'connection/jointCrossTieTopology.js',['142080'],'per-phase orthogonal body and nominal area diagnostics; no confinement credit'],
 ['tie-dimensions',['rc-confinement','joint-hoop-detail'],'rc/rectangularTieRequirements.js',['142050'],'independent dimensional requirements; no support geometry approval'],
 ['joint-probable-forces',['joint-probable-forces'],'connection/jointProbableForces.js',['142080'],'beam-end 1.25fy forces; panel bound requires independent method review'],
 ['joint-shear',['joint-shear'],'connection/kdsJointShear.js',['142010','142080'],'centered orthogonal special frame; supplied probable demand'],
 ['footing-depth',['foundation-depth'],'foundation/footingDepth.js',['142070'],'depth above bottom steel in isolated footings, current layer convention'],
 ['footing-spacing',['foundation-spacing'],'foundation/footingSpacing.js',['142050','142001'],'parallel single-bar layer clearance and specified aggregate; crossing layers separate'],
 ['footing-sections',['foundation-flexure','foundation-one-way-shear','foundation-reinforcement','foundation-distribution'],'foundation/footingSectionReview.js',['142010','142020','142022','142050','142070'],'provided top/bottom rectangular footing; uniform or centered-band distribution'],
 ['footing-punching',['foundation-punching'],'foundation/kdsPunching.js',['142010','142022'],'rectangular interior/edge/corner minimum perimeter; conservative eccentric method requires independent review'],
 ['footing-anchorage',['foundation-anchorage'],'foundation/footingAnchorage.js',['142052','142070'],'straight footing bars, both faces of positioned column'],
 ['column-footing-transfer',['foundation-column-transfer'],'foundation/columnTransfer.js',['142010','142020','142022','142052','142070'],'axial/interface shear and bounded biaxial traction with steel allocation; biaxial method requires independent review; no torsion'],
 ['ground-sliding',['foundation-sliding'],'foundation/groundSliding.js',['115005'],'explicit service Coulomb friction and supplied safety factor/reference; factor suitability is not authenticated; combined torsion method remains pending'],
 ['base-friction-bounds',['foundation-sliding'],'foundation/baseFrictionBounds.js',['115005'],'specified Coulomb traction bounds for horizontal force and torsion; no code safety factors, passive resistance or independent method qualification'],
 ['ground-evidence',['foundation-ground-review'],'foundation/groundReview.js',[],'user supplied external review, never automatic code certification'],
];
export const PRACTICAL_RULE_IMPLEMENTATIONS=Object.freeze(rows.map(([id,checkIds,module,documents,scope])=>Object.freeze({id:`p25-${id}`,version:1,checkIds,module:`src/design/${module}`,scope,implementation:'PARTIAL_PROFILE',sources:getKcscRuleSources(documents).map(({id,edition,sha256})=>({id,edition,sha256})),independentlyVerified:false})));
export const PRACTICAL_RULE_PACK_HASH=stableHash({rules:PRACTICAL_RULE_IMPLEMENTATIONS,rebarCatalog:REBAR_CATALOG_SOURCE});
export function practicalRuleFor(checkId){return PRACTICAL_RULE_IMPLEMENTATIONS.find(r=>r.checkIds.includes(checkId))||null;}
