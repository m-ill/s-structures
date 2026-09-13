import {reinforcementMassQuantity} from '../../design/rc/reinforcementMassQuantity.js';
// Member drawings retain their source fragments; the schedule counts physical
// bars once and preserves every model/detail/bar reference for traceability.
export function continuousBarQuantities(quantities,schedule){
 if(!schedule?.records?.length)return quantities;
 const byKey=new Map(quantities.filter(q=>q.kind==='longitudinal').map(q=>[JSON.stringify([q.detailId,q.version,q.mark]),q])),removed=new Set(),combined=[];
 for(const record of schedule.records){
  const parts=record.sourceFragments.map(r=>byKey.get(JSON.stringify([r.detailId,r.version,r.mark])));
  if(parts.some(p=>!p))throw Error('CONTINUOUS_BAR_QUANTITY_FRAGMENT_REQUIRED');
  parts.forEach(p=>removed.add(p));const first=parts[0],unitMass=parts.every(p=>p.unitMassKgPerM===first.unitMassKgPerM)?first.unitMassKgPerM:null,mass=reinforcementMassQuantity(unitMass,record.cutLength===null?null:[{length:record.cutLength,count:1}]);
  combined.push({detailId:first.detailId,version:first.version,memberId:first.memberId,mark:record.id,physicalBarId:record.id,kind:'longitudinal',shape:'continuous',diameter:first.diameter,area:first.area,areaBasis:first.areaBasis,designation:first.designation,productCatalogId:first.productCatalogId,unitMassKgPerM:first.unitMassKgPerM,productReference:first.productReference,productEdition:first.productEdition,productVerification:first.productVerification,...record,pieceCount:record.count,totalCutLength:record.cutLength,bodyLength:parts.reduce((s,p)=>s+p.bodyLength,0),bodyVolume:parts.reduce((s,p)=>s+p.bodyVolume,0),geometricQuantity:{status:record.status,geometricLength:record.cutLength,totalLength:record.cutLength,volume:record.volume,pieceCount:record.count},massQuantity:mass,pieceMassKg:mass.pieceMassKg??null,totalMassKg:mass.totalMassKg??null});
 }
 return [...quantities.filter(q=>!removed.has(q)),...combined];
}
