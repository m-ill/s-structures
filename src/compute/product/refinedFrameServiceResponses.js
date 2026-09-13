import {prepareRcMemberServiceResponses} from './rcMemberServiceResponses.js';
import {stableHash} from '../../core/stableHash.js';

// Retain the solved nodal trial field before internal refinement nodes are removed.
export function prepareRefinedFrameServiceResponses(refinement,result){
 const segments=[],members=new Map(refinement.model.members.map(m=>[m.id,m]));
 for(const row of refinement.mapping){
  const axes=[row.axes.x,row.axes.y,row.axes.z];
  for(const part of row.parts){
   const member=members.get(part.id);
   const localDisplacements=[member?.n1,member?.n2].flatMap(id=>{
    const d=result?.disp?.[id];
    if(!d||d.length!==6||!Array.from(d).every(Number.isFinite))throw Error('REFINED_SERVICE_NODE_DISPLACEMENTS_REQUIRED');
    return [0,3].flatMap(offset=>axes.map(axis=>axis.reduce((sum,v,i)=>sum+v*d[offset+i],0)));
   });
   segments.push({memberId:row.memberId,startX:part.startX,endX:part.endX,localDisplacements});
  }
 }
 return prepareRcMemberServiceResponses(segments);
}

export function verifyRefinedFrameServiceResponses(set,divisions){
 if(!Number.isInteger(divisions)||divisions<2||divisions>8)return false;
 const ids=Object.keys(set?.memberResults||{}),responses=set?.memberServiceResponses;
 if(!ids.length||ids.length>30||!responses||Object.keys(responses).length!==ids.length)return false;
 const segments=[];
 for(const id of ids){
  const r=responses[id],length=set.memberResults[id]?.forceRecoveryInput?.L;
  if(r?.memberId!==id||r.length!==length||!Array.isArray(r.segments)||r.segments.length!==divisions||r.segments.some(s=>s.memberId!==id))return false;
  segments.push(...r.segments);
 }
 try{return stableHash(prepareRcMemberServiceResponses(segments))===stableHash(responses);}catch{return false;}
}
