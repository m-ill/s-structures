import {baseFrictionBounds} from './baseFrictionBounds.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
export function evaluateGroundSliding({ground,combo,ledger,reaction,contact}){
 const base={qualification:'clause-scoped-not-whole-design',designTransferAllowed:false,safetyFactorVerified:false,codeReferences:getKcscRuleSources(['115005']).map(r=>({...r,clause:'4.1.7(1)'})),scope:'explicit service-load Coulomb base friction divided by specified safety factor; no cohesion or passive resistance; ground conditions and factor suitability require external review'};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(ground?.slidingMethod!=='coulomb-service-safety-factor')return nc('GROUND_SLIDING_METHOD_REQUIRED');
 if(combo?.type==='strength')return {...base,status:'N_A',ratio:null,reason:'CHECK_REQUIRES_SERVICE_COMBINATION',applicability:{expectedPurpose:'service',actualPurpose:'strength',basis:'explicit service allowable-resistance method'}};
 if(combo?.type!=='service')return nc('COMBINATION_PURPOSE_REQUIRED');
 if(ledger?.ok!==true)return nc('GROUND_SLIDING_LOAD_LEDGER_REQUIRED');
 const missing=[];
 if(!Number.isFinite(ground.friction)||ground.friction<0||ground.friction>1)missing.push('friction');
 if(!Number.isFinite(ground.slidingSafetyFactor)||ground.slidingSafetyFactor<1||ground.slidingSafetyFactor>100)missing.push('slidingSafetyFactor');
 if(typeof ground.slidingFactorReference!=='string'||!ground.slidingFactorReference.trim())missing.push('slidingFactorReference');
 if(missing.length){const raw=baseFrictionBounds({contact,normal:ledger?.totalN,friction:ground.friction,Hx:reaction?.rx,Hy:reaction?.ry,torsion:ledger?.totalMz});return {...nc('GROUND_SLIDING_FACTOR_INPUT_REQUIRED'),status:raw.mechanicsStatus==='NG'?'NG':'NOT_CHECKED',incomplete:true,requiredInputFields:missing,inputTargets:[{type:'ground-record',id:ground.id,version:ground.version}],blockerKind:'input-required',baseFriction:raw};}
 const factor=ground.slidingSafetyFactor,bounds=baseFrictionBounds({contact,normal:ledger.totalN,friction:ground.friction/factor,Hx:reaction?.rx,Hy:reaction?.ry,torsion:ledger.totalMz});
 const info={...base,safetyFactor:factor,factorReference:ground.slidingFactorReference,friction:ground.friction,effectiveFriction:ground.friction/factor,baseFriction:bounds};
 if(bounds.status!=='CALCULATED')return {...info,status:'NOT_CHECKED',ratio:null,reason:bounds.reason};
 if(Math.abs(bounds.residualTorsion)>1e-8)return {...info,status:bounds.mechanicsStatus==='NG'?'NG':'NOT_CHECKED',ratio:null,incomplete:true,methodReviewRequired:true,incompleteReasons:['FOUNDATION_BASE_FRICTION_METHOD_REVIEW_REQUIRED'],reason:'FOUNDATION_BASE_TORSION_SLIDING_REQUIRED'};
 const demand=bounds.horizontal,capacity=bounds.translationCapacity,failed=demand>capacity;
 return {...info,status:failed?'NG':'OK',ratio:capacity>0?demand/capacity:failed?null:0,demand,capacity,reason:failed?'GROUND_SLIDING_ALLOWABLE_RESISTANCE_EXCEEDED':null,units:{force:'kN',safetyFactor:'-'}};
}
