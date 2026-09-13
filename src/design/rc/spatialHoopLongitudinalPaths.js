import {repeatedArcPathDistance} from './repeatedArcPathDistance.js';
import {repeatedSpatialPathDistance} from './repeatedSpatialPathDistance.js';
import {repeatedTieDistance} from './repeatedTieDistance.js';
export function spatialHoopLongitudinalPaths(detail,prepared){
 const checks=[];let work=0,stationEvaluations=0,refinementCalls=0,refinementIntervals=0;
 const base={scope:'actual spatial hoop body and closure hooks against prepared longitudinal end/splice paths',fabricationApproved:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason,checks,segmentPairs:work,stationEvaluations});
 const closure=prepared?.outerHoop?.closureGeometry,hoop=closure?.path,distribution=prepared?.stirrupDistribution;
 const validPath=(p,dimensions)=>Array.isArray(p?.points)&&p.points.length>=2&&p.points.every(q=>Array.isArray(q)&&q.length===dimensions&&q.every(Number.isFinite))&&Array.isArray(p.segmentErrors)&&p.segmentErrors.length===p.points.length-1&&p.segmentErrors.every(x=>Number.isFinite(x)&&x>=0);
 if(hoop?.status!=='OK'||!validPath(hoop,3)||!Number.isFinite(closure.diameter)||closure.diameter<=0)return nc('SPATIAL_HOOP_PATH_REQUIRED');
 if(repeatedTieDistance(distribution,0,0).status!=='OK')return nc('REPEATED_TIE_DISTRIBUTION_INVALID');
 if(!Number.isFinite(prepared.length)||prepared.length<=0||!Number.isFinite(hoop.bounds?.min?.[0])||!Number.isFinite(hoop.bounds?.max?.[0]))return nc('SPATIAL_HOOP_REGION_REQUIRED');
 if(!Array.isArray(detail?.bars)||!detail.bars.length||detail.bars.length>100)return nc('LONGITUDINAL_BARS_REQUIRED');
 const primitiveStarts=new Map();for(const [index,id] of (hoop.primitiveIndices||[]).entries())if(!primitiveStarts.has(id))primitiveStarts.set(id,index);
 const extent={min:distribution.first+hoop.bounds.min[0]-closure.diameter/2,max:distribution.last+hoop.bounds.max[0]+closure.diameter/2,regionLength:prepared.length};
 const placement={status:extent.min>=-1e-9&&extent.max<=prepared.length+1e-9?'OK':'NG',...extent};
 for(const [barIndex,bar] of detail.bars.entries()){
  if(!Number.isFinite(bar.diameter)||bar.diameter<=0){checks.push({bar:barIndex+1,status:'NOT_CHECKED',reason:'LONGITUDINAL_DIAMETER_REQUIRED'});continue;}
  const geometry=prepared.bars?.[barIndex],paths=geometry?.splicePath?.status==='OK'?geometry.splicePath.pieces:geometry?.cutLength!=null&&geometry.points?[{...geometry,z:bar.z,mark:`B${barIndex+1}`}]:[];
  if(!Array.isArray(paths)||!paths.length){checks.push({bar:barIndex+1,status:'NOT_CHECKED',reason:'LONGITUDINAL_FABRICATION_PATH_REQUIRED'});continue;}
  for(const path of paths){
   if(!validPath(path,2)||!Number.isFinite(path.z)){checks.push({bar:barIndex+1,status:'NOT_CHECKED',reason:'LONGITUDINAL_CURVE_ERROR_BOUND_REQUIRED'});continue;}
   let lower=Infinity,upper=Infinity,witness;const required=(closure.diameter+bar.diameter)/2;
   for(let j=1;j<path.points.length;j++)for(let i=1;i<hoop.points.length;i++){
    if(++work>200000){if(upper<(closure.diameter+bar.diameter)/2-1e-9)checks.push({bar:barIndex+1,status:'NG',centerlineUpperBound:upper,requiredDistance:(closure.diameter+bar.diameter)/2,witness});checks.push({status:'NOT_CHECKED',reason:'SPATIAL_HOOP_COLLISION_WORK_LIMIT'});return finish();}
    const r=repeatedSpatialPathDistance({a:hoop.points[i-1],b:hoop.points[i],c:[...path.points[j-1],path.z],d:[...path.points[j],path.z],distribution});
    if(r.status!=='OK'){checks.push({bar:barIndex+1,status:'NOT_CHECKED',reason:r.reason});return finish();}
    stationEvaluations+=r.stationCandidates;
    const error=hoop.segmentErrors[i-1]+path.segmentErrors[j-1];
    let pairLower=Math.max(0,r.distance-error),pairUpper=r.distance+error,pairWitness={station:r.index,plane:r.plane,hoopSegment:i-1,barSegment:j-1};
    const id=hoop.primitiveIndices?.[i-1],arc=hoop.primitives?.[id];
    if(pairLower<required-1e-9&&pairUpper>=required-1e-9&&arc?.kind==='arc'&&refinementIntervals<10000){
     const local=i-1-primitiveStarts.get(id),refined=repeatedArcPathDistance({arc,c:[...path.points[j-1],path.z],d:[...path.points[j],path.z],distribution,from:arc.sweep*local/arc.steps,to:arc.sweep*(local+1)/arc.steps,maxIntervals:Math.min(128,Math.floor((10000-refinementIntervals+1)/2))});
     refinementCalls++;refinementIntervals+=refined.evaluatedIntervals||0;stationEvaluations+=refined.stationEvaluations||0;
     if(Number.isFinite(refined.lower)&&Number.isFinite(refined.upper)){
      pairLower=Math.max(pairLower,Math.max(0,refined.lower-path.segmentErrors[j-1]));
      if(refined.upper+path.segmentErrors[j-1]<pairUpper){pairUpper=refined.upper+path.segmentErrors[j-1];pairWitness={...pairWitness,...refined.witness,method:refined.method||'bounded-arc-refinement'};}
     }
    }
    lower=Math.min(lower,pairLower);
    if(pairUpper<upper){upper=pairUpper;witness=pairWitness;}
   }
   checks.push({bar:barIndex+1,piece:path.mark||null,centerlineLowerBound:lower,centerlineUpperBound:upper,requiredDistance:required,witness,status:lower>=required-1e-9?'OK':upper<required-1e-9?'NG':'NOT_CHECKED'});
  }
 }
 return finish();
 function finish(){
  const status=placement.status==='NG'||checks.some(c=>c.status==='NG')?'NG':checks.some(c=>c.status==='NOT_CHECKED')?'NOT_CHECKED':'OK';
  return {...base,status,reason:placement.status==='NG'?'SPATIAL_HOOP_OUTSIDE_REGION':checks.some(c=>c.status==='NG')?'SPATIAL_HOOP_LONGITUDINAL_COLLISION':status==='NOT_CHECKED'?'SPATIAL_HOOP_LONGITUDINAL_INCOMPLETE':null,placement,checks,segmentPairs:work,stationEvaluations,refinementCalls,refinementIntervals};
 }
}
