import {jointBeamLayerProposal} from './jointBeamLayerProposal.js';
import {jointCageSpacingProposal} from './jointCageSpacingProposal.js';
import {jointHoopSpacingProposal} from './jointHoopSpacingProposal.js';
import {jointSupportBarProposal} from './jointSupportBarProposal.js';
import {jointCrossTiePlaneProposal} from './jointCrossTiePlaneProposal.js';
import {evaluateProvidedJointHoops} from '../../design/connection/kdsJointHoops.js';
import {evaluateRcJoint} from '../../design/connection/rcJoint.js';
import {stageDesignInputCommand} from '../../modeling/designInputCommands.js';
import {stableHash} from '../../core/stableHash.js';
import {jointHookAnchorageProposal} from './jointHookAnchorageProposal.js';
import {jointColumnDepthProposal} from './jointColumnDepthProposal.js';
export function jointRepairProposal(command,checks,model){
 const direct=jointConfinementRepairProposal(command,checks,model);
 const record=model.designDetails?.connections?.find(r=>r.id===command.id&&r.version===command.version);
 if(!record)return direct;
 const hook=jointHookAnchorageProposal(model,record);
 const {commands,originalCommands,...hookProposal}=hook;
 if(!hook.ok){
  const depth=jointColumnDepthProposal(model,record);
  if(depth.ok)return {...depth,columnDepthProposal:{ok:true,columnMemberIds:depth.columnMemberIds,before:depth.before,after:depth.after,roundingStepMm:depth.roundingStepMm},hookProposal};
  const currentCage=checks.find(c=>c.entityId===`joint:${command.nodeId}`&&c.checkId==='joint-hoop-detail');
  const layer=currentCage?.spatialClosure?.crossTieAssembly?.status==='OK'?jointBeamLayerProposal(model,record,checks):null;
  if(layer?.ok)return {...layer,hookProposal,columnDepthProposal:depth,beamLayerProposal:{ok:true,changes:layer.changes}};
  const needsCage=direct.planeProposal?.reason?.startsWith('CROSS_TIE_FIT_')||checks.some(c=>c.entityId===`joint:${command.nodeId}`&&c.checkId==='joint-hoop-detail'&&c.spatialClosure?.crossTieAssembly?.status==='NG');
  const cage=needsCage?jointCageSpacingProposal(command,checks,model):null;
  if(cage?.reason==='JOINT_CAGE_NO_QUALIFIED_LAYOUT')return {...cage,hookProposal,columnDepthProposal:depth,...(layer?{beamLayerProposal:layer}:{})};
  if(cage?.ok)return {...cage,hookProposal,columnDepthProposal:depth,cageSpacingProposal:{ok:true,trials:cage.trials}};
  return {...direct,hookProposal,columnDepthProposal:depth,...(cage?{cageSpacingProposal:cage}:{}),...(layer?{beamLayerProposal:layer}:{})};
 }
 if(commands.some(c=>direct.additionalCommands?.some(d=>d.type===c.type&&d.id===c.id)))return {...direct,hookProposal:{ok:false,reason:'JOINT_HOOK_SUPPORT_COMMAND_CONFLICT'}};
 return {...direct,ok:true,version:'p25-joint-repair-proposal-v3-hook-core',edits:direct.ok?direct.edits:[{tieSpacing:command.tieSpacing}],additionalCommands:[...(direct.additionalCommands||[]),...commands],originalAdditionalCommands:[...(direct.originalAdditionalCommands||[]),...originalCommands],hookProposal,requiresReanalysis:true,requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
}
function jointConfinementRepairProposal(command,checks,model){
 const direct=jointHoopSpacingProposal(command,checks,model);
 const supportReasons=new Set(['JOINT_ADDITIONAL_OPPOSITE_FACE_BARS_REQUIRED','JOINT_DIAGONAL_CROSS_TIE_RULE_REQUIRED']);
 if(!supportReasons.has(direct.reason)&&!supportReasons.has(direct.pairProposal?.reason))return direct;
 const bars=jointSupportBarProposal(command,checks,model);
 if(!bars.ok)return {...direct,supportBarProposal:{ok:false,reason:bars.reason}};
 const virtual=structuredClone(model);
 for(const c of bars.commands)stageDesignInputCommand(virtual,c,{},[]);
 const original=virtual.designDetails.connections.find(r=>r.id===command.id&&r.version===command.version);
 if(!original)return {...direct,supportBarProposal:{ok:false,reason:'CURRENT_JOINT_RECORD_REQUIRED'}};
 const draft={...original,...bars.edit},quantity=evaluateProvidedJointHoops(virtual,draft),seed={...command,...bars.edit};
 const planes=jointCrossTiePlaneProposal(seed,[quantity],[],virtual,bars.edit);
 if(!planes.ok)return {...direct,supportBarProposal:{ok:false,reason:planes.reason}};
 const seeded={...seed,...planes.edit,version:command.version+1};stageDesignInputCommand(virtual,seeded,{},[]);
 const record=virtual.designDetails.connections.find(r=>r.id===seeded.id&&r.version===seeded.version);
 // Only geometry/material-dependent checks are consumed. This preview is not a
 // structural reanalysis and cannot supply an analysis-source certificate.
 const result=evaluateRcJoint(virtual,record),prospective=['joint-confinement','joint-hoop-detail'].map(checkId=>({...result[checkId],checkId,entityId:`joint:${command.nodeId}`,id:stableHash({stage:'prospective-support-geometry',checkId,value:result[checkId]})}));
 const spacing=jointHoopSpacingProposal(seeded,prospective,virtual),edit={...bars.edit,...planes.edit,...(spacing.ok?spacing.edits[0]:{})};
 return {ok:true,version:'p25-joint-repair-proposal-v2-splices',edits:[edit],additionalCommands:bars.commands,originalAdditionalCommands:bars.originalCommands,supportBarChanges:bars.changes,spliceChanges:bars.spliceChanges,basisCheckIds:checks.filter(c=>c.entityId===`joint:${command.nodeId}`&&['joint-confinement','joint-hoop-detail'].includes(c.checkId)).map(c=>c.id),prospectiveGeometry:{stage:'after-appended-bars-and-initial-plane-fit',checkHash:stableHash(prospective),sourceBarVersions:bars.changes.map(c=>({id:c.detailId,version:c.toVersion})),spacingProposalAvailable:spacing.ok,spacingProposalReason:spacing.reason||null},planeProposal:spacing.planeProposal?.reason==='NO_JOINT_CROSS_TIE_PLANE_CHANGE_REQUIRED'?{...planes,confirmedAtProposedSpacing:true}:spacing.planeProposal||planes,requiresCandidateEvaluation:true,requiresReanalysis:true,automaticApplicationAllowed:false,basis:'current source checks trigger appended existing-product bars; prospective geometry supplies spacing requirements; mandatory fresh analysis and full evaluation follow'};
}
