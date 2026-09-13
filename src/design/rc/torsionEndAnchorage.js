import {evaluateProvidedAnchorage} from './providedAnchorage.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
export function torsionEndAnchorage(model,member,detail){
 const codeReferences=getKcscRuleSources(['142022']).map(r=>({...r,clause:'4.5.3(3)'}));
 const nc=reason=>({status:'NOT_CHECKED',ratio:null,reason,codeReferences,designTransferAllowed:false});
 if(!['straight-tension','hook-tension'].includes(detail.anchorageMode)||![detail.anchorageStartCriticalX,detail.anchorageEndCriticalX].every(Number.isFinite))return nc('TORSION_BOTH_END_TENSION_ANCHORAGE_REQUIRED');
 const result=evaluateProvidedAnchorage(model,member,[detail]);
 if(result.status==='OK'&&(!result.calculations||result.calculations.length!==2*detail.bars.length))return nc('TORSION_ALL_BAR_ENDS_REQUIRED');
 return {...result,codeReferences:[...new Map([...codeReferences,...(result.calculations||[]).map(r=>r.source).filter(Boolean)].map(r=>[JSON.stringify(r),r])).values()],designTransferAllowed:false,scope:'full-yield longitudinal tension at both supplied critical sections; required extension region checked separately'};
}
