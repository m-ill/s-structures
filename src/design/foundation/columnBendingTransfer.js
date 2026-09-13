import {solveInterfaceTraction} from './interfaceTraction.js';
import {columnTransferDevelopment} from './columnTransferDevelopment.js';
import {columnInterfaceShear} from './columnInterfaceShear.js';
import {resolveMaterialRecord} from '../../materials/registry.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
export function evaluateColumnBendingTransfer({model,footing:f,detail:d,member,reaction,ledger,axes,section,forceTensionDevelopment=false}){
 const codeReferences=getKcscRuleSources(['142010','142020','142052','142070']).map(r=>({...r,clause:({142010:'4.2.3(2)',142020:'4.7',142052:'4.1.2; 4.1.3',142070:'4.2.3.1(1)-(4)'})[r.id]}));
 const base={codeReferences,method:'bounded-interface-traction',methodReviewRequired:true,qualification:'bounded-interface-stress-method-independent-review-pending',designTransferAllowed:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 const concrete=resolveMaterialRecord(model,f.materialId),column=resolveMaterialRecord(model,member.matId),steel=resolveMaterialRecord(model,d.barMaterialId);
 const fc=concrete?.strength?.concrete?.fck,columnFc=column?.strength?.concrete?.fck,fy=steel?.strength?.steel?.Fy;
 const material={Ec:Math.min(concrete?.elastic?.E,column?.elastic?.E),Es:steel?.elastic?.E,concreteLimit:.65*.85*Math.min(fc,columnFc),steelCompressionLimit:.65*fy,steelTensionLimit:.85*fy};
 const sign=axes.x[2],project=axis=>sign*(reaction.rmx*axis[0]+reaction.rmy*axis[1]);
 const demand={N:-ledger.columnN,My:project(axes.y),Mz:project(axes.z)};
 const normal=solveInterfaceTraction({section,bars:d.bars,material,demand});
 const area=section.B*section.H,As=d.bars.reduce((n,b)=>n+b.area,0),horizontal=Math.hypot(reaction.rx,reaction.ry);
 const shear=horizontal>1e-8?columnInterfaceShear({area,steelArea:As,fck:Math.min(fc,columnFc),fy,V:horizontal,surface:f.columnInterfaceSurface,clean:f.columnInterfaceClean,reference:f.columnInterfacePreparationReference}):null;
 if(normal.status!=='OK'||shear?.status==='NOT_CHECKED')return incompleteResult(base,normal,shear);
 const reservedArea=normal.bars.reduce((n,bar)=>n+Math.abs(bar.force)/((bar.force>=0?material.steelTensionLimit:material.steelCompressionLimit)*1000),0);
 const shearArea=shear?horizontal/(shear.phi*shear.designFy*shear.mu*1000):0;
 const development=columnTransferDevelopment({detail:d,footing:f,B:section.B,H:section.H,axes,fc,columnFc,fy,tensionAt:normal.bars.map(bar=>forceTensionDevelopment||!!shear||bar.force>1e-8),tensionMode:forceTensionDevelopment?'tension-for-interface-torsion':'tension-for-bending-or-interface-shear'});
 if(development.some(row=>[row.below,row.above].some(x=>x.status!=='CALCULATED')))return {...incompleteResult(base,normal,shear,'COLUMN_BAR_TRANSFER_DEVELOPMENT_REQUIRED'),...(development.some(row=>[row.below,row.above].some(x=>x.status==='NG'))?{status:'NG'}:{}),development};
 const requiredBelow=Math.max(...development.map(r=>r.below.requiredMm))/1000,requiredAbove=Math.max(...development.map(r=>r.above.requiredMm))/1000;
 const availableBelow=f.thickness-f.cover-Math.max(...d.bars.map(b=>b.diameter))/2,length=axes.L*(d.end-d.start);
 if(!(availableBelow>0&&length>0))return {...nc('COLUMN_BAR_TRANSFER_GEOMETRY_REQUIRED'),normalTransfer:normal};
 const criteria=[
  {id:'combined-normal-shear-steel',demand:reservedArea+shearArea,capacity:As,unit:'m2'},
  {id:'minimum-continuous-bars',demand:.005*area,capacity:As,unit:'m2'},
  {id:'development-below',demand:requiredBelow,capacity:f.columnEmbedmentLength,unit:'m'},
  {id:'development-above',demand:requiredAbove,capacity:f.columnDevelopmentAbove,unit:'m'},
  {id:'embedment-envelope',demand:f.columnEmbedmentLength,capacity:availableBelow,unit:'m'},
  {id:'column-region-envelope',demand:f.columnDevelopmentAbove,capacity:length,unit:'m'},
  ...(shear?[{id:'interface-shear',demand:horizontal,capacity:shear.capacity,unit:'kN'}]:[]),
 ].map(row=>({...row,ratio:row.demand/row.capacity,status:row.demand<=row.capacity*(1+1e-10)?'OK':'NG'}));
 const governing=criteria.reduce((a,b)=>b.ratio>a.ratio?b:a),{id:criterionId,...governingResult}=governing;
 return {...base,...governingResult,reason:governing.status==='NG'?`COLUMN_TRANSFER_${governing.id.toUpperCase().replaceAll('-','_')}_INSUFFICIENT`:null,governingCriterion:governing.id,criteria,normalTransfer:normal,interfaceShear:shear,steelAllocation:{reservedNormalArea:reservedArea,shearRequiredArea:shearArea,totalRequiredArea:reservedArea+shearArea,providedArea:As,method:'additive-normal-force-and-shear-reservations',localClampingBearingCoupling:'not-resolved-independent-method-review-required'},development,requiredBelow,requiredAbove,providedBelow:f.columnEmbedmentLength,providedAbove:f.columnDevelopmentAbove,columnMemberId:member.id,columnDetailId:d.id,columnDetailVersion:d.version,momentReference:'column-interface-at-footing-top',codeReferences:[...codeReferences,...(shear?.codeReferences??[]),...development.flatMap(r=>[r.below.source,r.above.source])],scope:'axial and biaxial interface traction with shear reserve; no torsion, laps, hooks or dowels'};
}

// An unresolved calculation must not hide an independently established failure.
// Passing subchecks cannot establish an overall pass while another is incomplete.
function incompleteResult(base, normal, shear, extraReason) {
 const rows=[{id:'normal-transfer',result:normal},{id:'interface-shear',result:shear}].filter(r=>r.result);
 const incompleteReasons=[...rows.filter(r=>r.result.status==='NOT_CHECKED').map(r=>r.result.reason),...(extraReason?[extraReason]:[])].filter(Boolean);
 const failures=rows.filter(r=>r.result.status==='NG');
 const governing=failures.reduce((a,b)=>!a||(b.result.ratio??-Infinity)>(a.result.ratio??-Infinity)?b:a,null);
 const result=governing?{...governing.result,governingCriterion:governing.id,reason:governing.result.reason||'COLUMN_INTERFACE_SHEAR_INSUFFICIENT'}:{status:'NOT_CHECKED',ratio:null,reason:incompleteReasons[0]||'COLUMN_TRANSFER_CALCULATION_INCOMPLETE'};
 return {...result,...base,status:governing?'NG':'NOT_CHECKED',normalTransfer:normal,interfaceShear:shear,incomplete:incompleteReasons.length>0,incompleteReasons,codeReferences:[...base.codeReferences,...(shear?.codeReferences??[])]};
}
