import {appendedSpliceCommands} from './appendedSpliceCommands.js';
import {outerHoopClosure} from '../../design/rc/outerHoopClosure.js';
import {reinforcementRegionsAt} from '../../design/rc/reinforcementRegions.js';
import {memberAxes} from '../../core/memberAxes.js';
import {resolveSectionRecord} from '../../materials/registry.js';
import {practicalCommandFromRecord} from '../../modeling/practicalInputContract.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export function jointSupportBarProposal(command,checks,model){
 const no=reason=>({ok:false,reason,automaticApplicationAllowed:false});
 if(command.jointCrossTiePattern!=='alternating-hook-side'||command.jointTieClosure!=='seismic-135'||command.jointColumnContinuity!=='aligned-through-bars')return no('JOINT_SUPPORT_BAR_SCOPE_REQUIRED');
 const column=model.members?.find(m=>m.id===command.columnMemberId),section=resolveSectionRecord(model,column?.secId),node=model.nodes?.find(n=>n.id===command.nodeId);
 if(!column||!node||![column.n1,column.n2].includes(node.id)||!command.memberIds?.includes(column.id)||!['RECT','SQUARE'].includes(section?.shape))return no('JOINT_COLUMN_REFERENCE_REQUIRED');
 const axes=m=>{const nodes=[m.n1,m.n2].map(id=>model.nodes.find(n=>n.id===id));return nodes.every(Boolean)?memberAxes(...nodes,m.localAxis):null;},ca=axes(column);
 if(!ca||Math.abs(ca.x[2])<1-1e-8)return no('JOINT_SUPPORT_VERTICAL_COLUMN_REQUIRED');
 const latest=new Map();for(const r of model.designDetails?.reinforcement||[])if(!latest.has(r.id)||latest.get(r.id).version<r.version)latest.set(r.id,r);
 const selected=m=>reinforcementRegionsAt([...latest.values()].filter(r=>r.memberId===m.id),m.n1===node.id?0:1);
 const sources=selected(column),source=sources[0];
 if(sources.length!==1||!source?.bars?.length||source.bars.length>96)return no('JOINT_SUPPORT_BAR_RECORD_REQUIRED');
 const rows=checks.filter(c=>c.entityId===`joint:${node.id}`&&c.checkId==='joint-confinement');
 if(!rows.length||rows.some(c=>c.columnDetailId!==source.id||c.columnDetailVersion!==source.version))return no('CURRENT_JOINT_COLUMN_BARS_REQUIRED');
 const prototype=source.bars[0],product=b=>[b.diameter,b.nominalArea,b.designation];
 if(source.bars.some(b=>product(b).some((v,i)=>v!==product(prototype)[i])))return no('JOINT_HOMOGENEOUS_SUPPORT_BARS_REQUIRED');
 const db=command.tieDiameter/1000,closure=outerHoopClosure({cover:command.jointCover,stirrups:{diameter:db},tieClosure:'standard-135',tieClosureCorner:command.jointClosureCorner,tieClosureSeparation:command.jointClosureSeparation,tieBendInsideRadius:command.jointBendInsideRadius,tieHookTail:command.jointHookTail},{B:section.params.B/1000,H:(section.params.H||section.params.B)/1000});
 const faces=closure.path?.primitives?.filter(p=>p.kind==='line').slice(1,-1);
 if(closure.path?.status!=='OK'||faces?.length!==4||!Number.isFinite(prototype.diameter)||prototype.diameter<=0)return no('JOINT_SUPPORT_FACE_GEOMETRY_REQUIRED');
 const positions=[];
 for(const axis of [1,2])for(const sign of [-1,1]){
  const along=axis===1?2:1,face=faces.find(f=>Math.abs(f.start[axis]-f.end[axis])<1e-10&&Math.sign(f.start[axis])===sign&&Math.min(f.start[along],f.end[along])<=0&&Math.max(f.start[along],f.end[along])>=0);
  if(!face)return no('JOINT_OPPOSITE_SUPPORT_FACES_REQUIRED');
  const p=[0,0,0];p[axis]=face.start[axis]-sign*(db+prototype.diameter)/2;positions.push({y:p[1],z:p[2]});
 }
 const related=command.memberIds.map(id=>model.members.find(m=>m.id===id)).filter(m=>m&&[m.n1,m.n2].includes(node.id)&&axes(m)&&Math.abs(dot(axes(m).x,ca.x))>1-1e-8);
 if(!related.length||related.length>2)return no('JOINT_SUPPORT_CONTINUITY_SCOPE_REQUIRED');
 const commands=[],originalCommands=[],changes=[];let pairIndices;
 for(const member of related){
  const records=selected(member),record=records[0],ma=axes(member);
  if(records.length!==1||!record?.bars?.length||record.bars.length>96)return no('JOINT_SUPPORT_BAR_RECORD_REQUIRED');
  if(record.locked)return no('DETAIL_LOCKED');
  if(record.barMaterialId!==source.barMaterialId||record.bars.some(b=>product(b).some((v,i)=>v!==product(prototype)[i])))return no('JOINT_SUPPORT_CONTINUITY_PRODUCT_REQUIRED');
  const original=practicalCommandFromRecord('reinforcement-record',record),next=structuredClone(original),indices=[],initial=next.bars.length;
  for(const p of positions){
   const global=ca.y.map((v,i)=>v*p.y+ca.z[i]*p.z),y=dot(global,ma.y),z=dot(global,ma.z);
   const index=next.bars.findIndex(b=>Math.hypot(b.y-y,b.z-z)<1e-9);
   if(index>=0){indices.push(index+1);continue;}
   const minimum=Math.max(.025,prototype.diameter,Number.isFinite(record.aggregateMaxSize)?4*record.aggregateMaxSize/3:0);
   if(next.bars.some(b=>Math.hypot(b.y-y,b.z-z)-(b.diameter/1000+prototype.diameter)/2<minimum-1e-9))return no('JOINT_ADDITIONAL_BAR_CLEARANCE_REQUIRED');
   next.bars.push({...original.bars[0],y,z});indices.push(next.bars.length);
  }
  if(member.id===column.id)pairIndices=indices;
  if(next.bars.length>initial){next.version++;originalCommands.push(original);commands.push(next);changes.push({detailId:record.id,memberId:member.id,fromVersion:record.version,toVersion:next.version,addedBarIndices:Array.from({length:next.bars.length-initial},(_,i)=>initial+i+1),addedBars:next.bars.slice(initial)});}
 }
 if(!commands.length)return no('JOINT_SUPPORT_BARS_ALREADY_PRESENT');
 const splices=appendedSpliceCommands(model,originalCommands,commands);if(!splices.ok)return no(splices.reason);
 return {ok:true,version:'p25-joint-support-bars-v2-splices',commands:[...commands,...splices.commands],originalCommands:[...originalCommands,...splices.originalCommands],changes,spliceChanges:splices.changes,edit:{jointCrossTieBarPairs:[`${pairIndices[0]}:${pairIndices[1]}`,`${pairIndices[2]}:${pairIndices[3]}`],jointCrossTieHookSides:['left','left'],jointCrossTiePlaneOffsets:['0','0']},basisCheckIds:rows.map(r=>r.id),requiresReanalysis:true,automaticApplicationAllowed:false,scope:'append existing-product opposite-face centre bars in up to two aligned column records; original bar indices preserved'};
}
