import {memberForceFromRecovery} from '../../solver/memberForceField.js';
export function verifyRecoverySource(input,tuples,length,loadIssues=[]){
 const nc=reason=>({status:'NOT_CHECKED',reason});
 if(loadIssues.length)return nc('BOUNDARY_RECOVERY_LOAD_ISSUES');
 if(!Number.isFinite(length)||length<=0||!Number.isFinite(input?.L)||Math.abs(input.L-length)>1e-9*Math.max(1,length))return nc('BOUNDARY_RECOVERY_LENGTH_MISMATCH');
 const parts=input.version==='member-force-recovery-v3-piecewise'?(Array.isArray(input.pieces)?input.pieces.map(p=>p?.input):null):[input];
 if(!Array.isArray(parts)||!parts.length||parts.length>20||!Array.isArray(tuples)||!tuples.length||parts.some(p=>!p||!['member-force-recovery-v1','member-force-recovery-v2-geometric',undefined].includes(p.version)||!Array.isArray(p.endForces)||p.endForces.length!==12||!p.endForces.every(Number.isFinite)||!Array.isArray(p.spanLoads)))return nc('BOUNDARY_RECOVERY_SOURCE_INVALID');
 if(parts.some(p=>p.spanLoads.some(l=>!['point','moment','udl','distributed-linear','foundation-distributed'].includes(l?.type))))return nc('BOUNDARY_RECOVERY_LOAD_TYPE_UNSUPPORTED');
 if(tuples.length>600||tuples.length*Math.max(1,parts.reduce((n,p)=>n+p.spanLoads.length,0))>200000)return nc('BOUNDARY_RECOVERY_VERIFICATION_WORK_LIMIT');
 const relativeTolerance=1e-8,absoluteTolerance=1e-9;let maximumNormalizedError=0;
 for(const t of tuples){
  let r;try{r=memberForceFromRecovery(input,t.x,t.side||'point');}catch{return nc('BOUNDARY_RECOVERY_SOURCE_INVALID');}
  for(const [key,value] of Object.entries({...r,T:r.Tq})){
   if(key==='Tq')continue;
   if(!Number.isFinite(t[key])||!Number.isFinite(value))return nc('BOUNDARY_RECOVERY_SOURCE_INVALID');
   const error=Math.abs(value-t[key])/(absoluteTolerance+relativeTolerance*Math.max(Math.abs(value),Math.abs(t[key])));
   maximumNormalizedError=Math.max(maximumNormalizedError,error);
   if(error>1)return {...nc('BOUNDARY_RECOVERY_SOURCE_MISMATCH'),quantity:key,x:t.x,side:t.side||'point',sourceValue:t[key],recoveredValue:value};
  }
 }
 return {status:'OK',stationCount:tuples.length,relativeTolerance,absoluteTolerance,maximumNormalizedError,basis:'all supplied source stations; not an independent solver comparison'};
}
