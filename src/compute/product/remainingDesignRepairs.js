import {checkIncomplete} from '../../metadata/checkCompleteness.js';
// Prepared from stored evaluation evidence, never a new analysis or a repair promise.
export function prepareRemainingDesignRepairs({model,checks,evaluationId,inputHash}){
 const targets=new Map();let ngCheckCount=0,incompleteCheckCount=0,omittedCheckCount=0;
 for(const check of checks){
  if(checkIncomplete(check))incompleteCheckCount++;
  if(check.status!=='NG'||check.checkId?.endsWith('code-compliance'))continue;
  ngCheckCount++;
  let target=targets.get(check.entityId);
  if(!target){if(targets.size>=32){omittedCheckCount++;continue;}target={entityId:check.entityId,ngCheckCount:0,basisCheckIds:[],checkKinds:[]};targets.set(check.entityId,target);}
  target.ngCheckCount++;if(target.basisCheckIds.length<12)target.basisCheckIds.push(check.id);
  if(!target.checkKinds.includes(check.checkId)&&target.checkKinds.length<12)target.checkKinds.push(check.checkId);
 }
 const latest=(channel,predicate)=>{const map=new Map();for(const r of model.designDetails?.[channel]||[])if(!map.has(r.id)||r.version>map.get(r.id).version)map.set(r.id,r);return [...map.values()].filter(predicate);};
 for(const target of targets.values()){
  const entity=target.entityId;
  let type,key,records;
  if(entity?.startsWith('foundation:')){type='foundation-record';key='foundationId';records=latest('foundations',r=>r.nodeId===entity.slice(11));}
  else if(entity?.startsWith('joint:')){type='connection-record';key='connectionId';records=latest('connections',r=>r.nodeId===entity.slice(6));}
  else if(model.members?.some(m=>m.id===entity)){type='reinforcement-record';key='memberId';records=latest('reinforcement',r=>r.memberId===entity);}
  else records=[];
  target.records=records.slice(0,8).map(r=>({id:r.id,version:r.version,type}));target.recordCount=records.length;target.recordsTruncated=records.length>8;
  target.basisTruncated=target.ngCheckCount>target.basisCheckIds.length;
  target.proposalEligibility='requires-planning';
  if(!records.length){target.reason='CURRENT_DETAIL_TARGET_REQUIRED';continue;}
  if(key!=='memberId'&&records.length!==1){target.reason='AMBIGUOUS_DETAIL_TARGET';continue;}
  if(records.some(r=>r.locked)){target.reason='DETAIL_LOCKED';continue;}
  target.planQuery={tool:'plan_design_candidates',arguments:{evaluationId,[key]:key==='memberId'?entity:records[0].id}};
 }
 return {version:'p25-remaining-design-repairs-v1',evaluationId,inputHash,ngCheckCount,incompleteCheckCount,targets:[...targets.values()],omittedCheckCount,truncated:omittedCheckCount>0||[...targets.values()].some(t=>t.basisTruncated||t.recordsTruncated),automaticApplicationAllowed:false,designTransferAllowed:false,basis:'current recorded NG grouped by design target; planning validates supported repair scope; each application requires new analysis or explicit reuse and reevaluation; incomplete checks also require input/method review'};
}
