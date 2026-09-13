import {torsionEndAnchorage} from './torsionEndAnchorage.js';
import {torsionTransverseHook} from './torsionTransverseHook.js';
import {torsionExtensionAt} from './torsionExtension.js';
import {mergeLocatedCheck} from '../evaluation/locationCoverage.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {resolveSectionRecord,resolveMaterialRecord} from '../../materials/registry.js';
import {reinforcementRegionsAt} from './reinforcementRegions.js';
import {evaluateReinforcedTorsionAt} from './kdsReinforcedTorsion.js';
export function kdsTorsionThreshold({B,H,fck,lambda,N,T}){
 const base={codeReferences:getKcscRuleSources(['142022','142010']).map(r=>({...r,clause:r.id==='142022'?'4.4.1(1); Eq.4.4-1; Eq.4.4-3':'4.2.3(2)'})),qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(![B,H,fck,lambda].every(x=>Number.isFinite(x)&&x>0)||lambda>1||fck>90||![N,T].every(Number.isFinite))return nc('TORSION_SECTION_MATERIAL_DEMAND_REQUIRED');
 const area=B*H,perimeter=2*(B+H),root=lambda*Math.min(Math.sqrt(fck),8.4),axialFactor=1-N/(area*root/3*1000);
 if(axialFactor<=0)return nc('AXIAL_TENSION_OUTSIDE_TORSION_NEGLECT_SCOPE');
 const threshold=.75*root/12*area**2/perimeter*Math.sqrt(axialFactor)*1000,demand=Math.abs(T);
 return {...base,status:demand<threshold?'OK':'NOT_CHECKED',ratio:demand/threshold,demand,threshold,area,perimeter,axialFactor,phi:.75,lambda,reason:demand<threshold?'TORSION_NEGLECTED_BY_KDS_THRESHOLD':'TORSION_REINFORCEMENT_DESIGN_REQUIRED',scope:'solid-rectangular-nonprestressed-threshold-only',units:{demand:'kN.m',threshold:'kN.m',area:'m2',perimeter:'m',axial:'kN tension-positive'}};
}
export function evaluateProvidedTorsion(model,member,details,tuples,{preparedDetails}={}){
 if(!details.some(d=>d.torsionStandard==='KDS-142022-2022'))return {};
 const section=resolveSectionRecord(model,member.secId),mat=resolveMaterialRecord(model,member.matId),nodes=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id));
 if(!['RECT','SQUARE'].includes(section?.shape)||!nodes.every(Boolean))return {};
 const anchorage=new Map(),hooks=new Map();
 const L=Math.hypot(nodes[0].x-nodes[1].x,nodes[0].y-nodes[1].y,nodes[0].z-nodes[1].z);let worst,extensionCoverage;
 for(const t of tuples){const found=reinforcementRegionsAt(details,t.x/L,t.side),d=found[0];
  let r=found.length===1&&d.torsionStandard==='KDS-142022-2022'?{...kdsTorsionThreshold({B:section.params.B/1000,H:(section.params.H||section.params.B)/1000,fck:mat?.strength?.concrete?.fck,lambda:d.concreteWeight==='normal'?1:d.concreteWeight==='lightweight'?d.lightweightFactor:null,N:t.N,T:t.T}),detailId:d.id,detailVersion:d.version,concurrentDemand:t}:{status:'NOT_CHECKED',ratio:null,reason:'TORSION_REGION_REQUIRED'};
  if(r.reason==='TORSION_REINFORCEMENT_DESIGN_REQUIRED'&&d.torsionDesignMode==='solid-rectangular-45deg')r={...evaluateReinforcedTorsionAt(model,member,section,d,t,{preparedDetails}),neglectThreshold:r.threshold};
  if(r.neglectThreshold!==undefined){
   const key=`${d.id}@${d.version}`;if(!anchorage.has(key))anchorage.set(key,torsionEndAnchorage(model,member,d));
   const endAnchorage=anchorage.get(key);r={...r,endAnchorage,codeReferences:[...(r.codeReferences||[]),...(endAnchorage.codeReferences||[])]};
   if(!hooks.has(key))hooks.set(key,torsionTransverseHook({B:section.params.B/1000,H:(section.params.H||section.params.B)/1000,cover:d.cover,tieDiameter:d.stirrups?.diameter,insideRadius:d.tieBendInsideRadius,tail:d.tieHookTail,closure:d.tieClosure,corner:d.torsionHookCorner,bars:d.bars}));
   const transverseHook=hooks.get(key);r={...r,transverseHook,codeReferences:[...r.codeReferences,...transverseHook.codeReferences]};
   if(transverseHook.status==='NG'&&r.status!=='NG')r={...r,status:'NG',reason:'TORSION_TRANSVERSE_HOOK_NOT_SATISFIED'};
   if(endAnchorage.status==='NG'&&r.status!=='NG')r={...r,status:'NG',reason:'TORSION_END_ANCHORAGE_NOT_SATISFIED'};
   const extension=torsionExtensionAt({detail:d,memberLength:L,x:t.x,bt:r.torsionSectionWidth/1000,d:r.effectiveDepth/1000});
   extensionCoverage=mergeLocatedCheck(extensionCoverage,{...extension,detailId:d.id,detailVersion:d.version,concurrentDemand:t});
   r={...r,extension,codeReferences:[...r.codeReferences,...extension.codeReferences]};
   if(extension.status==='NG'&&r.status!=='NG')r={...r,status:'NG',reason:'TORSION_REINFORCEMENT_EXTENSION_SHORT'};
  }
  worst=mergeLocatedCheck(worst,{...r,concurrentDemand:t});
 }
 return worst?{'rc-torsion':{...worst,...(extensionCoverage?{extensionCoverage}:{})}}:{};
}
