import {jointTransverseArcMap} from './jointTransverseArcMap.js';
import {repeatedArcPathDistance} from '../rc/repeatedArcPathDistance.js';
import {repeatedSpatialPathDistance} from '../rc/repeatedSpatialPathDistance.js';
export function jointTransverseLongitudinalAssembly(prepared,congestion){
 const base={scope:'physical intersection of prepared hoop/cross-tie paths and joint longitudinal paths; aggregate clearance and support qualification separate',fabricationApproved:false,codeReferences:congestion?.codeReferences||[],units:{length:'m'}};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason,checks:[]});
 const closure=prepared?.outerHoop?.closureGeometry,bars=congestion?.barPaths,height=prepared?.hoops?.height;
 if(congestion?.pathCoordinates!=='column-local-y,z,x; metres from joint node'||!Number.isFinite(height)||height<=0||!Array.isArray(bars)||!bars.length||bars.length>100||bars.reduce((n,b)=>n+(b.segments?.length||0),0)>1000)return nc('JOINT_LONGITUDINAL_PATH_MAPPING_REQUIRED');
 const shapes=[{mark:'outer-hoop',diameter:closure?.diameter,...closure?.path},...(prepared.crossTies?.pieces||[]).map(p=>({crossTie:p,mark:p.mark,diameter:p.diameter,distribution:p.distribution,sourceIndexOffset:p.sourceIndexOffset,sourceIndexStride:p.sourceIndexStride,points:p.points?.map(q=>[p.planeOffset,...q]),segmentErrors:p.segmentErrors}))];
 const point=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
 if(shapes.length>41||shapes.some(p=>!Number.isFinite(p.diameter)||p.diameter<=0||!Array.isArray(p.points)||p.points.length<2||!p.points.every(point)||!Array.isArray(p.segmentErrors)||p.segmentErrors.length!==p.points.length-1||p.segmentErrors.some(e=>!Number.isFinite(e)||e<0)))return nc('JOINT_TRANSVERSE_PATH_MAPPING_REQUIRED');
 for(const shape of shapes)shape.arcMap=jointTransverseArcMap(shape,shape.crossTie);
 const checks=[];let work=0,stationEvaluations=0,arcRefinements=0,limited=false;
 const local=p=>[p[2]+height/2,p[0],p[1]];
 for(const bar of bars){
  const sagitta=bar.sagitta??0;
  if(!Number.isFinite(bar.diameter)||bar.diameter<=0||!Number.isFinite(sagitta)||sagitta<0||!Array.isArray(bar.segments)||!bar.segments.length||bar.segments.some(s=>!Array.isArray(s)||s.length!==2||!s.every(point))){checks.push({barId:bar.id,status:'NOT_CHECKED',reason:'JOINT_LONGITUDINAL_PATH_INVALID'});continue;}
  let lower=Infinity,upper=Infinity,witness,invalid;
  if(bar.segmentErrors!==undefined&&(!Array.isArray(bar.segmentErrors)||bar.segmentErrors.length!==bar.segments.length||bar.segmentErrors.some(e=>!Number.isFinite(e)||e<0))){checks.push({barId:bar.id,status:'NOT_CHECKED',reason:'JOINT_LONGITUDINAL_PATH_INVALID'});continue;}
  search:for(const shape of shapes)for(const [segmentIndex,segment] of bar.segments.entries()){
   const segmentError=bar.segmentErrors?.[segmentIndex]??sagitta;
   const refined=new Map();
   for(let i=1;i<shape.points.length;i++){
   if(++work>200000){limited=true;break search;}
   const r=repeatedSpatialPathDistance({a:shape.points[i-1],b:shape.points[i],c:local(segment[0]),d:local(segment[1]),distribution:shape.distribution||prepared.stirrupDistribution});
   if(r.status!=='OK'){invalid=r.reason;break search;}
   stationEvaluations+=r.stationCandidates;
   const error=shape.segmentErrors[i-1]+segmentError,required=(shape.diameter+bar.diameter)/2;
   let candidateLower=Math.max(0,r.distance-error)-required,candidateUpper=r.distance+error-required,location={index:r.index,plane:r.plane},witnessSegment=i-1;
   const mapped=shape.arcMap[i-1];
   if(mapped&&candidateLower< -1e-9&&candidateUpper>=-1e-9){
    if(!refined.has(mapped.key)){
     const distance=repeatedArcPathDistance({arc:mapped.arc,c:local(segment[0]),d:local(segment[1]),distribution:shape.distribution||prepared.stirrupDistribution,maxIntervals:128});
     refined.set(mapped.key,distance);arcRefinements++;work+=distance.evaluatedIntervals||0;stationEvaluations+=distance.stationEvaluations||0;
    }
    const distance=refined.get(mapped.key);
    if(Number.isFinite(distance.lower)&&Number.isFinite(distance.upper)){
     candidateLower=Math.max(0,distance.lower-segmentError)-required;candidateUpper=distance.upper+segmentError-required;
     if(distance.witness){location={index:distance.witness.station,plane:distance.witness.plane,arcAngle:distance.witness.angle};witnessSegment=mapped.firstSegment+Math.max(0,Math.min(mapped.segmentCount-1,Math.floor(distance.witness.angle/mapped.arc.sweep*mapped.segmentCount)));}
    }
   }
   lower=Math.min(lower,candidateLower);
   if(candidateUpper<upper){upper=candidateUpper;witness={transverseMark:shape.mark,transverseSegment:witnessSegment,stationIndex:shape.sourceIndexOffset!==undefined?shape.sourceIndexOffset+location.index*shape.sourceIndexStride:location.index,stationPlane:location.plane,requiredCenterlineDistance:required,...(location.arcAngle!==undefined?{arcAngle:location.arcAngle}: {})};}
   if(work>200000){limited=true;break search;}
  }}
  checks.push({barId:bar.id,status:upper< -1e-9?'NG':limited||invalid?'NOT_CHECKED':lower>=-1e-9?'OK':'NOT_CHECKED',reason:invalid||null,clearanceLowerBound:Number.isFinite(lower)?lower:null,clearanceUpperBound:Number.isFinite(upper)?upper:null,requiredClearance:0,witness});
  if(limited)break;
 }
 const incomplete=limited||checks.some(c=>c.status==='NOT_CHECKED'),status=checks.some(c=>c.status==='NG')?'NG':incomplete?'NOT_CHECKED':'OK';
 return {...base,status,incomplete,incompleteReasons:[...new Set([...(limited?['JOINT_TRANSVERSE_COLLISION_WORK_LIMIT']:[]),...checks.filter(c=>c.status==='NOT_CHECKED').map(c=>c.reason||'JOINT_TRANSVERSE_LONGITUDINAL_CONTACT_UNCERTAIN')])],reason:status==='NG'?'JOINT_TRANSVERSE_LONGITUDINAL_COLLISION':limited?'JOINT_TRANSVERSE_COLLISION_WORK_LIMIT':incomplete?'JOINT_TRANSVERSE_LONGITUDINAL_CONTACT_UNCERTAIN':null,checks,segmentPairs:work,stationEvaluations,arcRefinements};
}
