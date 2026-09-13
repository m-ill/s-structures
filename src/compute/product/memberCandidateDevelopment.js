import {coupleCandidateSpliceLengths} from './memberCandidateSpliceDevelopment.js';
import {stagePracticalDesignInput} from '../../modeling/practicalDesignInputs.js';
import {evaluateProvidedAnchorage} from '../../design/rc/providedAnchorage.js';
import {memberEndDevelopmentProposal} from './memberEndDevelopmentProposal.js';
import {stableHash} from '../../core/stableHash.js';
// Called only for generated candidates inside the bounded geometry Worker.
export function coupleMemberCandidateDevelopment(model,built,{section}={}){
 const eligible=c=>c.type==='reinforcement-record'&&c.anchorageStandard==='KDS-142052-2024'&&[c.anchorageStartCriticalX,c.anchorageEndCriticalX].every(Number.isFinite);
 if(!built.commands.some(c=>eligible(c)||c.type==='splice-record'))return {...built,endDevelopment:[],spliceDevelopment:[]};
 const references=result=>[...new Map((result.calculations||[]).map(c=>c.source).filter(Boolean).map(source=>[JSON.stringify(source),source])).values()];
 const commands=structuredClone(built.commands),endDevelopment=[];
 const staged={...model,sections:[...(model.sections||[])],members:(model.members||[]).map(m=>({...m})),designDetails:{...model.designDetails,reinforcement:[...(model.designDetails?.reinforcement||[])],splices:[...(model.designDetails?.splices||[])]}};
 const reinforcement=commands.filter(eligible);
 const sectionMember=commands.find(c=>c.type==='reinforcement-record'||c.type==='splice-record')?.memberId;
 if(section&&sectionMember){
  const id='P25-ANCHOR-'+stableHash({section,memberId:sectionMember}).slice(0,20);
  stagePracticalDesignInput(staged,{type:'section-record',id,name:'Candidate anchorage section',version:1,shape:'RECT',dimensionUnit:'mm',...section,sourceNote:'Temporary candidate geometry owner evaluation'},[]);
  staged.members.find(m=>m.id===sectionMember).secId=id+'@1';
 }
 for(const command of commands)stagePracticalDesignInput(staged,command,[]);
 for(const command of reinforcement){
  const member=staged.members.find(m=>m.id===command.memberId),detail=staged.designDetails.reinforcement.find(d=>d.id===command.id&&d.version===command.version);
  if(!member||!detail)continue;
  const before=evaluateProvidedAnchorage(staged,member,[detail]);
  const proposal=memberEndDevelopmentProposal([command],[{...before,id:'candidate-anchorage-'+command.id,entityId:member.id,checkId:'rc-anchorage'}]);
  if(!proposal.ok){endDevelopment.push({detailId:command.id,status:before.status==='NG'?'UNRESOLVED':'UNCHANGED',anchorageStatus:before.status,reason:proposal.reason,codeReferences:references(before),requiresFullReevaluation:true,siteFitVerified:false});continue;}
  const row=proposal.regionConstraints[0],changes={};
  for(const side of ['start','end'])if(row[side+'Extensions']){const value=row[side+'Extensions'][0];command[side+'Extension']=value;changes[side+'Extension']=value;}
  const updated={...detail,...changes};
  staged.designDetails.reinforcement=staged.designDetails.reinforcement.map(d=>d===detail?updated:d);
  const after=evaluateProvidedAnchorage(staged,member,[updated]);
  endDevelopment.push({detailId:command.id,status:'ADJUSTED',changes,anchorageStatus:after.status,incomplete:after.incomplete===true,codeReferences:references(after),requiresFullReevaluation:true,siteFitVerified:false,basis:'fresh proposed section and reinforcement; fixed critical sections and shapes'});
 }
 const spliceDevelopment=coupleCandidateSpliceLengths(staged,commands);
 return {...built,commands,endDevelopment,spliceDevelopment};
}
