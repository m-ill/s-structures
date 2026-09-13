import {reinforcementMassQuantity} from './reinforcementMassQuantity.js';
// Use actual prepared end/piece lengths. A lap is already present in the two
// overlapping pieces and must not be added a second time to this quantity.
export function longitudinalReinforcementQuantity(detail,prepared,{spliceBarIndices=[]}={}){
 const base={fabricationApproved:false,methodReviewRequired:true,basis:'prepared-nominal-centerline',units:{length:'m',volume:'m3'},volume:null,totalLength:null,pieceCount:null,rows:[]};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason});
 if(!Array.isArray(detail?.bars)||!detail.bars.length||detail.bars.length>100||!Array.isArray(prepared?.bars)||prepared.bars.length!==detail.bars.length||!Array.isArray(spliceBarIndices)||spliceBarIndices.length>10000||spliceBarIndices.some(i=>!Number.isInteger(i)||i<1||i>detail.bars.length))return nc('LONGITUDINAL_QUANTITY_INPUT_REQUIRED');
 const spliced=new Set(spliceBarIndices),rows=[];
 for(const [index,bar] of detail.bars.entries()){
  const geometry=prepared.bars[index],path=geometry?.splicePath,area=bar.area??Math.PI*bar.diameter**2/4;
  const row={geometryKind:'longitudinal-quantity-row-v1',barIndex:index+1,mark:`B${index+1}`,area,geometricLength:null,volume:null,pieceCount:null,fabricationApproved:false};
  const missing=reason=>{rows.push({...row,status:'NOT_CHECKED',reason,massQuantity:reinforcementMassQuantity(bar.unitMassKgPerM,null)});};
  if(!Number.isFinite(bar.diameter)||bar.diameter<=0||!Number.isFinite(area)||area<=0){missing('LONGITUDINAL_QUANTITY_AREA_REQUIRED');continue;}
  let length,count;
  if(path||spliced.has(index+1)){
   if(path?.status!=='OK'||!Array.isArray(path.pieces)||path.pieces.length<2||path.pieces.length>101||path.pieces.some(p=>!Number.isFinite(p.cutLength)||p.cutLength<=0)){missing('LONGITUDINAL_SPLICE_PIECES_REQUIRED');continue;}
   length=path.pieces.reduce((sum,p)=>sum+p.cutLength,0);count=path.pieces.length;
   if(!Number.isFinite(path.totalCutLength)||Math.abs(length-path.totalCutLength)>1e-9){missing('LONGITUDINAL_PIECE_LENGTH_MISMATCH');continue;}
  }else{length=geometry?.cutLength;count=1;}
  if(!Number.isFinite(length)||length<=0||!Number.isFinite(length*area)){missing('LONGITUDINAL_END_LENGTH_REQUIRED');continue;}
  const massQuantity=reinforcementMassQuantity(bar.unitMassKgPerM,path?path.pieces.map(p=>({length:p.cutLength,count:1})):[{length,count}]);
  rows.push({...row,massQuantity,status:'OK',geometricLength:length,volume:length*area,pieceCount:count,includesLapOverlap:count>1});
 }
 const complete=rows.every(r=>r.status==='OK'),volume=complete?rows.reduce((sum,r)=>sum+r.volume,0):null,totalLength=complete?rows.reduce((sum,r)=>sum+r.geometricLength,0):null;
 if(complete&&(!Number.isFinite(volume)||!Number.isFinite(totalLength)))return nc('LONGITUDINAL_QUANTITY_OVERFLOW');
 return {...base,status:complete?'OK':'NOT_CHECKED',reason:complete?'NOMINAL_PIECE_GEOMETRY; FABRICATION_APPROVAL_SEPARATE':'LONGITUDINAL_QUANTITY_INCOMPLETE',rows,volume,totalLength,pieceCount:complete?rows.reduce((sum,r)=>sum+r.pieceCount,0):null};
}
