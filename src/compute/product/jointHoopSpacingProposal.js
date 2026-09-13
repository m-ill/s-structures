import {jointCrossTiePlaneProposal} from './jointCrossTiePlaneProposal.js';
import {jointCrossTiePairProposal} from './jointCrossTiePairProposal.js';
import {validJointPlaneOffsets} from '../../design/connection/jointPlaneOffsets.js';
// Consume the quantity owner's linear spacing limit, not the overall ratio:
// material and core geometry failures cannot be repaired by tighter spacing.
export function jointHoopSpacingProposal(command,checks,model){
 const unavailable=reason=>({ok:false,reason,edits:[],automaticApplicationAllowed:false});
 if(command.connectionType!=='rc-joint'||!Number.isFinite(command.tieSpacing)||command.tieSpacing<=0)return unavailable('JOINT_SPACING_INPUT_REQUIRED');
 const rows=checks.filter(c=>c.entityId===`joint:${command.nodeId}`&&c.checkId==='joint-confinement');
 if(!rows.length||rows.some(c=>!['OK','NG'].includes(c.status)||!Number.isFinite(c.spacingRepairLimit)||c.spacingRepairLimit<=0||!Number.isFinite(c.spacing)||Math.abs(c.spacing*1000-command.tieSpacing)>1e-7))return unavailable('RECORDED_JOINT_SPACING_REQUIREMENTS_REQUIRED');
 const limit=Math.min(...rows.map(c=>c.spacingRepairLimit*1000));
 const changedSpacing=limit<command.tieSpacing-1e-7;
 const tieSpacing=changedSpacing?Math.floor((limit+1e-8)/25)*25:command.tieSpacing;
 if(changedSpacing&&tieSpacing<25)return unavailable('JOINT_SPACING_GRID_REQUIRES_REDESIGN');
 let crossTiePlaneEnvelope;
 const edit=changedSpacing?{tieSpacing}:{},basisCheckIds=rows.map(c=>c.id);
 for(const row of checks.filter(c=>c.entityId===`joint:${command.nodeId}`&&c.checkId==='joint-hoop-detail')){
  if(command.jointTieClosure==='seismic-135')for(const [key,kind] of [['jointHookTail','135-hook-tail'],['jointBendInsideRadius','inside-bend-radius']]){
   const bound=row.checks?.find(c=>c.kind===kind),provided=command[key];
   if(!Number.isFinite(provided)||provided<=0||!Number.isFinite(bound?.provided)||Math.abs(bound.provided-provided)>1e-10||!Number.isFinite(bound?.required)||bound.required<=0)continue;
   if(key==='jointHookTail'&&(!Number.isFinite(row.requiredSeismicTail)||row.requiredSeismicTail<=0))continue;
   const required=key==='jointHookTail'?Math.max(bound.required,row.requiredSeismicTail):bound.required;
   const value=Math.ceil((required-1e-10)*1000)/1000;
   if(provided<required-1e-10){edit[key]=Math.max(edit[key]??provided,value);if(!basisCheckIds.includes(row.id))basisCheckIds.push(row.id);}
  }
  for(const [key,kind] of [['jointFirstStart','start-first-tie'],['jointFirstEnd','end-first-tie']]){
   const bound=row.checks?.find(c=>c.kind===kind),provided=command[key];
   if(!Number.isFinite(provided)||provided<0||!Number.isFinite(bound?.provided)||Math.abs(bound.provided-provided)>1e-10||!Number.isFinite(bound?.maximum)||bound.maximum<=0)continue;
   // Existing detail owner uses a spacing-proportional end-offset limit.
   const maximum=bound.maximum*tieSpacing/command.tieSpacing;
   if(provided>maximum+1e-10){edit[key]=Math.min(edit[key]??provided,maximum);if(!basisCheckIds.includes(row.id))basisCheckIds.push(row.id);}
  }
 }
 if(command.jointCrossTiePlaneOffsets!==undefined&&(edit.jointFirstStart!==undefined||edit.jointFirstEnd!==undefined)){
  if(!validJointPlaneOffsets(command.jointCrossTiePlaneOffsets)||!Number.isFinite(command.tieDiameter)||command.tieDiameter<=0)return unavailable('JOINT_CROSS_TIE_END_ENVELOPE_REQUIRES_REDESIGN');
  const first=edit.jointFirstStart??command.jointFirstStart,last=edit.jointFirstEnd??command.jointFirstEnd,radius=command.tieDiameter/2000;
  const low=radius-first,high=last-radius;
  const gridLow=Math.ceil((low-1e-10)*1000)/1000,gridHigh=Math.floor((high+1e-10)*1000)/1000;
  if(![gridLow,gridHigh].every(Number.isFinite)||gridLow>gridHigh)return unavailable('JOINT_CROSS_TIE_END_ENVELOPE_REQUIRES_REDESIGN');
  crossTiePlaneEnvelope={minimumOffset:low,maximumOffset:high,barRadius:radius,firstStart:first,firstEnd:last,roundingStep:.001,unit:'m'};
  const offsets=command.jointCrossTiePlaneOffsets.map(s=>Number(s)<low-1e-10?String(gridLow):Number(s)>high+1e-10?String(gridHigh):s);
  if(offsets.some((s,i)=>s!==command.jointCrossTiePlaneOffsets[i]))edit.jointCrossTiePlaneOffsets=offsets;
 }
 const pairProposal=jointCrossTiePairProposal(command,rows,model,edit);
 if(pairProposal.ok)Object.assign(edit,pairProposal.edit);
 const planeProposal=jointCrossTiePlaneProposal(command,rows,checks,model,edit);
 if(planeProposal.ok){
  Object.assign(edit,planeProposal.edit);
  for(const c of checks)if(c.entityId===`joint:${command.nodeId}`&&c.checkId==='joint-hoop-detail'&&typeof c.id==='string'&&!basisCheckIds.includes(c.id))basisCheckIds.push(c.id);
 }
 if(!Object.keys(edit).length)return unavailable(pairProposal.reason==='JOINT_ADDITIONAL_OPPOSITE_FACE_BARS_REQUIRED'?pairProposal.reason:planeProposal.reason?.startsWith('CROSS_TIE_FIT_')?planeProposal.reason:'NO_JOINT_SPACING_CHANGE_REQUIRED');
 return {ok:true,version:'p25-joint-hoop-spacing-proposal-v6-separated-planes',pairProposal,planeProposal,edits:[edit],basisCheckIds,...(crossTiePlaneEnvelope?{crossTiePlaneEnvelope}:{}),roundingStepMm:25,hookRoundingStepMm:1,basis:'recorded hoop amount and spacing limits; material and geometry require separate checks',requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
}
