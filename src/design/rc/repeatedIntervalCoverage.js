import {repeatedTieDistance} from './repeatedTieDistance.js';
export function repeatedIntervalCoverage(d,offset,intervals){
 const tolerance=1e-9;
 if(repeatedTieDistance(d,0,0).status!=='OK'||!Number.isFinite(offset)||!Array.isArray(intervals)||intervals.length>10000||intervals.some(r=>!Array.isArray(r)||r.length!==2||!r.every(Number.isFinite)||r[0]>r[1]))return {status:'NOT_CHECKED',reason:'REPEATED_INTERVAL_INPUT_REQUIRED'};
 const ranges=[];
 for(const [from,to] of intervals){
  if(d.count>1){const lo=Math.max(0,Math.ceil((from-offset-d.first-tolerance)/d.spacing)),hi=Math.min(d.count-2,Math.floor((to-offset-d.first+tolerance)/d.spacing));if(lo<=hi)ranges.push([lo,hi]);}
  if(d.last+offset>=from-tolerance&&d.last+offset<=to+tolerance)ranges.push([d.count-1,d.count-1]);
 }
 ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
 for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1]+1)last[1]=Math.max(last[1],range[1]);else merged.push([...range]);}
 const coveredCount=merged.reduce((n,[a,b])=>n+b-a+1,0);let first=0;
 for(const [a,b] of merged){if(a>first)break;first=b+1;}
 return {status:coveredCount===d.count?'OK':'NOT_CHECKED',totalCount:d.count,coveredCount,uncoveredCount:d.count-coveredCount,firstUncoveredIndex:first<d.count?first:null,firstUncoveredPlane:first<d.count?(first===d.count-1?d.last:d.first+first*d.spacing)+offset:null,axialTolerance:tolerance,method:'union of station-index intervals; no station expansion'};
}
