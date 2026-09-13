import {jointColumnContactPaths} from './jointColumnContactPaths.js';
import {crossTieContactCoverage} from '../rc/crossTieContactCoverage.js';
export function jointCrossTieSupport(model,joint,prepared,congestion,{mappedPaths}={}){
 const base={fabricationApproved:false,methodReviewRequired:true,scope:'declared cross-tie hook contact with mapped straight column paths at all repeated planes; seismic anchorage and confinement credit separate'};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason,checks:[]});
 if(!prepared?.crossTies?.pieces?.length||prepared.crossTies.pieces.length>40)return nc('JOINT_CROSS_TIE_SUPPORT_PATHS_REQUIRED');
 const mapped=mappedPaths||jointColumnContactPaths(model,prepared,congestion);if(!mapped.ok)return nc(mapped.reason);
 const {detail,sourcePaths}=mapped;
 const contact=crossTieContactCoverage(detail,mapped.prepared);
 return {...contact,...base,reason:contact.status==='OK'?null:'JOINT_CROSS_TIE_ACTUAL_CONTACT_REQUIRED',columnDetailId:detail.id,columnDetailVersion:detail.version,sourcePaths,codeReferences:prepared.crossTies.codeReferences||[]};
}
