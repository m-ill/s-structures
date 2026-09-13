import {memberForceFromRecovery} from '../memberForceField.js';
// Preserve each element's recovery law, including geometric forces. Replacing
// it with a single linear end-moment interpolation would discard local P-delta.
export function collapseDirectFrameResult(refinement,result){
 if(!result?.ok)throw Error('REFINEMENT_RESULT_REQUIRED');
 const memberResults={};
 for(const row of refinement.mapping){
  const parts=row.parts.map(p=>({...p,result:result.memberResults?.[p.id]}));
  if(parts.some(p=>!p.result?.forceRecoveryInput||p.result.loadRecoveryIssues?.length))throw Error('REFINEMENT_FORCE_RECOVERY_REQUIRED');
  const end=[...parts[0].result.structuralEnd.slice(0,6),...parts.at(-1).result.structuralEnd.slice(6)];
  const pieces=parts.map(p=>({startX:p.startX,endX:p.endX,input:structuredClone(p.result.forceRecoveryInput)}));
  const spanLoads=parts.flatMap(p=>p.result.forceRecoveryInput.spanLoads.map(l=>{
   if(l.type==='udl'){
    const q1=l.q.map(v=>l.shape==='asc'?0:v),q2=l.q.map(v=>l.shape==='desc'?0:v);
    return {type:'distributed-linear',a:p.startX,b:p.endX,q1,q2};
   }
   return {...structuredClone(l),...(l.a!==undefined?{a:l.a+p.startX}:{}),...(l.b!==undefined?{b:l.b+p.startX}:{})};
  }));
  const input={version:'member-force-recovery-v3-piecewise',L:row.length,endForces:end,spanLoads,pieces};
  const stations=[];
  for(const [i,p] of parts.entries())for(let j=0;j<p.result.xs.length;j++){
   const local=p.result.xs[j],x=j===0?p.startX:j===p.result.xs.length-1?p.endX:p.startX+local;
   const side=i>0&&j===0?'right':i<parts.length-1&&j===p.result.xs.length-1?'left':p.result.stationSides?.[j]??'point';
   stations.push({x,side,...memberForceFromRecovery(input,x,side)});
  }
  if(stations.length>600)throw Error('REFINEMENT_STATION_LIMIT');
  // Cut-node equilibrium must hold apart from an actual point action there.
  const loadsOnly={version:'member-force-recovery-v1',L:row.length,endForces:Array(12).fill(0),spanLoads};
  for(const p of parts.slice(1)){
   const left=memberForceFromRecovery(input,p.startX,'left'),right=memberForceFromRecovery(input,p.startX,'right');
   const loadLeft=memberForceFromRecovery(loadsOnly,p.startX,'left'),loadRight=memberForceFromRecovery(loadsOnly,p.startX,'right');
   for(const k of ['N','Vy','Vz','Tq','My','Mz'])if(Math.abs(right[k]-left[k]-(loadRight[k]-loadLeft[k]))>1e-8+1e-7*Math.max(Math.abs(left[k]),Math.abs(right[k])))throw Error('REFINEMENT_CUT_EQUILIBRIUM_REQUIRED');
  }
  memberResults[row.memberId]={ax:row.axes,L:row.length,xs:stations.map(s=>s.x),stationSides:stations.map(s=>s.side),...Object.fromEntries(['N','Vy','Vz','Tq','My','Mz'].map(k=>[k,stations.map(s=>s[k])])),T:stations.map(s=>s.Tq),end,structuralEnd:end,forceRecoveryInput:input,loadRecoveryIssues:[],signConvention:'solver-native',refinement:{divisions:refinement.divisions,version:refinement.version,cutEquilibriumVerified:true}};
 }
 const physical=record=>Object.fromEntries(refinement.originalNodeIds.filter(id=>record?.[id]!==undefined).map(id=>[id,structuredClone(record[id])]));
 return {...result,memberResults,disp:physical(result.disp),reactions:physical(result.reactions)};
}
