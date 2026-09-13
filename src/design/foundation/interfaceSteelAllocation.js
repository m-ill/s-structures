import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
// Additional steel for net tension is reserved before friction steel is used.
// Uniform axial demand only; bending/torsion require an explicit bar-force model.
export function interfaceSteelAllocation({steelArea,fy,columnN,horizontal,shear}){
 const codeReferences=getKcscRuleSources(['142010','142022','142070']).map(r=>({...r,clause:({142010:'4.2.3(2) tension-controlled axial tension',142022:'4.6.2(6)',142070:'4.2.3.1(3)②; 4.2.3.2(2)'})[r.id]}));
 const base={codeReferences,qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(![steelArea,fy].every(x=>Number.isFinite(x)&&x>0)||fy>600||![columnN,horizontal].every(Number.isFinite)||horizontal<0)return nc('COLUMN_STEEL_ALLOCATION_INPUT_REQUIRED');
 if(horizontal>1e-8&&(!shear||!['OK','NG'].includes(shear.status)||![shear.phi,shear.designFy,shear.mu].every(x=>Number.isFinite(x)&&x>0)||Math.abs(shear.demand-horizontal)>1e-9*Math.max(1,horizontal)))return nc('INTERFACE_SHEAR_BASIS_REQUIRED');
 const tensionDemand=Math.max(0,-columnN),tensionPhi=.85;
 const tensionRequiredArea=tensionDemand/(tensionPhi*fy*1000),shearRequiredArea=horizontal>1e-8?horizontal/(shear.phi*shear.designFy*shear.mu*1000):0;
 const totalRequiredArea=tensionRequiredArea+shearRequiredArea,ratio=totalRequiredArea/steelArea;
 return {...base,status:ratio<=1+1e-10?'OK':'NG',reason:ratio>1+1e-10?'COLUMN_COMBINED_STEEL_AREA_INSUFFICIENT':null,ratio,demand:totalRequiredArea,capacity:steelArea,unit:'m2',tensionDemand,tensionPhi,tensionRequiredArea,shearRequiredArea,totalRequiredArea,providedArea:steelArea,remainingAreaAfterTension:Math.max(0,steelArea-tensionRequiredArea),method:'additive-required-steel-areas',permanentCompressionCredit:0};
}
