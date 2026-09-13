import {reinforcementMassQuantity} from './reinforcementMassQuantity.js';
// Quantities of the prepared nominal centreline geometry, not approved shop
// lengths. Never replace a missing closure or cross-tie shape by zero steel.
export function transverseReinforcementQuantity(detail,prepared){
 const base={fabricationApproved:false,methodReviewRequired:true,units:{length:'m',area:'m2',volume:'m3'},basis:'prepared-nominal-centerline',rows:[],totalLength:null,volume:null};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason});
 const db=detail?.stirrups?.diameter,area=detail?.stirrups?.area??Math.PI*db**2/4,count=prepared?.stirrupDistribution?.count;
 if(!Number.isFinite(db)||db<=0||!Number.isFinite(area)||area<=0||prepared?.stirrupDistribution?.status!=='OK'||!Number.isSafeInteger(count)||count<1)return nc('TRANSVERSE_QUANTITY_INPUT_REQUIRED');
 const closure=prepared?.outerHoop?.closureGeometry,path=closure?.path;
 if(path?.status!=='OK'||!Number.isFinite(path.centerlineLength)||path.centerlineLength<=0||!Array.isArray(path.primitives)||!path.primitives.length||path.primitives.length>128||path.primitives.some(p=>!Number.isFinite(p.length)||p.length<=0))return nc('TRANSVERSE_CLOSURE_PATH_REQUIRED');
 if(Math.abs(path.primitives.reduce((sum,p)=>sum+p.length,0)-path.centerlineLength)>1e-9)return nc('TRANSVERSE_PATH_LENGTH_MISMATCH');
 const bends=path.primitives.filter(p=>p.kind==='arc').map(p=>({centerlineRadius:p.radius,angleDegrees:p.sweep*180/Math.PI,length:p.length}));
 const rows=[{mark:'S1',kind:'stirrup',count,area,diameter:db,geometricLength:path.centerlineLength,bends,codeReferences:closure.codeReferences||[]}];
 const expected=detail.crossTieBarPairs?.length||0,pieces=prepared.crossTies?.pieces||[];
 if(expected>20||pieces.length!==expected)return nc('TRANSVERSE_CROSS_TIE_SHAPES_REQUIRED');
 for(const piece of pieces){
  if(!Number.isFinite(piece.cutLength)||piece.cutLength<=0||piece.diameter!==db)return nc('TRANSVERSE_CROSS_TIE_LENGTH_REQUIRED');
  rows.push({mark:piece.mark,kind:'cross-tie',count,area,diameter:db,geometricLength:piece.cutLength,planeOffset:piece.planeOffset,codeReferences:prepared.crossTies.codeReferences||[]});
 }
 for(const row of rows){row.massQuantity=reinforcementMassQuantity(detail.stirrups?.unitMassKgPerM,[{length:row.geometricLength,count:row.count}]);row.geometryKind='transverse-quantity-row-v1';row.totalLength=row.count*row.geometricLength;row.volume=row.totalLength*row.area;}
 const totalLength=rows.reduce((sum,r)=>sum+r.totalLength,0),volume=rows.reduce((sum,r)=>sum+r.volume,0);
 if(!Number.isFinite(totalLength)||!Number.isFinite(volume))return nc('TRANSVERSE_QUANTITY_OVERFLOW');
 return {...base,status:'OK',reason:'NOMINAL_GEOMETRY_ONLY; BENDING_ALLOWANCE_AND_FABRICATION_APPROVAL_SEPARATE',rows,totalLength,volume};
}
