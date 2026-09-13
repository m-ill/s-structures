import {toRcSectionDemand} from '../../core/rcFrameConvention.js';
import {prepareSpliceStationLayouts} from './spliceStationLayout.js';
import {mergeLocatedCheck} from '../evaluation/locationCoverage.js';
import {reinforcementRegionsAt} from './reinforcementRegions.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {sectionCapacityAtAxial,sectionStressBlockResponse} from './providedSection.js';
import {evaluateKdsSection} from './kdsStrength.js';
import {torsionSteelAllocation} from './torsionAllocation.js';

export function validateMechanicsLaw(law) {
 const fields=['alpha','beta','epscu','phiSection','phiShear','vcCoefficient','maxShearCoefficient','minClearSpacing','minRatio','maxRatio','maxStirrupSpacing'];
 if(!fields.every(k=>Number.isFinite(law[k])&&law[k]>0)||['alpha','beta','phiSection','phiShear'].some(k=>law[k]>1)||law.minRatio>law.maxRatio)throw new Error('EXPLICIT_MECHANICS_LAW_INVALID');
}
export function evaluateProvidedMember(model,member,details,tuples,law,layoutResolver) {
 const result={};
 if(!law&&!details.some(d=>d.strengthStandard==='KDS-142020-2022'))return result;
 if(law)validateMechanicsLaw(law);
 const record=resolveSectionRecord(model,member.secId),concrete=resolveMaterialRecord(model,member.matId);
 if(!['RECT','SQUARE'].includes(record?.shape))return result;
 const section={B:record.params.B/1000,H:(record.params.H||record.params.B)/1000};
 const nodes=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id));
 const L=Math.hypot(nodes[1].x-nodes[0].x,nodes[1].y-nodes[0].y,nodes[1].z-nodes[0].z);
 const resolveLayout=layoutResolver||prepareSpliceStationLayouts(model,details,{memberLength:L,H:section.H});
 const strengthRepairs=new Map();let strengthRepairsTruncated=false;
 const put=(id,value)=>{
  result[id]=mergeLocatedCheck(result[id],value);
  if(id!=='rc-section-strength'||!value.detailId)return;
  const key=JSON.stringify([value.detailId,value.detailVersion]);
  if(!strengthRepairs.has(key)&&strengthRepairs.size>=32){strengthRepairsTruncated=true;return;}
  const row=strengthRepairs.get(key)??{detailId:value.detailId,detailVersion:value.detailVersion,needsRepair:false,blocked:false,evaluatedLocations:0};
  row.evaluatedLocations++;row.needsRepair ||= value.status==='NG';
  row.blocked ||= !['OK','NG'].includes(value.status)||!!value.incomplete||value.reason==='MINIMUM_TENSION_STRAIN_NOT_SATISFIED'||value.torsionReservedArea>0;
  strengthRepairs.set(key,row);
 };
 const checked=(ratio,extra={})=>({status:Number.isFinite(ratio)?ratio>1?'NG':'OK':'NOT_CHECKED',ratio:Number.isFinite(ratio)?ratio:null,reason:Number.isFinite(ratio)?null:'CALCULATION_FAILED',qualification:'explicit-law-unqualified',...extra});
 for(const tuple of tuples) {
  const at=tuple.x/L,matching=reinforcementRegionsAt(details,at,tuple.side);
  if(matching.length!==1){for(const id of ['rc-section-strength','rc-shear-y','rc-shear-z','rc-spacing'])put(id,{status:'NOT_CHECKED',ratio:null,reason:matching.length?'AMBIGUOUS_REINFORCEMENT_REGION':'MISSING_REINFORCEMENT_REGION'});continue;}
  const layout=resolveLayout(matching[0],tuple.x,tuple.side);
  if(layout.status!=='OK'){put('rc-section-strength',{...layout,concurrentDemand:tuple,detailId:matching[0].id,detailVersion:matching[0].version});continue;}
  const detail=layout.detail,bar=resolveMaterialRecord(model,detail.barMaterialId),fy=bar?.strength?.steel?.Fy,Es=bar?.elastic?.E,fc=concrete?.strength?.concrete?.fck;
  if(![fy,Es,fc].every(x=>Number.isFinite(x)&&x>0))continue;
  const material={fc,fy,Es},trace={concurrentDemand:tuple,detailId:detail.id,detailVersion:detail.version,x:tuple.x,...(layout.changed?{spliceLayoutEvaluated:true,spliceLayoutBasis:layout.basis,pieceMarks:layout.pieceMarks}:{})};
  const kds=detail.strengthStandard==='KDS-142020-2022';
  let allocation;try{allocation=torsionSteelAllocation(detail);}catch{put('rc-section-strength',{status:'NOT_CHECKED',ratio:null,reason:'TORSION_LONGITUDINAL_ALLOCATION_REQUIRED',...trace});continue;}
  const strengthBars=allocation.bars;
  if(kds)put('rc-section-strength',{...(detail.reinforcementForm==='single-deformed'&&detail.stirrups?evaluateKdsSection(section,strengthBars,material,tuple):{status:'NOT_CHECKED',ratio:null,reason:'KDS_NONPRESTRESSED_TIED_SECTION_INPUT_REQUIRED'}),torsionReservedArea:allocation.reservedArea,torsionAllocationFraction:allocation.fraction,...trace});
  if(!law)continue;
  const As=detail.bars.reduce((s,b)=>s+b.area,0),rho=As/(section.B*section.H);
  put('rc-reinforcement-ratio',checked(Math.max(law.minRatio/rho,rho/law.maxRatio),{providedRatio:rho,...trace}));
  let gap=Infinity;
  for(let i=0;i<detail.bars.length;i++)for(let j=i+1;j<detail.bars.length;j++){const a=detail.bars[i],b=detail.bars[j];gap=Math.min(gap,Math.hypot(a.y-b.y,a.z-b.z)-(a.diameter+b.diameter)/2);}
  put('rc-spacing',checked(gap===Infinity?0:law.minClearSpacing/Math.max(gap,1e-20),{clearSpacing:gap===Infinity?null:gap,...trace}));
  const magnitude=Math.hypot(tuple.My,tuple.Mz);
  if(!kds&&magnitude>1e-9) {
   const sectionDemand=toRcSectionDemand(tuple);
   const capacity=sectionCapacityAtAxial(section,strengthBars,material,law,sectionDemand.N/law.phiSection,{My:sectionDemand.My,Mz:sectionDemand.Mz});
   put('rc-section-strength',capacity.ok?checked(magnitude/(capacity.capacity*law.phiSection),{capacity:capacity.capacity*law.phiSection,demand:magnitude,equilibrium:{N:capacity.N,My:capacity.My,Mz:capacity.Mz},equilibriumConvention:'rc-section',sectionDemand:{N:sectionDemand.N,My:sectionDemand.My,Mz:sectionDemand.Mz},...trace}):{status:capacity.reason==='AXIAL_CAPACITY_EXCEEDED'?'NG':'NOT_CHECKED',ratio:null,reason:capacity.reason,...trace});
  } else if(!kds) {
   const compression=sectionStressBlockResponse(section,strengthBars,material,law,0,1e9),capacity=(tuple.N<0?-compression.N:(As-allocation.reservedArea)*fy*1000)*law.phiSection;
   put('rc-section-strength',checked(Math.abs(tuple.N)/capacity,{capacity,demand:Math.abs(tuple.N),...trace}));
  }
  for(const [axis,coord,depth,width] of [['y','y',section.H,section.B],['z','z',section.B,section.H]]) {
   const group=sign=>detail.bars.filter(b=>sign*b[coord]>0),centroid=bs=>bs.reduce((s,b)=>s+b[coord]*b.area,0)/bs.reduce((s,b)=>s+b.area,0);
   const plus=group(1),minus=group(-1),d=plus.length&&minus.length?Math.min(depth/2+centroid(plus),depth/2-centroid(minus)):null;
   if(!d){put(`rc-shear-${axis}`,{status:'NOT_CHECKED',ratio:null,reason:'BOTH_FACE_REINFORCEMENT_REQUIRED',...trace});continue;}
   if(!detail.stirrups){put(`rc-shear-${axis}`,{status:'NOT_CHECKED',ratio:null,reason:'MISSING_STIRRUPS',...trace});continue;}
   const s=detail.stirrups,Av=s.legs*(s.area??Math.PI*s.diameter**2/4),Vs=Av*fy*1000*d/s.spacing,Vc=law.vcCoefficient*Math.sqrt(fc)*1000*width*d;
   const cap=law.maxShearCoefficient*Math.sqrt(fc)*1000*width*d,capacity=law.phiShear*Math.min(Vc+Vs,cap),demand=Math.abs(tuple[axis==='y'?'Vy':'Vz']);
   put(`rc-shear-${axis}`,checked(demand/capacity,{capacity,demand,effectiveDepth:d,components:{Vc,Vs,nominalUpperBound:cap},...trace}));
   put('rc-confinement',checked(s.spacing/law.maxStirrupSpacing,{spacing:s.spacing,...trace}));
  }
  if(Math.abs(tuple.T)>1e-9)put('rc-torsion',{status:'NOT_CHECKED',ratio:null,reason:'TORSION_RULE_UNAVAILABLE',...trace});
  else put('rc-torsion',{status:'N_A',ratio:null,reason:'ZERO_TORSION_IN_SELECTED_CONCURRENT_DEMAND',...trace});
 }
 if(result['rc-section-strength'])Object.assign(result['rc-section-strength'],{strengthRepairRegions:[...strengthRepairs.values()],strengthRepairRegionsTruncated:strengthRepairsTruncated});
 return result;
}
