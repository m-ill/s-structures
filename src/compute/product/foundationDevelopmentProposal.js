// Use recorded calculation requirements; do not select code editions, soil
// properties or reinforcement materials on behalf of the project designer.
export function foundationDevelopmentProposal(command,checks){
 const rows=checks.filter(c=>c.entityId===`foundation:${command.nodeId}`&&c.checkId==='foundation-column-transfer');
 const unavailable=reason=>({ok:false,reason,edits:[],automaticApplicationAllowed:false});
 if(!rows.length||!['columnEmbedmentLength','columnDevelopmentAbove','thickness'].every(k=>Number.isFinite(command[k])&&command[k]>0))return unavailable('RECORDED_DEVELOPMENT_REQUIREMENTS_REQUIRED');
 const data=rows.map(c=>{let source=c,sourcePath='';for(let depth=0;depth<3&&source?.requiredBelow===undefined;depth++){source=source?.normalTransfer;sourcePath+=(sourcePath?'.':'')+'normalTransfer';}return {check:c,source,sourcePath,below:source?.requiredBelow,above:source?.requiredAbove,availableBelow:source?.criteria?.find(r=>r.id==='embedment-envelope')?.capacity,availableAbove:source?.criteria?.find(r=>r.id==='column-region-envelope')?.capacity};});
 if(data.some(r=>![r.below,r.above,r.availableBelow,r.availableAbove].every(x=>Number.isFinite(x)&&x>0)))return unavailable('RECORDED_DEVELOPMENT_REQUIREMENTS_REQUIRED');
 const round=v=>Math.ceil(v/.025)*.025;
 const requiredBelow=Math.max(...data.map(r=>r.below)),requiredAbove=Math.max(...data.map(r=>r.above));
 const below=requiredBelow>command.columnEmbedmentLength?round(requiredBelow):command.columnEmbedmentLength,above=requiredAbove>command.columnDevelopmentAbove?round(requiredAbove):command.columnDevelopmentAbove;
 if(above>Math.min(...data.map(r=>r.availableAbove))+1e-10)return unavailable('COLUMN_REGION_EXTENSION_REQUIRES_REDESIGN');
 const neededThickness=command.thickness+below-Math.min(...data.map(r=>r.availableBelow));
 const thickness=neededThickness>command.thickness?round(neededThickness):command.thickness;
 if(![below,above,thickness].every(Number.isFinite))return unavailable('DEVELOPMENT_PROPOSAL_NONFINITE');
 const edit={};if(below>command.columnEmbedmentLength+1e-10)edit.columnEmbedmentLength=below;if(above>command.columnDevelopmentAbove+1e-10)edit.columnDevelopmentAbove=above;if(thickness>command.thickness+1e-10)edit.thickness=thickness;
 if(!Object.keys(edit).length)return unavailable('NO_DEVELOPMENT_CHANGE_REQUIRED');
 return {ok:true,version:'p25-foundation-development-proposal-v2-nested-requirements',edits:[edit],basisCheckIds:data.map(r=>r.check.id),requirementPaths:data.map(r=>({checkId:r.check.id,path:r.sourcePath})),roundingStepM:.025,basis:'recorded required development and physical embedment envelopes',requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
}
