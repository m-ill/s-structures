// This is a sampling audit, not force interpolation or a continuous envelope.
export function spliceIntervalCoverage(model,memberId,details,length,tuples){
 const current=new Map();for(const s of model.designDetails?.splices||[])if(!current.has(s.id)||current.get(s.id).version<s.version)current.set(s.id,s);
 const refs=new Set(details.map(d=>`${d.id}@${d.version}`)),unvisited=[];let intervalCount=0;
 for(const s of current.values()){
  if(s.memberId!==memberId||!s.continuationSide||!refs.has(s.reinforcementId))continue;
  intervalCount++;const startX=s.start*length,endX=s.end*length;
  const valid=[startX,endX].every(Number.isFinite)&&startX>=0&&endX<=length&&startX<endX;
  const visited=valid&&tuples.some(t=>(t.x>startX&&t.x<endX)||(t.x===startX&&['point','right'].includes(t.side||'point'))||(t.x===endX&&t.side==='left'));
  if(!visited)unvisited.push({spliceId:s.id,version:s.version,startX,endX,reason:valid?'SPLICE_INTERVAL_WITHOUT_DEMAND_STATION':'SPLICE_INTERVAL_GEOMETRY_INVALID'});
 }
 return {complete:unvisited.length===0,intervalCount,unvisited,basis:'at-least-one-demand-station-per-declared-splice; continuous-envelope-not-established',demandInterpolated:false};
}
