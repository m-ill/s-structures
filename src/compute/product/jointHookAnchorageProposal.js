import {evaluateJointHookAnchorage} from '../../design/connection/jointHookAnchorage.js';
import {reinforcementRegionsAt} from '../../design/rc/reinforcementRegions.js';
import {practicalCommandFromRecord} from '../../modeling/practicalInputContract.js';
import {stageDesignInputCommand} from '../../modeling/designInputCommands.js';

// A geometric proposal only. The caller must still reanalyse and evaluate all
// connected details, including congestion and development outside the panel.
export function jointHookAnchorageProposal(model,joint){
 const no=reason=>({ok:false,reason,automaticApplicationAllowed:false});
 const current=evaluateJointHookAnchorage(model,joint);
 // Through-bar depth failures need section/bar redesign, never hook extension.
 // A mixed joint can still offer a hook repair while preserving those failures.
 const hookCurrent=joint.jointAnchorageMode==='special-frame-beam-mixed'?current.hooks:
  joint.jointAnchorageMode==='special-frame-beam-90-hooks'?current:null;
 if(hookCurrent?.status!=='NG'||!hookCurrent.checks?.length)return no('NO_REPAIRABLE_JOINT_HOOK_FAILURE');
 const groups=new Map();
 for(const row of hookCurrent.checks){
  const key=JSON.stringify([row.memberId,row.end]);
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
 }
 const latest=new Map();for(const r of model.designDetails?.reinforcement||[])if(!latest.has(r.id)||latest.get(r.id).version<r.version)latest.set(r.id,r);
 const commands=[],originalCommands=[],changes=[];
 for(const rows of groups.values()){
  if(rows.every(r=>r.status==='OK'))continue;
  const {memberId,end}=rows[0],selected=reinforcementRegionsAt([...latest.values()].filter(r=>r.memberId===memberId),end==='start'?0:1),record=selected[0];
  if(selected.length!==1)return no('JOINT_HOOK_REINFORCEMENT_RECORD_REQUIRED');
  if(record.locked)return no('DETAIL_LOCKED');
  if(model.designDetails?.splices?.some(s=>s.reinforcementId===record.id||s.reinforcementId?.startsWith(`${record.id}@`)))return no('JOINT_HOOK_SPLICE_LAYOUT_REQUIRES_REVIEW');
  // available = column half-depth + farReach. The confined core excludes
  // cover and the actual (catalogue-resolved) outer hoop diameter.
  const deltas=rows.map(r=>r.available-2*r.farReach-joint.jointCover-joint.reinforcement.diameter);
  if(!deltas.every(Number.isFinite)||deltas.some(d=>Math.abs(d-deltas[0])>1e-9))return no('JOINT_HOOK_COMMON_EXTENSION_UNAVAILABLE');
  const original=practicalCommandFromRecord('reinforcement-record',record),field=`${end}Extension`,provided=original[field]??0;
  if(!Number.isFinite(provided))return no('JOINT_HOOK_EXTENSION_INPUT_REQUIRED');
  const value=provided+deltas[0];
  if(!Number.isFinite(value)||value<0||value>5||Math.abs(value-provided)<1e-10)return no('JOINT_HOOK_EXTENSION_REQUIRES_REDESIGN');
  originalCommands.push(original);commands.push({...original,version:original.version+1,[field]:value});
  changes.push({detailId:record.id,memberId,end,field,before:provided,after:value,unit:'m'});
 }
 if(!commands.length)return no('NO_REPAIRABLE_JOINT_HOOK_FAILURE');
 const virtual=structuredClone(model);
 for(const c of commands)stageDesignInputCommand(virtual,c,{},[]);
 const checked=evaluateJointHookAnchorage(virtual,joint);
 const hookChecked=joint.jointAnchorageMode==='special-frame-beam-mixed'?checked.hooks:checked;
 if(hookChecked?.status!=='OK')return no(hookChecked?.reason||'JOINT_HOOK_PROPOSED_GEOMETRY_NOT_SATISFIED');
 const remainingAnchorageChecks=(checked.throughBars?.checks||[]).filter(r=>r.status!=='OK');
 return {ok:true,commands,originalCommands,changes,prospectiveAnchorageStatus:checked.status,prospectiveHookStatus:hookChecked.status,remainingAnchorageChecks,requiresReanalysis:true,requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
}
