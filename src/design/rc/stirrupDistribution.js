// One source for drawing quantities and extension checks. Position arrays are
// bounded independently from the analytically available count and endpoints.
export function stirrupDistribution(detail,length){
 const base={count:null,positions:null,first:null,last:null,explicitEnds:false};
 const unavailable=(status,reason)=>({...base,status,reason});
 const spacing=detail.stirrups?.spacing;
 if(!Number.isFinite(length)||length<=0||!Number.isFinite(spacing)||spacing<=0)return unavailable('NOT_CHECKED','STIRRUP_SPACING_OR_LENGTH_REQUIRED');
 const providedStart=detail.tieFirstStart!==undefined,providedEnd=detail.tieFirstEnd!==undefined;
 if(providedStart!==providedEnd)return unavailable('NOT_CHECKED','BOTH_TIE_END_OFFSETS_REQUIRED');
 const explicit=providedStart&&providedEnd,start=explicit?detail.tieFirstStart:0,end=explicit?length-detail.tieFirstEnd:length;
 if(![start,end].every(Number.isFinite))return unavailable('NOT_CHECKED','FINITE_TIE_END_OFFSETS_REQUIRED');
 if(start<0||end<start||end>length)return unavailable('NG','TIE_END_OFFSETS_OUTSIDE_REGION');
 let count=explicit?Math.ceil(Math.max(0,end-start-1e-10)/spacing)+1:Math.floor((length+1e-10)/spacing)+1;
 if(detail.end!==1&&Math.abs(Math.min(start+(count-1)*spacing,end)-length)<1e-9)count--;
 if(!Number.isSafeInteger(count)||count<0)return unavailable('NOT_CHECKED','STIRRUP_COUNT_RANGE');
 const last=count?Math.min(start+(count-1)*spacing,end):null;
 return {...base,status:'OK',reason:count>200?'STIRRUP_POSITION_ARRAY_LIMIT':null,count,first:count?start:null,last,spacing,explicitEnds:explicit,positions:count>200?null:Array.from({length:count},(_,i)=>Math.min(start+i*spacing,end))};
}
