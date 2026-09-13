import {evaluateRcJoint} from '../../design/connection/rcJoint.js';
import {fitCrossTieCage} from '../../design/rc/fitCrossTieCage.js';
import {resolveSectionRecord} from '../../materials/registry.js';
// Search transverse geometry before choosing an amount-driven spacing. The
// confinement owner may credit cross ties only after actual assembly is proved.
export function jointCageSpacingProposal(command,checks,model){
 const trials=[],no=reason=>({ok:false,reason,trials,automaticApplicationAllowed:false});
 if(command.locked)return no('DETAIL_LOCKED');
 if(command.jointTieClosure!=='seismic-135'||command.jointCrossTiePattern!=='alternating-hook-side'||!command.jointCrossTieBarPairs?.length)return no('JOINT_CAGE_SEARCH_SCOPE_REQUIRED');
 const rows=checks.filter(c=>c.entityId===`joint:${command.nodeId}`&&c.checkId==='joint-confinement');
 if(!rows.length||rows.some(c=>!Number.isFinite(c.spacingLimit)||c.spacingLimit<=0))return no('RECORDED_JOINT_SPACING_REQUIREMENTS_REQUIRED');
 const column=model.members.find(c=>c.id===command.columnMemberId),section=resolveSectionRecord(model,column?.secId),row=rows[0];
 const detail=model.designDetails?.reinforcement?.find(d=>d.id===row.columnDetailId&&d.version===row.columnDetailVersion);
 if(!detail||detail.memberId!==column?.id||model.designDetails.reinforcement.some(d=>d.id===detail.id&&d.version>detail.version)||rows.some(c=>c.columnDetailId!==detail.id||c.columnDetailVersion!==detail.version)||!['RECT','SQUARE'].includes(section?.shape))return no('CURRENT_JOINT_COLUMN_BARS_REQUIRED');
 const maximum=Math.min(200,Math.floor(Math.min(...rows.map(c=>c.spacingLimit))*1000/25+1e-8)*25);
 const edits=[];
 const longitudinal=checks.some(c=>c.entityId===`joint:${command.nodeId}`&&c.checkId==='joint-bar-congestion'&&c.status==='OK');
 const source=model.designDetails.connections.find(c=>c.id===command.id&&c.version===command.version);
 const phases=longitudinal?[.5,.4,.3,.2,.1]:[.5];
 for(let spacing=maximum;spacing>=25;spacing-=25){
  if(spacing/1000>command.jointPanelHeight)continue;
  for(const phase of phases){
  const first=spacing/1000*phase;
  const fit=fitCrossTieCage({bars:detail.bars,cover:command.jointCover,start:0,end:1,stirrups:{diameter:command.tieDiameter/1000,spacing:spacing/1000},tieClosure:'standard-135',tieClosureCorner:command.jointClosureCorner,tieClosureSeparation:command.jointClosureSeparation,tieBendInsideRadius:command.jointBendInsideRadius,tieHookTail:command.jointHookTail,tieFirstStart:first,tieFirstEnd:first,crossTieBarPairs:command.jointCrossTieBarPairs,crossTieHookSides:command.jointCrossTieHookSides,crossTiePlaneOffsets:command.jointCrossTiePlaneOffsets},{B:section.params.B/1000,H:(section.params.H||section.params.B)/1000,length:command.jointPanelHeight});
  const trial={spacingMm:spacing,phase,status:fit.status,reason:fit.reason||null};trials.push(trial);
  if(fit.status==='OK'){
   const edit={tieSpacing:spacing,jointFirstStart:first,jointFirstEnd:first,jointCrossTiePlaneOffsets:fit.planeOffsets,jointCrossTieHookSides:fit.hookSides};
   if(longitudinal){
    if(!source)return no('CURRENT_JOINT_RECORD_REQUIRED');
    const record={...source,...command,...edit,reinforcement:{...source.reinforcement,spacing:spacing/1000}};
    const evaluated=evaluateRcJoint(model,record),hoop=evaluated['joint-hoop-detail'],quantity=evaluated['joint-confinement'];
    trial.hoopStatus=hoop.status;trial.confinementStatus=quantity.status;trial.longitudinalReason=hoop.reason;
    if(hoop.status!=='OK'||quantity.status!=='OK')continue;
   }
   const same=(a,b)=>Array.isArray(a)?Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i])):Number.isFinite(Number(a))&&Number.isFinite(Number(b))?Math.abs(Number(a)-Number(b))<1e-10:a===b;
   if(Object.entries(edit).every(([key,value])=>same(value,command[key]))){trial.unchanged=true;continue;}
   edits.push(edit);
   if(longitudinal)break;
  }
  }
  if(longitudinal&&edits.length)break;
 }
 if(!edits.length)return no(longitudinal?'JOINT_CAGE_NO_QUALIFIED_LAYOUT':'JOINT_CAGE_NO_CHANGED_SEPARATED_SPACING');
 return {ok:true,version:'p25-joint-cage-spacing-v2-longitudinal',edits,trials,codeReferences:rows.flatMap(c=>c.codeReferences||[]),basisCheckIds:rows.map(c=>c.id).filter(Boolean),maximumTrials:longitudinal?40:8,longitudinalGeometryVerified:longitudinal,requiresCandidateEvaluation:true,requiresReanalysis:true,automaticApplicationAllowed:false,designTransferAllowed:false,scope:'bounded transverse-only geometry search; amount, beam-bar collisions and all KDS checks require full candidate review'};
}
