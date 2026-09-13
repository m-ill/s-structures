const reject=code=>{throw Object.assign(new Error(code),{code});};
// Inspect metadata only: publication must not clone the numerical source again.
export function requireCurrentDesignSources(bridge,sources){
 if(!Array.isArray(sources)||!sources.length)reject('DESIGN_SOURCE_IDENTITY_REQUIRED');
 const currentIdentities=Object.create(null);
 for(const entry of sources){
  const source=entry.source,expected=entry.resultHash??entry.row?.resultHash;
  if(source?.rcSpliceId){
   let current;try{current=bridge.getRcSpliceSourceMetadata(source.rcSpliceId);}catch{reject('DESIGN_SOURCE_CHANGED');}
   if(!current.ok||!current.converged||!current.elasticRangeSatisfied||current.resultHash!==expected)reject('DESIGN_SOURCE_CHANGED');
   if(current.stale)reject('STALE_INPUT');currentIdentities[source.rcSpliceId]={inputHash:current.inputHash};continue;
  }
  if(source?.rcIterationId){
   let current;try{current=bridge.getRcServiceIterationMetadata(source.rcIterationId);}catch{reject('DESIGN_SOURCE_CHANGED');}
   if(!current.ok||!current.converged||current.resultHash!==expected)reject('DESIGN_SOURCE_CHANGED');
   if(current.stale)reject('STALE_INPUT');
   currentIdentities[source.rcIterationId]={inputHash:current.inputHash};continue;
  }
  if(!source?.analysisRunId||!expected)reject('DESIGN_SOURCE_IDENTITY_REQUIRED');
  const current=bridge.getWorkflowAnalysisMetadata(source.analysisRunId);
  if(!current.ok||current.resultHash!==expected)reject('DESIGN_SOURCE_CHANGED');
  if(current.stale)reject('STALE_INPUT');
  if(current.kind!=='static'||current.executionStatus!=='completed')reject('COMPLETED_STATIC_RESULT_REQUIRED');
  currentIdentities[source.analysisRunId]=current.identity;
 }
 return {currentIdentities};
}
