import {validJointBarPairs} from '../../design/connection/jointBarPairs.js';
// Search existing opposite-face bars only. No new bar, material, or strength is
// inferred; full candidate geometry/contact/strength evaluation remains required.
export function jointCrossTiePairProposal(command,rows,model,edit={}){
 const no=reason=>({ok:false,reason});
 if(command.jointCrossTiePattern!=='alternating-hook-side'||!validJointBarPairs(command.jointCrossTieBarPairs))return no('ALTERNATING_JOINT_PAIRS_REQUIRED');
 const row=rows[0],column=model?.members?.find(m=>m.id===command.columnMemberId);
 if(!column||![column.n1,column.n2].includes(command.nodeId)||!command.memberIds?.includes(column.id))return no('JOINT_COLUMN_REFERENCE_REQUIRED');
 const detail=model.designDetails?.reinforcement?.find(d=>d.id===row?.columnDetailId&&d.version===row.columnDetailVersion);
 if(!detail||detail.memberId!==column.id||model.designDetails.reinforcement.some(d=>d.id===detail.id&&d.version>detail.version)||rows.some(r=>r.columnDetailId!==detail.id||r.columnDetailVersion!==detail.version))return no('CURRENT_JOINT_COLUMN_BARS_REQUIRED');
 const bars=detail.bars,db=command.tieDiameter/1000,R=(edit.jointBendInsideRadius??command.jointBendInsideRadius)+db/2;
 if(!Array.isArray(bars)||bars.length<2||bars.length>100||bars.some(b=>![b.y,b.z,b.diameter].every(Number.isFinite)||b.diameter<=0)||![db,R,row.hcB,row.hcH].every(x=>Number.isFinite(x)&&x>0))return no('JOINT_PAIR_GEOMETRY_REQUIRED');
 const result=[...command.jointCrossTieBarPairs],used=new Set(result.map(s=>s.split(':').map(Number).sort((a,b)=>a-b).join(':'))),changes=[];
 for(let index=0;index<result.length;index++){
  const ids=result[index].split(':').map(n=>Number(n)-1),a=bars[ids[0]],b=bars[ids[1]];
  if(!a||!b)return no('JOINT_PAIR_REFERENCE_REQUIRED');
  const axis=Math.abs(a.y-b.y)<1e-10?'y':Math.abs(a.z-b.z)<1e-10?'z':null;
  if(!axis)return no('JOINT_DIAGONAL_CROSS_TIE_RULE_REQUIRED');
  const hc=axis==='y'?row.hcH:row.hcB,margin=hc/2-R-db;
  if(Math.abs(a[axis])<margin-1e-9)continue;
  const along=axis==='y'?'z':'y',lo=Math.min(...bars.map(b=>b[along])),hi=Math.max(...bars.map(b=>b[along]));let best=null;
  for(let i=0;i<bars.length;i++)for(let j=i+1;j<bars.length;j++){
   const p=bars[i],q=bars[j],key=`${i+1}:${j+1}`;
   if(used.has(key)||Math.abs(p[axis]-q[axis])>1e-10||Math.abs(p[axis])>=margin-1e-9||Math.abs(p.diameter-q.diameter)>1e-10)continue;
   if(Math.abs(Math.min(p[along],q[along])-lo)>1e-9||Math.abs(Math.max(p[along],q[along])-hi)>1e-9)continue;
   if(!best||Math.abs(p[axis])<best.score)best={key,score:Math.abs(p[axis])};
  }
  if(!best)return no('JOINT_ADDITIONAL_OPPOSITE_FACE_BARS_REQUIRED');
  used.delete(ids.map(n=>n+1).sort((a,b)=>a-b).join(':'));used.add(best.key);
  changes.push({index,from:result[index],to:best.key,axis,maximumAbsoluteBarCoordinate:margin});result[index]=best.key;
 }
 if(!changes.length)return no('NO_JOINT_PAIR_CHANGE_REQUIRED');
 return {ok:true,edit:{jointCrossTieBarPairs:result},changes,columnDetailId:detail.id,columnDetailVersion:detail.version,requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
}
