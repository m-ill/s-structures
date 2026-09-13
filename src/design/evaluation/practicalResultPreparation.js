import {evaluatePracticalDesign,summarizePracticalChecks} from './practicalEvaluation.js';
import {prepareDetailGeometry} from '../rc/preparedDetailGeometry.js';
// Single preparation owner for a bound set of concurrent combinations.
// Consumers add presentation metadata, never recompute RC summary counts.
export function preparePracticalResult(model,sets,{mechanicsLaw,includeGeometry=true}={}){
 if(!Array.isArray(sets)||!sets.length||sets.length>100)throw new Error('PRACTICAL_SOURCE_SET_REQUIRED');
 const byCombo=Object.create(null),methods=Object.create(null),sources=new Map();
 for(const entry of sets){
  const id=entry.source?.comboId,method=entry.method??entry.analysisCase?.settings?.pDeltaMethod;
  if(typeof id!=='string'||!id||sources.has(id)||entry.set?.combo?.id!==id||entry.set?.ok!==true)throw new Error('PRACTICAL_SOURCE_SET_MISMATCH');
  if(method!==undefined&&!['off','direct'].includes(method))throw new Error('PRACTICAL_ANALYSIS_METHOD_UNSUPPORTED');
  sources.set(id,entry.source);byCombo[id]=entry.set;methods[id]=method;
 }
// includeGeometry controls retained output only; omitted output must not skip
 // the geometry-dependent checks performed by evaluatePracticalDesign.
 const preparedDetails=includeGeometry?prepareDetailGeometry(model):null;
 const {checks,demands,version,designTransferAllowed,...summary}=evaluatePracticalDesign(model,{byCombo},{analysisMethods:methods,mechanicsLaw,preparedDetails});
 const boundChecks=checks.map(c=>{
  const source=sources.get(c.comboId);
  const spliceSource=source?.rcSpliceId?source:!source?sets.find(s=>s.source?.rcSpliceId)?.source:null;
  return {...c,...(spliceSource?{rcSpliceId:spliceSource.rcSpliceId,incomplete:true,sourceQualification:{globalMethodQualified:false,reason:'RC_SPLICE_GLOBAL_METHOD_UNQUALIFIED'}}:{}),...(source?.analysisRunId?{analysisRunId:source.analysisRunId}:{}),...(source?.rcIterationId?{rcIterationId:source.rcIterationId,incomplete:true,sourceQualification:{globalMethodQualified:false,reason:'RC_ITERATION_GLOBAL_METHOD_UNQUALIFIED'}}:{})};
 });
 const boundSummary={...summary,...summarizePracticalChecks(boundChecks,summary.combinationCoverage)};
 return {checks:boundChecks,demands,summary:boundSummary,...(includeGeometry?{preparedDetails}:{}),evaluatorVersion:version,designTransferAllowed};
}
