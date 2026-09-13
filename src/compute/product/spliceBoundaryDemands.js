import {verifyRecoverySource} from './recoverySourceVerification.js';
import {memberForceFromRecovery} from '../../solver/memberForceField.js';
export function supplementSpliceDemands(model,member,details,row,tuples){
 const current=new Map();for(const s of model.designDetails?.splices||[])if(!current.has(s.id)||current.get(s.id).version<s.version)current.set(s.id,s);
 const refs=new Set(details.map(d=>`${d.id}@${d.version}`)),selected=[...current.values()].filter(s=>s.memberId===member.id&&s.continuationSide&&refs.has(s.reinforcementId));
 if(!selected.length)return {tuples,status:'N_A',added:0};
 const r=row?.forceRecoveryInput,nc=reason=>({tuples,status:'NOT_CHECKED',reason,added:0});
 if(!['member-force-recovery-v1','member-force-recovery-v2-geometric','member-force-recovery-v3-piecewise'].includes(r?.version)||!Array.isArray(r.endForces)||r.endForces.length!==12||!r.endForces.every(Number.isFinite)||!Array.isArray(r.spanLoads)||!tuples.length)return nc('BOUNDARY_FORCE_RECOVERY_SOURCE_REQUIRED');
 if(!Number.isFinite(r.L)||r.L<=0||r.spanLoads.length>10000)return nc('BOUNDARY_FORCE_RECOVERY_SOURCE_INVALID');
 const nodes=[member.n1,member.n2].map(id=>model.nodes?.find(n=>n.id===id));
 const length=nodes.every(Boolean)?Math.hypot(nodes[1].x-nodes[0].x,nodes[1].y-nodes[0].y,nodes[1].z-nodes[0].z):NaN;
 const sourceVerification=verifyRecoverySource(r,tuples,length,row.loadRecoveryIssues||[]);
 if(sourceVerification.status!=='OK')return {...nc(sourceVerification.reason),sourceVerification};
 const basis=r.version==='member-force-recovery-v3-piecewise'?'stored-piecewise-material-and-geometric-fields':r.version==='member-force-recovery-v2-geometric'?'stored-elastic-end-span-loads-and-geometric-end-field':'stored-equilibrium-end-and-span-loads';
 const positions=[...new Set(selected.flatMap(s=>[s.start*r.L,s.end*r.L]))].sort((a,b)=>a-b);
 if(positions.some(x=>!Number.isFinite(x)||x<0||x>r.L)||tuples.length+2*positions.length>600)return nc('BOUNDARY_FORCE_RECOVERY_POSITION_LIMIT');
 const byX=new Map();for(const t of tuples){if(!byX.has(t.x))byX.set(t.x,[]);byX.get(t.x).push(t);}
 let recovered=0;
 for(const x of positions){
  const sides=x===0?['right']:x===r.L?['left']:['left','right'],rows=[];
  for(const side of sides){
   let force;try{force=memberForceFromRecovery(r,x,side);}catch{return nc('BOUNDARY_FORCE_RECOVERY_FAILED');}
   if(!Object.values(force).every(Number.isFinite))return nc('BOUNDARY_FORCE_RECOVERY_FAILED');
   rows.push({...tuples[0],...force,T:force.Tq,x,side,recoveryBasis:basis,demandInterpolated:false});recovered++;
  }
  byX.set(x,rows);
 }
 const result=[...byX].sort((a,b)=>a[0]-b[0]).flatMap(([,rows])=>rows).map((t,station)=>({...t,station}));
 return {tuples:result,status:'OK',added:result.length-tuples.length,recovered,positions,sourceVerification,basis,demandInterpolated:false};
}
