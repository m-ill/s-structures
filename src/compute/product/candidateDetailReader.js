import {BudgetMap} from '../../core/resourceBudget.js';
import {jsonTokens} from '../../core/jsonTokens.js';
import {stableHash} from '../../core/stableHash.js';
import {candidateDetailChunk,candidateDetailData} from './candidateQuery.js';
// Keys belong to immutable finalized job/evaluation records. Cache only text,
// never model or candidate references that could pin evicted numerical data.
export function createCandidateDetailReader({budget}){
 const cache=new BudgetMap(budget,'candidate-detail-text',{maxEntries:4,maxBytes:2200000});
 let hits=0,serializedRecords=0,streamedReads=0;
 function retain(key,value){if(cache.size>=4&&!cache.has(key))cache.delete(cache.keys().next().value);cache.set(key,value);}
 return {
  read(key,candidate,{offset=0,limit=4096,baselineSplices=[],baselineReinforcement=[],baselineFoundations=[],baselineConnections=[]}={}){
   if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>4096)throw Object.assign(Error('PAGINATION_INVALID'),{code:'PAGINATION_INVALID'});
   let entry=cache.get(key);
   if(entry)hits++;
   else {
    const owner=budget.nextOwner('candidate-detail-serialization');
    try{
     budget.reserve(owner,16*1024*1024);
     const detail=candidateDetailData(candidate,baselineSplices,baselineReinforcement,baselineFoundations,baselineConnections),parts=[];let length=0,oversized=false;
     for(const token of jsonTokens(detail)){length+=token.length;if(length>262144){oversized=true;break;}parts.push(token);}
     if(oversized)entry={streamed:true};
     else{entry={text:parts.join(''),detailHash:stableHash(detail)};serializedRecords++;}
     retain(key,entry);
    }catch(error){if(!['RESOURCE_ENTRY_LIMIT','RESOURCE_STORE_BUDGET_EXCEEDED','MANAGED_MEMORY_BUDGET_EXCEEDED'].includes(error.code))throw error;entry=null;}
    finally{budget.release(owner);}
   }
   if(!entry||entry.streamed){streamedReads++;return candidateDetailChunk(candidate,{offset,limit,baselineSplices,baselineReinforcement,baselineFoundations,baselineConnections});}
   if(offset>entry.text.length)throw Object.assign(Error('PAGINATION_INVALID'),{code:'PAGINATION_INVALID'});
   return {detailHash:entry.detailHash,encoding:'json-text',offset,total:entry.text.length,chunk:entry.text.slice(offset,offset+limit),nextOffset:offset+limit<entry.text.length?offset+limit:null};
  },
  stats:()=>({entries:cache.size,hits,serializedRecords,streamedReads,maxRecordChars:262144,maxEntries:4}),
  releaseJob(jobId){let count=0;for(const key of cache.keys())if(key.startsWith(`${jobId}:`)){cache.delete(key);count++;}return count;},
  clear(){cache.clear();}
 };
}
