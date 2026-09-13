import {retainedBytes} from '../../core/resourceBudget.js';
// Accounting estimate for synchronous generation, indexing, command conversion
// and returned diagnostics. The retained plan has its separate BudgetMap owner.
export function estimateCandidateProposalWorkingSet({model,checks,input}){
 const components={modelCopies:retainedBytes(model)*3,checkDerivedRecords:retainedBytes(checks)*2,inputCopies:retainedBytes(input)*4,runtime:1024**2};
 const estimatedBytes=Object.values(components).reduce((sum,n)=>sum+n,0);
 if(!Number.isSafeInteger(estimatedBytes)||estimatedBytes<0)throw Error('RESOURCE_SIZE_INVALID');
 return {version:'p25-candidate-proposal-working-set-v1',estimatedBytes,components,measuredHeap:false,basis:'conservative proposal working records and response copies; not measured heap or RSS'};
}
