import {spliceGeometry} from '../../design/rc/spliceGeometry.js';
import {parseVersionedId} from '../../materials/registry.js';
export function jointSplicePlacement(model,targets,budget){
 const fail=reason=>({attempted:true,ok:false,reason});
 if(targets.length<2||targets.length>16)return fail('JOINT_SPLICE_TARGET_LIMIT');
 const ids=new Set(targets.map(t=>t.splice.id)),members=new Set(targets.map(t=>t.splice.memberId)),latest=new Map();
 for(const s of model.designDetails.splices)if(members.has(s.memberId)&&(!latest.has(s.id)||latest.get(s.id).version<s.version))latest.set(s.id,s);
 if(latest.size>128)return fail('JOINT_SPLICE_PEER_LIMIT');
 const share=(a,b)=>a.memberId===b.memberId&&parseVersionedId(a.reinforcementId).id===parseVersionedId(b.reinforcementId).id&&a.barIndices.some(i=>b.barIndices.includes(i));
 const rows=targets.map(t=>({...t})).sort((a,b)=>a.splice.start-b.splice.start||(a.splice.id<b.splice.id?-1:a.splice.id>b.splice.id?1:0));
 for(const row of rows)for(const peer of latest.values())if(!ids.has(peer.id)&&share(row.splice,peer)){
  if(peer.end<=row.splice.start)row.lower=Math.max(row.lower,peer.end);
  else if(peer.start>=row.splice.end)row.upper=Math.min(row.upper,peer.start-row.span);
  else return fail('JOINT_SPLICE_ORIGINAL_OVERLAP');
 }
 // Propagate room needed by following shared-bar intervals before placing earlier ones.
 for(let i=rows.length-1;i>=0;i--)for(let j=i+1;j<rows.length;j++)if(share(rows[i].splice,rows[j].splice))rows[i].upper=Math.min(rows[i].upper,rows[j].upper-rows[i].span);
 for(let i=0;i<rows.length;i++){
  const row=rows[i];for(let j=0;j<i;j++)if(share(rows[j].splice,row.splice))row.lower=Math.max(row.lower,rows[j].next.end);
  if(row.lower>row.upper+1e-10)return fail('JOINT_SPLICE_INTERVAL_INFEASIBLE');
  const start=Math.max(row.lower,Math.min(row.upper,row.centre-row.span/2));
  row.next={...row.splice,start:Math.max(row.command.start,start),end:Math.min(row.command.end,start+row.span)};
 }
 if(budget.remaining<rows.length)return fail('SPLICE_POSITION_SEARCH_LIMIT');
 const replacements=new Map(rows.map(r=>[r.splice.id,r.next])),trial={...model,designDetails:{...model.designDetails,splices:[...latest.values()].map(s=>replacements.get(s.id)||s)}};
 for(const row of rows){budget.remaining--;budget.used++;const fit=spliceGeometry(trial,row.next);if(fit.status!=='OK')return {...fail('JOINT_SPLICE_GEOMETRY_UNRESOLVED'),geometryReason:fit.reason};}
 return {attempted:true,ok:true,method:'ordered-shared-bar-interval-bounds',repairs:rows.map(row=>({id:row.splice.id,version:row.splice.version,reinforcementId:row.splice.reinforcementId,start:row.next.start,end:row.next.end,requiredLength:row.length,positionStrategy:'joint-shift-preserving-overlap',centreShiftM:((row.next.start+row.next.end)/2-row.centre)*row.memberLength})),basisCheckIds:[...new Set(rows.flatMap(r=>r.basisCheckIds))]};
}
