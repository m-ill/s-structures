import {object} from '../../modeling/designInputCommands.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
// Acceptance of the specified effective-modulus endpoint approximation.
// This is not a stress-history creep solver or an automatic KDS limit derivation.
export function prepareRcPostAttachmentReview({sources,response,input}){
 object(input,['attachmentAgeDays','evaluationAgeDays','history','limits','limitReference']);
 if(input.history!=='constant-sustained-coeval')fail('RC_ATTACHMENT_HISTORY_REQUIRED');
 if(!Number.isFinite(input.attachmentAgeDays)||input.attachmentAgeDays<=0||!Number.isFinite(input.evaluationAgeDays)||input.evaluationAgeDays<input.attachmentAgeDays)fail('RC_ATTACHMENT_AGE_INVALID');
 if(sources.length!==2)fail('RC_ATTACHMENT_TWO_ENDPOINTS_REQUIRED');
 const end=sources.find(s=>s.factor===1),before=sources.find(s=>s.factor===-1);
 if(!end||!before||end.timeEffect!=='sustained-effective-modulus'||before.timeEffect!=='attachment-effective-modulus')fail('RC_ATTACHMENT_SOURCE_ROLES_REQUIRED');
 if(end.comboId!==before.comboId)fail('RC_ATTACHMENT_LOAD_MISMATCH');
 const ids=Object.keys(end.frameTimeStates||{});
 if(!ids.length||ids.length!==Object.keys(before.frameTimeStates||{}).length)fail('RC_ATTACHMENT_FRAME_STATES_REQUIRED');
 for(const id of ids){
  const a=before.frameTimeStates[id],b=end.frameTimeStates[id];
  if(!a||a.materialId!==b.materialId||a.materialVersion!==b.materialVersion||a.elasticModulusAtLoading!==b.elasticModulusAtLoading)fail('RC_ATTACHMENT_MATERIAL_MISMATCH');
  if(a.loadingAgeDays!==end.timeState.loadingAgeDays||a.loadingAgeDays!==b.loadingAgeDays||a.loadingAgeDays>input.attachmentAgeDays||a.evaluationAgeDays!==input.attachmentAgeDays||b.evaluationAgeDays!==input.evaluationAgeDays)fail('RC_ATTACHMENT_AGE_MISMATCH');
  if(a.creepCoefficient>b.creepCoefficient||a.shrinkageInitialStrain<b.shrinkageInitialStrain)fail('RC_ATTACHMENT_STATE_ORDER');
 }
 if(!response.globalExtremaEvaluated)fail('RC_ATTACHMENT_EXTREMA_REQUIRED');
 object(input.limits,['u','v','w']);
 if(!Object.keys(input.limits).length||Object.values(input.limits).some(v=>!Number.isFinite(v)||v<=0)||typeof input.limitReference!=='string'||!input.limitReference.trim()||input.limitReference.length>256)fail('RC_ATTACHMENT_LIMIT_REQUIRED');
 const checks=Object.entries(input.limits).map(([axis,capacity])=>{
  const r=response[axis];if(!r||![r.maxAbs,r.value,r.x].every(Number.isFinite)||r.maxAbs<0)fail('RC_ATTACHMENT_EXTREMA_INVALID');
  const ratio=r.maxAbs/capacity;return {axis,demand:r.maxAbs,signedValue:r.value,position:r.x,capacity,ratio,status:ratio<=1?'OK':'NG'};
 });
 const governing=checks.reduce((a,b)=>a.ratio>=b.ratio?a:b);
 return {kind:'rc-post-attachment-endpoint-review-v1',status:governing.status,ratio:governing.ratio,governingAxis:governing.axis,checks,attachmentAgeDays:input.attachmentAgeDays,evaluationAgeDays:input.evaluationAgeDays,history:input.history,boundary:response.boundary,length:response.length,units:'m',equation:'relative displacement field = final sustained field - attachment sustained field; extrema after subtraction',limitReference:input.limitReference,limitBasis:'user-specified-displacement-limits',sourceChronologyChecked:true,ageingStressHistoryIncluded:false,additionalLiveLoadIncluded:false,kdsCompliance:'NOT_ESTABLISHED',codeReferences:getKcscRuleSources(['142010','142030']).map(r=>({...r,clause:r.id==='142010'?'4.2.2(4)':'4.2.1',applicationScope:'time-dependent serviceability review target; endpoint approximation and supplied limits require separate method review',governsCalculation:false})),designTransferAllowed:false};
}
