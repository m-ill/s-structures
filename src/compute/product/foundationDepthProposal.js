export function foundationDepthProposal(command,checks){
 const no=reason=>({ok:false,reason,edits:[],automaticApplicationAllowed:false});
 const rows=checks.filter(c=>c.entityId===`foundation:${command.nodeId}`&&c.checkId==='foundation-depth');
 if(!rows.length||!Number.isFinite(command.thickness)||command.thickness<=0)return no('RECORDED_FOOTING_DEPTH_REQUIRED');
 let thickness=command.thickness;const basisCheckIds=[];
 for(const c of rows){
  if(c.incomplete||!Array.isArray(c.axisChecks)||c.axisChecks.length!==2||c.thickness!==command.thickness)return no('RECORDED_FOOTING_DEPTH_REQUIRED');
  for(const r of c.axisChecks){
   if(!['OK','NG'].includes(r.status)||![r.provided,r.limit].every(x=>Number.isFinite(x)&&x>0))return no('RECORDED_FOOTING_DEPTH_REQUIRED');
   if(r.status==='NG'){thickness=Math.max(thickness,command.thickness+r.limit-r.provided);basisCheckIds.push(c.id);}
  }
 }
 if(thickness<=command.thickness+1e-10)return no('NO_FOOTING_DEPTH_CHANGE_REQUIRED');
 thickness=Math.ceil((thickness-1e-10)/.025)*.025;
 return {ok:true,version:'p25-foundation-depth-proposal-v1',edits:[{thickness}],basisCheckIds:[...new Set(basisCheckIds)],roundingStepM:.025,basis:'recorded depth above bottom reinforcement; unchanged cover and diameters',requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
}
