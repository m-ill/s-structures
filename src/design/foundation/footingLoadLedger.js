import {resolveMaterialRecord} from '../../materials/registry.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {pressureIntegral} from './compressionContact.js';
import {footingReactionHeight} from './footingReactionHeight.js';
export function resolveFootingLoadLedger(model,footing,reaction,combo){
 const fail=reason=>({ok:false,reason});
 if(![reaction?.rx,reaction?.ry,reaction?.rz,reaction?.rmx,reaction?.rmy].every(Number.isFinite))return fail('CONCURRENT_REACTION_REQUIRED');
 const vertical=footingReactionHeight(footing,reaction);if(!vertical.ok)return vertical;
 if(!['superstructure-only','includes-footing-weight'].includes(footing.reactionBasis))return fail('REACTION_WEIGHT_ACCOUNTING_REQUIRED');
 const density=resolveMaterialRecord(model,footing.materialId)?.elastic?.rho,area=footing.B*footing.L;
 if(![density,area,footing.thickness,reaction.rz].every(Number.isFinite)||Math.min(density,area,footing.thickness)<=0)return fail('FOOTING_WEIGHT_GEOMETRY_REQUIRED');
 const components=[];
 for(const [kind,caseId,pressure,sign] of [['self-weight',footing.footingWeightCaseId,density*9.80665*footing.thickness,1],['overburden',footing.overburdenCaseId,footing.uniformOverburdenPressure||0,1],['buoyancy',footing.buoyancyCaseId,footing.uniformBuoyancyPressure||0,-1]]){
  if(pressure===0)continue;
  const factor=combo?.factors?.[caseId];
  if(!model.loadCases?.some(x=>x.id===caseId)||!Number.isFinite(factor)||factor<0||!Number.isFinite(pressure)||pressure<0)return fail('FOOTING_DISTRIBUTED_LOAD_CASE_AND_FACTOR_REQUIRED');
  components.push({kind,caseId,unfactoredPressure:pressure,factor,sign,factoredPressure:sign*pressure*factor});
 }
 const uniformDownwardPressure=components.reduce((s,x)=>s+x.factoredPressure,0),distributedN=uniformDownwardPressure*area;
 const totalN=reaction.rz+(footing.reactionBasis==='superstructure-only'?distributedN:0),columnN=totalN-distributedN;
 const x=footing.columnOffsetX??0,y=footing.columnOffsetY??0;
 if(![x,y].every(Number.isFinite))return fail('FOOTING_COLUMN_GEOMETRY_REQUIRED');
 const reference=footing.reactionMomentReference||(!x&&!y?'column-center':null);
 if(!['column-center','footing-center'].includes(reference))return fail('FOOTING_REACTION_MOMENT_REFERENCE_REQUIRED');
 const shift=reference==='column-center'?reaction.rz:0;
 const heightMx=0-vertical.height*reaction.ry,heightMy=0+vertical.height*reaction.rx;
 const totalMx=reaction.rmx+shift*y+heightMx,totalMy=reaction.rmy-shift*x+heightMy;
 const columnBaseMx=totalMx-columnN*y,columnBaseMy=totalMy+columnN*x;
 const columnMx=columnBaseMx+footing.thickness*reaction.ry,columnMy=columnBaseMy-footing.thickness*reaction.rx;
 const horizontalTorsion=x*reaction.ry-y*reaction.rx,totalMz=Number.isFinite(reaction.rmz)?reaction.rmz+(reference==='column-center'?horizontalTorsion:0):null,columnMz=totalMz===null?null:totalMz-horizontalTorsion;
 return {ok:true,totalN,columnN,totalMx,totalMy,totalMz,columnBaseMx,columnBaseMy,columnMx,columnMy,columnMz,columnInterfaceHeightAboveBase:footing.thickness,reactionHeightAboveBase:vertical.height,reactionVerticalReference:vertical.reference,heightMoment:{Mx:heightMx,My:heightMy},columnOffsetX:x,columnOffsetY:y,reactionMomentReference:reference,distributedN,uniformDownwardPressure,components,gravity:9.80665,units:{force:'kN',moment:'kN.m',length:'m',pressure:'kPa',density:'t/m3'},reactionBasis:footing.reactionBasis,distribution:'uniform-centered-over-entire-footing',codeReferences:getKcscRuleSources(['142070']).map(x=>({...x,clause:'4.2.1(1),(2); 4.2.2.1(1)'}))};
}
export function netFootingCut(contact,footing,ledger,axis,sign,cut){
 const soil=pressureIntegral(contact,axis,sign,cut),span=axis==='B'?footing.B:footing.L,width=axis==='B'?footing.L:footing.B,arm=Math.max(0,span/2-cut);
 const downwardForce=ledger.uniformDownwardPressure*width*arm,downwardMoment=downwardForce*arm/2;
 return {force:soil.force-downwardForce,moment:soil.moment-downwardMoment,soil,downwardForce,downwardMoment};
}
