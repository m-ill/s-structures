export function jointColumnContactPaths(model,prepared,congestion){
 const nc=reason=>({ok:false,reason});
 const detail=model.designDetails?.reinforcement?.find(r=>r.id===prepared?.columnDetailId&&r.version===prepared.columnDetailVersion&&r.memberId===prepared.columnMemberId);
 const height=prepared?.hoops?.height,paths=congestion?.barPaths;
 if(!detail?.bars?.length||detail.bars.length>100||congestion?.pathCoordinates!=='column-local-y,z,x; metres from joint node'||!Array.isArray(paths)||paths.length>100||paths.reduce((n,p)=>n+(p.segments?.length||0),0)>1000||!Number.isFinite(height)||height<=0)return nc('JOINT_COLUMN_CONTACT_PATHS_REQUIRED');
 const sourcePaths=[];
 const bars=detail.bars.map((bar,i)=>{
  const expected=`${prepared.columnMemberId}:B${i+1}`,matches=paths.filter(p=>p.id===expected||p.continuationIds?.includes(expected));
  if(matches.length!==1)return {splicePath:{status:'OK',pieces:[]}};
  const path=matches[0],pieces=[];
  if(!Number.isFinite(path.diameter)||Math.abs(path.diameter-bar.diameter)>1e-9||path.sagitta!==0||!Array.isArray(path.segments)||path.segments.length>1000)return {splicePath:{status:'OK',pieces}};
  for(const segment of path.segments){
   if(!Array.isArray(segment)||segment.length!==2||segment.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))continue;
   const [a,b]=segment;
   if([a,b].some(p=>Math.abs(p[0]-bar.y)>1e-9||Math.abs(p[1]-bar.z)>1e-9))continue;
   pieces.push({points:[[a[2]+height/2,a[0]],[b[2]+height/2,b[0]]],z:a[1],segmentErrors:[0]});
  }
  sourcePaths.push({bar:i+1,pathId:path.id,expectedPathId:expected,pieceCount:pieces.length});
  return {splicePath:{status:'OK',pieces}};
 });
 return {ok:true,detail,prepared:{...prepared,bars},sourcePaths};
}
