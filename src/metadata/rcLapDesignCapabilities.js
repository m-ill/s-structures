// Shared admission policy and discovery data; do not import numerical modules.
export const RC_LAP_DESIGN_LIMITS=Object.freeze({maxBars:100,maxSplices:100,maxSourceSplices:1000,maxOriginalLayers:8,maxLayouts:64,maxStations:600,maxStrengthChecks:2400,maxSpanLoads:100,maxEnvelopeWorkUnits:200000,maxRefinementPasses:2});
export function getRcLapDesignCapabilities(){return {
 version:'p25-rc-lap-design-capabilities-v1',implementation:'clause-scoped-implemented',productionQualified:false,designTransferAllowed:false,
 spliceTypes:['tension-A','tension-B','compression-with-tension-envelope'],
 supported:['ordinary-single-deformed-bars','rectangular-section','original-single-layer-or-up-to-four-symmetric-layers-per-face','actual-piece-height-and-lateral-offsets','coexisting-piece-layout-envelope','half-area-strength-proof','per-partition-sliding-area-window','uniaxial-and-proportional-biaxial-bending','piecewise-constant-tension','variable-pure-tension','point-and-distributed-recovery-extrema'],
 pending:['general-changing-bending-direction','coupled-variable-axial-and-bending-envelope','compression-in-class-A-proof','seismic-lap-detailing','mixed-partner-product-and-diameter','independent-method-qualification','whole-design-qualification'],
 limits:{...RC_LAP_DESIGN_LIMITS,basis:'admission-and-computation-limits-not-building-capacity'},
 automaticRepair:{requiresCurrentCalculatedDeficit:true,classARequiresCurrentStrengthAndAreaProof:true,rechecksExpandedAreaWindow:true,preservesOriginalOverlap:true,preservesPartnerClearDistanceOnDiameterChange:true,explicitCandidateOptIn:'repairSpliceLengths',maximumRefinementPasses:RC_LAP_DESIGN_LIMITS.maxRefinementPasses,usesOriginalJobTimeBudget:true,requiresFullReevaluation:true,automaticWholeDesignApproval:false},
 tools:['get_design_input_schema','get_design_records','preview_design_changes','apply_design_changes','evaluate_practical_design','get_practical_design_check','plan_design_candidates','start_design_candidates','get_design_candidates','get_design_candidate_detail','apply_design_candidate_and_review','release_design_candidates'],
 codeBasis:['KDS 14 20 52:2024 4.5.2','KDS 14 20 20:2022 4.1.1, 4.1.2','KDS 14 20 50:2022 4.2.2'],
};}
