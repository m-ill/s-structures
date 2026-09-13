import {RC_SPLICE_MODEL_VERSION,RC_SPATIAL_ABSOLUTE_TOLERANCES,RC_SPLICE_BASE_WORKING_BYTES,RC_SPLICE_COMPARISON_WORKING_BYTES} from './rcSplicePolicy.js';

// Discovery metadata only: importing this module must never load a solver.
export function getRcSpliceCapabilities(){
 return {
  version:RC_SPLICE_MODEL_VERSION,implementation:'bounded-implemented',productionQualified:false,designTransferAllowed:false,
  memoryEstimate:{baseWorkingBytes:RC_SPLICE_BASE_WORKING_BYTES,additionalDirectComparisonBytes:RC_SPLICE_COMPARISON_WORKING_BYTES,measuredHeap:false},
  pDeltaMethods:['off','direct'],
  supported:['rectangular-rc-frame','compression-only-concrete','explicit-reinforcement','quadratic-lap-slip','shared-slip-boundaries','rigid-horizontal-diaphragm','prescribed-support-displacement','nodal-spring-and-reference-settlement','canonical-affine-constraints','uniform-temperature','through-depth-temperature-gradient','factored-member-and-nodal-loads','self-weight','piecewise-force-recovery','same-mesh-first-second-order-moment-comparison','finite-element-displacement-field'],
  pending:['semi-rigid-diaphragm','shell-and-slab-coupling','shear-deformation','distributed-ground-model','time-history-and-shrinkage','ultimate-splice-qualification','independent-method-qualification','load-particular-displacement-solutions'],
  limits:{basis:'admission-limits-not-qualified-building-capacity',maxExpandedNodes:20,maxExpandedElements:20,maxHostDofs:120,maxSlipDofs:80,maxTotalDofs:200,maxWorkUnits:256,maxGeneralConstraints:20,maxMpcTerms:120,maxRetainedSources:8,maxRetainedSourceBytes:32*1024**2,maxWorkerMillis:10000,maxFrameDivisions:8},
  convergence:{relativeTolerance:.002,absoluteTolerances:{...RC_SPATIAL_ABSOLUTE_TOLERANCES},designUseRequires:['current-input','internal-stress-and-slip-convergence','frame-mesh-convergence','elastic-range','second-order-proof-when-direct'],frameConvergenceOption:'frameConvergence=true'},
  tools:['solve_rc_splice_model','get_rc_splice_model_result','get_rc_splice_member_force_source','release_rc_splice_model_result','cancel_rc_splice_interval'],
  designTools:['evaluate_practical_design','plan_design_candidates','apply_design_candidate_and_review','export_design_drawings'],
 };
}
