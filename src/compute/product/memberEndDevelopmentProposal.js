// Extend declared ends from recorded KDS requirements; do not choose critical sections or hooks.
export function memberEndDevelopmentProposal(commands,checks){
 const regions=[],basis=new Set(),unavailable=[];
 for(const command of commands){
  if(command.locked||command.anchorageStandard!=='KDS-142052-2024'||![command.anchorageStartCriticalX,command.anchorageEndCriticalX].every(Number.isFinite))continue;
  const targets={start:command.startExtension??0,end:command.endExtension??0},used=[];
  if(!Object.values(targets).every(v=>Number.isFinite(v)&&v>=0&&v<=5))continue;
  for(const check of checks){
   if(check.entityId!==command.memberId||check.checkId!=='rc-anchorage'||check.status!=='NG')continue;
   for(const row of check.calculations||[]){
    if(row.detailId!==command.id||row.detailVersion!==command.version||row.kind!=='development'||!['start','end'].includes(row.end)||!row.source||![row.requiredMm,row.providedMm].every(Number.isFinite)||row.requiredMm<=0||row.requiredMm<=row.providedMm+1e-7)continue;
    targets[row.end]=Math.max(targets[row.end],(command[row.end+'Extension']??0)+(row.requiredMm-row.providedMm)/1000);used.push(check.id);
   }
  }
  if(!used.length)continue;
  const row={detailId:command.id};let exceeds=false;
  for(const side of ['start','end']){
   if(targets[side]<=(command[side+'Extension']??0)+1e-10)continue;
   const value=Math.ceil((targets[side]-1e-10)/.025)/40;
   if(value>5){exceeds=true;break;}
   if(value>(command[side+'Extension']??0)+1e-10)row[side+'Extensions']=[value];
  }
  if(exceeds){unavailable.push({detailId:command.id,reason:'BAR_EXTENSION_SEARCH_LIMIT'});continue;}
  if(Object.keys(row).length>1){regions.push(row);for(const id of used)if(typeof id==='string')basis.add(id);}
 }
 return {ok:regions.length>0,version:'p25-member-end-development-v1-recorded',reason:regions.length?null:unavailable[0]?.reason||'RECORDED_END_DEVELOPMENT_REQUIRED',regionConstraints:regions,basisCheckIds:[...basis],unavailable,roundingStepM:.025,maximumExtensionM:5,siteFitVerified:false,requiresCandidateEvaluation:true,automaticApplicationAllowed:false,basis:'maximum recorded same-version bar-end development deficit; declared critical sections and shapes preserved; fresh whole-candidate review required'};
}
