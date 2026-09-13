import {RC_LAP_DESIGN_LIMITS} from '../../metadata/rcLapDesignCapabilities.js';
import {spliceLaneSegments} from './spliceLaneSegments.js';
import {parseVersionedId} from '../../materials/registry.js';
// One physical lane per original bar. Only concurrently present pieces are
// combined; lap endpoints include both partners without double area credit.
export function classAActualPieceLayouts(detail,splices,length){
 const nc=reason=>({status:'NOT_CHECKED',reason}),latest=new Map();
 for(const s of splices)if(!latest.has(s.id)||latest.get(s.id).version<s.version)latest.set(s.id,s);
 const selected=[...latest.values()].filter(s=>parseVersionedId(s.reinforcementId).id===detail.id);
 if(!selected.some(s=>s.continuationSide))return {status:'OK',layouts:[detail.bars],actual:false};
 if(selected.length>RC_LAP_DESIGN_LIMITS.maxSplices||!detail.bars?.length||detail.bars.length>RC_LAP_DESIGN_LIMITS.maxBars)return nc('CLASS_A_ACTUAL_PIECE_INPUT_LIMIT');
 const from=detail.start*length,to=detail.end*length,paths=[],boundaries=new Set([from,to]);
 for(const [index,bar] of detail.bars.entries()){
  const related=selected.filter(s=>s.barIndices?.some(i=>Number(i)===index+1));
  let segments=[{startX:from,endX:to,offset:[0,0]}];
  if(related.length){
   const lanes=spliceLaneSegments({startX:from,endX:to,splices:related.map(s=>({...s,startX:s.start*length,endX:s.end*length}))});
   if(lanes.status!=='OK')return nc(lanes.reason);segments=lanes.segments;
  }
  paths.push(segments);for(const s of segments){boundaries.add(s.startX);boundaries.add(s.endX);}
 }
 const events=[...boundaries].sort((a,b)=>a-b),stations=events.flatMap((x,i)=>i?[(events[i-1]+x)/2,x]:[x]),unique=new Map();
 for(const x of stations){
  let combinations=[[]];
  for(const segments of paths){
   const offsets=[...new Map(segments.filter(s=>s.startX<=x+1e-10&&s.endX>=x-1e-10).map(s=>[JSON.stringify(s.offset),s.offset])).values()];
   if(!offsets.length)return nc('CLASS_A_ACTUAL_PIECE_COVERAGE_REQUIRED');
   if(combinations.length*offsets.length>RC_LAP_DESIGN_LIMITS.maxLayouts)return nc('CLASS_A_ACTUAL_PIECE_LAYOUT_LIMIT');
   combinations=combinations.flatMap(layout=>offsets.map(offset=>[...layout,offset]));
  }
  for(const offsets of combinations){
   const key=JSON.stringify(offsets);if(unique.has(key))continue;
   if(unique.size>=RC_LAP_DESIGN_LIMITS.maxLayouts)return nc('CLASS_A_ACTUAL_PIECE_LAYOUT_LIMIT');
   unique.set(key,offsets.map(([y,z],i)=>({...detail.bars[i],y:detail.bars[i].y+y,z:detail.bars[i].z+z})));
  }
 }
 return {status:'OK',layouts:[...unique.values()],actual:true,extraLapAreaCredited:false,maximumLayouts:RC_LAP_DESIGN_LIMITS.maxLayouts,coexistenceStationCount:stations.length,basis:'concurrent physical lane combinations from closed piece boundaries and interval interiors; every layout tested against the full demand envelope; actual transverse coordinates including height offsets; no doubled lap area'};
}
