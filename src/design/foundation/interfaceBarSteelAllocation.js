// Additive local reservations under the explicit bar-group distribution model.
// A scalar sum alone can conceal one overloaded bar in an eccentric group.
export function interfaceBarSteelAllocation({normal,distribution,friction}){
 const base={version:'p25-interface-bar-allocation-v1',designTransferAllowed:false,interfaceCapacityQualified:false,methodReviewRequired:true,method:'per-bar-additive-normal-and-friction-reservations'};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(normal?.status!=='OK'||distribution?.status!=='CALCULATED'||!['OK','NG'].includes(friction?.status)||!['phi','mu','designFy'].every(k=>Number.isFinite(friction[k])&&friction[k]>0)||!['steelTensionLimit','steelCompressionLimit'].every(k=>Number.isFinite(normal.limits?.[k])&&normal.limits[k]>0))return nc('INTERFACE_BAR_RESERVATION_BASIS_REQUIRED');
 const bars=normal.bars,forces=distribution.barForces;
 if(!Array.isArray(bars)||!bars.length||bars.length>100||!Array.isArray(forces)||forces.length!==bars.length||bars.some((b,i)=>!Number.isFinite(b.area)||b.area<=0||!Number.isFinite(b.force)||forces[i].barIndex!==i+1||forces[i].area!==b.area||!Number.isFinite(forces[i].resultant)||forces[i].resultant<0))return nc('INTERFACE_BAR_RESERVATION_MAPPING_REQUIRED');
 const rows=bars.map((b,i)=>{
  const normalRequiredArea=Math.abs(b.force)/((b.force>=0?normal.limits.steelTensionLimit:normal.limits.steelCompressionLimit)*1000);
  const frictionRequiredArea=forces[i].resultant/(friction.phi*friction.mu*friction.designFy*1000),requiredArea=normalRequiredArea+frictionRequiredArea;
  return {barIndex:i+1,normalForce:b.force,shearResultant:forces[i].resultant,normalRequiredArea,frictionRequiredArea,requiredArea,providedArea:b.area,ratio:requiredArea/b.area};
 });
 if(rows.some(r=>!Number.isFinite(r.ratio)||!Number.isFinite(r.requiredArea)))return nc('INTERFACE_BAR_RESERVATION_NONFINITE');
 const governing=rows.reduce((a,b)=>b.ratio>a.ratio?b:a);
 return {...base,status:governing.ratio<=1+1e-10?'OK':'NG',ratio:governing.ratio,reason:governing.ratio>1+1e-10?'COLUMN_LOCAL_COMBINED_STEEL_INSUFFICIENT':null,governingBarIndex:governing.barIndex,rows,totalRequiredArea:rows.reduce((s,r)=>s+r.requiredArea,0),providedArea:bars.reduce((s,b)=>s+b.area,0),units:{force:'kN',area:'m2'},compressionClampingCredit:0};
}
