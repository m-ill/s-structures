import {validateConcreteCreep} from '../../materials/concreteCreep.js';
function fail(code){throw Object.assign(Error(code),{code});}
// Source ages describe an effective-modulus interval, not an attachment history.
export function rcStageTimeState(timeEffect='instantaneous',effect){
 const common={timeEffect,attachmentAgeDays:null,chronologyQualified:false};
 if(timeEffect==='instantaneous'){
  if(effect!=null)fail('RC_SERVICE_TIME_STATE_CONFLICT');
  return {...common,loadingAgeDays:null,evaluationAgeDays:null,ageBasis:'not-specified-by-instantaneous-solve'};
 }
 if(!['sustained-effective-modulus','attachment-effective-modulus'].includes(timeEffect))fail('RC_SERVICE_TIME_STATE_INVALID');
 if(!effect)fail('RC_SERVICE_TIME_STATE_REQUIRED');
 const c={method:effect.method,coefficient:effect.creepCoefficient,loadingAgeDays:effect.loadingAgeDays,evaluationAgeDays:effect.evaluationAgeDays,elasticModulusAtLoading:effect.elasticModulusAtLoading,reference:effect.reference};
 if(effect.shrinkageIncluded===true)Object.assign(c,{shrinkageMicrostrain:-effect.shrinkageInitialStrain*1e6,shrinkageReference:effect.shrinkageReference});
 const expected=c.elasticModulusAtLoading/(1+c.coefficient);
 if(validateConcreteCreep({kind:'concrete',creep:c}).length||!Number.isFinite(effect.effectiveE)||Math.abs(effect.effectiveE-expected)>1e-10*Math.max(1,Math.abs(expected))||typeof effect.shrinkageIncluded!=='boolean'||!Number.isFinite(effect.shrinkageInitialStrain)||!effect.shrinkageIncluded&&effect.shrinkageInitialStrain!==0)fail('RC_SERVICE_TIME_STATE_INVALID');
 return {...common,attachmentAgeDays:timeEffect==='attachment-effective-modulus'?c.evaluationAgeDays:null,ageBasis:'specified-constant-sustained-load-interval',loadingAgeDays:c.loadingAgeDays,evaluationAgeDays:c.evaluationAgeDays,materialId:effect.materialId,materialVersion:effect.materialVersion,creepCoefficient:c.coefficient,elasticModulusAtLoading:c.elasticModulusAtLoading,effectiveE:effect.effectiveE,modulusUnit:'MPa',reference:c.reference,shrinkageIncluded:effect.shrinkageIncluded,shrinkageInitialStrain:effect.shrinkageInitialStrain,shrinkageReference:effect.shrinkageIncluded?effect.shrinkageReference:null};
}
