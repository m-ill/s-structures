import {repeatedIntervalCoverage} from './repeatedIntervalCoverage.js';
import {repeatedTieDistance} from './repeatedTieDistance.js';
export function lineBarContactCoverage(detail,prepared,{lines,diameter}){
 const base={fabricationApproved:false,methodReviewRequired:true,scope:'interior contact of actual straight longitudinal paths with spatial straight hoop faces',contactTolerance:1e-9};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason,checks:[]});
 const vector=(p,n)=>Array.isArray(p)&&p.length===n&&p.every(Number.isFinite);
 if(!Array.isArray(lines)||!lines.length||lines.length>8||!Number.isFinite(diameter)||diameter<=0||!Array.isArray(detail?.bars)||!detail.bars.length||detail.bars.length>100)return nc('HOOP_FACE_CONTACT_INPUT_REQUIRED');
 if(repeatedTieDistance(prepared?.stirrupDistribution,0,0).status!=='OK')return nc('REPEATED_TIE_DISTRIBUTION_INVALID');
 const checks=[];let segmentTests=0;
 for(const [index,line] of lines.entries()){
  if(!line||line.kind!=='line'||!vector(line.start,3)||!vector(line.end,3))return nc('HOOP_FACE_LINE_REQUIRED');
  const dy=line.end[1]-line.start[1],dz=line.end[2]-line.start[2],norm=Math.hypot(dy,dz);
  if(norm<=1e-12)return nc('HOOP_FACE_PROJECTION_DEGENERATE');
  let ny=-dz/norm,nz=dy/norm;const side=ny*line.start[1]+nz*line.start[2];
  if(Math.abs(side)<=1e-12)return nc('HOOP_FACE_INTERIOR_REFERENCE_REQUIRED');
  if(side>0){ny=-ny;nz=-nz;}
  const locate=(y,z,required)=>{
   const a=y-line.start[1],b=z-line.start[2],parameter=(a*dy+b*dz)/(norm*norm),signedDistance=a*ny+b*nz;
   if(parameter<0||parameter>1||Math.abs(signedDistance-required)>1e-9)return null;
   return {parameter,localX:line.start[0]+parameter*(line.end[0]-line.start[0]),distance:signedDistance,y,z};
  };
  const candidates=[];
  for(const [barIndex,bar] of detail.bars.entries()){
   if(![bar.y,bar.z,bar.diameter].every(Number.isFinite)||bar.diameter<=0)continue;
   const required=(diameter+bar.diameter)/2,geometry=prepared.bars?.[barIndex],paths=geometry?.splicePath?.status==='OK'?geometry.splicePath.pieces:geometry?.cutLength!=null&&geometry.points?[{...geometry,z:bar.z}]:[];
   if(!Array.isArray(paths)||paths.length>100)return nc('HOOP_FACE_CONTACT_PATH_LIMIT');
   const intervals=[],contacts=[];let eligible=!!locate(bar.y,bar.z,required),recordPositionMatches=true,minimumParameter=Infinity,maximumParameter=-Infinity;
   for(const path of paths){
    if(!Array.isArray(path.points)||path.points.length>512||!Number.isFinite(path.z))continue;
    for(let j=1;j<path.points.length;j++){
     if(++segmentTests>10000)return nc('HOOP_FACE_CONTACT_PATH_LIMIT');
     const a=path.points[j-1],b=path.points[j];if(!vector(a,2)||!vector(b,2)||path.segmentErrors?.[j-1]!==0||a[1]!==b[1])continue;
     const contact=locate(a[1],path.z,required);if(!contact)continue;eligible=true;recordPositionMatches&&=Math.abs(contact.y-bar.y)<=1e-9&&Math.abs(contact.z-bar.z)<=1e-9;minimumParameter=Math.min(minimumParameter,contact.parameter);maximumParameter=Math.max(maximumParameter,contact.parameter);
     intervals.push([Math.min(a[0],b[0])-contact.localX,Math.max(a[0],b[0])-contact.localX]);
     if(contacts.length<8)contacts.push({...contact,piece:path.mark||null,segment:j-1,requiredDistance:required});
    }
   }
   if(eligible){const coverage=repeatedIntervalCoverage(prepared.stirrupDistribution,0,intervals);candidates.push({bar:barIndex+1,status:coverage.status,coverage,contacts,recordPositionMatches,parameterRange:intervals.length?[minimumParameter,maximumParameter]:null,contactIntervalCount:intervals.length});}
  }
  checks.push({face:index+1,candidates,contactedBarIndices:candidates.filter(c=>c.status==='OK').map(c=>c.bar)});
 }
 return {...base,status:'OK',checks,segmentTests};
}
