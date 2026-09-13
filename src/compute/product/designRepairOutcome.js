import {checkIncomplete} from '../../metadata/checkCompleteness.js';
// Prepared once from the actual post-application evaluation. Report consumers
// display this bounded summary; they do not rerun calculations or infer repairs.
export function designRepairOutcome({checks,commands,originalRegions=[],entityIds=[]}){
 let truncated=false,pendingCheckCount=0,affectedPendingCheckCount=0;
 const clip=(v,n=128)=>{if(v==null)return null;const s=String(v);if(s.length>n)truncated=true;return s.slice(0,n);};
 const scope=new Set(entityIds),changed=new Set(commands.filter(c=>c.type==='reinforcement-record').map(c=>c.id));
 const details=commands.filter(c=>c.type?.endsWith('-record'));
 const changedDetails=details.slice(0,16).map(c=>({type:clip(c.type),id:clip(c.id),version:c.version}));
 const pending=c=>c.status!=='N_A'&&(c.status==='NG'||checkIncomplete(c));
 for(const c of checks)if(pending(c)){pendingCheckCount++;if(scope.has(c.entityId))affectedPendingCheckCount++;}
 const pendingChecks=[];
 for(const affected of [true,false])for(const c of checks){
  if(pendingChecks.length>=10)break;
  if(!pending(c)||scope.has(c.entityId)!==affected)continue;
  const fields=c.requiredInputFields||[],reasons=c.incompleteReasons||[],refs=c.codeBasis?.applied?.length?c.codeBasis.applied:c.codeBasis?.reviewTargets||c.codeReferences||[];
  if(fields.length>4||reasons.length>3||refs.length>2)truncated=true;
  pendingChecks.push({id:clip(c.id),entityId:clip(c.entityId),comboId:clip(c.comboId),checkId:clip(c.checkId),status:clip(c.status),incomplete:checkIncomplete(c),reason:clip(c.reason,256),withinAffectedScope:affected,requiredInputFields:fields.slice(0,4).map(v=>clip(v)),incompleteReasons:reasons.slice(0,3).map(v=>clip(v)),codeBasisStatus:clip(c.codeBasis?.status),codeReferences:refs.slice(0,2).map(r=>({code:clip(r.code??r.id),edition:clip(r.edition),clause:clip(r.clause),sourceHash:clip(r.sha256)}))});
 }
 return {version:'p25-repair-outcome-v1',changedDetailCount:details.length,changedDetails,preservedRegionCount:originalRegions.filter(c=>!changed.has(c.id)).length,pendingCheckCount,affectedPendingCheckCount,pendingChecks,truncated:truncated||details.length>16||pendingCheckCount>pendingChecks.length,detailTool:'get_practical_design_check',designTransferAllowed:false};
}
