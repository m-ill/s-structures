import {RC_LAP_DESIGN_LIMITS} from '../../metadata/rcLapDesignCapabilities.js';
import {parseVersionedId} from '../../materials/registry.js';
export function spliceWindowFraction(detail,splices,length,minimumWindowLength=0){
 const nc=reason=>({status:'NOT_CHECKED',reason}),latest=new Map();
 if(!Number.isFinite(minimumWindowLength)||minimumWindowLength<0||minimumWindowLength>length)return nc('CLASS_A_SPLICE_WINDOW_INPUT_REQUIRED');
 if(!Number.isFinite(length)||length<=0||!Array.isArray(splices)||splices.length>RC_LAP_DESIGN_LIMITS.maxSourceSplices)return nc('CLASS_A_SPLICE_WINDOW_INPUT_REQUIRED');
 for(const s of splices)if(!latest.has(s.id)||latest.get(s.id).version<s.version)latest.set(s.id,s);
 const selected=[...latest.values()].filter(s=>parseVersionedId(s.reinforcementId).id===detail.id);
 if(!selected.length||selected.length>RC_LAP_DESIGN_LIMITS.maxSplices||!detail.bars?.length||detail.bars.length>RC_LAP_DESIGN_LIMITS.maxBars)return nc('CLASS_A_SPLICE_WINDOW_INPUT_REQUIRED');
 const rows=[];
 for(const s of selected){
  if(s.reinforcementId!==`${detail.id}@${detail.version}`||s.memberId!==detail.memberId)return nc('CLASS_A_CURRENT_SPLICE_DETAIL_REQUIRED');
  const indices=(s.barIndices||[]).map(i=>Number(i)-1);
  if(![s.start,s.end].every(Number.isFinite)||s.start<0||s.end>1||s.start>=s.end||!indices.length||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=detail.bars.length))return nc('CLASS_A_SPLICE_WINDOW_INPUT_REQUIRED');
  rows.push({id:s.id,version:s.version,from:s.start*length,to:s.end*length,indices});
 }
 const areas=detail.bars.map(b=>b.area);if(areas.some(a=>!Number.isFinite(a)||a<=0))return nc('CLASS_A_SPLICE_AREA_REQUIRED');
 const totalArea=areas.reduce((a,b)=>a+b,0),windowLength=Math.max(minimumWindowLength,...rows.map(r=>r.to-r.from));
 if(!Number.isFinite(totalArea)||totalArea<=0)return nc('CLASS_A_SPLICE_AREA_REQUIRED');
 // A sliding window intersects a lap on [lap.from - window, lap.to].
 // Closed endpoints conservatively include touching intervals. The actual
 // lap-length checks must still pass: only then is this provided-length
 // window an upper bound on the required Class A lap length.
 const events=[...new Set(rows.flatMap(r=>[r.from-windowLength,r.to]))].sort((a,b)=>a-b);let governing=null;
 for(const from of events){
  const active=rows.filter(r=>r.from<=from+windowLength+1e-10&&r.to>=from-1e-10),indices=[...new Set(active.flatMap(r=>r.indices))],area=indices.reduce((n,i)=>n+areas[i],0);
  if(!governing||area>governing.area)governing={from,to:from+windowLength,area,barIndices:indices.map(i=>i+1).sort((a,b)=>a-b),spliceSources:active.map(r=>({id:r.id,version:r.version}))};
 }
 return {status:'OK',splicedFraction:governing.area/totalArea,totalArea,splicedArea:governing.area,windowLength,governingWindow:governing,windowCount:events.length,providedLengthsMustSatisfyRequired:true,basis:'maximum-provided-lap-length sliding window; union of all intersected bars; actual lap length checks remain mandatory',units:{length:'m',area:'m2'}};
}
