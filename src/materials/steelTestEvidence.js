import {STEEL_TEST_INPUT_MAP} from '../metadata/steelTestEvidencePolicy.js';
export {STEEL_TEST_INPUT_MAP};
export function validateSteelTestEvidence(record){
 const e=record.testEvidence;if(e==null)return [];
 const errors=[],bad=key=>errors.push('testEvidence.'+key);
 if(record.kind!=='steel')bad('steel-only');
 if(typeof e!=='object'||Array.isArray(e))return [...errors,'testEvidence.object'];
 for(const key of Object.keys(e))if(!Object.values(STEEL_TEST_INPUT_MAP).includes(key))bad(key);
 if(e.product!==undefined||e.grade!==undefined)for(const key of ['product','grade'])if(typeof e[key]!=='string'||!e[key].trim()||e[key].length>256)bad(key);
 for(const key of ['reference','batch','testEdition'])if(typeof e[key]!=='string'||!e[key].trim()||e[key].length>256)bad(key);
 if(typeof e.sha256!=='string'||!/^[a-f0-9]{64}$/.test(e.sha256))bad('sha256');
 const date=typeof e.testDate==='string'?new Date(e.testDate+'T00:00:00.000Z'):new Date(NaN);
 if(typeof e.testDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.testDate)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==e.testDate)bad('testDate');
 for(const key of ['sizeMm','yieldStrength','tensileStrength'])if(!Number.isFinite(e[key])||e[key]<.001||e[key]>10000)bad(key);
 if(!Number.isFinite(e.elongationPercent)||e.elongationPercent<0||e.elongationPercent>100)bad('elongationPercent');
 return errors;
}
export function assessSteelTestEvidence(record){
 const base={certificateAuthenticated:false,ksComplianceVerified:false,ductilityQualified:false,designTransferAllowed:false,requiresProductBatchAndSizeMatch:true,basis:'reported measurements compared only with declared design strengths; no standard acceptance or source authentication'};
 if(record.testEvidence==null)return {...base,status:'NOT_RECORDED',designValueConsistency:'NOT_CHECKED'};
 const errors=validateSteelTestEvidence(record);if(errors.length)return {...base,status:'INVALID',designValueConsistency:'NOT_CHECKED',inputErrors:errors};
 const e=record.testEvidence,declared=record.strength?.steel,issues=[];
 const identityIssues=[];
 for(const key of ['product','grade'])if(e[key]&&record.specification?.[key]&&e[key]!==record.specification[key])identityIssues.push('CERTIFICATE_'+key.toUpperCase()+'_DIFFERS_FROM_DESIGN_SPECIFICATION');
 const identity={identityConsistency:identityIssues.length?'MISMATCH':['product','grade'].every(k=>e[k]&&record.specification?.[k])?'CONSISTENT':'NOT_CHECKED',identityIssues,certificateIdentity:{product:e.product??null,grade:e.grade??null},declaredIdentity:{product:record.specification?.product??null,grade:record.specification?.grade??null},identityComparisonBasis:'exact-reported-identifiers; source authentication and grade equivalence not established'};
 if(![declared?.Fy,declared?.Fu].every(v=>Number.isFinite(v)&&v>0))return {...base,...identity,status:'RECORDED_UNAUTHENTICATED',designValueConsistency:'NOT_CHECKED',issues:['DECLARED_DESIGN_STRENGTH_REQUIRED']};
 if(e.yieldStrength<declared.Fy)issues.push('MEASURED_YIELD_BELOW_DESIGN_VALUE');
 if(e.tensileStrength<declared.Fu)issues.push('MEASURED_TENSILE_BELOW_DESIGN_VALUE');
 if(e.tensileStrength<e.yieldStrength)issues.push('MEASURED_TENSILE_BELOW_MEASURED_YIELD');
 const ratio=v=>Number.isFinite(v)?v:null;
 return {...base,...identity,status:'RECORDED_UNAUTHENTICATED',designValueConsistency:issues.length?'NG':'CONSISTENT',issues,declared:{Fy:declared.Fy,Fu:declared.Fu},measured:{Fy:e.yieldStrength,Fu:e.tensileStrength,elongation:e.elongationPercent},designToMeasuredRatios:{yield:ratio(declared.Fy/e.yieldStrength),tensile:ratio(declared.Fu/e.tensileStrength)},scope:{product:record.specification?.product??null,grade:record.specification?.grade??null,batch:e.batch,testedSizeMm:e.sizeMm},units:{strength:'MPa',size:'mm',elongation:'%'}};
}
