import {stableHash} from '../../core/stableHash.js';
import {LOAD_FAMILIES,inferLoadCaseFamily,normalizeLoadCaseMetadata} from '../../loads/loadCaseMetadata.js';
import {PRACTICAL_RULE_PACK_HASH} from '../../metadata/practicalRuleImplementations.js';

export function profileLoadScopeHash(model) {
 return stableHash({loadCases:model.loadCases||[],loads:model.loads||[],loadCombinations:model.loadCombinations||[],designBasis:model.designBasis||null});
}
export function evaluateProjectProfile(model) {
 const latest=new Map();for(const row of model.designDetails?.profiles||[])if(!latest.has(row.id)||row.version>latest.get(row.id).version)latest.set(row.id,row);
 const issues=[],add=(code,details={})=>issues.push({code,...details});
 const base={qualification:'user-declared-scope-only',codeQualified:false,loadScopeHash:profileLoadScopeHash(model)};
 if(latest.size!==1)return {...base,status:'NOT_CHECKED',issues:[{code:latest.size?'AMBIGUOUS_PROJECT_PROFILE':'PROJECT_PROFILE_REQUIRED'}]};
 const profile=[...latest.values()][0],required=profile.requiredFamilies||[],excluded=profile.excludedFamilies||[],confirmed=profile.confirmedCaseIds||[];
 if(profile.rulePackHash!==PRACTICAL_RULE_PACK_HASH)add('PROFILE_RULE_PACK_STALE');
 if(profile.loadScopeHash!==base.loadScopeHash)add('PROFILE_LOAD_REVIEW_STALE');
 const partition=[...required,...excluded];
 if(partition.length!==LOAD_FAMILIES.length||new Set(partition).size!==partition.length||LOAD_FAMILIES.some(x=>!partition.includes(x)))add('LOAD_FAMILY_PARTITION_REQUIRED');
 const cases=(model.loadCases||[]).filter(x=>x.enabled!==false),combos=(model.loadCombinations||[]).filter(x=>x.enabled!==false);
 for(const family of excluded)if(cases.some(x=>inferLoadCaseFamily(x)===family))add('EXCLUDED_FAMILY_HAS_CASES',{family});
 for(const id of confirmed)if(!cases.some(x=>x.id===id))add('CONFIRMED_CASE_MISSING',{id});
 for(const family of required){
  const rows=cases.filter(x=>inferLoadCaseFamily(x)===family);
  if(!rows.length)add('REQUIRED_FAMILY_HAS_NO_CASE',{family});
  for(const row of rows){
   if(!confirmed.includes(row.id))add('LOAD_CASE_REVIEW_REQUIRED',{id:row.id,family});
   if(!combos.some(c=>['strength','service'].includes(c.type)&&Number.isFinite(c.factors?.[row.id])&&c.factors[row.id]!==0))add('LOAD_CASE_UNUSED',{id:row.id,family});
  }
  if(['W','E'].includes(family)){
   const directions=new Set(rows.map(row=>{const m=normalizeLoadCaseMetadata(row);return `${m.direction}:${m.sign}`;}));
   const missing=['x:1','x:-1','y:1','y:-1'].filter(x=>!directions.has(x));
   if(missing.length)add('LATERAL_DIRECTIONS_INCOMPLETE',{family,missing});
  }
 }
 const joints=new Map();for(const row of model.designDetails?.connections||[])if(!joints.has(row.id)||row.version>joints.get(row.id).version)joints.set(row.id,row);
 for(const row of joints.values())if(row.jointDesignStandard?.includes('special-frame')&&profile.structuralSystem!=='special-rc-frame')add('PROFILE_DETAIL_SYSTEM_MISMATCH',{id:row.id});
 return {...base,status:issues.length?'NOT_CHECKED':'OK',profileId:profile.id,profileVersion:profile.version,structuralSystem:profile.structuralSystem,stiffnessBasis:profile.stiffnessBasis,decisionReference:profile.decisionReference,issues};
}
