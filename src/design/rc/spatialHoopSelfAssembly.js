import {segmentClosest} from './repeatedPathDistance.js';
import {repeatedTieDistance} from './repeatedTieDistance.js';
import {repeatedSpatialPairDistance} from './repeatedSpatialPairDistance.js';
export function spatialHoopSelfAssembly(closure,distribution){
 const base={scope:'non-adjacent body/hook primitives within one hoop and all primitives across distinct stations',fabricationApproved:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason});
 const path=closure?.path,db=closure?.diameter,repeat=repeatedTieDistance(distribution,0,0);
 if(path?.status!=='OK'||!Array.isArray(path.primitiveIndices)||path.primitiveIndices.length!==path.points?.length-1||!Array.isArray(path.segmentErrors)||path.segmentErrors.length!==path.primitiveIndices.length||!Number.isFinite(db)||db<=0)return nc('SPATIAL_HOOP_PRIMITIVE_PATH_REQUIRED');
 if(path.points.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))||path.segmentErrors.some(x=>!Number.isFinite(x)||x<0)||!Array.isArray(path.primitives)||path.primitiveIndices.some(i=>!Number.isSafeInteger(i)||i<0||i>=path.primitives.length)||![path.bounds?.min?.[0],path.bounds?.max?.[0]].every(Number.isFinite))return nc('SPATIAL_HOOP_PRIMITIVE_PATH_REQUIRED');
 if(repeat.status!=='OK')return nc(repeat.reason);
 const same={lower:Infinity,upper:Infinity},across={lower:Infinity,upper:Infinity};let work=0,stationEvaluations=0;
 const axialGap=repeat.minimumRepeatDistance===null?null:repeat.minimumRepeatDistance-(path.bounds.max[0]-path.bounds.min[0]);
 const separated=axialGap!==null&&axialGap>=db-1e-9;
 const record=(state,r,error,witness)=>{state.lower=Math.min(state.lower,Math.max(0,r.distance-error));if(r.distance+error<state.upper){state.upper=r.distance+error;state.witness=witness;}};
 let limited=false;
 outer:for(let i=1;i<path.points.length;i++)for(let j=i;j<path.points.length;j++){
  const nonAdjacent=Math.abs(path.primitiveIndices[i-1]-path.primitiveIndices[j-1])>1;
  if(!nonAdjacent&&(distribution.count===1||separated))continue;
  if(++work>200000){limited=true;break outer;}
  const [a,b,c,d]=[path.points[i-1],path.points[i],path.points[j-1],path.points[j]],error=path.segmentErrors[i-1]+path.segmentErrors[j-1];
  if(nonAdjacent)record(same,segmentClosest(a,b,c,d),error,{firstSegment:i-1,secondSegment:j-1});
  if(distribution.count>1&&!separated){
   const r=repeatedSpatialPairDistance({a,b,c,d,distribution,excludeSameStation:true});
   if(r.status!=='OK')return nc(r.reason);
   stationEvaluations+=r.stationEvaluations;record(across,r,error,{firstSegment:i-1,secondSegment:j-1,indices:r.indices,relativeShift:r.relativeShift});
  }
 }
 const result=state=>({status:state.upper<db-1e-9?'NG':limited?'NOT_CHECKED':state.lower>=db-1e-9?'OK':'NOT_CHECKED',centerlineLowerBound:limited?0:state.lower,centerlineUpperBound:Number.isFinite(state.upper)?state.upper:null,requiredDistance:db,witness:state.witness||null});
 const sameStation=result(same),repeatedStations=distribution.count===1?{status:'N_A',reason:'SINGLE_STATION_NO_REPEAT_PAIR'}:separated?{status:'OK',axialSeparationLowerBound:axialGap,requiredDistance:db,method:'exact-axial-bounds'}:result(across);
 const status=[sameStation,repeatedStations].some(r=>r.status==='NG')?'NG':[sameStation,repeatedStations].some(r=>r.status==='NOT_CHECKED')?'NOT_CHECKED':'OK';
 return {...base,status,reason:status==='NG'?'SPATIAL_HOOP_SELF_OR_REPEAT_COLLISION':limited?'SPATIAL_HOOP_COLLISION_WORK_LIMIT':status==='NOT_CHECKED'?'SPATIAL_HOOP_SELF_CONTACT_UNCERTAIN':null,sameStation,repeatedStations,segmentPairs:work,stationEvaluations};
}
