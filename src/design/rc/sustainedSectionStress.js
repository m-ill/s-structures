import {solveCrackedElasticSection} from './crackedElasticSection.js';
import {resolveMaterialRecord} from '../../materials/registry.js';
import {concreteEffectiveModulus} from '../../materials/concreteCreep.js';
import {stableHash} from '../../core/stableHash.js';
import {workflowModelInput} from '../../core/workflowIdentity.js';
import {toRcSectionDemand} from '../../core/rcFrameConvention.js';
import {RC_SERVICE_ITERATION_VERSION} from '../../metadata/rcServicePolicy.js';

// Prepare a located section state using the same specified material state as
// the retained frame source. Crack-spacing/mean-strain qualification is separate.
export function prepareSustainedSectionStress(model,member,detail,tuple,{B,H},source){
 const fail=reason=>({ok:false,reason,designTransferAllowed:false});
 const proof=source?.stiffnessProvenance,effect=source?.creepEffects?.[member.id];
 if(!source?.ok||source.combo?.id!==tuple.comboId||proof?.stiffnessMode!=='fully-cracked-elastic'||!['sustained-effective-modulus','attachment-effective-modulus'].includes(proof.timeEffect)||proof.rcPolicyVersion!==RC_SERVICE_ITERATION_VERSION||proof.sourceModelHash!==stableHash(workflowModelInput(model)))return fail('SUSTAINED_SECTION_SOURCE_REQUIRED');
 const concrete=resolveMaterialRecord(model,member.matId),steel=resolveMaterialRecord(model,detail.barMaterialId);
 let expected,demand;
 try{expected={...concreteEffectiveModulus(concrete,{state:proof.timeEffect==='attachment-effective-modulus'?'attachment':'final'}),materialId:concrete.id,materialVersion:concrete.version};demand=toRcSectionDemand(tuple);}catch(error){return fail(error.code||error.message);}
 if(stableHash(expected)!==stableHash(effect))return fail('SUSTAINED_SECTION_MATERIAL_STATE_MISMATCH');
 const initialStrains={concrete:effect.shrinkageInitialStrain,steel:0};
 const response=solveCrackedElasticSection({B:B/1000,H:H/1000,Ec:effect.effectiveE,Es:steel?.elastic?.E,bars:detail.bars,demand,includeBarForces:true,initialStrains});
 if(!response.ok)return response;
 const fy=steel?.strength?.steel?.Fy,fc=concrete?.strength?.concrete?.fck;
 const stresses=response.steelForces.map((force,i)=>force/(detail.bars[i].area*1000));
 const [epsilon,ky,kz]=response.strain;
 const concreteCompression=Math.max(0,...[-1,1].flatMap(y=>[-1,1].map(z=>-(epsilon-z*B/2000*ky+y*H/2000*kz-initialStrains.concrete)*effect.effectiveE)));
 if(!Number.isFinite(fy)||!Number.isFinite(fc)||fy<=0||fc<=0||stresses.some(s=>Math.abs(s)>fy)||concreteCompression>fc)return {...response,ok:false,reason:'SUSTAINED_SECTION_ELASTIC_RANGE_EXCEEDED',steelStresses:stresses,maximumConcreteCompression:concreteCompression};
 return {...response,sectionDemand:demand,appliedConcreteModulus:effect.effectiveE,appliedCreepEffect:effect,sourceTimeEffect:proof.timeEffect,scope:'specified-effective-modulus and optional uniform initial shrinkage; located elastic section equilibrium only',meanCrackStrainQualified:false,methodReviewRequired:true};
}
