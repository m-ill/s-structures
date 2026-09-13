// Secondary strain slope per log10 time decade, normalized to the supplied layer thickness.
export function parseSecondaryCompressionLayers(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>50)throw Error('SECONDARY_COMPRESSION_LAYERS_INVALID');
 return rows.map(row=>{
  if(typeof row!=='string'||row.length>128)throw Error('SECONDARY_COMPRESSION_LAYERS_INVALID');
  const parts=row.split(':');
  if(parts.length!==2||parts.some(x=>!x.trim()))throw Error('SECONDARY_COMPRESSION_LAYERS_INVALID');
  const [strainCoefficient,referenceDays]=parts.map(Number);
  if(!Number.isFinite(strainCoefficient)||strainCoefficient<0||strainCoefficient>1||!Number.isFinite(referenceDays)||referenceDays<=0||referenceDays>1e6)throw Error('SECONDARY_COMPRESSION_LAYERS_INVALID');
  return {strainCoefficient,referenceDays};
 });
}
