import {minimumReinforcementRepairSupported} from './minimumReinforcementRepair.js';
import {stableHash} from '../../core/stableHash.js';
import {createSpliceLayoutResolver} from './spliceStationLayout.js';
import {mergeLocatedCheck} from '../evaluation/locationCoverage.js';
import {torsionSteelAllocation} from './torsionAllocation.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {resolveSectionRecord,resolveMaterialRecord} from '../../materials/registry.js';
import {evaluateKdsSection} from './kdsStrength.js';
import {reinforcementRegionsAt} from './reinforcementRegions.js';

// KDS 14 20 20:2022 4.3.2(1),(2), noncomposite compression members
// with rectangular ties. Areas are m²; lap applicability is explicit input.
export function kdsCompressionReinforcement({grossArea,steelArea,barCount,lapRequired}) {
 const base={codeReferences:getKcscRuleSources(['142020']).map(r=>({...r,clause:'4.3.2(1),(2)'})),qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 if(![grossArea,steelArea].every(x=>Number.isFinite(x)&&x>0)||steelArea>=grossArea||!Number.isInteger(barCount)||barCount<1||typeof lapRequired!=='boolean')return {...base,status:'NOT_CHECKED',ratio:null,reason:'COMPRESSION_REINFORCEMENT_INPUT_REQUIRED'};
 const providedRatio=steelArea/grossArea,minRatio=0.01,maxRatio=lapRequired?0.04:0.08;
 const ratio=Math.max(minRatio/providedRatio,providedRatio/maxRatio,4/barCount);
 return {...base,status:ratio<=1?'OK':'NG',ratio,providedRatio,minRatio,maxRatio,minBarCount:4,barCount,grossArea,steelArea,lapRequired,
  reason:barCount<4?'MINIMUM_LONGITUDINAL_BAR_COUNT':providedRatio<minRatio?'MINIMUM_LONGITUDINAL_REINFORCEMENT':providedRatio>maxRatio?'MAXIMUM_LONGITUDINAL_REINFORCEMENT':null,units:{grossArea:'m2',steelArea:'m2'}};
}

export function kdsFlexuralMinimum({B,H,fck,lambda,designMomentCapacity}){
 const base={codeReferences:getKcscRuleSources(['142020','142030']).map(r=>({...r,clause:r.id==='142020'?'4.2.2(1); Eq.4.2-1':'4.2.1(3); Eq.4.2-2'})),qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 if(![B,H,fck,lambda,designMomentCapacity].every(x=>Number.isFinite(x)&&x>0)||lambda>1)return {...base,status:'NOT_CHECKED',ratio:null,reason:'FLEXURAL_MINIMUM_INPUT_REQUIRED'};
 const fr=.63*lambda*Math.sqrt(fck),Mcr=fr*B*H**2/6*1000,requiredCapacity=1.2*Mcr,ratio=requiredCapacity/designMomentCapacity;
 return {...base,status:ratio<=1+1e-10?'OK':'NG',ratio,Mcr,fr,requiredCapacity,capacity:designMomentCapacity,excessSteelExceptionApplied:false,units:{Mcr:'kN.m',capacity:'kN.m',fr:'MPa'}};
}

export function evaluateProvidedKdsDetailing(model,member,details,tuples,layoutResolver) {
 if(!details.some(d=>d.detailingStandard==='KDS-142020-2022'))return {};
 const section=resolveSectionRecord(model,member.secId),nodes=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id));
 if(!['RECT','SQUARE'].includes(section?.shape)||!nodes.every(Boolean))return {};
 const grossArea=section.params.B*(section.params.H||section.params.B)/1e6,L=Math.hypot(nodes[0].x-nodes[1].x,nodes[0].y-nodes[1].y,nodes[0].z-nodes[1].z);
 const resolveLayout=layoutResolver||createSpliceLayoutResolver(model,member,details);
 const cache=new Map(),repairs=new Map();let governing,repairsTruncated=false;
 for(const tuple of tuples){
  const found=reinforcementRegionsAt(details,tuple.x/L,tuple.side),layout=found.length===1?resolveLayout(found[0],tuple.x,tuple.side):null,d=layout?.detail||found[0];let result;
  if(layout&&layout.status!=='OK'){governing=mergeLocatedCheck(governing,{...layout,concurrentDemand:tuple});continue;}
  if(found.length!==1)result={status:'NOT_CHECKED',ratio:null,reason:'UNIQUE_REINFORCEMENT_REGION_REQUIRED'};
  else if(d.memberRole==='flexural-member'&&d.detailingStandard==='KDS-142020-2022'){
   if(d.reinforcementForm!=='single-deformed'||Math.abs(tuple.N)>1e-8||Math.abs(tuple.My)>1e-8)result={status:'NOT_CHECKED',ratio:null,reason:'UNIAXIAL_FLEXURAL_MINIMUM_SCOPE_REQUIRED'};
   else if(Math.abs(tuple.Mz)<=1e-10)result={status:'N_A',ratio:null,reason:'NO_FLEXURAL_TENSION_DEMAND_AT_STATION',qualification:'clause-scoped-not-whole-design',codeReferences:getKcscRuleSources(['142020']).map(r=>({...r,clause:'4.2.2(1)'}))};
   else{
    const key=`${d.id}@${d.version}:${tuple.Mz>=0?1:-1}:${tuple.signConvention??'rc-section'}:${stableHash(d.bars)}`;
    if(!cache.has(key)){
     const concrete=resolveMaterialRecord(model,member.matId),steel=resolveMaterialRecord(model,d.barMaterialId),fck=concrete?.strength?.concrete?.fck,lambda=d.concreteWeight==='normal'?1:d.concreteWeight==='lightweight'?d.lightweightFactor:null;
     const B=section.params.B/1000,H=(section.params.H||section.params.B)/1000;
     let allocation;try{allocation=torsionSteelAllocation(d);}catch{return {'rc-reinforcement-ratio':{status:'NOT_CHECKED',ratio:null,reason:'TORSION_LONGITUDINAL_ALLOCATION_REQUIRED',detailId:d.id,detailVersion:d.version,concurrentDemand:tuple}};}
     const strength=evaluateKdsSection({B,H},allocation.bars,{fc:fck,fy:steel?.strength?.steel?.Fy,Es:steel?.elastic?.E},{N:0,My:0,Mz:tuple.Mz>=0?1:-1,signConvention:tuple.signConvention});
     cache.set(key,strength.capacity?{...kdsFlexuralMinimum({B,H,fck,lambda,designMomentCapacity:strength.capacity}),detailId:d.id,detailVersion:d.version}:strength);
    }
    result={...cache.get(key)};
   }
  }
  else if(d.detailingStandard!=='KDS-142020-2022'||d.memberRole!=='compression-member'||d.reinforcementForm!=='single-deformed'||d.stirrupForm!=='closed-rectangular-two-leg'||d.stirrups?.legs!==2)result={status:'NOT_CHECKED',ratio:null,reason:'NONCOMPOSITE_RECTANGULAR_TIED_COMPRESSION_SCOPE_REQUIRED'};
  else result={...kdsCompressionReinforcement({grossArea,steelArea:d.bars.reduce((n,b)=>n+b.area,0),barCount:d.bars.length,lapRequired:d.lapRequired}),detailId:d.id,detailVersion:d.version,areaBasis:d.areaBasis,productBasis:d.areaBasis==='specified-nominal'?{reference:d.barProductReference,edition:d.barProductEdition,grade:d.barProductGrade,verification:'user-specified-not-independently-qualified'}:{verification:'geometric-diameter-not-product-certified'}};
  result={...result,...(layout?.changed?{spliceLayoutEvaluated:true,pieceMarks:layout.pieceMarks}:{}),concurrentDemand:tuple};
  if(found.length===1){
   const key=JSON.stringify([d.id,d.version]);
   if(!repairs.has(key)&&repairs.size>=32)repairsTruncated=true;
   else{
    const repair=repairs.get(key)||{detailId:d.id,detailVersion:d.version,needsRepair:false,blocked:false,evaluatedLocations:0};
    repair.evaluatedLocations++;
    repair.needsRepair ||= result.status==='NG';
    repair.blocked ||= !['OK','NG','N_A'].includes(result.status)||result.incomplete===true||result.status==='NG'&&!minimumReinforcementRepairSupported(result);
    repairs.set(key,repair);
   }
  }
  governing=mergeLocatedCheck(governing,result);
 }
 return governing?{'rc-reinforcement-ratio':{...governing,reinforcementRepairRegions:[...repairs.values()],reinforcementRepairRegionsTruncated:repairsTruncated}}:{};
}
