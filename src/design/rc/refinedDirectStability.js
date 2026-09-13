import {RC_SERVICE_ITERATION_VERSION,KDS_SECOND_ORDER_STIFFNESS_VERSION} from '../../metadata/rcServicePolicy.js';
import {DIRECT_MOMENT_COMPARISON_VERSION} from '../../metadata/directMomentComparisonPolicy.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {stableHash} from '../../core/stableHash.js';
import {workflowModelInput} from '../../core/workflowIdentity.js';

export function evaluateRefinedDirectStability(model,member,details,set){
 const proof=set?.stiffnessProvenance,mesh=proof?.frameRefinement,trace=set?.secondOrderTrace,collection=set?.firstOrderMomentComparison,comparison=collection?.members?.[member.id];
 const blockers=[],factor=proof?.memberFactors?.find(r=>r.memberId===member.id),recovery=set?.memberResults?.[member.id];
 if(details.some(d=>d.stabilityStandard!=='KDS-142020-2022'))blockers.push('STABILITY_STANDARD_SELECTION_REQUIRED');
 if(proof?.rcPolicyVersion!==RC_SERVICE_ITERATION_VERSION||proof?.kdsSecondOrderPolicy!==KDS_SECOND_ORDER_STIFFNESS_VERSION||proof?.sourceModelHash!==stableHash(workflowModelInput(model))||typeof proof?.appliedProfileHash!=='string'||!/^[a-f0-9]{64}$/.test(proof.appliedProfileHash)||proof.localMagnifierApplied!==false||!factor)blockers.push('KDS_APPLIED_STIFFNESS_PROOF_REQUIRED');
 if(!mesh?.converged||!Number.isInteger(mesh.divisions)||mesh.divisions<2||mesh.divisions>8||!Number.isFinite(mesh.maximumNormalizedChange)||mesh.maximumNormalizedChange<0||mesh.maximumNormalizedChange>1||!Number.isFinite(mesh.tolerance)||mesh.tolerance<=0||mesh.tolerance>.02||!(mesh.comparisons>0)||recovery?.refinement?.cutEquilibriumVerified!==true||recovery.refinement.divisions!==mesh.divisions)blockers.push('DIRECT_FRAME_REFINEMENT_PROOF_REQUIRED');
 if(set?.method!=='direct'||trace?.converged!==true||trace.frameDivisions!==mesh?.divisions||!Array.isArray(trace?.limitationCodes)||trace.limitationCodes.length)blockers.push('DIRECT_FORMULATION_LIMITATIONS_REMAIN');
 if(collection?.version!==DIRECT_MOMENT_COMPARISON_VERSION||collection.limit!==1.4||comparison?.intervalCoverageVerified!==true||!['WITHIN_RECOVERY_INTERVALS','EXCEEDS_IN_RECOVERY_INTERVALS'].includes(comparison?.status)||!['My','Mz'].every(k=>Number.isFinite(comparison?.axes?.[k]?.maximumFiniteRatio)&&comparison.axes[k].maximumFiniteRatio>=0))blockers.push('FULL_MEMBER_MOMENT_COMPARISON_REQUIRED');
 // A status label from a superseded comparison is not a current numerical failure.
 const comparisonVerified=!blockers.includes('FULL_MEMBER_MOMENT_COMPARISON_REQUIRED');
 const excess=comparisonVerified&&comparison?.status==='EXCEEDS_IN_RECOVERY_INTERVALS',axes=Object.values(comparison?.axes||{});
 const ratio=axes.length===2&&axes.every(a=>Number.isFinite(a.maximumFiniteRatio))&&!axes.some(a=>a.zeroReferenceExceedance)?Math.max(...axes.map(a=>a.maximumFiniteRatio)):null;
 return {status:excess?'NG':blockers.length?'NOT_CHECKED':'OK',ratio:excess||!blockers.length?ratio:null,reason:excess?'DIRECT_MOMENT_AMPLIFICATION_LIMIT_EXCEEDED':blockers[0]??null,
  incomplete:blockers.length>0,incompleteReasons:blockers,methodReviewRequired:true,qualification:'clause-scoped-not-whole-design',globalStabilityQualified:false,designTransferAllowed:false,
  codeReferences:getKcscRuleSources(['142020']).map(r=>({...r,clause:'4.4.2(2),(3),(4); 4.4.4',applicationScope:'specified-inertia elastic second-order path and retained full-member moment comparison'})),
  method:'refined-direct-elastic-second-order',momentComparison:comparison??null,frameRefinement:mesh??null,appliedMemberStiffness:factor??null,solverLimitations:trace?.limitationCodes??null,
  localMagnifierApplied:false,strengthDemandBasis:'converged refined Direct force fields unchanged',minimumEccentricityBasis:'no 4.4.6 magnifier added to the 4.4.4 elastic second-order path; model imperfections and method qualification remain separate',
  scope:'calculated refined Direct member response and 1.4 moment limit; not independent method certification'};
}
