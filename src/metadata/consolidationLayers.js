export function parseConsolidationLayers(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>50)throw Error('CONSOLIDATION_LAYERS_INVALID');
 return rows.map(row=>{
  if(typeof row!=='string'||row.length>128)throw Error('CONSOLIDATION_LAYERS_INVALID');
  const parts=row.split(':');const coefficient=Number(parts[0]);
  if(parts.length!==2||!parts[0].trim()||!Number.isFinite(coefficient)||coefficient<=0||coefficient>1e6||!['single','double'].includes(parts[1]))throw Error('CONSOLIDATION_LAYERS_INVALID');
  return {coefficient,drainage:parts[1]};
 });
}
