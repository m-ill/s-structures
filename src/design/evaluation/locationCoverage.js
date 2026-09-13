import {checkIncomplete} from '../../metadata/checkCompleteness.js';
// Keep confirmed failures and incomplete coverage as independent facts.
// Only bounded witnesses are retained; counters describe all visited locations.
const statuses=['OK','NG','WARN','NOT_CHECKED','N_A','FAILED'];
const priority={N_A:0,OK:1,WARN:2,NOT_CHECKED:3,NG:4,FAILED:5};
const witnessLimit=12;
function witness(row){
 const t=row.concurrentDemand||{};
 return {status:row.status,reason:row.reason??null,ratio:row.ratio??null,
  x:t.x??row.x??null,side:t.side??null,comboId:t.comboId??null,
  detailId:row.detailId??null,detailVersion:row.detailVersion??null,...(row.bar!==undefined?{bar:row.bar}:{}),...(row.end!==undefined?{end:row.end}:{}),...(row.incomplete?{incomplete:true,incompleteReasons:(row.incompleteReasons||[]).slice(0,12)}:{})};
}
export function mergeLocatedCheck(previous,current){
 if(!statuses.includes(current.status))throw Error('LOCATION_CHECK_STATUS_INVALID');
 const old=previous?.locationCoverage;
 const counts=old?{...old.counts}:Object.fromEntries(statuses.map(s=>[s,0]));
 counts[current.status]++;
 const missingLocations=[...(old?.missingLocations||[])],failedLocations=[...(old?.failedLocations||[])];
 if(checkIncomplete(current)&&missingLocations.length<witnessLimit)missingLocations.push(witness(current));
 if(['NG','FAILED'].includes(current.status)&&failedLocations.length<witnessLimit)failedLocations.push(witness(current));
 const selected=!previous||priority[current.status]>priority[previous.status]||priority[current.status]===priority[previous.status]&&(current.ratio??0)>(previous.ratio??0)?current:previous;
 const incompleteCount=(old?.incompleteCount??(old?old.counts.NOT_CHECKED+old.counts.FAILED+old.counts.WARN:0))+(checkIncomplete(current)?1:0);
 const complete=incompleteCount===0;
 return {...selected,incomplete:!complete,...(!complete?{methodReviewRequired:true}:{}),locationCoverage:{
  counts,incompleteCount,total:Object.values(counts).reduce((n,v)=>n+v,0),complete,missingLocations,failedLocations,
  witnessLimit,witnessesTruncated:incompleteCount>missingLocations.length||counts.NG+counts.FAILED>failedLocations.length,
 }};
}
