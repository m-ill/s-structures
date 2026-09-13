import {repeatedSpatialPairDistance} from './repeatedSpatialPairDistance.js';
export function spatialHoopCrossTieAssembly(detail,prepared){
 const base={scope:'actual spatial hoop body/hooks against cross-ties at all repeated station pairs',fabricationApproved:false};
 if(!detail.crossTieBarPairs?.length)return {...base,status:'N_A',checks:[],segmentPairs:0,stationEvaluations:0};
 const checks=[];let work=0,stationEvaluations=0;
 const closure=prepared?.outerHoop?.closureGeometry,hoop=closure?.path,pieces=prepared?.crossTies?.pieces;
 if(hoop?.status!=='OK'||!Array.isArray(pieces)||!pieces.length)return {...base,status:'NOT_CHECKED',reason:'SPATIAL_HOOP_CROSS_TIE_GEOMETRY_REQUIRED',checks};
 const valid=(p,n)=>Array.isArray(p?.points)&&p.points.length>=2&&p.points.every(q=>Array.isArray(q)&&q.length===n&&q.every(Number.isFinite))&&Array.isArray(p.segmentErrors)&&p.segmentErrors.length===p.points.length-1&&p.segmentErrors.every(x=>Number.isFinite(x)&&x>=0);
 if(!valid(hoop,3)||!Number.isFinite(closure.diameter)||closure.diameter<=0)return {...base,status:'NOT_CHECKED',reason:'SPATIAL_HOOP_PATH_REQUIRED',checks};
 for(const tie of pieces){
  if(!valid(tie,2)||!Number.isFinite(tie.planeOffset)||!Number.isFinite(tie.diameter)||tie.diameter<=0){checks.push({tie:tie.mark,status:'NOT_CHECKED',reason:'CROSS_TIE_PATH_REQUIRED'});continue;}
  let lower=Infinity,upper=Infinity,witness;const required=(closure.diameter+tie.diameter)/2;
  for(let i=1;i<hoop.points.length;i++)for(let j=1;j<tie.points.length;j++){
   if(++work>200000){if(upper<required-1e-9)checks.push({tie:tie.mark,status:'NG',centerlineUpperBound:upper,requiredDistance:required,witness});checks.push({status:'NOT_CHECKED',reason:'SPATIAL_HOOP_COLLISION_WORK_LIMIT'});return finish();}
   const r=repeatedSpatialPairDistance({a:hoop.points[i-1],b:hoop.points[i],c:[tie.planeOffset,...tie.points[j-1]],d:[tie.planeOffset,...tie.points[j]],distribution:prepared.stirrupDistribution,distributionB:tie.distribution});
   if(r.status!=='OK'){checks.push({tie:tie.mark,status:'NOT_CHECKED',reason:r.reason});return finish();}
   stationEvaluations+=r.stationEvaluations;
   const error=hoop.segmentErrors[i-1]+tie.segmentErrors[j-1];lower=Math.min(lower,Math.max(0,r.distance-error));
   if(r.distance+error<upper){upper=r.distance+error;witness={indices:[r.indices[0],tie.sourceIndexOffset!==undefined?tie.sourceIndexOffset+r.indices[1]*tie.sourceIndexStride:r.indices[1]],relativeShift:r.relativeShift,hoopSegment:i-1,tieSegment:j-1};}
  }
  checks.push({tie:tie.mark,centerlineLowerBound:lower,centerlineUpperBound:upper,requiredDistance:required,witness,status:lower>=required-1e-9?'OK':upper<required-1e-9?'NG':'NOT_CHECKED'});
 }
 return finish();
 function finish(){const status=checks.some(c=>c.status==='NG')?'NG':checks.some(c=>c.status==='NOT_CHECKED')?'NOT_CHECKED':'OK';return {...base,status,reason:status==='NG'?'SPATIAL_HOOP_CROSS_TIE_COLLISION':status==='NOT_CHECKED'?'SPATIAL_HOOP_CROSS_TIE_INCOMPLETE':null,checks,segmentPairs:work,stationEvaluations};}
}
