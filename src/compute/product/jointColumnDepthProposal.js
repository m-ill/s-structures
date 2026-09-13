import {fitSpatialHoopBars} from '../../design/rc/fitSpatialHoopBars.js';
import {resizeSpatialHoopCoordinates} from '../../design/rc/resizeSpatialHoopCoordinates.js';
import {sectionJointCommands,coupleSectionJoints} from './sectionJointCoupling.js';
import {sectionFoundationCommands,coupleSectionFoundations} from './sectionFoundationCoupling.js';
import {jointThroughBars} from '../../design/connection/jointThroughBars.js';
import {jointTopology} from '../../design/connection/jointTopology.js';
import {memberAxes} from '../../core/memberAxes.js';
import {requiresOffsetAwareDesign} from '../../core/memberDesignGeometry.js';
import {resolveSectionRecord} from '../../materials/registry.js';
import {practicalCommandFromRecord} from '../../modeling/practicalInputContract.js';
import {memberCandidateCommands} from '../../design/rc/memberCandidateCommands.js';
import {stableHash} from '../../core/stableHash.js';
// Depth comes from the existing anchorage owner. Resize every incident column
// and its physical reinforcement together, then require fresh global analysis.
export function jointColumnDepthProposal(model,joint){
 const no=reason=>({ok:false,reason,automaticApplicationAllowed:false});
 const through=jointThroughBars(model,joint);
 if(through.reason!=='JOINT_THROUGH_COLUMN_DEPTH_INSUFFICIENT'||!through.continuityVerified)return no('NO_VERIFIED_THROUGH_DEPTH_REPAIR');
 if(joint.locked)return no('DETAIL_LOCKED');
 const topology=jointTopology(model,joint);
 if(topology.status!=='OK'||!topology.columns.length||topology.columns.length>2||new Set(topology.columns.map(c=>c.side)).size!==topology.columns.length)return no('JOINT_COLUMN_GROUP_REQUIRED');
 const columns=topology.columns.map(c=>model.members.find(m=>m.id===c.memberId));
 const sections=columns.map(m=>resolveSectionRecord(model,m.secId));
 if(columns.some(m=>m.taper||requiresOffsetAwareDesign(m))||sections.some(s=>!['RECT','SQUARE'].includes(s?.shape)))return no('JOINT_DEPTH_PRISMATIC_COLUMNS_REQUIRED');
 const dimensions=sections.map(s=>({B:s.params.B,H:s.params.H||s.params.B}));
 if(dimensions.some(s=>s.B!==dimensions[0].B||s.H!==dimensions[0].H)||joint.jointWidth!==dimensions[0].B/1000||joint.jointDepth!==dimensions[0].H/1000)return no('JOINT_DEPTH_MATCHING_COLUMN_SECTIONS_REQUIRED');
 const axes=columns.map(m=>memberAxes(...[m.n1,m.n2].map(id=>model.nodes.find(n=>n.id===id)),m.localAxis));
 if(axes.some(a=>['x','y','z'].some(k=>a[k].some((v,i)=>Math.abs(v-axes[0][k][i])>1e-8))))return no('JOINT_DEPTH_COLUMN_AXIS_MAPPING_REQUIRED');
 const section={...dimensions[0]};
 for(const row of through.checks){
  if(!Number.isFinite(row.requiredDepth)||row.requiredDepth<=0)return no('JOINT_DEPTH_REQUIREMENT_INVALID');
  const axis=row.axis==='X'?0:row.axis==='Y'?1:null;if(axis===null)return no('JOINT_DEPTH_REQUIREMENT_INVALID');
  const key=Math.abs(axes[0].y[axis])>1-1e-8?'H':Math.abs(axes[0].z[axis])>1-1e-8?'B':null;
  if(!key)return no('JOINT_DEPTH_COLUMN_AXIS_MAPPING_REQUIRED');
  section[key]=Math.max(section[key],Math.ceil((row.requiredDepth*1000-1e-7)/25)*25);
 }
 if(Math.max(section.B,section.H)>3000)return no('JOINT_DEPTH_SECTION_CANDIDATE_LIMIT');
 const latest=new Map();for(const r of model.designDetails?.reinforcement||[])if(!latest.has(r.id)||latest.get(r.id).version<r.version)latest.set(r.id,r);
 const originals=[],reinforcement=[];
 try{
  for(const member of columns){
   const rows=[...latest.values()].filter(r=>r.memberId===member.id).sort((a,b)=>a.start-b.start);
   if(!rows.length||rows[0].start!==0||rows.at(-1).end!==1||rows.some((r,i)=>r.locked||i&&r.start!==rows[i-1].end))return no('JOINT_DEPTH_EDITABLE_COLUMN_REGIONS_REQUIRED');
   const commands=rows.map(r=>practicalCommandFromRecord('reinforcement-record',r));originals.push(...commands);
   if(commands.every(c=>c.stirrupDiameter==null&&!c.crossTieBarPairs?.length)){
    // Move boundary bars with the section faces and scale interior coordinates.
    // Preserve bar IDs and refit actual spatial corner contacts; whole geometry is reevaluated.
    // Spliced paths need the full member geometry transfer owner.
    if((model.designDetails?.splices||[]).some(s=>commands.some(c=>s.reinforcementId===`${c.id}@${c.version}`)))return no('JOINT_DEPTH_COLUMN_SPLICE_MAPPING_REQUIRED');
    const prior={B:dimensions[0].B/1000,H:dimensions[0].H/1000},target={B:section.B/1000,H:section.H/1000};
    for(const c of commands){
     const detail={bars:c.bars.map(b=>({...b,diameter:b.diameter/1000})),cover:joint.jointCover,stirrups:{diameter:joint.reinforcement.diameter},tieBendInsideRadius:joint.jointBendInsideRadius,tieHookTail:joint.jointHookTail,tieClosure:'standard-135',tieClosureCorner:joint.jointClosureCorner,tieClosureSeparation:joint.jointClosureSeparation};
     const moved=resizeSpatialHoopCoordinates(detail,prior,target);
     const fit=fitSpatialHoopBars({...detail,bars:moved},target,{source:{detail,section:prior},transfer:'section-resize'});
     if(fit.status!=='OK')return no(fit.reason);
     const next={...c,version:c.version+1,bars:c.bars.map((b,i)=>({...b,y:fit.bars[i].y,z:fit.bars[i].z}))};
     reinforcement.push(next);
    }
   }else reinforcement.push(...memberCandidateCommands(model,commands,{section,closureBarFit:'contact',crossTieCageFit:'separate'}).commands);
  }
 }catch(error){return no(error.code||error.message);}
 const dependents=[];
 try{for(const column of columns){
  coupleSectionJoints(model,column.id,section,sectionJointCommands(model,column.id).filter(c=>c.id!==joint.id),dependents);
  coupleSectionFoundations(model,column.id,section,sectionFoundationCommands(model,column.id),dependents);
 }}catch(error){return no(error.code||error.message);}
 if(dependents.length>8)return no('JOINT_DEPTH_DEPENDENT_COMMAND_LIMIT');
 if(reinforcement.length>16)return no('JOINT_DEPTH_COMMAND_LIMIT');
 const id=`P25-JDEPTH-${stableHash({joint:joint.id,columns:columns.map(m=>m.id),section}).slice(0,24)}`;
 if(model.sections.some(s=>s.id===id))return no('JOINT_DEPTH_SECTION_ID_ALREADY_PRESENT');
 return {ok:true,version:'p25-joint-column-depth-proposal-v2-spatial-contact',edits:[{jointWidth:section.B/1000,jointDepth:section.H/1000}],
  additionalCommands:[{type:'section-record',id,version:1,name:'Joint depth repair section',shape:'RECT',dimensionUnit:'mm',...section,sourceNote:'Candidate dimensions from recorded through-bar depth requirements; fresh analysis and full detailing review required'},
   {type:'member-assignment',memberIds:columns.map(m=>m.id),secId:`${id}@1`},...reinforcement,...dependents],originalAdditionalCommands:originals,
  columnMemberIds:columns.map(m=>m.id),before:dimensions[0],after:section,roundingStepMm:25,dependentDetailIds:dependents.map(c=>c.id),codeReferences:through.codeReferences,
  requiresReanalysis:true,requiresCandidateEvaluation:true,automaticApplicationAllowed:false,designTransferAllowed:false};
}
