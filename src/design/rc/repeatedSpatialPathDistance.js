import {segmentClosest} from './repeatedPathDistance.js';
import {repeatedTieDistance} from './repeatedTieDistance.js';
// Distance between convex segments is convex under translation of one segment.
// Binary search its regular station sequence, then test the shortened last
// station independently. No translated geometry array is materialized.
export function repeatedSpatialPathDistance({a,b,c,d,distribution,offset=0}){
 const nc=reason=>({status:'NOT_CHECKED',reason,distance:null});
 if(repeatedTieDistance(distribution,0,0).status!=='OK')return nc('REPEATED_TIE_DISTRIBUTION_INVALID');
 if(![a,b,c,d].every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite))||!Number.isFinite(offset))return nc('SPATIAL_PATH_GEOMETRY_REQUIRED');
 const {count,first,last,spacing}=distribution,cache=new Map();
 const at=index=>{
  if(cache.has(index))return cache.get(index);
  const plane=(index===count-1?last:first+index*spacing)+offset;
  const r={...segmentClosest([a[0]+plane,a[1],a[2]],[b[0]+plane,b[1],b[2]],c,d),index,plane};
  cache.set(index,r);return r;
 };
 let lo=0,hi=Math.max(0,count-2);
 while(lo<hi){const mid=lo+Math.floor((hi-lo)/2);if(at(mid).distance<=at(mid+1).distance)hi=mid;else lo=mid+1;}
 let best=at(lo);const final=at(count-1);if(final.distance<best.distance)best=final;
 if([...cache.values()].some(r=>!Number.isFinite(r.distance)))return nc('SPATIAL_PATH_DISTANCE_NONFINITE');
 return {status:'OK',...best,stationCandidates:cache.size,method:'convex-discrete-search-and-final-point'};
}
