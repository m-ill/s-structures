import {transverseArcMap} from './transverseArcMap.js';
import {repeatedArcPathDistance} from './repeatedArcPathDistance.js';
import {repeatedPathDistance} from './repeatedPathDistance.js';
export function crossTieLongitudinalPaths(detail,prepared,{pointDistance}={}){
 const checks=[];let work=0,arcRefinements=0;
 const arcMaps=new Map(prepared.crossTies.pieces.map(tie=>[tie,transverseArcMap({points:tie.points.map(p=>[tie.planeOffset,...p])},tie)]));
 for(const [barIndex,bar] of detail.bars.entries()){
  const geometry=prepared.bars[barIndex],paths=geometry?.splicePath?.status==='OK'?geometry.splicePath.pieces:geometry?.cutLength!=null&&geometry.points?[{...geometry,z:bar.z,mark:`B${barIndex+1}`}]:[];
  if(!paths.length){checks.push({bar:barIndex+1,status:'NOT_CHECKED',reason:'LONGITUDINAL_FABRICATION_PATH_REQUIRED'});continue;}
  for(const path of paths)for(const tie of prepared.crossTies.pieces){
   if(!Array.isArray(path.segmentErrors)||path.segmentErrors.length!==path.points.length-1){checks.push({bar:barIndex+1,status:'NOT_CHECKED',reason:'LONGITUDINAL_CURVE_ERROR_BOUND_REQUIRED'});continue;}
   let lower=Infinity,upper=Infinity,witness;
   for(let j=1;j<path.points.length;j++){
    const refined=new Map();
    const c=path.points[j-1],d=path.points[j];
    if(pointDistance&&c[1]===d[1]&&path.segmentErrors[j-1]===0){
     if(++work>200000){checks.push({status:'NOT_CHECKED',reason:'LONGITUDINAL_COLLISION_WORK_LIMIT'});return finish();}
     const point=[c[1],path.z],r=repeatedPathDistance({a:point,b:point,c:[...c,path.z],d:[...d,path.z],distribution:tie.distribution??prepared.stirrupDistribution,offset:tie.planeOffset});
     if(r.status!=='OK'){checks.push({bar:barIndex+1,status:'NOT_CHECKED',reason:r.reason});return finish();}
     const distance=Math.hypot(r.distance,pointDistance(point,tie));
     lower=Math.min(lower,distance);
     if(distance<upper){upper=distance;witness={tie:tie.mark,bar:barIndex+1,piece:path.mark||null,station:r.index,plane:r.plane,barSegment:j-1,method:'analytic-point-to-rounded-perimeter'};}
     continue;
    }
    for(let i=1;i<tie.points.length;i++){
    if(++work>200000){checks.push({status:'NOT_CHECKED',reason:'LONGITUDINAL_COLLISION_WORK_LIMIT'});return finish();}
    const r=repeatedPathDistance({a:tie.points[i-1],b:tie.points[i],c:[...path.points[j-1],path.z],d:[...path.points[j],path.z],distribution:tie.distribution??prepared.stirrupDistribution,offset:tie.planeOffset});
    if(r.status!=='OK'){checks.push({bar:barIndex+1,status:'NOT_CHECKED',reason:r.reason});return finish();}
    const error=tie.segmentErrors[i-1]+path.segmentErrors[j-1];
    let candidateLower=Math.max(0,r.distance-error),candidateUpper=r.distance+error,refinedWitness;
    const mapped=arcMaps.get(tie)?.[i-1],required=(tie.diameter+bar.diameter)/2;
    if(mapped&&candidateLower<required-1e-9&&candidateUpper>=required-1e-9){
     if(!refined.has(mapped.key)){
      const distance=repeatedArcPathDistance({arc:mapped.arc,c:[...c,path.z],d:[...d,path.z],distribution:tie.distribution??prepared.stirrupDistribution,maxIntervals:128});
      refined.set(mapped.key,distance);arcRefinements++;work+=distance.evaluatedIntervals||0;
     }
     const distance=refined.get(mapped.key),pathError=path.segmentErrors[j-1];
     if(Number.isFinite(distance.lower)&&Number.isFinite(distance.upper)){candidateLower=Math.max(0,distance.lower-pathError);candidateUpper=distance.upper+pathError;refinedWitness=distance.witness;}
     if(work>200000){checks.push({status:'NOT_CHECKED',reason:'LONGITUDINAL_COLLISION_WORK_LIMIT'});return finish();}
    }
    lower=Math.min(lower,candidateLower);
    if(candidateUpper<upper){upper=candidateUpper;witness={tie:tie.mark,bar:barIndex+1,piece:path.mark||null,station:r.index,plane:r.plane,barSegment:j-1,tieSegment:i-1,...(refinedWitness?{station:refinedWitness.station,plane:refinedWitness.plane,arcAngle:refinedWitness.angle,method:'analytic-arc-refinement',tieSegment:mapped.firstSegment}: {})};}
   }
   }
   const required=(tie.diameter+bar.diameter)/2;
   checks.push({bar:barIndex+1,tie:tie.mark,piece:path.mark||null,centerlineLowerBound:lower,centerlineUpperBound:upper,requiredDistance:required,witness,status:lower>=required-1e-9?'OK':upper<required-1e-9?'NG':'NOT_CHECKED'});
  }
 }
 return finish();
 function finish(){
  const incomplete=checks.some(c=>c.status==='NOT_CHECKED'),status=checks.some(c=>c.status==='NG')?'NG':incomplete?'NOT_CHECKED':'OK';
  const incompleteReasons=[...new Set(checks.filter(c=>c.status==='NOT_CHECKED').map(c=>c.reason||'LONGITUDINAL_CROSS_TIE_CONTACT_UNCERTAIN'))];
  return {status,incomplete,incompleteReasons,reason:status==='NG'?'CROSS_TIE_LONGITUDINAL_COLLISION':incompleteReasons[0]||null,checks,segmentPairs:work,arcRefinements,scope:'prepared longitudinal end and splice paths against repeated cross-ties; support-contact coverage and outer-hoop closure separate',fabricationApproved:false};
 }
}
