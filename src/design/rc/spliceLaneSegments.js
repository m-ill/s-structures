// Mechanical piece extents shared by fabrication paths and analysis meshing.
export function spliceLaneSegments({startX:from,endX:to,splices}){
 const nc=reason=>({status:'NOT_CHECKED',reason});
 if(![from,to].every(Number.isFinite)||from<0||from>=to)return nc('SPLICE_PIECE_REGION_REQUIRED');
 if(!Array.isArray(splices)||!splices.length||splices.length>100)return nc('SPLICE_PIECE_INPUT_REQUIRED');
 const ordered=[...splices].sort((a,b)=>a.startX-b.startX);
 for(const [i,s] of ordered.entries())if(![s.startX,s.endX,s.offsetY,s.offsetZ].every(Number.isFinite)||s.startX<from||s.endX>to||s.startX>=s.endX||i&&s.startX<ordered[i-1].endX)return nc('SPLICE_PIECE_INTERVAL_INVALID');
 if(ordered.some(s=>!['offset-toward-start','offset-toward-end'].includes(s.continuationSide)))return nc('SPLICE_CONTINUATION_SIDE_REQUIRED');
 const lane=(s,incoming)=>s.continuationSide===(incoming?'offset-toward-start':'offset-toward-end')?[s.offsetY,s.offsetZ]:[0,0];
 let current=lane(ordered[0],true),start=from;const segments=[];
 for(const s of ordered){
  const incoming=lane(s,true);if(incoming.some((v,i)=>Math.abs(v-current[i])>1e-10))return nc('SPLICE_PIECE_LANE_DISCONTINUITY');
  segments.push({startX:start,endX:s.endX,offset:current,endSpliceId:s.id});start=s.startX;current=lane(s,false);
 }
 segments.push({startX:start,endX:to,offset:current});return {status:'OK',segments};
}
