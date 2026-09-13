import {checkIncomplete} from '../../metadata/checkCompleteness.js';
const strength=new Set(['rc-stability','rc-section-strength','rc-shear-y','rc-shear-z','rc-torsion','joint-shear','joint-probable-forces','foundation-flexure','foundation-one-way-shear','foundation-punching','foundation-reinforcement','foundation-column-transfer']);
const service=new Set(['rc-deflection','rc-serviceability','foundation-bearing','foundation-ground-review','foundation-settlement','foundation-differential-settlement']);
export function checkApplicability(checkId,purpose) {
 const expected=strength.has(checkId)?'strength':service.has(checkId)?'service':null;
 if(!expected)return null;
 if(!['strength','service'].includes(purpose))return {status:'NOT_CHECKED',ratio:null,reason:'COMBINATION_PURPOSE_REQUIRED'};
 if(expected!==purpose)return {status:'N_A',ratio:null,reason:`CHECK_REQUIRES_${expected.toUpperCase()}_COMBINATION`,applicability:{expectedPurpose:expected,actualPurpose:purpose,basis:'declared-load-combination-purpose; required-combination-coverage-separate'}};
 return null;
}
export function aggregateCodeCompliance(checks) {
 const applicable=checks.filter(x=>x.status!=='N_A');
 const missing=applicable.filter(x=>checkIncomplete(x)||!['OK','NG'].includes(x.status)||x.codeBasis?.status!=='CLAUSE_APPLIED');
 const failed=applicable.filter(x=>x.status==='NG');
 return {status:missing.length||!applicable.length?'NOT_CHECKED':failed.length?'NG':'OK',ratio:null,
  reason:missing.length||!applicable.length?'REQUIRED_KDS_CHECKS_INCOMPLETE':failed.length?'REQUIRED_KDS_CHECK_FAILED':null,
  requiredCheckIds:checks.map(x=>x.id),missingCheckIds:missing.map(x=>x.checkId),failedCheckIds:failed.map(x=>x.checkId),
  qualification:'scoped-check-aggregation-not-project-qualification',
  codeReferences:missing.length?[]:applicable.flatMap(x=>x.codeBasis.applied),wholeDesignQualified:false};
}
