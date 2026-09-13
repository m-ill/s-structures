import {memberSpliceLengthProposal} from './memberSpliceLengthProposal.js';
import {memberSpliceRepairCommands} from './memberSpliceRepairCommands.js';
import {practicalCommandFromRecord} from '../../modeling/practicalInputContract.js';
export function candidateSpliceRefinement(model,commands,checks){
 const members=new Set(commands.filter(c=>['reinforcement-record','splice-record'].includes(c.type)).map(c=>c.memberId)),latest=new Map();
 for(const d of model.designDetails?.reinforcement||[])if(members.has(d.memberId)&&(!latest.has(d.id)||latest.get(d.id).version<d.version))latest.set(d.id,d);
 const hosts=[...latest.values()].map(d=>practicalCommandFromRecord('reinforcement-record',d));
 const qualified=checks.filter(c=>members.has(c.entityId)&&c.checkId==='rc-splices').map(c=>({...c,checks:(c.checks||[]).filter(r=>r.calculation?.spliceClass==='A')}));
 const proposal=memberSpliceLengthProposal(model,hosts,qualified);
 if(!proposal.ok)return {ok:false,reason:proposal.reason,unavailable:proposal.unavailable};
 const result=memberSpliceRepairCommands(model,{commands},proposal.spliceRepairs);
 return {ok:true,commands:result.commands,changes:result.spliceLengthChanges,positionSearch:proposal.positionSearch,jointPlacement:proposal.jointPlacement,unavailable:proposal.unavailable,basisCheckIds:proposal.basisCheckIds,requiresFullReevaluation:true};
}
