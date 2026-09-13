import {requiresOffsetAwareDesign} from '../../core/memberDesignGeometry.js';
import {memberAxes} from '../../core/memberAxes.js';
import {resolveSectionRecord} from '../../materials/registry.js';
import {practicalCommandFromRecord} from '../../modeling/practicalInputContract.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
// Explicit legacy panel dimensions follow column local B/H. Spatial cages
// already derive their section from the assigned column in prepared geometry.
export function sectionJointCommands(model,memberId){
 const latest=new Map();for(const r of model.designDetails?.connections||[])if(!latest.has(r.id)||latest.get(r.id).version<r.version)latest.set(r.id,r);
 const member=model.members.find(m=>m.id===memberId);
 return [...latest.values()].filter(r=>r.connectionType==='rc-joint'&&r.memberIds?.includes(memberId)&&[member?.n1,member?.n2].includes(r.nodeId)&&(r.columnMemberId===memberId?(r.jointWidth!==undefined||r.jointDepth!==undefined):r.columnMemberId&&r.jointPanelHeight!==undefined&&isHorizontal(model,member))).map(r=>practicalCommandFromRecord('connection-record',r));
}
function isHorizontal(model,member){
 const nodes=[member?.n1,member?.n2].map(id=>model.nodes.find(n=>n.id===id));
 return nodes.every(Boolean)&&Math.abs(nodes[0].z-nodes[1].z)<1e-9;
}
function jointPanelHeight(model,joint,changedId,section){
 let height=0,found=false;
 for(const id of joint.memberIds||[]){
  const member=model.members.find(m=>m.id===id);
  if(!member||![member.n1,member.n2].includes(joint.nodeId))fail('SECTION_JOINT_BEAM_MAPPING_REQUIRED');
  const nodes=[member.n1,member.n2].map(n=>model.nodes.find(v=>v.id===n));
  if(!nodes.every(Boolean))fail('SECTION_JOINT_BEAM_MAPPING_REQUIRED');
  if(!isHorizontal(model,member)){
   if(Math.hypot(nodes[0].x-nodes[1].x,nodes[0].y-nodes[1].y)>1e-9)fail('SECTION_JOINT_BEAM_MAPPING_REQUIRED');
   continue;
  }
  const axes=memberAxes(nodes[0],nodes[1],member.localAxis),record=resolveSectionRecord(model,member.secId);
  if(requiresOffsetAwareDesign(member)||axes.L<=1e-9||!['RECT','SQUARE'].includes(record?.shape)||Math.max(Math.abs(axes.y[2]),Math.abs(axes.z[2]))<1-1e-9)fail('SECTION_JOINT_BEAM_MAPPING_REQUIRED');
  const sizes=id===changedId&&section?section:record.params;
  height=Math.max(height,(Math.abs(axes.y[2])*(sizes.H||sizes.B)+Math.abs(axes.z[2])*sizes.B)/1000);if(id===changedId)found=true;
 }
 if(!found||!Number.isFinite(height)||height<=0)fail('SECTION_JOINT_BEAM_MAPPING_REQUIRED');
 return height;
}
export function coupleSectionJoints(model,memberId,section,originals,commands){
 if(!section||!originals.length)return [];
 const member=model.members.find(m=>m.id===memberId),prior=resolveSectionRecord(model,member?.secId);
 if(!['RECT','SQUARE'].includes(prior?.shape))fail('SECTION_JOINT_MAPPING_REQUIRED');
 const before={jointWidth:prior.params.B/1000,jointDepth:(prior.params.H||prior.params.B)/1000},after={jointWidth:section.B/1000,jointDepth:(section.H||section.B)/1000},changed=[];
 for(const original of originals){
  if(original.locked)fail('DETAIL_LOCKED');
  const beam=original.columnMemberId&&original.columnMemberId!==memberId;
  if(!beam&&requiresOffsetAwareDesign(member))fail('SECTION_JOINT_MAPPING_REQUIRED');
  let mapped=after;
  if(beam){
   const priorHeight=jointPanelHeight(model,original,memberId,null);
   if(!Number.isFinite(original.jointPanelHeight)||Math.abs(original.jointPanelHeight-priorHeight)>1e-9)fail('SECTION_JOINT_SOURCE_PANEL_HEIGHT_MISMATCH');
   mapped={jointPanelHeight:jointPanelHeight(model,original,memberId,section)};
  }
  if(!beam&&Object.keys(before).some(k=>!Number.isFinite(original[k])||Math.abs(original[k]-before[k])>1e-9))fail('SECTION_JOINT_SOURCE_DIMENSION_MISMATCH');
  const index=commands.findIndex(c=>c.type==='connection-record'&&c.id===original.id),next={...(index<0?original:commands[index]),...mapped,version:original.version+1};
  if(index<0)commands.push(next);else commands[index]=next;
  changed.push(next);
 }
 return changed;
}
