import {jointThroughBars} from '../../design/connection/jointThroughBars.js';
import {memberAxes} from '../../core/memberAxes.js';
import {requiresOffsetAwareDesign} from '../../core/memberDesignGeometry.js';
import {resolveSectionRecord} from '../../materials/registry.js';
import {practicalCommandFromRecord} from '../../modeling/practicalInputContract.js';
import {sectionJointCommands,coupleSectionJoints} from './sectionJointCoupling.js';
import {stableHash} from '../../core/stableHash.js';
// Candidate strategy, not a capacity estimate. Preserve paired through-bar
// identities while separating opposite vertical layers by enlarging beam depth.
export function jointBeamLayerProposal(model,joint,checks){
 const no=reason=>({ok:false,reason,automaticApplicationAllowed:false});
 if(joint.locked)return no('DETAIL_LOCKED');
 if(!checks.some(c=>c.entityId===`joint:${joint.nodeId}`&&c.checkId==='joint-bar-congestion'&&c.status==='NG'))return no('RECORDED_JOINT_CONGESTION_REQUIRED');
 const through=jointThroughBars(model,joint);
 if(!through.continuityVerified||joint.jointAnchorageMode!=='special-frame-beam-mixed')return no('JOINT_PAIRED_LAYER_SCOPE_REQUIRED');
 const ids=[...new Set(through.pairs.flatMap(p=>[p.a.memberId,p.b.memberId]))];
 if(ids.length!==2)return no('JOINT_PAIRED_LAYER_SCOPE_REQUIRED');
 const latest=new Map();for(const r of model.designDetails?.reinforcement||[])if(!latest.has(r.id)||latest.get(r.id).version<r.version)latest.set(r.id,r);
 const additionalCommands=[],originalAdditionalCommands=[],coupled=[],changes=[];
 try{for(const memberId of ids){
  const member=model.members.find(m=>m.id===memberId),sec=resolveSectionRecord(model,member?.secId),nodes=[member?.n1,member?.n2].map(id=>model.nodes.find(n=>n.id===id));
  if(!nodes.every(Boolean)||requiresOffsetAwareDesign(member)||member.taper||!['RECT','SQUARE'].includes(sec?.shape))return no('JOINT_BEAM_LAYER_PRISMATIC_SCOPE_REQUIRED');
  const axes=memberAxes(...nodes,member.localAxis),axis=Math.abs(axes.y[2])>1-1e-8?'y':Math.abs(axes.z[2])>1-1e-8?'z':null;
  if(!axis||Math.abs(axes.x[2])>1e-8)return no('JOINT_BEAM_LAYER_AXIS_REQUIRED');
  const rows=[...latest.values()].filter(r=>r.memberId===memberId);
  if(rows.length!==1||rows[0].start!==0||rows[0].end!==1||rows[0].locked)return no('JOINT_BEAM_LAYER_EDITABLE_FULL_REGION_REQUIRED');
  const r=rows[0];
  if(r.stirrups||r.barLayerGroups||(model.designDetails?.splices||[]).some(s=>s.memberId===memberId))return no('JOINT_BEAM_LAYER_CAGE_OR_SPLICE_MAPPING_REQUIRED');
  if(r.bars.some(b=>Math.abs(b[axis])<1e-6)||!r.bars.some(b=>b[axis]>0)||!r.bars.some(b=>b[axis]<0))return no('JOINT_BEAM_OPPOSITE_LAYERS_REQUIRED');
  const section={B:sec.params.B,H:sec.params.H||sec.params.B},key=axis==='y'?'H':'B',prior=section[key];
  section[key]+=100;if(section[key]>3000||section[key]>prior*1.5)return no('JOINT_BEAM_LAYER_SIZE_LIMIT');
  const original=practicalCommandFromRecord('reinforcement-record',r),next={...original,version:r.version+1,bars:original.bars.map(b=>({...b,[axis]:b[axis]+Math.sign(b[axis])*.05}))};
  const id=`P25-JLAYER-${stableHash({joint:joint.id,memberId,section}).slice(0,24)}`;
  if(model.sections.some(s=>s.id===id))return no('JOINT_BEAM_LAYER_SECTION_ID_PRESENT');
  additionalCommands.push({type:'section-record',id,version:1,name:'Joint layer separation candidate',shape:'RECT',dimensionUnit:'mm',...section,sourceNote:'100 mm beam depth candidate; architectural fit and whole design review required'},{type:'member-assignment',memberIds:[memberId],secId:`${id}@1`},next);
  originalAdditionalCommands.push(original);
  coupleSectionJoints(model,memberId,section,sectionJointCommands(model,memberId),coupled);
  changes.push({memberId,detailId:r.id,axis,priorDepthMm:prior,proposedDepthMm:section[key],layerShiftMm:50});
 }}catch(error){return no(error.code||error.message);}
 // Opposing hooks in one beam can overlap in their common bend plane.
 // Move the negative-y layer inward in z by a bounded clearance-based offset.
 const congestion=checks.find(c=>c.entityId===`joint:${joint.nodeId}`&&c.checkId==='joint-bar-congestion');
 const barMember=bar=>model.members.find(m=>typeof bar==='string'&&bar.startsWith(`${m.id}:B`)&&/^[1-9][0-9]*$/.test(bar.slice(m.id.length+2)))?.id;
 const hookIds=[...new Set((congestion?.failedPairs||[]).filter(p=>p.bars?.length===2&&barMember(p.bars[0])&&barMember(p.bars[0])===barMember(p.bars[1])).map(p=>barMember(p.bars[0])))].filter(id=>!ids.includes(id));
 if(hookIds.length>1)return no('JOINT_HOOK_LAYER_SCOPE_REQUIRED');
 for(const memberId of hookIds){
  const member=model.members.find(m=>m.id===memberId),section=resolveSectionRecord(model,member?.secId),rows=[...latest.values()].filter(r=>r.memberId===memberId),r=rows[0];
  if(!member||member.taper||requiresOffsetAwareDesign(member)||!['RECT','SQUARE'].includes(section?.shape)||rows.length!==1||r.start!==0||r.end!==1||r.locked||r.stirrups||r.barLayerGroups||model.designDetails?.splices?.some(s=>s.memberId===memberId))return no('JOINT_HOOK_LAYER_MAPPING_REQUIRED');
  const end=member.n1===joint.nodeId?'start':member.n2===joint.nodeId?'end':null;
  if(!end||(r[`${end}FabricationShape`]??r.fabricationShape)!=='L90')return no('JOINT_HOOK_LAYER_SHAPE_REQUIRED');
  const clearance=joint.jointMinimumClearance??NaN,shift=Math.ceil((Math.max(...r.bars.map(b=>b.diameter))+clearance+.001)/.005)*.005;
  if(!Number.isFinite(shift)||shift>.05||!r.bars.some(b=>b.y<0)||r.bars.filter(b=>b.y<0).some(b=>Math.abs(b.z)<=shift))return no('JOINT_HOOK_LAYER_LANE_UNAVAILABLE');
  const original=practicalCommandFromRecord('reinforcement-record',r);
  const next={...original,version:r.version+1,bars:original.bars.map(b=>({...b,z:b.y<0?b.z-Math.sign(b.z)*shift:b.z}))};
  additionalCommands.push(next);originalAdditionalCommands.push(original);changes.push({memberId,detailId:r.id,kind:'opposing-hook-lane',axis:'z',layerShiftMm:shift*1000});
 }
 const target=coupled.find(c=>c.id===joint.id);
 if(!target)return no('JOINT_BEAM_LAYER_PANEL_MAPPING_REQUIRED');
 additionalCommands.push(...coupled.filter(c=>c.id!==joint.id));
 if(additionalCommands.length>16)return no('JOINT_BEAM_LAYER_COMMAND_LIMIT');
 return {ok:true,version:'p25-joint-beam-layer-v1',edits:[{jointPanelHeight:target.jointPanelHeight}],additionalCommands,originalAdditionalCommands,changes,codeReferences:[...through.codeReferences,...(congestion?.codeReferences||[])],requiresCandidateEvaluation:true,requiresReanalysis:true,automaticApplicationAllowed:false,designTransferAllowed:false,scope:'paired full-span unspliced through beams without declared cages; fixed 100 mm depth candidate, full strength/cover/anchorage/collision review required'};
}
