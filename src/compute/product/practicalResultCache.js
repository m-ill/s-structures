import {createSharedComputation} from '../../core/sharedComputation.js';
import {BudgetMap,retainedBytes} from '../../core/resourceBudget.js';
import {stableHash} from '../../core/stableHash.js';
import {freezeCheckpointValue} from './workflowResults.js';
import {PRACTICAL_EVALUATION_VERSION} from '../../design/evaluation/practicalEvaluation.js';
import {PREPARED_DETAIL_VERSION} from '../../design/rc/preparedDetailGeometry.js';
import {PRACTICAL_RULE_PACK_HASH} from '../../metadata/practicalRuleImplementations.js';
export function practicalResultCacheKey(inputHash,sets,mechanicsLaw){
 if(typeof inputHash!=='string'||!inputHash||!Array.isArray(sets)||!sets.length||sets.some(e=>(!e.source?.analysisRunId&&!e.source?.rcIterationId&&!e.source?.rcSpliceId)||!e.source?.comboId||!(e.resultHash??e.row?.resultHash)))throw Error('SHARED_RESULT_SOURCE_REQUIRED');
 return stableHash({inputHash,sources:sets.map(e=>({source:e.source,resultHash:e.resultHash??e.row?.resultHash,method:e.method??e.analysisCase?.settings?.pDeltaMethod??'off'})),mechanicsLaw:mechanicsLaw||null,evaluator:PRACTICAL_EVALUATION_VERSION,rules:PRACTICAL_RULE_PACK_HASH,geometry:PREPARED_DETAIL_VERSION});
}
export function createPracticalResultCache(budget){
 const computation=createSharedComputation();
 const maxBytes=32*1024*1024,cache=new BudgetMap(budget,'shared-practical-results',{maxEntries:4,maxBytes});let hits=0,misses=0;
 return {
  compute(key,produce,signal){return computation.run(key,async sharedSignal=>freezeCheckpointValue(await produce(sharedSignal)),signal);},
  get(key){const row=cache.get(key);if(row){hits++;return row;}misses++;return null;},
  put(key,result){
   if(result?.preparedDetails?.version!==PREPARED_DETAIL_VERSION||result.evaluatorVersion!==PRACTICAL_EVALUATION_VERSION)return false;
   const size=retainedBytes([key,result]);if(size>maxBytes)return false;
   while(cache.size&&(!cache.has(key)&&cache.size>=4||cache.bytes+size>maxBytes))cache.delete(cache.keys().next().value);
   try{cache.setCopy(key,result);freezeCheckpointValue(cache.get(key));return true;}
   catch(error){if(['MANAGED_MEMORY_BUDGET_EXCEEDED','RESOURCE_STORE_BUDGET_EXCEEDED'].includes(error.code))return false;throw error;}
  },
  snapshot:()=>({entries:cache.size,bytes:cache.bytes,hits,misses,maxEntries:4,maxBytes,persistence:'session',computation:computation.snapshot()}),
  evict(key){return cache.delete(key);},
  clear(){computation.clear();cache.clear();},
 };
}
