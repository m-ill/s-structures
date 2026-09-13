import {parseSecondaryCompressionLayers} from '../../metadata/secondaryCompressionLayers.js';
import {parseConsolidationStages} from '../../metadata/consolidationStages.js';
export function evaluateSecondaryCompression(ground,layers){
 const fail=reason=>({status:'NOT_CHECKED',reason,methodReviewRequired:true});
 if(ground.secondaryCompressionModel!=='log-time-reference-strain')return fail('SECONDARY_COMPRESSION_MODEL_REQUIRED');
 if(!Number.isFinite(ground.consolidationElapsedDays)||ground.consolidationElapsedDays<0||typeof ground.secondaryCompressionReference!=='string'||!ground.secondaryCompressionReference.trim())return fail('SECONDARY_COMPRESSION_TIME_AND_REFERENCE_REQUIRED');
 let properties,stages;try{properties=parseSecondaryCompressionLayers(ground.secondaryCompressionLayers);stages=parseConsolidationStages(ground.consolidationStages);}catch(error){return fail(error.message);}
 if(!Array.isArray(layers)||layers.length!==properties.length)return fail('SECONDARY_COMPRESSION_LAYER_COUNT_MISMATCH');
 const finalLoadDay=stages.at(-1).day,ageSinceFinalLoad=Math.max(0,ground.consolidationElapsedDays-finalLoadDay),rows=[];
 for(let i=0;i<layers.length;i++){
  const layer=layers[i],data=properties[i];
  if(!Number.isFinite(layer.thickness)||layer.thickness<=0)return fail('SECONDARY_COMPRESSION_LAYER_GEOMETRY_INVALID');
  // Difference of logarithms avoids overflowing the time ratio.
  const decades=ageSinceFinalLoad>data.referenceDays?Math.log10(ageSinceFinalLoad)-Math.log10(data.referenceDays):0;
  const displacement=layer.thickness*data.strainCoefficient*decades;
  if(!Number.isFinite(displacement)||displacement<0)return fail('SECONDARY_COMPRESSION_NUMERIC_RANGE_UNSUPPORTED');
  rows.push({index:layer.index,...data,thickness:layer.thickness,decades,displacement});
 }
 const displacementAtTime=rows.reduce((sum,row)=>sum+row.displacement,0);
 if(!Number.isFinite(displacementAtTime))return fail('SECONDARY_COMPRESSION_NUMERIC_RANGE_UNSUPPORTED');
 return {status:'CALCULATED',model:ground.secondaryCompressionModel,elapsedDays:ground.consolidationElapsedDays,finalLoadDay,ageSinceFinalLoad,layers:rows,displacementAtTime,reference:ground.secondaryCompressionReference,referenceTimeVerified:false,methodReviewRequired:true,designTransferAllowed:false,scope:'log-time secondary strain after a supplied primary-end reference age measured from final load stage; no secondary superposition across stages, unloading or stress-dependent creep',units:{time:'day',displacement:'m',strainCoefficient:'strain per log10 time decade'}};
}
