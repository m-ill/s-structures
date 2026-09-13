import {practicalCommandFromRecord,practicalInputFields} from '../../modeling/practicalInputContract.js';
import {jsonTextWindow} from '../../core/jsonTextWindow.js';
import {stableHash} from '../../core/stableHash.js';
export function candidateQuerySummary(candidate,{jobId,includeProof=false}){
 if(!candidate)return null;
 const {command,commands,codeBasis,analysisProof,summary,changes,completionBlockers,...rest}=candidate;
 const {regionEdits,endDevelopment,spliceDevelopment,spliceRefinement,...compactChanges}=changes||{};
 if(spliceRefinement)compactChanges.spliceRefinement=spliceRefinement.map(r=>({pass:r.pass,ok:r.ok,reason:r.reason??null,changeCount:r.changes?.length??0,unavailableCount:r.unavailable?.length??0,basisCheckCount:r.basisCheckIds?.length??0,detailAvailable:true}));
 if(spliceDevelopment)compactChanges.spliceDevelopment=spliceDevelopment.map(({codeReferences,...row})=>({...row,codeReferenceCount:codeReferences?.length??0,detailAvailable:true}));
 if(endDevelopment)compactChanges.endDevelopment=endDevelopment.map(({codeReferences,...row})=>({...row,codeReferenceCount:codeReferences?.length??0,detailAvailable:true}));
 return structuredClone({...rest,reinforcementChangeCount:(commands||[]).filter(c=>c.type==='reinforcement-record').length,spliceChangeCount:(commands||[]).filter(c=>c.type==='splice-record').length,...(completionBlockers?{completionBlockers:{counts:completionBlockers.counts,total:completionBlockers.total,truncated:completionBlockers.truncated,automaticInputSelectionAllowed:false,detailAvailable:true}}:{}),...(changes?{changes:compactChanges}:{}),...(summary?{summary:{complete:summary.complete,checkCount:summary.checkCount,incompleteCheckCount:summary.incompleteCheckCount,closureDiagnosticCounts:summary.closureDiagnosticCounts,counts:summary.counts}}:{}),detailQuery:{tool:'get_design_candidate_detail',jobId,candidateId:candidate.candidateId},...(codeBasis?{codeBasisCount:codeBasis.length,codeBasisQuery:{tool:'get_design_candidate_basis',jobId,candidateId:candidate.candidateId}}:{}),...(includeProof?{analysisProof:analysisProof||[]}:{analysisProofCount:analysisProof?.length||0})});
}
export function candidateDetailChunk(candidate,{offset=0,limit=4096,baselineSplices=[],baselineReinforcement=[],baselineFoundations=[],baselineConnections=[]}={}){
 if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>4096)throw Object.assign(new Error('PAGINATION_INVALID'),{code:'PAGINATION_INVALID'});
 const detail=candidateDetailData(candidate,baselineSplices,baselineReinforcement,baselineFoundations,baselineConnections);
 const window=jsonTextWindow(detail,{offset,limit});
 return {detailHash:stableHash(detail),encoding:'json-text',offset,total:window.totalChars,chunk:window.chunk,nextOffset:window.nextOffset};
}

export function candidateDetailData(candidate,baselineSplices=[],baselineReinforcement=[],baselineFoundations=[],baselineConnections=[]){
 const {command,commands,codeBasis,...detail}=candidate;
 const spliceCommands=(commands||[]).filter(c=>c.type==='splice-record');
 if(spliceCommands.length){
  const latest=new Map();for(const s of baselineSplices)if(!latest.has(s.id)||latest.get(s.id).version<s.version)latest.set(s.id,s);
  const fields=practicalInputFields('splice-record'),keys=fields.map(f=>f.key),inputUnits=Object.fromEntries(fields.filter(f=>f.unit).map(f=>[f.key,f.unit]));
  const record=s=>s?Object.fromEntries(keys.filter(k=>s[k]!==undefined).map(k=>[k,structuredClone(s[k])])):null;
  detail.spliceChanges=spliceCommands.map(c=>({before:record(latest.get(c.id)),after:record(c),geometryQualified:false,designTransferAllowed:false,basis:'recorded candidate input changes; splice geometry and strength require the associated design checks',units:{...inputUnits,offset:'m',startEnd:'member-length fraction'}}));
 }
 const reinforcementCommands=(commands||[]).filter(c=>c.type==='reinforcement-record');
 if(reinforcementCommands.length){
  const latest=new Map();for(const r of baselineReinforcement)if(!latest.has(r.id)||latest.get(r.id).version<r.version)latest.set(r.id,r);
  detail.reinforcementChanges=reinforcementCommands.map(after=>{
   const record=latest.get(after.id),before=record?practicalCommandFromRecord('reinforcement-record',record):null;
   const keys=[...new Set([...Object.keys(before||{}),...Object.keys(after)])].filter(k=>k!=='type').sort();
   const changedFields=keys.filter(k=>stableHash(before?.[k]??null)!==stableHash(after[k]??null));
   return {before,after:structuredClone(after),changedFields,geometryQualified:false,designTransferAllowed:false,barNumberIdentity:'array positions only; regenerated layouts may renumber bars',units:{startExtension:'m',endExtension:'m',anchorageStartCriticalX:'m',anchorageEndCriticalX:'m',coordinates:'m',barDiameter:'mm',stirrupDiameter:'mm',stirrupSpacing:'mm',nominalArea:'mm2',startEnd:'member-length fraction'},basis:'recorded baseline and candidate public input; verify associated candidate checks before application'};
  });
 }
 for(const [type,baseline,key] of [['foundation-record',baselineFoundations,'foundationChanges'],['connection-record',baselineConnections,'connectionChanges']]){
  const selected=(commands||[]).filter(c=>c.type===type);if(!selected.length)continue;
  const latest=new Map();for(const r of baseline)if(!latest.has(r.id)||latest.get(r.id).version<r.version)latest.set(r.id,r);
  const units=Object.fromEntries(practicalInputFields(type).filter(f=>f.unit).map(f=>[f.key,f.unit]));
  detail[key]=selected.map(after=>{
   const original=latest.get(after.id),before=original?practicalCommandFromRecord(type,original):null;
   const keys=[...new Set([...Object.keys(before||{}),...Object.keys(after)])].filter(k=>k!=='type').sort();
   return {before,after:structuredClone(after),units,changedFields:keys.filter(k=>stableHash(before?.[k]??null)!==stableHash(after[k]??null)),designTransferAllowed:false,basis:'recorded baseline and candidate public input; associated reanalysis and design checks govern acceptance'};
  });
 }

 return detail;
}
