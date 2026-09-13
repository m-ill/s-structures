import {spliceGeometry} from '../../design/rc/spliceGeometry.js';
// Search contact boundaries of occupied intervals, retaining the original overlap.
export function searchSplicePosition(model,splice,{span,lower,upper,centre,initialStart},budget){
 const peers=[];for(const peer of model.designDetails.splices)if(peer.id!==splice.id&&peer.memberId===splice.memberId){if(peers.length>=128)return {ok:false,reason:'SPLICE_POSITION_PEER_LIMIT'};peers.push(peer);}
 const candidates=[],seen=new Set([initialStart]);
 const add=(start,end)=>{if(![start,end].every(Number.isFinite)||start<lower-1e-10||start>upper+1e-10||seen.has(start))return;seen.add(start);candidates.push({start,end});};
 add(lower,lower+span);add(upper,upper+span);
 for(const peer of peers){add(peer.start-span,peer.start);add(peer.end,peer.end+span);}
 candidates.sort((a,b)=>Math.abs((a.start+a.end)/2-centre)-Math.abs((b.start+b.end)/2-centre)||a.start-b.start);
 let lastReason=null;
 for(const point of candidates){
  if(budget.remaining<=0)return {ok:false,reason:'SPLICE_POSITION_SEARCH_LIMIT',lastReason};
  budget.remaining--;budget.used++;
  const next={...splice,...point},fit=spliceGeometry(model,next);
  if(fit.status==='OK')return {ok:true,next,fit};lastReason=fit.reason;
 }
 return {ok:false,reason:'SPLICE_POSITION_SEARCH_EXHAUSTED',lastReason};
}
