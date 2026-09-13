import {reinforcementMassQuantity} from '../rc/reinforcementMassQuantity.js';
// Panel-perimeter estimate shared by standalone and dependent proposals.
// The full cage centreline (cover, bends, closure) is not supplied by this input.
export function jointHoopQuantity(record,prepared){
 const base={massQuantity:reinforcementMassQuantity(record?.reinforcement?.unitMassKgPerM,null),quantityComplete:false,fabricationQuantity:false,cutLength:null,basis:'panel-perimeter-proxy',unit:'m3'};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason,steelVolume:null});
 if(record?.jointClosureCorner!==undefined||record?.jointClosureSeparation!==undefined||['jointCrossTieBarPairs','jointCrossTieHookSides','jointCrossTiePlaneOffsets','jointCrossTiePattern'].some(k=>record?.[k]!==undefined)){
  const q=prepared?.nominalQuantity;
  if(q?.status!=='OK')return nc(q?.reason||'JOINT_HOOP_PREPARED_SHAPE_REQUIRED');
  return {...base,massQuantity:{...reinforcementMassQuantity(record.reinforcement?.unitMassKgPerM,q.rows.map(r=>({length:r.geometricLength,count:r.count}))),scope:'prepared-joint-hoops-and-cross-ties'},status:'OK',basis:q.basis,area:q.rows[0].area,count:q.rows[0].count,steelVolume:q.volume,totalGeometricLength:q.totalLength,rows:q.rows,shapeStatus:prepared.outerHoop?.closureGeometry?.status,reason:'NOMINAL_JOINT_HOOP_PATH; FULL_CAGE_ASSEMBLY_AND_FABRICATION_REVIEW_REQUIRED'};
 }
 const r=record?.reinforcement,count=prepared?.hoops?.count,area=r?.area??Math.PI*r?.diameter**2/4;
 if(![record?.jointWidth,record?.jointDepth,r?.diameter,area].every(x=>Number.isFinite(x)&&x>0)||!Number.isSafeInteger(count)||count<1)return nc('JOINT_HOOP_QUANTITY_INPUT_REQUIRED');
 const perimeter=2*(record.jointWidth+record.jointDepth),steelVolume=area*perimeter*count;
 if(!Number.isFinite(steelVolume))return nc('JOINT_HOOP_QUANTITY_OVERFLOW');
 return {...base,status:'OK',area,count,panelPerimeter:perimeter,steelVolume,reason:'FULL_JOINT_CAGE_CENTERLINE_REQUIRED'};
}
