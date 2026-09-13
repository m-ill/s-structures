import {stableHash} from '../../core/stableHash.js';
// Bounded receipt/report summary. Hashes bind the complete proposal and original
// calculation rows; retained references are excerpts, never an approval claim.
export function proposalProvenance(generation,base){
 if(!generation?.ok)return null;
 let truncated=false;
 const clip=(value,max=128)=>{if(value==null)return null;const text=String(value);if(text.length>max)truncated=true;return text.slice(0,max);};
 const ids=[...new Set(generation.basisCheckIds||[])],wanted=new Set(ids),checks=base.checks.filter(c=>wanted.has(c.id));
 const references=new Map();for(const check of checks)for(const ref of check.codeReferences||[])references.set(stableHash(ref),ref);
 const codeReferences=[...references.values()].slice(0,6).map(r=>({code:clip(r.code??r.id),edition:clip(r.edition),clause:clip(r.clause,256),sourceHash:clip(r.sha256),url:clip(r.url,256)}));
 const output={version:'p25-proposal-provenance-v1',generatorVersion:clip(generation.version),proposalHash:stableHash(generation),basis:clip(generation.basis,256),sourceEvaluationId:clip(base.id),sourceInputHash:clip(base.inputHash),rulePackHash:clip(base.rulePackHash),basisChecksHash:stableHash(checks),basisCheckCount:ids.length,basisCheckIds:ids.slice(0,8).map(id=>clip(id)),missingBasisCheckCount:ids.filter(id=>!checks.some(c=>c.id===id)).length,codeReferenceCount:references.size,codeReferences,designTransferAllowed:false};
 return {...output,truncated:truncated||ids.length>8||references.size>6};
}
