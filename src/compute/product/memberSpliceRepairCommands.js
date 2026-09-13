import {practicalCommandFromRecord} from '../../modeling/practicalInputContract.js';
export function memberSpliceRepairCommands(model,built,repairs=[]){
 const commands=[...built.commands],spliceLengthChanges=[];
 for(const repair of repairs){
  const current=(model.designDetails?.splices||[]).filter(s=>s.id===repair.id).sort((a,b)=>b.version-a.version)[0];
  if(!current||current.version!==repair.version||current.reinforcementId!==repair.reinforcementId||current.locked)throw Object.assign(Error('SPLICE_REPAIR_SOURCE_STALE_OR_LOCKED'),{code:'SPLICE_REPAIR_SOURCE_STALE_OR_LOCKED'});
  const index=commands.findIndex(c=>c.type==='splice-record'&&c.id===repair.id),base=index>=0?commands[index]:{...practicalCommandFromRecord('splice-record',current),version:current.version+1};
  const next={...base,start:repair.start,end:repair.end};
  if(index>=0)commands[index]=next;else commands.push(next);
  spliceLengthChanges.push({id:current.id,beforeVersion:current.version,afterVersion:next.version,before:{start:current.start,end:current.end},after:{start:next.start,end:next.end},positionStrategy:repair.positionStrategy,centreShiftM:repair.centreShiftM,requiredLength:repair.requiredLength,requiresFullReevaluation:true});
 }
 return {...built,commands,spliceLengthChanges};
}
