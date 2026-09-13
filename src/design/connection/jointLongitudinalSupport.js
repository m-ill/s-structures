import {crossTieSupports} from '../rc/crossTieSupports.js';
export function jointLongitudinalSupport(joint,prepared,detail,mapped){
 const base={methodReviewRequired:true,fabricationApproved:false,policy:'existing KDS 142050 lateral-support owner; 150 mm interpretation review remains open'};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason,checks:[]});
 const perimeter=detail.outerHoopSupport?.perimeterLayout;
 if(!mapped?.ok||perimeter?.status!=='OK'||detail.outerHoopSupport.columnDetailId!==mapped.detail.id||detail.outerHoopSupport.columnDetailVersion!==mapped.detail.version)return nc('JOINT_ACTUAL_PERIMETER_SUPPORT_REQUIRED');
 const pairs=joint.jointCrossTieBarPairs||[];
 if(pairs.length&&detail.crossTieSupport?.status!=='OK')return nc('JOINT_ALL_CROSS_TIE_CONTACT_REQUIRED');
 if(pairs.length&&!prepared.crossTies?.pieces?.length)return nc('JOINT_CROSS_TIE_SHAPES_REQUIRED');
 const r=crossTieSupports({bars:mapped.detail.bars,cornerIndices:perimeter.cornerBarIndices.map(i=>i-1),orderedIndices:perimeter.positions.map(p=>p.barIndex-1),pairs,diameter:joint.reinforcement?.diameter,insideRadius:joint.jointBendInsideRadius,tail:joint.jointHookTail,perimeterPositions:mapped.detail.bars.map((_,i)=>perimeter.positions.find(p=>p.barIndex===i+1)?.s),perimeterLength:perimeter.perimeter});
 return {...r,...base,columnDetailId:mapped.detail.id,columnDetailVersion:mapped.detail.version,codeReferences:detail.codeReferences||[],reason:r.status==='NG'?'JOINT_LONGITUDINAL_LATERAL_SUPPORT_INSUFFICIENT':r.reason||null};
}
