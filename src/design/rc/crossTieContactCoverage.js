import {repeatedIntervalCoverage} from './repeatedIntervalCoverage.js';
export function crossTieContactCoverage(detail,prepared){
 const checks=[];
 for(const tie of prepared.crossTies.pieces)for(const [end,index] of tie.bars.entries()){
  const bar=detail.bars[index-1],geometry=prepared.bars[index-1],arc=tie.path.arcs[end],intervals=[];
  const paths=geometry?.splicePath?.status==='OK'?geometry.splicePath.pieces:geometry?.cutLength!=null&&geometry.points?[{...geometry,z:bar.z}]:[];
  for(const path of paths)for(let i=1;i<path.points.length;i++){
   const a=path.points[i-1],b=path.points[i];
   if(path.segmentErrors?.[i-1]!==0||Math.abs(a[1]-b[1])>1e-12)continue;
   const delta=[a[1]-arc.center[0],path.z-arc.center[1]],radius=Math.hypot(...delta),s=delta[0]*tie.path.u[0]+delta[1]*tie.path.u[1],t=delta[0]*tie.path.n[0]+delta[1]*tie.path.n[1],angle=Math.atan2(t,s);
   const onArc=radius<1e-12||[-1,0,1].some(k=>angle+2*k*Math.PI>=arc.lo-1e-9&&angle+2*k*Math.PI<=arc.hi+1e-9);
   if(onArc&&Math.abs(radius+bar.diameter/2-tie.insideRadius)<=1e-9)intervals.push([Math.min(a[0],b[0]),Math.max(a[0],b[0])]);
  }
  const coverage=repeatedIntervalCoverage(tie.distribution||prepared.stirrupDistribution,tie.planeOffset,intervals);
  checks.push({tie:tie.mark,bar:index,status:coverage.status,reason:coverage.status==='OK'?null:paths.length?'ACTUAL_CONTACT_AT_CURVED_OR_SHIFTED_BAR_REQUIRED':'LONGITUDINAL_FABRICATION_PATH_REQUIRED',coverage});
 }
 return {status:checks.length&&checks.every(c=>c.status==='OK')?'OK':'NOT_CHECKED',checks,scope:'all repeated tie planes covered by actual straight longitudinal path segments contacting the selected hook arc',fabricationApproved:false};
}
