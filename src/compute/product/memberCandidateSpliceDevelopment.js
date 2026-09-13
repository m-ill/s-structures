import {evaluateMemberSplices} from '../../design/rc/spliceGeometry.js';
import {practicalCommandFromRecord} from '../../modeling/practicalInputContract.js';
import {stagePracticalDesignInput} from '../../modeling/practicalDesignInputs.js';
import {memberSpliceLengthProposal} from './memberSpliceLengthProposal.js';
// Mutate only the temporary candidate records and commands supplied by the geometry Worker.
export function coupleCandidateSpliceLengths(staged,commands){
 const members=new Set(commands.filter(c=>c.type==='splice-record').map(c=>c.memberId)),results=[];
 for(const memberId of members){
  const member=staged.members.find(m=>m.id===memberId);if(!member)continue;
  const latest=new Map();for(const d of staged.designDetails.reinforcement||[])if(d.memberId===memberId&&(!latest.has(d.id)||latest.get(d.id).version<d.version))latest.set(d.id,d);
  const hosts=[...latest.values()].map(d=>practicalCommandFromRecord('reinforcement-record',d));
  const before=evaluateMemberSplices(staged,member,[]),proposal=memberSpliceLengthProposal(staged,hosts,[{...before,id:'candidate-splices-'+memberId,entityId:memberId,checkId:'rc-splices'}]);
  const changes=[];
  for(const repair of proposal.spliceRepairs){
   const record=staged.designDetails.splices.find(s=>s.id===repair.id&&s.version===repair.version),index=commands.findIndex(c=>c.type==='splice-record'&&c.id===repair.id);
   const next=index>=0?{...commands[index],start:repair.start,end:repair.end}:{...practicalCommandFromRecord('splice-record',record),version:record.version+1,start:repair.start,end:repair.end};
   // Replacing a provisional same-version record is confined to this temporary model.
   staged.designDetails.splices=staged.designDetails.splices.filter(s=>s.id!==next.id||s.version!==next.version);
   stagePracticalDesignInput(staged,next,[]);
   if(index>=0)commands[index]=next;else commands.push(next);
   changes.push({id:next.id,version:next.version,start:next.start,end:next.end,positionStrategy:repair.positionStrategy,centreShiftM:repair.centreShiftM,requiredLength:repair.requiredLength});
  }
  const after=changes.length?evaluateMemberSplices(staged,member,[]):before;
  const requiresAnalysisProof=(after.checks||[]).some(r=>r.reason==='CLASS_A_ANALYSIS_ENVELOPE_REQUIRED');
  results.push({memberId,requiresAnalysisProof,status:changes.length?'ADJUSTED':after.status==='NG'?'UNRESOLVED':'UNCHANGED',spliceStatus:after.status,incomplete:after.incomplete===true||requiresAnalysisProof,changes,jointPlacement:proposal.jointPlacement,positionSearch:proposal.positionSearch,unavailable:proposal.unavailable,omittedCount:proposal.omittedCount,codeReferences:after.codeReferences||[],requiresFullReevaluation:true,siteFitVerified:false,basis:'fresh candidate reinforcement and splice geometry; B/compression-envelope lengths recomputed here; A-class strength proof is deferred to the subsequent full analysis review'});
 }
 return results;
}
