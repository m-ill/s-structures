import {practicalCommandFromRecord} from '../../modeling/practicalInputContract.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
// Rebind only references to the current baseline version, never repair stale input silently.
export function rebindDifferentialPeerCommands(model,commands,{maxCommands=100}={}){
 if(!Array.isArray(commands)||commands.length>maxCommands)fail('CANDIDATE_COMMAND_LIMIT');
 const result=[...commands],latest=new Map(),updates=new Map(),reverse=new Map();
 for(const f of model.designDetails?.foundations||[])if(!latest.has(f.id)||latest.get(f.id).version<f.version)latest.set(f.id,f);
 for(const command of commands)if(command.type==='foundation-record'){
  if(updates.has(command.id))fail('DIFFERENTIAL_DUPLICATE_FOUNDATION_COMMAND');
  updates.set(command.id,command);
 }
 if(!updates.size)return {commands:result,rewired:[]};
 for(const f of latest.values())for(const ref of f.differentialPeerIds||[]){
  if(typeof ref!=='string')continue;
  const ids=reverse.get(ref)||new Set();ids.add(f.id);reverse.set(ref,ids);
 }
 const queue=[...updates.keys()],visited=new Set(),added=new Set();
 for(let index=0;index<queue.length;index++){
  const id=queue[index];if(visited.has(id))continue;visited.add(id);
  const original=latest.get(id),update=updates.get(id);
  if(!original)continue;
  if(update.version!==original.version+1)fail('DIFFERENTIAL_CANDIDATE_VERSION_REQUIRED');
  for(const parentId of reverse.get(`${id}@${original.version}`)||[]){
   if(updates.has(parentId))continue;
   const parent=latest.get(parentId);
   if(parent.locked)fail('DIFFERENTIAL_DEPENDENT_LOCKED');
   if(result.length>=maxCommands)fail('CANDIDATE_COMMAND_LIMIT');
   if(parent.version>=1e6)fail('DIFFERENTIAL_VERSION_LIMIT');
   const command={...practicalCommandFromRecord('foundation-record',parent),version:parent.version+1};
   result.push(command);updates.set(parentId,command);added.add(parentId);queue.push(parentId);
  }
 }
 const replacement=new Map();
 for(const [id,command] of updates){const original=latest.get(id);if(original)replacement.set(`${id}@${original.version}`,`${id}@${command.version}`);}
 const rewired=[];
 for(let i=0;i<result.length;i++){
  const command=result[i];if(command.type!=='foundation-record'||!Array.isArray(command.differentialPeerIds))continue;
  const references=command.differentialPeerIds.map(ref=>replacement.get(ref)||ref),peerCount=references.reduce((n,ref,j)=>n+(ref!==command.differentialPeerIds[j]?1:0),0);
  if(!peerCount)continue;
  if(latest.get(command.id)?.locked)fail('DIFFERENTIAL_DEPENDENT_LOCKED');
  result[i]={...command,differentialPeerIds:references};
  rewired.push({id:command.id,fromVersion:latest.get(command.id)?.version??null,toVersion:command.version,peerCount,addedCommand:added.has(command.id)});
 }
 return {commands:result,rewired};
}
