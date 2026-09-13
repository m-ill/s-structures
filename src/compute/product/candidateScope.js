import {stableHash} from '../../core/stableHash.js';
import {summarizePracticalChecks} from '../../design/evaluation/practicalEvaluation.js';

// A local completion never grants project or method qualification. A changed
// stiffness/load path conservatively affects every evaluated entity.
export function assessCandidateScope({model,commands,impact,baselineChecks,checks,combinationCoverage}){
 const entities=new Set(),requiredMembers=new Set(),requiredEntities=new Set();let supported=true;
 const latestFoundations=new Map();for(const footing of model.designDetails?.foundations||[])if(!latestFoundations.has(footing.id)||latestFoundations.get(footing.id).version<footing.version)latestFoundations.set(footing.id,footing);
 const includeMember=id=>{
  const member=model.members?.find(m=>m.id===id);
  if(!member){supported=false;return;}
  requiredMembers.add(id);entities.add(id);
  for(const node of [member.n1,member.n2]){entities.add(`joint:${node}`);entities.add(`foundation:${node}`);}
 };
 for(const command of commands){
  if(['reinforcement-record','splice-record'].includes(command.type))includeMember(command.memberId);
  else if(command.type==='connection-record'){
   entities.add(`joint:${command.nodeId}`);requiredEntities.add(`joint:${command.nodeId}`);
   for(const id of command.memberIds||[])includeMember(id);
  }else if(command.type==='foundation-record'){
   entities.add(`foundation:${command.nodeId}`);requiredEntities.add(`foundation:${command.nodeId}`);
   for(const footing of latestFoundations.values())if(footing.footprintClearance!==undefined||footing.footprintClearanceReference!==undefined){entities.add(`foundation:${footing.nodeId}`);requiredEntities.add(`foundation:${footing.nodeId}`);}
   for(const member of model.members||[])if(member.n1===command.nodeId||member.n2===command.nodeId)includeMember(member.id);
  }else if(!['section-record','member-assignment'].includes(command.type)||impact!=='REANALYSIS_REQUIRED')supported=false;
 }
 const global=impact==='REANALYSIS_REQUIRED';
 if(global)for(const check of [...baselineChecks,...checks])entities.add(check.entityId);
 const key=c=>JSON.stringify([c.entityId,c.comboId,c.checkId]);
 const before=new Map(baselineChecks.map(c=>[key(c),c])),after=new Map(checks.map(c=>[key(c),c]));
 const duplicateChecks=before.size!==baselineChecks.length||after.size!==checks.length;
 const missingCheckCount=[...before.keys()].filter(k=>!after.has(k)).length;
 const missingEntityIds=[...new Set([...requiredMembers,...requiredEntities])].filter(id=>!checks.some(c=>c.entityId===id));
 let unaffectedRegressionCount=0,unaffectedSourceRecordChangeCount=0;
 // Unchanged local inputs must leave *all* unrelated recorded checks unchanged,
 // including incomplete reasons and detailed diagnostics, not merely OK/NG totals.
 const content=({analysisRunId,...check})=>check;
 // Rebinding a proven reusable source creates a new record ID. Preserve that
 // lineage difference separately; all numerical, rule and diagnostic data stay
 // in the comparison. Source eligibility is enforced by the evaluation service.
 for(const [k,check] of after)if(!entities.has(check.entityId)){
  const previous=before.get(k);
  if(previous&&check.analysisRunId!==previous.analysisRunId)unaffectedSourceRecordChangeCount++;
  const validSourceId=value=>typeof value==='string'&&value.length>0;
  const sourceIdentityLost=previous&&check.analysisRunId!==previous.analysisRunId&&(!validSourceId(check.analysisRunId)||!validSourceId(previous.analysisRunId));
  if(!previous||sourceIdentityLost||stableHash(content(check))!==stableHash(content(previous)))unaffectedRegressionCount++;
 }
 const scopeChecks=checks.filter(c=>entities.has(c.entityId));
 const summary=summarizePracticalChecks(scopeChecks,combinationCoverage);
 const project=summarizePracticalChecks(checks,combinationCoverage);
 const complete=!!combinationCoverage&&supported&&!duplicateChecks&&!missingCheckCount&&!missingEntityIds.length&&!unaffectedRegressionCount&&summary.complete;
 return {version:'p25-candidate-scope-v4-source-record-lineage',basis:global?'all-evaluated-entities-after-reanalysis':'target-members-incident-details-and-declared-footprint-neighbors',entityIds:[...entities].sort(),summary,complete,projectComplete:project.complete,unaffectedRegressionCount,unaffectedSourceRecordChangeCount,missingCheckCount,missingEntityIds,duplicateChecks,supported,designTransferAllowed:false};
}
