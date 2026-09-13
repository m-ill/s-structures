// Discovery only: no imports from solvers, design calculations or workers.
export function getSectionRepairCapabilities({jointRepair=false}={}){return {
 version:'p25-section-repair-capabilities-v4-joint-geometry',implementation:'scoped-implemented',productionQualified:false,automaticWholeDesignApproval:false,
 targets:['rc-prismatic-rectangular-member'],triggerChecks:['rc-section-strength','rc-deflection','rc-stability','rc-shear-y','rc-shear-z'],
 continuation:{resultField:'remainingRepairs',detailTool:'get_practical_design_check',targetTool:'plan_design_candidates',preparedDuringEvaluation:true,maxTargets:32,maxBasisChecksPerTarget:12},
 requiresCurrentEvaluation:true,requiresReanalysis:true,requiresCandidateEvaluation:true,
 automaticSearch:{dimensions:'50-mm-grid-enlargement',existingSectionIncluded:'strength-or-deflection-only; excluded for supported gross-concrete stability or shear upper-bound NG',architecturalFitVerified:false},
 shear:{trigger:'SECTION_SHEAR_CAPACITY_EXCEEDED',requiresVerifiedUpperBound:true,torsionInteractionSupported:false,ordinarySpacingFailureRequiresSectionChange:false},
 stability:{analysisMethod:'off',classification:'explicit-braced-column-with-reference-in-every-region',stiffnessBasis:'0.2 Ec Ig; no reinforcement stiffness term',requiresContinuousFullLengthDetailCoverage:true,variableAxialForceSupported:false,directLocalMethodQualified:false},
 ...(jointRepair?{jointRepair:{target:'connectionId',columnDepthGridMm:25,preservesSpatialCornerContacts:true,pairedBeamDepthIncreaseMm:100,maximumBeamDepthRatio:1.5,maxTransverseSpacingTrials:8,maxLongitudinalPhaseTrials:40,noFeasibleLayoutCode:'JOINT_CAGE_NO_QUALIFIED_LAYOUT',noFeasibleLayoutMutatesInput:false,allCandidatesRequireWholeReview:true}}:{}),
 coupledInputs:['foundation-column-contact-xy-dimensions','joint-column-local-width-depth','joint-panel-height-from-connected-horizontal-beams'],
 couplingConditions:['explicit-member-and-node-references','solver-endOffset-and-insertionPoint-checked','original-dimensions-match-source-section','unlocked-details','rectangular-sections','vertical-orthogonal-column-for-foundation','horizontal-orthogonal-beams-for-panel-height','no-offsets-in-foundation-or-panel-mapping'],
 preservedInputs:['loads','material-strength','ground-properties','footing-outer-dimensions-unless-separately-proposed','joint-end-offsets','user-locks'],
 limits:{maxConnectedDetails:8,maxSectionDimensionMm:3000,automaticGridStepMm:50,basis:'search-limits-not-design-qualification'},
 changeEvidence:{candidateTool:'get_design_candidate_detail',candidateFields:['foundationChanges','connectionChanges'],appliedTool:'get_practical_design_check',appliedField:'connectedGeometryChanges',appliedSource:'actual-before-and-after-model',survivesCandidateRelease:true,reportIncludesActualChanges:true},
 pending:['variable-axial-stability','direct-local-stability-qualification','general-inclined-or-offset-joint-mapping','architectural-clearance-approval','full-cage-fabrication-and-independent-qualification'],
 tools:['get_design_modules','get_design_input_schema','get_design_records','plan_design_candidates','start_design_candidates','get_design_candidates','get_design_candidate_detail','apply_design_candidate_and_review','get_practical_design_check','release_design_candidates'],
};}
