import {repeatedArcPathDistance} from './repeatedArcPathDistance.js';
import {repeatedIntervalCoverage} from './repeatedIntervalCoverage.js';
import {repeatedTieDistance} from './repeatedTieDistance.js';
// Nominal contact with straight portions of the actual longitudinal paths.
// Shared contact kernel for closure hooks and body bends.
// This geometric predicate does not approve seismic detailing or fabrication.
export function arcBarContactCoverage(detail,prepared,{arcs,diameter}){
 const base={fabricationApproved:false,methodReviewRequired:true,scope:'individual spatial bend arcs contacting actual straight longitudinal paths at every nominal station',contactTolerance:1e-9};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason,checks:[],commonBarIndices:[]});
 if(!Array.isArray(arcs)||!arcs.length||arcs.length>8||!Number.isFinite(diameter)||diameter<=0||!Array.isArray(detail?.bars)||!detail.bars.length||detail.bars.length>100)return nc('CLOSURE_HOOK_CONTACT_INPUT_REQUIRED');
 if(repeatedTieDistance(prepared.stirrupDistribution,0,0).status!=='OK')return nc('REPEATED_TIE_DISTRIBUTION_INVALID');
 const checks=[];let queries=0,segmentTests=0;
 for(const [index,arc] of arcs.entries()){
  if(![arc.center,arc.u,arc.v].every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite))||!Number.isFinite(arc.radius)||arc.radius<=0||!Number.isFinite(arc.sweep))return nc('CLOSURE_HOOK_ARC_REQUIRED');
  const det=arc.u[1]*arc.v[2]-arc.u[2]*arc.v[1];
  if(Math.abs(det)<1e-12)return nc('CLOSURE_HOOK_PROJECTION_DEGENERATE');
  const candidates=[];
  for(const [index,bar] of detail.bars.entries()){
   if(!Number.isFinite(bar.diameter)||bar.diameter<=0)continue;
   const geometry=prepared.bars?.[index],paths=geometry?.splicePath?.status==='OK'?geometry.splicePath.pieces:geometry?.cutLength!=null&&geometry.points?[{...geometry,z:bar.z}]:[],intervals=[],contacts=[];
   if(!Array.isArray(paths)||paths.length>100)return nc('CLOSURE_CONTACT_PATH_LIMIT');
   let eligible=false,recordPositionMatches=true;
   for(const path of paths){
    if(!Number.isFinite(path.z)||!Array.isArray(path.points)||path.points.length>512)continue;
    for(let j=1;j<path.points.length;j++){
     if(++segmentTests>10000)return nc('CLOSURE_CONTACT_PATH_LIMIT');
     const a=path.points[j-1],b=path.points[j];
     if(![a,b].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))||path.segmentErrors?.[j-1]!==0||a[1]!==b[1])continue;
     const dy=a[1]-arc.center[1],dz=path.z-arc.center[2],s=(dy*arc.v[2]-dz*arc.v[1])/det,t=(arc.u[1]*dz-arc.u[2]*dy)/det,rho=Math.hypot(s,t),theta=Math.atan2(t,s);
     const onArc=rho<1e-12||[-1,0,1].some(k=>theta+2*k*Math.PI>=Math.min(0,arc.sweep)-1e-9&&theta+2*k*Math.PI<=Math.max(0,arc.sweep)+1e-9);
     if(rho>=arc.radius||!onArc)continue;
     eligible=true;if(++queries>1000)return nc('CLOSURE_CONTACT_WORK_LIMIT');
     const distance=repeatedArcPathDistance({arc,c:[arc.center[0]-2*arc.radius,a[1],path.z],d:[arc.center[0]+2*arc.radius,a[1],path.z],distribution:{status:'OK',explicitEnds:true,count:1,first:0,last:0,spacing:1},maxIntervals:128});
     const required=(bar.diameter+diameter)/2;
     if(!Number.isFinite(distance.lower)||!Number.isFinite(distance.upper)||distance.lower<required-1e-9||distance.upper>required+1e-9)continue;
     const angle=distance.witness.angle,x=arc.center[0]+arc.radius*(arc.u[0]*Math.cos(angle)+arc.v[0]*Math.sin(angle));
     recordPositionMatches&&=Math.abs(a[1]-bar.y)<=1e-9&&Math.abs(path.z-bar.z)<=1e-9;
     intervals.push([Math.min(a[0],b[0])-x,Math.max(a[0],b[0])-x]);
     if(contacts.length<8)contacts.push({piece:path.mark||null,segment:j-1,angle,localX:x,distanceLower:distance.lower,distanceUpper:distance.upper,requiredDistance:required});
    }
   }
   if(eligible){const coverage=repeatedIntervalCoverage(prepared.stirrupDistribution,0,intervals);candidates.push({bar:index+1,status:coverage.status,coverage,contacts,recordPositionMatches,contactIntervalCount:intervals.length});}
  }
  const contactedBarIndices=candidates.filter(c=>c.status==='OK').map(c=>c.bar);
  checks.push({arcIndex:index,status:contactedBarIndices.length?'OK':'NOT_CHECKED',candidates,contactedBarIndices});
 }
 const complete=checks.every(c=>c.status==='OK');
 return {...base,status:complete?'OK':'NOT_CHECKED',reason:complete?null:'SPATIAL_BEND_CONTACT_COVERAGE_REQUIRED',checks,distanceQueries:queries,segmentTests};
}
