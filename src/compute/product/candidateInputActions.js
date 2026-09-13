import {practicalInputSchema} from '../../modeling/practicalInputContract.js';
// Fixed-size action summaries. No default material, geometry or review values.
export function createCandidateInputActions(){
 const actions=new Map(),fieldSets=new Map();let omittedTargetOccurrences=0,unmappedCheckCount=0;
 function fields(type){if(!fieldSets.has(type)){try{fieldSets.set(type,new Set(Object.keys(practicalInputSchema(type).properties).filter(k=>k!=='type')));}catch{return null;}}return fieldSets.get(type);}
 function add(check){
  const seen=new Set();let identified=false;
  for(const [action,targets] of [['create',check.requiredInputRecords],['update',check.inputTargets]])for(const raw of targets||[]){
   if(!raw||typeof raw.type!=='string')continue;
   const allowed=fields(raw.type);if(!allowed)continue;
   const target={type:raw.type};
   for(const key of ['id','memberId','nodeId'])if(typeof raw[key]==='string'&&raw[key].length>0&&raw[key].length<=128)target[key]=raw[key];
   if(Object.keys(target).length===1)continue;
   if(Number.isSafeInteger(raw.version)&&raw.version>0)target.version=raw.version;
   const key=JSON.stringify([action,target]),firstOccurrence=!seen.has(key);seen.add(key);identified=true;
   if(!firstOccurrence&&!actions.has(key))continue;
   if(!actions.has(key)){
    if(actions.size>=80){omittedTargetOccurrences++;continue;}
    actions.set(key,{action,target,requiredInputFields:[],affectedCheckCount:0,evidence:[],evidenceTruncated:false});
   }
   const row=actions.get(key);if(firstOccurrence)row.affectedCheckCount++;
   for(const field of (Array.isArray(raw.requiredInputFields)?raw.requiredInputFields:check.requiredInputFields||[]))if(allowed.has(field)&&!row.requiredInputFields.includes(field))row.requiredInputFields.push(field);
   if(!firstOccurrence)continue;
   if(row.evidence.length<12)row.evidence.push({entityId:check.entityId,comboId:check.comboId,checkId:check.checkId,reason:check.reason??null});else row.evidenceTruncated=true;
  }
  if(!identified)unmappedCheckCount++;
 }
 return {add,finish:()=>({rows:[...actions.values()],unmappedCheckCount,omittedTargetOccurrences,truncated:omittedTargetOccurrences>0,automaticValuesSelected:false,scope:'explicit record targets across all recorded input blockers; omitted occurrences are not unique-target counts'})};
}
