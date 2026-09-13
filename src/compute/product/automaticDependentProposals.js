import {jointHoopSpacingProposal} from './jointHoopSpacingProposal.js';
import {foundationRepairProposal} from './foundationRepairProposal.js';
// Consume latest typed commands lazily. Never construct the full proposal product.
export function automaticDependentProposals(member,commands,checks,model){
 const dependentCandidates=[],selectedCommands=[],components=[],unavailable=[],basisCheckIds=new Set();let unavailableCount=0;
 const omit=(command,reason)=>{unavailableCount++;if(unavailable.length<16)unavailable.push({id:command.id,type:command.type,reason});};
 for(const command of commands){
  const joint=command.type==='connection-record';
  if(!member||![member.n1,member.n2].includes(command.nodeId)||joint&&!command.memberIds?.includes(member.id)||!joint&&command.columnMemberId&&command.columnMemberId!==member.id)continue;
  if(command.locked){omit(command,'DETAIL_LOCKED');continue;}
  if(dependentCandidates.length>=8){omit(command,'AUTOMATIC_DEPENDENT_LIMIT');continue;}
  const proposal=joint?jointHoopSpacingProposal(command,checks,model):foundationRepairProposal(command,checks,model);
  if(!proposal.ok){omit(command,proposal.reason);continue;}
  dependentCandidates.push({[joint?'connectionId':'foundationId']:command.id,detailCandidates:proposal.edits});
  selectedCommands.push(command);components.push({...proposal,detailId:command.id,detailType:command.type});
  for(const id of proposal.basisCheckIds||[])basisCheckIds.add(id);
 }
 return {dependentCandidates,selectedCommands,components,basisCheckIds:[...basisCheckIds],unavailable,unavailableCount,truncated:unavailableCount>unavailable.length};
}
