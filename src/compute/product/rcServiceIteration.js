import {runFlexuralIteration} from './flexuralIteration.js';
import {evaluateProvidedDeflection} from '../../design/rc/kdsServiceability.js';
import {resolveMaterialRecord} from '../../materials/registry.js';
import {sectionOf} from '../../core/catalogs.js';
import {runRcCoupledIteration} from './rcCoupledIteration.js';
import {runKdsSecondOrderIteration} from './kdsSecondOrderIteration.js';

import {RC_SERVICE_ITERATION_VERSION} from '../../metadata/rcServicePolicy.js';
export {RC_SERVICE_ITERATION_VERSION} from '../../metadata/rcServicePolicy.js';
// Existing uniaxial service section law used as an explicitly unqualified
// global fixed-point policy. KDS clause references apply to Ie, not convergence.
export function calculateRcServiceProfiles(source,analysis,{liveComboId}={}){
 const live=analysis.byCombo?.[liveComboId];
 if(!live?.ok)throw Error('RC_SERVICE_LIVE_SOURCE_REQUIRED');
 const current=new Map();
 for(const row of source.designDetails?.reinforcement||[])if(!current.has(row.id)||current.get(row.id).version<row.version)current.set(row.id,row);
 const profiles=[],references=new Map(),serviceabilityByMember={};
 for(const member of source.members||[]){
  if(resolveMaterialRecord(source,member.matId)?.kind!=='concrete')continue;
  if((source.designDetails?.splices||[]).some(s=>s.memberId===member.id))throw Error('RC_SERVICE_SPLICE_STIFFNESS_REQUIRED');
  const details=[...current.values()].filter(d=>d.memberId===member.id);
  if(!details.length)throw Error('MISSING_REINFORCEMENT');
  // Sustained multipliers belong to deflection, not an instantaneous EI law.
  if(details.some(d=>!['instant-live-curvature','long-term-curvature'].includes(d.serviceabilityMode)))throw Error('RC_ITERATION_SERVICE_POLICY_REQUIRED');
  for(const set of Object.values(analysis.byCombo||{})){
   const force=set?.memberResults?.[member.id];
   if(!set?.ok||!force||!['N','My'].every(k=>force[k]?.length&&force[k].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e-8)))throw Error('UNIAXIAL_FLEXURE_WITHOUT_AXIAL_FORCE_REQUIRED');
  }
  const result=evaluateProvidedDeflection(source,member,details,live,analysis.byCombo);
  if(!['OK','NG'].includes(result.status)||!result.regions?.length)throw Error(result.reason||'RC_SERVICE_STIFFNESS_UNAVAILABLE');
  serviceabilityByMember[member.id]={...result,serviceabilityMode:details[0].serviceabilityMode,globalCreepRedistributionIncluded:false,preparedFrom:'converged-instantaneous-effective-stiffness-results'};
  const gross=sectionOf(source,member.secId);
  profiles.push({memberId:member.id,segments:result.regions.map(r=>({start:r.start,end:r.end,Iy:gross.Iy,Iz:r.Ie}))});
  for(const reference of result.codeReferences||[])references.set(`${reference.code}/${reference.edition}/${reference.clause}`,{...reference,applicationScope:'section-effective-inertia-only; global-iteration-unqualified'});
 }
 if(!profiles.length)throw Error('RC_SERVICE_MEMBERS_REQUIRED');
 return {profiles,method:'instant-service-uniaxial-effective-inertia-fixed-point',codeReferences:[...references.values()],preparedResults:{serviceabilityByMember}};
}
export async function runRcServiceIteration(source,{liveComboId,maxIterations,tolerance,signal,stiffnessMode='effective-inertia',comboIds,spatialTolerance,maxRefinements,timeEffect}={}){
 if(stiffnessMode==='kds-elastic-second-order'){
  if(timeEffect!==undefined||liveComboId!==undefined)throw Error('RC_STIFFNESS_MODE_INPUT_CONFLICT');
  return withStiffnessPolicy({...await runKdsSecondOrderIteration(source,{comboIds,maxIterations,tolerance,signal,spatialTolerance,maxRefinements}),rcPolicyVersion:RC_SERVICE_ITERATION_VERSION,stiffnessMode},{stiffnessMode,timeEffect:'specified-lateral-sustained-ratio'});
 }
 if(stiffnessMode==='fully-cracked-elastic')return withStiffnessPolicy({...await runRcCoupledIteration(source,{comboIds,maxIterations,tolerance,signal,spatialTolerance,maxRefinements,timeEffect}),rcPolicyVersion:RC_SERVICE_ITERATION_VERSION,stiffnessMode},{stiffnessMode,timeEffect:timeEffect??'instantaneous'});
 if(timeEffect!==undefined)throw Error('RC_TIME_EFFECT_MODE_CONFLICT');
 if(stiffnessMode!=='effective-inertia')throw Error('RC_STIFFNESS_MODE_INVALID');
 const {preparedResults,...result}=await runFlexuralIteration(source,{maxIterations,tolerance,signal,calculateProfiles:({analysis})=>calculateRcServiceProfiles(source,analysis,{liveComboId})});
 return withStiffnessPolicy({...result,serviceabilityByMember:preparedResults?.serviceabilityByMember??{},pDeltaMethod:result.analysis?.pDeltaMethod??'off',secondOrderByCombo:Object.fromEntries(Object.entries(result.analysis?.byCombo||{}).filter(([,set])=>set.secondOrderTrace).map(([id,set])=>[id,set.secondOrderTrace])),rcPolicyVersion:RC_SERVICE_ITERATION_VERSION,liveComboId,globalMethodQualified:false,qualification:'section-law-referenced; global-redistribution-validation-pending',designTransferAllowed:false},{stiffnessMode,timeEffect:'instantaneous'});
}

function withStiffnessPolicy(result,policy){
 if(result.ok)for(const [comboId,set] of Object.entries(result.analysis?.byCombo||{})){
  if(['sustained-effective-modulus','attachment-effective-modulus'].includes(policy.timeEffect))set.creepEffects=structuredClone(result.creepEffectsByCombo?.[comboId]||{});
  if(set.stiffnessProvenance)set.stiffnessProvenance={...set.stiffnessProvenance,rcPolicyVersion:RC_SERVICE_ITERATION_VERSION,...policy,timeHistoryCreepIncluded:false};
 }
 return result;
}
