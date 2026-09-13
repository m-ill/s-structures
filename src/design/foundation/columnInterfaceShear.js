import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
// Normal concrete; reinforcement perpendicular to the interface. Areas m2,
// strengths MPa and forces kN. Permanent axial compression credit is omitted.
export function columnInterfaceShear({area,steelArea,fck,fy,V,surface,clean,reference}){
 const codeReferences=getKcscRuleSources(['142022','142010','142070']).map(r=>({...r,clause:({142022:'4.6.2(1),(3)-(7); Eq.4.6-1; 4.6.3(1)',142010:'4.2.3(2)',142070:'4.2.3.1(5)'})[r.id]}));
 const base={codeReferences,qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(![area,steelArea,fck,fy].every(x=>Number.isFinite(x)&&x>0)||steelArea>=area||fck<18||fck>90||fy>600||!Number.isFinite(V)||V<0)return nc('COLUMN_INTERFACE_SHEAR_INPUT_RANGE');
 const mu={monolithic:1.4,'roughened-6mm':1,unroughened:.6}[surface];
 if(!mu||typeof reference!=='string'||!reference.trim()||surface!=='monolithic'&&clean!==true)return nc('COLUMN_INTERFACE_PREPARATION_REQUIRED');
 const designFy=Math.min(fy,500),steelResistance=steelArea*designFy*mu*1000;
 const stressLimit=surface==='unroughened'?Math.min(.2*fck,5.5):Math.min(.2*fck,3.3+.08*fck,11);
 const concreteLimit=stressLimit*area*1000,nominalCapacity=Math.min(steelResistance,concreteLimit),capacity=.75*nominalCapacity;
 return {...base,status:V<=capacity+1e-10?'OK':'NG',ratio:V/capacity,demand:V,capacity,nominalCapacity,steelResistance,concreteLimit,stressLimit,phi:.75,mu,designFy,providedFy:fy,area,steelArea,surface,clean:clean===true,preparationReference:reference,permanentCompressionCredit:0,anchorageRequired:'tension development both sides for full bar yield',unit:'kN',scope:'perpendicular continuous bars; normal concrete; no interface tension, bending or torsion allocation'};
}
