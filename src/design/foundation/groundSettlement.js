import {evaluateSecondaryCompression} from './secondaryCompression.js';
import {evaluateConsolidationTime} from './consolidationTime.js';
import {twoToOneLayerStress} from './twoToOneLayerStress.js';
import {parseSettlementLayers} from '../../metadata/settlementLayers.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
// A local Winkler displacement is not a soil settlement prediction.
export function evaluateGroundSettlement({ground,combo,contact,footing,ledger}) {
 const base={qualification:'provided-input-mechanics',designTransferAllowed:false,methodReviewRequired:true,
  codeReferences:getKcscRuleSources(['115005']).map(r=>({...r,clause:'4.2.1'})),
  scope:'local Winkler displacement only; soil layering, consolidation and differential settlement are not calculated'};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,incomplete:true,reason,incompleteReasons:[reason]});
 if(combo?.type==='strength')return {...base,status:'N_A',ratio:null,reason:'CHECK_REQUIRES_SERVICE_COMBINATION',applicability:{expectedPurpose:'service',actualPurpose:'strength',basis:'service displacement comparison'}};
 if(combo?.type!=='service')return nc('COMBINATION_PURPOSE_REQUIRED');
 if(contact?.ok!==true||!Number.isFinite(contact.qmax)||contact.qmax<0)return nc('SETTLEMENT_CONTACT_REQUIRED');
 if(ground?.settlementMethod!==undefined){
  const automaticStress=ground.settlementMethod==='layered-two-to-one-gross';
  if(!automaticStress&&ground.settlementMethod!=='layered-constrained-modulus')return nc('SETTLEMENT_METHOD_UNSUPPORTED');
  if(typeof ground.settlementReference!=='string'||!ground.settlementReference.trim()||!Number.isFinite(ground.settlementLimit)||ground.settlementLimit<=0)return nc('SETTLEMENT_METHOD_AND_INPUT_REQUIRED');
  let layers;try{layers=parseSettlementLayers(ground.settlementLayers,{automaticStress});}catch{return nc('SETTLEMENT_LAYERS_INVALID');}
  let distribution={};
  if(automaticStress){distribution=twoToOneLayerStress({footing,ledger,contact,layers});if(!distribution.ok)return nc(distribution.reason);layers=distribution.layers;}
  layers=layers.map(layer=>{const stressIncrement=automaticStress?layer.stressIncrement:contact.qmax*layer.stressFactor,strain=stressIncrement/layer.constrainedModulus;return {...layer,stressIncrement,strain,displacement:strain*layer.thickness};});
  const primaryUltimateDisplacement=layers.reduce((sum,layer)=>sum+layer.displacement,0);
  const secondaryCompression=ground.secondaryCompressionModel!==undefined?evaluateSecondaryCompression(ground,layers):null;
  const demand=primaryUltimateDisplacement+(secondaryCompression?.status==='CALCULATED'?secondaryCompression.displacementAtTime:0),capacity=ground.settlementLimit,ratio=demand/capacity;
  if(!Number.isFinite(demand)||!Number.isFinite(ratio))return nc('SETTLEMENT_NUMERIC_RANGE_UNSUPPORTED');
  const failed=demand>capacity;
  const consolidation=ground.consolidationModel!==undefined?evaluateConsolidationTime(ground,layers):null;
  const timeIncomplete=consolidation?.status==='NOT_CHECKED',secondaryIncomplete=secondaryCompression?.status==='NOT_CHECKED';
  const requiredInputFields=[...(timeIncomplete?(consolidation.reason.startsWith('CONSOLIDATION_STAGES')||consolidation.reason==='CONSOLIDATION_FINAL_LOAD_FRACTION_REQUIRED'?['consolidationStages']:['consolidationLayers','consolidationElapsedDays','consolidationReference']):[]),...(secondaryIncomplete?(secondaryCompression.reason.startsWith('CONSOLIDATION_STAGES')||secondaryCompression.reason==='CONSOLIDATION_FINAL_LOAD_FRACTION_REQUIRED'?['consolidationStages']:['secondaryCompressionLayers','secondaryCompressionReference','consolidationElapsedDays']):[])];
  return {...nc('GEOTECHNICAL_SETTLEMENT_REVIEW_PENDING'),status:failed?'NG':'NOT_CHECKED',ratio,demand,capacity,layers,...(consolidation?{consolidation}:{}),...(secondaryCompression?{secondaryCompression,primaryUltimateDisplacement,demandBasis:secondaryIncomplete?'primary-only-secondary-incomplete':'ultimate-primary-plus-secondary-at-specified-horizon',evaluationDays:ground.consolidationElapsedDays??null}:{}),...((timeIncomplete||secondaryIncomplete)?{incompleteReasons:['GEOTECHNICAL_SETTLEMENT_REVIEW_PENDING',...(timeIncomplete?[consolidation.reason]:[]),...(secondaryIncomplete?[secondaryCompression.reason]:[])],blockerKind:'input-required',inputTargets:[{type:'ground-record',id:ground.id,version:ground.version}],requiredInputFields:[...new Set(requiredInputFields)]}:{}),...(automaticStress?{stressDistribution:distribution.stressDistribution}:{}),mechanicsStatus:failed?'NG':'OK',method:ground.settlementMethod,reference:ground.settlementReference,stressReferencePressure:contact.qmax,stressReference:automaticStress?'current gross load over 2V:1H spread area; fully dissipated load increment assumed':'current gross qmax; supplied factors represent layer-average effective stress increase',scope:automaticStress?'one-dimensional compression under uniform full-contact gross loading, exact 2V:1H layer average; no excavation unloading, partial contact, general load history or differential settlement; optional independent uniform-layer consolidation is reported separately':'one-dimensional layer compression with prescribed stress influence factors and constrained moduli; factor applicability, stress range, general load history and differential settlement require review; optional independent uniform-layer consolidation is reported separately',units:{displacement:'m',pressure:'kPa',constrainedModulus:'kPa'}};
 }
 if(!Number.isFinite(ground?.subgradeModulus)||ground.subgradeModulus<=0||!Number.isFinite(ground?.settlementLimit)||ground.settlementLimit<=0)return nc('SETTLEMENT_METHOD_AND_INPUT_REQUIRED');
 const demand=contact.qmax/ground.subgradeModulus,capacity=ground.settlementLimit,ratio=demand/capacity;
 if(!Number.isFinite(demand)||!Number.isFinite(ratio))return nc('SETTLEMENT_NUMERIC_RANGE_UNSUPPORTED');
 const failed=demand>capacity;
 return {...nc('GEOTECHNICAL_SETTLEMENT_REVIEW_PENDING'),status:failed?'NG':'NOT_CHECKED',ratio,demand,capacity,winklerDisplacement:demand,mechanicsStatus:failed?'NG':'OK',units:{displacement:'m',pressure:'kPa',subgradeModulus:'kN/m3'}};
}
