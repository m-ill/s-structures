import {arcBarContactCoverage} from './arcBarContactCoverage.js';
import {closureHookContactCoverage} from './closureHookContactCoverage.js';
// Small bipartite matching, not enumeration of every combination of supports.
export function assignDistinctSupportBars(groups){
 if(!Array.isArray(groups)||groups.length!==4||groups.some(g=>!Array.isArray(g)||g.length>100||g.some(i=>!Number.isInteger(i)||i<1||i>100)))return null;
 const owner=new Map();
 function place(group,visited){
  for(const bar of groups[group]){
   if(visited.has(bar))continue;visited.add(bar);
   if(!owner.has(bar)||place(owner.get(bar),visited)){owner.set(bar,group);return true;}
  }
  return false;
 }
 for(let i=0;i<groups.length;i++)if(!place(i,new Set()))return null;
 const result=Array(4);for(const [bar,group] of owner)result[group]=bar;return result;
}
export function spatialHoopSupportCoverage(detail,prepared){
 const base={fabricationApproved:false,methodReviewRequired:true,scope:'four distinct longitudinal bars contacted at closure and three body bends throughout nominal repeated stations'};
 const closure=prepared?.outerHoop?.closureGeometry,arcs=closure?.path?.primitives?.filter(p=>p.kind==='arc');
 if(closure?.path?.status!=='OK'||arcs?.length!==5)return {...base,status:'NOT_CHECKED',reason:'FIVE_SPATIAL_HOOP_BENDS_REQUIRED',supportedBarIndices:[]};
 const ends=closure.contactCoverage??closureHookContactCoverage(detail,prepared),body=arcBarContactCoverage(detail,prepared,{arcs:arcs.slice(1,4),diameter:closure.diameter});
 const groups=[ends.commonBarIndices||[],...body.checks.map(c=>c.contactedBarIndices)],assignment=ends.status==='OK'&&body.status==='OK'?assignDistinctSupportBars(groups):null;
 const status=assignment?'OK':'NOT_CHECKED',reason=assignment?null:'FOUR_DISTINCT_SPATIAL_HOOP_SUPPORTS_REQUIRED';
 const reportSummary={status,reason,supportedBarIndices:assignment||[],closureBarIndices:ends.commonBarIndices||[],bodyContactStatus:body.status,bodyCoverage:body.checks.map((c,i)=>({bend:i+1,status:c.status,candidates:c.candidates.map(b=>({bar:b.bar,covered:b.coverage.coveredCount,total:b.coverage.totalCount,firstMissing:b.coverage.firstUncoveredIndex,firstMissingPlane:b.coverage.firstUncoveredPlane}))})),fabricationApproved:false};
 return {...base,status,reason,geometryKind:'spatial-hoop-support-v1',reportSummary,closureContact:ends,bodyContact:body,supportGroups:groups,supportedBarIndices:assignment||[]};
}
