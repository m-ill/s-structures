export function relatedLongitudinalQuantity(commands,preparedDetails){
 const rows=commands.filter(c=>c.type==='reinforcement-record').map(c=>{
  const g=preparedDetails.reinforcement?.[`${c.id}@${c.version}`],quantity=g?.longitudinalQuantity;
  const nominal=quantity?.status==='OK',volume=nominal?quantity.volume:g?.bars?.reduce((n,b)=>n+b.bodyVolume,0);
  if(!Number.isFinite(volume)||volume<=0)throw Object.assign(new Error('RELATED_REINFORCEMENT_QUANTITY_REQUIRED'),{code:'RELATED_REINFORCEMENT_QUANTITY_REQUIRED'});
  return {id:c.id,memberId:c.memberId,version:c.version,steelVolume:volume,quantityBasis:nominal?'prepared-longitudinal-centerline':'longitudinal-body-proxy',nominalGeometryAvailable:nominal,fabricationQuantity:false,unit:'m3'};
 });
 return {rows,steelVolume:rows.reduce((n,r)=>n+r.steelVolume,0),nominalGeometryAvailable:rows.every(r=>r.nominalGeometryAvailable)};
}
