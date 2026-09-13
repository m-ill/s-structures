import {reinforcementMassQuantity} from '../rc/reinforcementMassQuantity.js';
import {splitRepeatedDistribution} from '../rc/splitRepeatedDistribution.js';
import {crossTieGeometry} from '../rc/crossTieGeometry.js';
import {crossTieAssembly} from '../rc/crossTieAssembly.js';
import {transverseReinforcementQuantity} from '../rc/transverseReinforcementQuantity.js';
export function alternatingJointCrossTies(detail,prepared,{B,H,length}){
 const split=splitRepeatedDistribution(prepared.stirrupDistribution,2);
 const nc=reason=>({status:'NOT_CHECKED',reason,pieces:[],nominalQuantity:{status:'NOT_CHECKED',reason}});
 if(split.status!=='OK')return nc(split.reason);
 if(!Array.isArray(detail.crossTieHookSides))return nc('CROSS_TIE_ORIENTATION_AND_PLANE_REQUIRED');
 const phases=[];
 for(const group of split.groups){
  const distribution=group.distribution,sides=detail.crossTieHookSides?.map(s=>group.sourceIndexOffset===0?s:s==='left'?'right':s==='right'?'left':s);
  const phaseDetail={...detail,stirrups:{...detail.stirrups,spacing:distribution.spacing},tieFirstStart:distribution.first,tieFirstEnd:length-distribution.last,crossTieHookSides:sides};
  const shape=crossTieGeometry(phaseDetail,{B,H,length});
  if(!shape.pieces?.length)return nc(shape.reason||'ALTERNATING_CROSS_TIE_GEOMETRY_REQUIRED');
  shape.pieces=shape.pieces.map(p=>({...p,mark:`${p.mark}-${group.sourceIndexOffset+1}`,sourceMark:p.mark,sourceIndexOffset:group.sourceIndexOffset,sourceIndexStride:2,distribution}));
  const quantity=transverseReinforcementQuantity(phaseDetail,{...prepared,stirrupDistribution:distribution,crossTies:shape});
  if(quantity.status!=='OK')return nc(quantity.reason);
  phases.push({group,shape,quantity});
 }
 const pieces=phases.flatMap(p=>p.shape.pieces),assembly=crossTieAssembly({pieces,bars:detail.bars,distribution:prepared.stirrupDistribution,length,hoopGeometry:{B,H,cover:detail.cover,diameter:detail.stirrups.diameter,insideRadius:detail.tieBendInsideRadius}});
 const prototype=phases[0].quantity,outer={...prototype.rows[0],count:prepared.stirrupDistribution.count};outer.totalLength=outer.count*outer.geometricLength;outer.volume=outer.totalLength*outer.area;outer.massQuantity=reinforcementMassQuantity(detail.stirrups?.unitMassKgPerM,[{length:outer.geometricLength,count:outer.count}]);
 const rows=[outer,...phases.flatMap(p=>p.quantity.rows.filter(r=>r.kind==='cross-tie'))],nominalQuantity={...prototype,rows,totalLength:rows.reduce((n,r)=>n+r.totalLength,0),volume:rows.reduce((n,r)=>n+r.volume,0)};
 return {status:phases.some(p=>p.shape.status==='NG')||assembly.status==='NG'?'NG':'OK',pieces,assembly,assemblyStatus:assembly.status,assemblyReason:'ALTERNATING_CROSS_TIE_FULL_JOINT_REVIEW_REQUIRED',pattern:'alternating-hook-side',phaseCounts:phases.map(p=>p.group.distribution.count),codeReferences:phases[0].shape.codeReferences,nominalQuantity};
}
