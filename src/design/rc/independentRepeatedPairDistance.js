import {splitRepeatedDistribution} from './splitRepeatedDistribution.js';
import {repeatedTieDistance} from './repeatedTieDistance.js';
import {repeatedSpatialPathDistance} from './repeatedSpatialPathDistance.js';
// Independent arithmetic sequences with a shared pitch and optional shortened
// final intervals. Four relative progressions cover every pair without expansion.
export function independentRepeatedPairDistance({a,b,c,d,distributionA:A,distributionB:B}){
 const nc=reason=>({status:'NOT_CHECKED',reason,distance:null});
 if(repeatedTieDistance(A,0,0).status!=='OK'||repeatedTieDistance(B,0,0).status!=='OK')return nc('INDEPENDENT_REPEAT_DISTRIBUTION_INVALID');
 if(A.spacing!==B.spacing){
  const splitA=A.spacing<B.spacing,small=splitA?A:B,large=splitA?B:A,stride=Math.round(large.spacing/small.spacing);
  if(!Number.isInteger(stride)||stride<2||stride>8||small.spacing*stride!==large.spacing)return nc('INDEPENDENT_REPEAT_COMMENSURATE_PITCH_REQUIRED');
  const split=splitRepeatedDistribution(small,stride);if(split.status!=='OK')return nc(split.reason);
  let best,stationEvaluations=0;
  for(const group of split.groups){
   const r=independentRepeatedPairDistance({a,b,c,d,distributionA:splitA?group.distribution:A,distributionB:splitA?B:group.distribution});
   if(r.status!=='OK')return r;
   stationEvaluations+=r.stationEvaluations;
   if(!best||r.distance<best.distance){const indices=[...r.indices],axis=splitA?0:1;indices[axis]=group.sourceIndexOffset+indices[axis]*group.sourceIndexStride;best={distance:r.distance,s:r.s,t:r.t,indices,relativeShift:r.relativeShift};}
  }
  return {status:'OK',...best,stationEvaluations,partitionCount:split.groups.length,method:'bounded-residue-class-relative-progressions'};
 }
 const m=A.count-1,n=B.count-1,pitch=A.spacing,groups=[];
 if(m&&n)groups.push({count:m+n-1,first:A.first-B.first-(n-1)*pitch,last:A.first-B.first+(m-1)*pitch,map:k=>{const delta=k-(n-1);return [Math.max(0,delta),Math.max(0,-delta)];}});
 if(n)groups.push({count:n,first:A.last-B.first-(n-1)*pitch,last:A.last-B.first,map:k=>[A.count-1,n-1-k]});
 if(m)groups.push({count:m,first:A.first-B.last,last:A.first+(m-1)*pitch-B.last,map:k=>[k,B.count-1]});
 groups.push({count:1,first:A.last-B.last,last:A.last-B.last,map:()=>[A.count-1,B.count-1]});
 if(groups.some(g=>!Number.isSafeInteger(g.count)||g.count<1||![g.first,g.last].every(Number.isFinite)))return nc('INDEPENDENT_REPEAT_RANGE_LIMIT');
 let best,stationEvaluations=0;
 for(const g of groups){
  const r=repeatedSpatialPathDistance({a,b,c,d,distribution:{status:'OK',explicitEnds:true,count:g.count,first:g.first,last:g.last,spacing:pitch}});
  if(r.status!=='OK')return r;
  stationEvaluations+=r.stationCandidates;
  if(!best||r.distance<best.distance)best={distance:r.distance,s:r.s,t:r.t,indices:g.map(r.index),relativeShift:r.plane};
 }
 return {status:'OK',...best,stationEvaluations,method:'four-independent-relative-progressions'};
}
