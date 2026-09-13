// Geometric body volumes from prepared layout; hook cutting lengths and
// fabrication approval are separate. Above-foundation column steel is counted
// in the member, so only the additional below-interface length belongs here.
export function footingReinforcementQuantity(footing,prepared){
 const rows=[],nc=reason=>({status:'NOT_CHECKED',reason,steelVolume:null,rows,fabricationQuantity:false});
 for(const face of ['bottom','top'])for(const axis of ['B','L']){
  const key=face+axis;if(!footing.reinforcement?.[key])continue;
  const layer=prepared?.[key];
  if(layer?.status!=='OK'||![layer.area,layer.bodyLength].every(x=>Number.isFinite(x)&&x>0))return nc('FOUNDATION_LAYER_QUANTITY_REQUIRED');
  rows.push({kind:'foundation-layer',key,count:layer.count,volume:layer.area*layer.bodyLength});
 }
 if(!rows.length)return nc('FOUNDATION_LAYER_QUANTITY_REQUIRED');
 const layerVolume=rows.reduce((n,r)=>n+r.volume,0);
 if(footing.columnTransferType==='cast-in-place-continuous-straight-bars'){
  if(!prepared.columnBars?.length)return nc('FOUNDATION_COLUMN_EXTENSION_QUANTITY_REQUIRED');
  for(const bar of prepared.columnBars){
   if(!Number.isFinite(bar.additionalBodyVolume)||bar.additionalBodyVolume<=0)return nc('FOUNDATION_COLUMN_EXTENSION_QUANTITY_REQUIRED');
   rows.push({kind:'column-extension',memberId:bar.memberId,memberMark:bar.memberMark,volume:bar.additionalBodyVolume});
  }
 }
 const columnExtensionVolume=rows.filter(r=>r.kind==='column-extension').reduce((n,r)=>n+r.volume,0);
 return {status:'OK',steelVolume:layerVolume+columnExtensionVolume,layerVolume,columnExtensionVolume,rows,unit:'m3',fabricationQuantity:false,scope:'prepared footing layers plus below-interface continuous column extensions; above portion included in member'};
}
