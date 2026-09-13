import {independentRepeatedPairDistance} from './independentRepeatedPairDistance.js';
import {repeatedTieDistance} from './repeatedTieDistance.js';
import {repeatedSpatialPathDistance} from './repeatedSpatialPathDistance.js';
// Relative positions of two identical station sequences consist of regular
// positive/negative differences plus each shortened final-to-regular sequence.
// Search those four progressions; no O(count²) station-pair expansion.
export function repeatedSpatialPairDistance({a,b,c,d,distribution,distributionB,excludeSameStation=false}){
 const nc=reason=>({status:'NOT_CHECKED',reason,distance:null});
 if(repeatedTieDistance(distribution,0,0).status!=='OK')return nc('REPEATED_TIE_DISTRIBUTION_INVALID');
 if(typeof excludeSameStation!=='boolean')return nc('REPEATED_PAIR_EXCLUSION_INVALID');
 if(!excludeSameStation)return independentRepeatedPairDistance({a,b,c,d,distributionA:distribution,distributionB:distributionB??distribution});
 if(distributionB!==undefined&&distributionB!==distribution)return nc('INDEPENDENT_REPEAT_EXCLUSION_REQUIRES_MAPPING');
 const {count,first,last,spacing}=distribution,regular=count-1,span=(regular-1)*spacing,range=last-first;
 let groups=count===1?[{count:1,first:0,last:0,map:()=>[0,0]}]:[
  {count:regular,first:0,last:span,map:k=>[k,0]},
  {count:regular,first:-span,last:0,map:k=>[0,regular-1-k]},
  {count:regular,first:range-span,last:range,map:k=>[count-1,regular-1-k]},
  {count:regular,first:-range,last:span-range,map:k=>[k,count-1]},
 ];
 if(excludeSameStation){
  groups=count===1?[]:[...(regular>1?[
   {count:regular-1,first:spacing,last:span,map:k=>[k+1,0]},
   {count:regular-1,first:-span,last:-spacing,map:k=>[0,regular-1-k]},
  ]:[]),...groups.slice(2)];
 }
 if(!groups.length)return {status:'N_A',reason:'SINGLE_STATION_NO_REPEAT_PAIR',distance:null,stationEvaluations:0};
 let best,stationEvaluations=0;
 for(const g of groups){
  const r=repeatedSpatialPathDistance({a,b,c,d,distribution:{status:'OK',explicitEnds:true,count:g.count,first:g.first,last:g.last,spacing}});
  if(r.status!=='OK')return r;
  stationEvaluations+=r.stationCandidates;
  if(!best||r.distance<best.distance)best={distance:r.distance,s:r.s,t:r.t,indices:g.map(r.index),relativeShift:r.plane};
 }
 return {status:'OK',...best,stationEvaluations,method:'four-relative-station-progressions'};
}
