import {memberForceFromRecovery} from '../memberForceField.js';
export function compareFrameRefinements(before,after,tolerance){
 let maximumNormalizedChange=0,comparisons=0;
 const compare=(a,b,absolute)=>{
  if(![a,b].every(Number.isFinite))throw Error('REFINEMENT_NONFINITE_RESPONSE');
  maximumNormalizedChange=Math.max(maximumNormalizedChange,Math.abs(a-b)/(absolute+tolerance*Math.max(Math.abs(a),Math.abs(b))));comparisons++;
 };
 for(const [id,values] of Object.entries(before.disp||{})){
  if(!after.disp?.[id]||values.length!==6)throw Error('REFINEMENT_NODE_COVERAGE_REQUIRED');
  values.forEach((v,i)=>compare(v,after.disp[id][i],i<3?1e-9:1e-10));
 }
 for(const [id,row] of Object.entries(before.memberResults||{})){
  const next=after.memberResults?.[id];if(!next)throw Error('REFINEMENT_MEMBER_COVERAGE_REQUIRED');
  const positions=new Map();
  for(const r of [row,next])r.xs.forEach((x,i)=>positions.set(JSON.stringify([x,r.stationSides?.[i]??'point']),[x,r.stationSides?.[i]??'point']));
  if(positions.size>1200)throw Error('REFINEMENT_COMPARISON_WORK_LIMIT');
  for(const [x,side] of positions.values()){
   const a=memberForceFromRecovery(row.forceRecoveryInput,x,side),b=memberForceFromRecovery(next.forceRecoveryInput,x,side);
   for(const k of ['N','Vy','Vz','Tq','My','Mz'])compare(a[k],b[k],['My','Mz','Tq'].includes(k)?1e-7:1e-6);
  }
 }
 for(const [id,response] of Object.entries(before.memberServiceResponses||{})){
  const next=after.memberServiceResponses?.[id];
  if(!next)throw Error('REFINEMENT_SERVICE_COVERAGE_REQUIRED');
  for(const boundary of ['chord','cantilever-start','cantilever-end'])for(const axis of ['v','w'])
   compare(response[boundary]?.[axis]?.maxAbs,next[boundary]?.[axis]?.maxAbs,1e-9);
 }
 return {converged:maximumNormalizedChange<=1,maximumNormalizedChange,comparisons,tolerance,absoluteTolerances:{translation:1e-9,rotation:1e-10,force:1e-6,moment:1e-7},scope:'physical nodal response, union of recovered force stations and relative deflection extrema; independent method qualification separate'};
}
