import {parseConsolidationStages} from '../../metadata/consolidationStages.js';
import {parseConsolidationLayers} from '../../metadata/consolidationLayers.js';
// Terzaghi average degree for uniform initial excess pore pressure, constant Cv.
export function meanConsolidationDegree(timeFactor){
 const fail=reason=>({ok:false,reason});
 if(!Number.isFinite(timeFactor)||timeFactor<0)return fail('CONSOLIDATION_TIME_FACTOR_INVALID');
 if(timeFactor===0)return {ok:true,degree:0,timeFactor,terms:0,absoluteErrorBound:0};
 if(timeFactor<=.02){
  const degree=2*Math.sqrt(timeFactor/Math.PI);
  const imageBound=4*Math.sqrt(timeFactor/Math.PI)*Math.exp(-1/timeFactor)/(1-Math.exp(-3/timeFactor));
  return {ok:true,degree,timeFactor,terms:0,absoluteErrorBound:imageBound+8*Number.EPSILON};
 }
 let residual=0,tail=Infinity,terms=0;
 for(let m=0;m<128;m++){
  const k=2*m+1;residual+=8/(Math.PI*Math.PI*k*k)*Math.exp(-k*k*Math.PI*Math.PI*timeFactor/4);terms++;
  const next=k+2,first=8/(Math.PI*Math.PI*next*next)*Math.exp(-next*next*Math.PI*Math.PI*timeFactor/4),ratio=Math.exp(-(next+1)*Math.PI*Math.PI*timeFactor);
  tail=first/(1-ratio);
  if(tail<1e-15)break;
 }
 if(tail>=1e-15)return fail('CONSOLIDATION_SERIES_LIMIT');
 return {ok:true,degree:Math.max(0,Math.min(1,1-residual)),timeFactor,terms,absoluteErrorBound:tail+16*Number.EPSILON};
}
export function evaluateConsolidationTime(ground,layers){
 const fail=reason=>({status:'NOT_CHECKED',reason});
 if(ground.consolidationModel!=='independent-uniform-layers')return fail('CONSOLIDATION_MODEL_REQUIRED');
 if(!Number.isFinite(ground.consolidationElapsedDays)||ground.consolidationElapsedDays<0||typeof ground.consolidationReference!=='string'||!ground.consolidationReference.trim())return fail('CONSOLIDATION_TIME_AND_REFERENCE_REQUIRED');
 let data;try{data=parseConsolidationLayers(ground.consolidationLayers);}catch{return fail('CONSOLIDATION_LAYERS_INVALID');}
 if(!Array.isArray(layers)||layers.length!==data.length)return fail('CONSOLIDATION_LAYER_COUNT_MISMATCH');
 let stages;try{stages=parseConsolidationStages(ground.consolidationStages);}catch(error){return fail(error.message);}
 const active=stages.filter(stage=>stage.day<=ground.consolidationElapsedDays);
 const appliedLoadFraction=active.length?active.at(-1).cumulativeFraction:0;
 const rows=[];
 for(let i=0;i<layers.length;i++){
  const layer=layers[i],properties=data[i],drainagePath=layer.thickness/(properties.drainage==='double'?2:1);
  if(!Number.isFinite(drainagePath)||drainagePath<=0||!Number.isFinite(layer.displacement)||layer.displacement<0)return fail('CONSOLIDATION_LAYER_GEOMETRY_INVALID');
  let fraction=0,errorBound=0,terms=0,timeFactor=null;
  for(const stage of active){
   const tv=properties.coefficient*(ground.consolidationElapsedDays-stage.day)/(drainagePath*drainagePath),response=meanConsolidationDegree(tv);
   if(!response.ok)return fail(response.reason);
   fraction+=stage.increment*response.degree;errorBound+=stage.increment*response.absoluteErrorBound;terms+=response.terms;
   if(stages.length===1)timeFactor=tv;
  }
  fraction=Math.max(0,Math.min(appliedLoadFraction,fraction));
  rows.push({index:layer.index,...properties,drainagePath,degree:fraction,degreeBasis:'fraction of final ultimate settlement, including unreached future loads',timeFactor,terms,absoluteErrorBound:errorBound+8*Number.EPSILON,activeStageCount:active.length,ultimateDisplacement:layer.displacement,displacementAtTime:layer.displacement*fraction});
 }
 const displacementAtTime=rows.reduce((sum,row)=>sum+row.displacementAtTime,0),ultimateDisplacement=rows.reduce((sum,row)=>sum+row.ultimateDisplacement,0);
 if(!Number.isFinite(displacementAtTime)||!Number.isFinite(ultimateDisplacement))return fail('CONSOLIDATION_NUMERIC_RANGE_UNSUPPORTED');
 return {status:'CALCULATED',model:ground.consolidationModel,elapsedDays:ground.consolidationElapsedDays,reference:ground.consolidationReference,stages,appliedLoadFraction,futureLoadFraction:1-appliedLoadFraction,layers:rows,displacementAtTime,ultimateDisplacement,remainingPrimarySettlement:Math.max(0,ultimateDisplacement-displacementAtTime),methodReviewRequired:true,designTransferAllowed:false,scope:'monotone staged proportional loading of the final stress profile; each layer is an independent drainage domain with uniform initial mean excess pore pressure and constant Cv/M; no coupled interlayer drainage, unloading, changing load footprint or secondary compression',units:{coefficient:'m2/day',time:'day',displacement:'m'}};
}
