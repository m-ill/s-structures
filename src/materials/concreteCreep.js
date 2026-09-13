import {getKcscRuleSources} from '../metadata/kcscRuleSources.js';
export const CONCRETE_CREEP_VERSION='p25-concrete-creep-input-v3-attachment-state';
export function validateConcreteCreep(record){
 const c=record?.creep,errors=[];
 if(record?.kind!=='concrete'||!c||typeof c!=='object'||Array.isArray(c))return ['creep.concrete-record-required'];
 if(c.method!=='effective-modulus-constant-sustained-load')errors.push('creep.method');
 if(!Number.isFinite(c.coefficient)||c.coefficient<0||c.coefficient>100)errors.push('creep.coefficient');
 for(const k of ['loadingAgeDays','evaluationAgeDays','elasticModulusAtLoading'])if(!Number.isFinite(c[k])||c[k]<=0)errors.push(`creep.${k}`);
 if(c.evaluationAgeDays<c.loadingAgeDays||c.evaluationAgeDays===c.loadingAgeDays&&c.coefficient!==0)errors.push('creep.age-order');
 if(typeof c.reference!=='string'||!c.reference.trim()||c.reference.length>256)errors.push('creep.reference');
 if(c.shrinkageMicrostrain!==undefined||c.shrinkageReference!==undefined){
  if(!Number.isFinite(c.shrinkageMicrostrain)||c.shrinkageMicrostrain<0||c.shrinkageMicrostrain>20000)errors.push('creep.shrinkageMicrostrain');
  if(typeof c.shrinkageReference!=='string'||!c.shrinkageReference.trim()||c.shrinkageReference.length>256)errors.push('creep.shrinkageReference');
  if(c.loadingAgeDays===c.evaluationAgeDays&&c.shrinkageMicrostrain!==0)errors.push('creep.shrinkage-age-interval');
 }
 if(c.attachment!==undefined){
  const a=c.attachment;
  if(!a||typeof a!=='object'||Array.isArray(a))errors.push('creep.attachment');
  else{
   if(Object.keys(a).some(k=>!['coefficient','evaluationAgeDays','reference','shrinkageMicrostrain','shrinkageReference'].includes(k))||typeof a.reference!=='string'||!a.reference.trim())errors.push('creep.attachment.fields');
   if(a.shrinkageMicrostrain!==undefined&&(typeof a.shrinkageReference!=='string'||!a.shrinkageReference.trim()))errors.push('creep.attachment.shrinkage-reference-required');
   const {attachment,...base}=c;
   const selected={...base,...a};delete selected.attachment;
   // Optional final shrinkage cannot silently be inherited at attachment.
   if(c.shrinkageMicrostrain!==undefined&&a.shrinkageMicrostrain===undefined)errors.push('creep.attachment.shrinkage-required');
   errors.push(...validateConcreteCreep({kind:'concrete',creep:selected}).map(e=>`attachment.${e}`));
   if(a.evaluationAgeDays>c.evaluationAgeDays||a.coefficient>c.coefficient)errors.push('creep.attachment.order');
   if(a.shrinkageMicrostrain!==undefined&&(c.shrinkageMicrostrain===undefined||a.shrinkageMicrostrain>c.shrinkageMicrostrain))errors.push('creep.attachment.shrinkage-order');
  }
 }
 return errors;
}
export function concreteEffectiveModulus(record,{state='final'}={}){
 const errors=validateConcreteCreep(record);if(errors.length)throw Object.assign(Error('CONCRETE_CREEP_INPUT_INVALID'),{code:'CONCRETE_CREEP_INPUT_INVALID',details:errors});
 if(!['final','attachment'].includes(state))throw Error('CONCRETE_CREEP_STATE_INVALID');
 if(state==='attachment'&&!record.creep.attachment)throw Error('CONCRETE_ATTACHMENT_STATE_REQUIRED');
 const c=state==='attachment'?{...record.creep,...record.creep.attachment}:record.creep,effectiveE=c.elasticModulusAtLoading/(1+c.coefficient);
 return {version:CONCRETE_CREEP_VERSION,method:c.method,effectiveE,elasticModulusAtLoading:c.elasticModulusAtLoading,creepCoefficient:c.coefficient,loadingAgeDays:c.loadingAgeDays,evaluationAgeDays:c.evaluationAgeDays,reference:c.reference,
  equation:'Eeffective=E(at loading)/(1+creep coefficient)',modulusUnit:'MPa',
  codeReferences:getKcscRuleSources(['142010']).map(r=>({...r,clause:'4.2.2(4)',applicationScope:'time-dependent-effects consideration; effective-modulus formula not qualified by this clause',governsCalculation:false})),
  technicalReference:'https://dot.nebraska.gov/media/sgcjyoeq/final-report-p530.pdf',
  technicalReferenceVerification:'search-index-excerpt; full-document-review-pending',
  basis:'specified coefficient; constant-sustained-load effective-modulus approximation',
  coefficientAutomaticallyPredicted:false,shrinkageIncluded:c.shrinkageMicrostrain!==undefined,shrinkageInitialStrain:-(c.shrinkageMicrostrain??0)/1e6,shrinkageReference:c.shrinkageReference??null,ageingStressHistoryIncluded:false,designTransferAllowed:false};
}
