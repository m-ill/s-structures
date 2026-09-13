import {punchingUtilization} from './punchingUtilization.js';
import {kdsPunchingCapacity} from './kdsPunchingCapacity.js';
export {kdsPunchingCapacity} from './kdsPunchingCapacity.js';
import {evaluateRectangularFootingPunching} from './rectangularFootingPunching.js';
import {footingColumnGeometry} from './footingColumnGeometry.js';
import {footingBarLayout} from './footingBarLayout.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {resolveMaterialRecord} from '../../materials/registry.js';
import {tensionDevelopment} from '../rc/kdsAnchorage.js';
import {criticalPerimeterActions,perimeterShearInteraction} from './eccentricPunching.js';
export function evaluateFootingPunching(model,footing,set,{ledger,contact,preparedPerimeter}={}) {
 const nc=(reason,extra={})=>({status:'NOT_CHECKED',ratio:null,reason,codeReferences:getKcscRuleSources(['142022']).map(r=>({...r,clause:'4.11.1; 4.11.2; 4.11.7'})),...extra});
 if(footing.punchingStandard!=='KDS-142022-2022')return nc('PUNCHING_STANDARD_REQUIRED');
 const combo=model.loadCombinations.find(x=>x.id===set?.combo?.id),r=set?.reactions?.[footing.nodeId],rb=footing.reinforcement;
 if(combo?.type!=='strength'||!r||!rb||!footing.columnWidth||!footing.columnDepth)return nc('STRENGTH_REACTION_COLUMN_AND_REINFORCEMENT_REQUIRED');
 if(footing.concreteWeight!=='normal'||footing.barCoating!=='uncoated')return nc('NORMAL_CONCRETE_UNCOATED_BOTTOM_BARS_REQUIRED');
 if(![footing.B,footing.L,footing.cover,footing.thickness,rb.bottomB?.diameter,rb.bottomB?.spacing,rb.bottomL?.diameter,rb.bottomL?.spacing].every(x=>Number.isFinite(x)&&x>0))return nc('FOOTING_GEOMETRY_INPUT_INVALID');
 const fc=resolveMaterialRecord(model,footing.materialId)?.strength?.concrete?.fck,fy=resolveMaterialRecord(model,rb.materialId)?.strength?.steel?.Fy;
 const dB=footing.thickness-footing.cover-rb.bottomB.diameter/2,dL=footing.thickness-footing.cover-rb.bottomB.diameter-rb.bottomL.diameter/2,d=(dB+dL)/2;
 const geometry=footingColumnGeometry(footing);if(!geometry.ok)return nc(geometry.reason);
 if(footing.punchingPerimeterScope==='rectangular-solid-no-openings')return evaluateRectangularFootingPunching(model,footing,{ledger,contact,d,dB,dL,preparedPerimeter});
 if(!(Math.min(dB,dL)>0)||2*Math.abs(geometry.x)+footing.columnWidth+d>=footing.B||2*Math.abs(geometry.y)+footing.columnDepth+d>=footing.L)return nc('INTERIOR_CRITICAL_PERIMETER_REQUIRED');
 if((geometry.x||geometry.y)&&footing.punchingMomentMethod!=='conservative-perimeter-shear')return nc('OFFSET_COLUMN_NET_PUNCHING_ACTIONS_REQUIRED');
 const layouts={B:footingBarLayout(footing,'bottom','B'),L:footingBarLayout(footing,'bottom','L')};
 if(Object.values(layouts).some(x=>x.status!=='OK'))return nc('FOOTING_BAR_LAYOUT_REQUIRED');
 const ratio=(axis,width,column,bar,depth)=>{const offset=axis==='B'?geometry.y:geometry.x,half=(column+d)/2+footing.thickness,low=Math.max(-width/2,offset-half),high=Math.min(width/2,offset+half);
  const count=layouts[axis].positions.filter(x=>x-width/2>=low-1e-10&&x-width/2<=high+1e-10).length;
  return count*(bar.area??Math.PI*bar.diameter**2/4)/((high-low)*depth);};
 const rho=(ratio('B',footing.L,footing.columnDepth,rb.bottomB,dB)+ratio('L',footing.B,footing.columnWidth,rb.bottomL,dL))/2;
 const calc=kdsPunchingCapacity({fck:fc,d:d*1000,b0:2*(footing.columnWidth+footing.columnDepth+2*d)*1000,rho,lambda:1,columnPosition:'interior'});
 if(calc.status!=='CALCULATED')return calc;
 if(![r.rz,r.rmx,r.rmy].every(Number.isFinite)||r.rz<=0)return nc('COMPRESSIVE_CONCURRENT_REACTION_REQUIRED',{calculation:calc,codeReferences:calc.codeReferences});
 let transfer=null;
 if(footing.punchingMomentMethod==='conservative-perimeter-shear'){
  if(footing.punchingPerimeterScope!=='interior-solid-no-openings')return nc('PUNCHING_PERIMETER_SCOPE_REQUIRED');
  if(!ledger?.ok||!contact?.ok)return nc('PUNCHING_NET_ACTION_LEDGER_REQUIRED');
  const B=footing.columnWidth+d,L=footing.columnDepth+d,actions=criticalPerimeterActions({B,L,x:geometry.x,y:geometry.y,reaction:r,ledger,contact});
  const vc=calc.nominalCapacity/(2*(B+L)*d)/1000,cuRatio=calc.factors.cu/(d*1000);
  const nominalStress=Math.min(vc,.58*fc*cuRatio,.63*Math.sqrt(fc),.25*fc);
  transfer={...perimeterShearInteraction({B,L,d,...actions,designStress:.75*nominalStress*1000}),actions,nominalStress,method:'conservative-perimeter-shear',independentMethodReview:'pending'};
  if(transfer.status==='NOT_CHECKED')return transfer;
 }else if(Math.abs(r.rmx)>1e-8||Math.abs(r.rmy)>1e-8)return nc('COMBINED_PUNCHING_MOMENT_TRANSFER_4_11_7_REQUIRED',{calculation:calc,codeReferences:calc.codeReferences});
 const extensions=[];
 for(const [axis,span,column,bar] of [['B',footing.B,footing.columnWidth,rb.bottomB],['L',footing.L,footing.columnDepth,rb.bottomL]]) {
  const db=bar.diameter*1000,ld=tensionDevelopment({db,fy,fck:fc,lambda:1,c:Math.min(footing.cover+bar.diameter/2,layouts[axis].minimumSpacing/2)*1000,Ktr:0,topBar:false,coating:'uncoated',sizeFactor:db<=19.1?0.8:1});
  if(ld.status!=='CALCULATED')return nc('PUNCHING_REINFORCEMENT_DEVELOPMENT_REQUIRED',{calculation:calc,codeReferences:calc.codeReferences});
  const sideChecks=[-1,1].map(side=>({side,available:span/2-geometry.axes[axis].cut(side)-d/2-footing.cover}));
  extensions.push({axis,available:Math.min(...sideChecks.map(row=>row.available)),sideChecks,required:footing.thickness+ld.requiredMm/1000,source:ld.source});
 }
 const extensionFailure=extensions.some(x=>x.available<x.required),utilization=transfer?transfer.ratio:r.rz/calc.capacity;
 const ratioDetails=punchingUtilization(extensions,utilization);
 if(transfer)return {...calc,status:utilization>1+1e-10||extensionFailure?'NG':'OK',...ratioDetails,demand:transfer.demandStress,capacity:transfer.capacity,nominalCapacity:transfer.nominalStress*1000,unit:'kPa',demandBasis:'combined-perimeter-stress',verticalDemand:transfer.actions.V,verticalShearCapacity:calc.capacity,nominalVerticalShearCapacity:calc.nominalCapacity,methodReviewRequired:true,reason:extensionFailure?'PUNCHING_REINFORCEMENT_EXTENSION_INSUFFICIENT':null,extensions,transfer,soilReactionReductionApplied:true,qualification:'conservative-perimeter-method-independent-review-pending',scope:'interior-column-solid-footing-without-openings; no flexural transfer credit',codeReferences:[...calc.codeReferences,...getKcscRuleSources(['142022']).map(r=>({...r,clause:'4.11.7(1)-(5); Eq.4.11-14; Eq.4.11-16; Eq.4.11-17; Eq.4.11-18'})),...extensions.map(x=>x.source)]};
 return {...calc,status:utilization>1||extensionFailure?'NG':'OK',demand:r.rz,...ratioDetails,reason:extensionFailure?'PUNCHING_REINFORCEMENT_EXTENSION_INSUFFICIENT':null,extensions,soilReactionReductionApplied:false,demandBasis:'full-column-reaction-conservative-upper-bound',scope:'centered-interior-isolated-footing-with-straight-bottom-bars',codeReferences:[...calc.codeReferences,...extensions.map(x=>x.source)]};
}
