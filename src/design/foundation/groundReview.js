import {stableHash} from '../../core/stableHash.js';

// External evidence is bound to one immutable footing, ground record and
// concurrent result. Registering it never turns a Winkler diagnostic into a
// geotechnical calculation performed by this application.
export function groundReviewScope(footing,ground,set,context) {
 const input=structuredClone(ground),foundation=structuredClone(footing);
 delete input.version;delete foundation.version;
 if(foundation.groundId)foundation.groundId=foundation.groundId.split('@')[0];
 for(const key of Object.keys(input))if(key.startsWith('review'))delete input[key];
 return stableHash({version:'p25-ground-review-scope-v2-load-contact',footing:foundation,ground:input,combo:set?.combo,reaction:set?.reactions?.[footing.nodeId],loadLedger:context?.loadLedger??null,contact:context?.contact??null});
}
export function evaluateGroundReview(footing,ground,set,context) {
 const scopeHash=groundReviewScope(footing,ground,set,context);
 const base={status:'NOT_CHECKED',ratio:null,scopeHash,scopeVersion:'p25-ground-review-scope-v2-load-contact',qualification:'external-geotechnical-review',groundId:ground.id,groundVersion:ground.version,footingId:footing.id,footingVersion:footing.version,calculatedByApplication:false,designTransferAllowed:false};
 if(context?.loadLedger?.ok!==true||context?.contact?.ok!==true)return {...base,reason:'GROUND_REVIEW_CALCULATION_CONTEXT_REQUIRED'};
 const required=['reviewer','reviewDocument','reviewEdition','reviewDate','reviewEvidenceSha256','reviewMethod','reviewConditions','reviewKdsReferences'];
 if(required.some(k=>typeof ground[k]!=='string'||!ground[k].trim()))return {...base,reason:'INDEPENDENT_GROUND_REVIEW_EVIDENCE_REQUIRED',requiredFields:required};
 if(!/^[a-f0-9]{64}$/i.test(ground.reviewEvidenceSha256)||!/^\d{4}-\d{2}-\d{2}$/.test(ground.reviewDate))return {...base,reason:'GROUND_REVIEW_EVIDENCE_FORMAT_INVALID'};
 const plural=ground.reviewScopeHashes!==undefined,scopes=plural?ground.reviewScopeHashes:ground.reviewScopeHash!==undefined?[ground.reviewScopeHash]:null;
 if(!scopes)return {...base,reason:'GROUND_REVIEW_SCOPE_REQUIRED',requiredFieldAlternatives:[['reviewScopeHash'],['reviewScopeHashes']]};
 if(plural&&ground.reviewScopeHash!==undefined||!Array.isArray(scopes)||!scopes.length||scopes.length>50||new Set(scopes).size!==scopes.length||scopes.some(hash=>typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)))return {...base,reason:'GROUND_REVIEW_SCOPE_FORMAT_INVALID'};
 if(!scopes.includes(scopeHash))return {...base,reason:'GROUND_REVIEW_SCOPE_CHANGED'};
 const evidence={...Object.fromEntries(required.map(k=>[k,ground[k]])),...(plural?{reviewScopeHashes:[...scopes]}:{reviewScopeHash:scopes[0]})};
 if(!['accepted','rejected'].includes(ground.reviewConclusion))return {...base,reason:'GROUND_REVIEW_CONCLUSION_REQUIRED'};
 return {...base,status:ground.reviewConclusion==='accepted'?'OK':'NG',reason:'EXTERNAL_REVIEW_RECORDED_NOT_INDEPENDENTLY_AUTHENTICATED',evidence,matchedScopeHash:scopeHash,evidenceAuthentication:'user-supplied',reviewConclusion:ground.reviewConclusion};
}
