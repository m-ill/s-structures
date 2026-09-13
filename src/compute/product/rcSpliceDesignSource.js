import {prepareRcMemberServiceResponses} from './rcMemberServiceResponses.js';
import {validRcSpliceSecondOrder,validRcSpliceSpatialProof} from '../../metadata/rcSplicePolicy.js';
// Shared candidate/published result conversion; no alternate numerical solver.
export function rcSpliceDesignSource(result){
 const fail=code=>{throw Object.assign(Error(code),{code});};
 if(!validRcSpliceSecondOrder(result))fail('RC_SPLICE_SECOND_ORDER_PROOF_REQUIRED');
 if(!validRcSpliceSpatialProof(result))fail('RC_SPLICE_SPATIAL_PROOF_REQUIRED');
 if(!result.ok||!result.stressIntegrationConvergenceVerified||!result.frameRefinement?.convergenceVerified||!result.elasticRangeSatisfied)fail(result.reason||'RC_SPLICE_DESIGN_SOURCE_CONVERGENCE_REQUIRED');
 return {ok:true,anyOk:true,firstOrderMomentComparison:result.firstOrderMomentComparison,combo:result.combination,method:result.pDeltaMethod??'off',solverMethod:'rc-splice-frame',memberResults:result.memberForceSources,memberServiceResponses:prepareRcMemberServiceResponses(result.segments||[]),reactions:Object.fromEntries(result.originalNodes.map(n=>[n.nodeId,Object.fromEntries(['rx','ry','rz','rmx','rmy','rmz'].map((k,i)=>[k,n.reactions[i]]))])),qualification:{globalMethodQualified:false,designTransferAllowed:false},codeReferences:result.codeReferences};
}
