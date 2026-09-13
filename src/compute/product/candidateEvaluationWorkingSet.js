import {retainedBytes} from '../../core/resourceBudget.js';
// Keep this reservation until comparison/publication finishes, not merely until
// the analysis Worker terminates. These records are still used by evaluation.
export function estimateCandidateEvaluationWorkingSet({model,sets,analysisProof=[],result=null}){
 const components={modelCopies:retainedBytes(model)*3,setCopies:retainedBytes(sets)*3,proofCopies:retainedBytes(analysisProof)*2,resultCopies:result?retainedBytes(result)*2:0,runtime:4*1024**2};
 const estimatedBytes=Object.values(components).reduce((sum,n)=>sum+n,0);
 if(!Number.isSafeInteger(estimatedBytes)||estimatedBytes<0)throw Error('RESOURCE_SIZE_INVALID');
 return {version:'p25-candidate-evaluation-working-set-v1',estimatedBytes,components,measuredHeap:false,basis:'conservative retained records plus Worker serialization/copies; not measured peak heap'};
}
