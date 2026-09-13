import {toRcSectionDemand,RC_FRAME_CONVENTION_VERSION} from '../../core/rcFrameConvention.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {sectionCapacityAtAxial} from './providedSection.js';
const refs=()=>getKcscRuleSources(['142020','142010']).map(x=>({...x,clause:x.id==='142020'?'4.1.1(3),(8) Table 4.1-2; 4.1.2(3)-(7) Eq.4.1-17':'4.2.3(2)'}));
export function kdsStressBlock(fc) {
 if(!Number.isFinite(fc)||fc<=0||fc>90)return null;
 if(fc<=40)return {alpha:0.85,beta:0.8,epscu:0.0033};
 // Intermediate strengths use the explicit 4.1.1(7) constitutive law.
 const row={50:[0.97,0.8,0.0032],60:[0.95,0.76,0.0031],70:[0.91,0.74,0.003],80:[0.87,0.72,0.0029],90:[0.84,0.70,0.0028]}[fc];
 return row?{alpha:0.85*row[0],beta:row[1],epscu:row[2]}:{kind:'parabolic-linear',alpha:.85,beta:1,epscu:.0033-(fc-40)/100000,epsco:.002+(fc-40)/100000,exponent:Math.min(2,1.2+1.5*((100-fc)/60)**4)};
}
export function kdsStrengthPhi(et,fy,Es) {
 if(![et,fy,Es].every(Number.isFinite)||fy<=0||Es<=0)throw new Error('KDS_STRAIN_INPUT_INVALID');
 const ey=fy/Es,limit=fy<=400?0.005:2.5*ey;
 if(limit<=ey)throw new Error('KDS_STRAIN_LIMIT_INVALID');
 if(et<=ey)return 0.65;if(et>=limit)return 0.85;
 return 0.65+0.2*(et-ey)/(limit-ey);
}
export function evaluateKdsSection(section,bars,material,demand) {
 const codeReferences=refs(),base={codeReferences,qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 const {fc,fy,Es}=material,law=kdsStressBlock(fc);
 if(law?.kind==='parabolic-linear')codeReferences.find(r=>r.id==='142020').clause='4.1.1(7); Eq.4.1-1; Eq.4.1-2; Eq.4.1-3; Eq.4.1-4; Eq.4.1-5; 4.1.2';
 if(!law||![fy,Es].every(x=>Number.isFinite(x)&&x>0)||fy>600)return nc('KDS_SECTION_MATERIAL_RANGE_UNSUPPORTED');
 const inputSignConvention=demand?.signConvention??'rc-section';
 try{demand=toRcSectionDemand(demand);}catch(error){return nc(error.code);}
 Object.assign(base,{inputSignConvention,sectionDemand:{N:demand.N,My:demand.My,Mz:demand.Mz},equilibriumConvention:'rc-section',frameConventionVersion:RC_FRAME_CONVENTION_VERSION});
 const As=bars.reduce((s,b)=>s+b.area,0),physicalAs=bars.reduce((s,b)=>s+(b.physicalArea??b.area),0),Ag=section.B*section.H;
 if(!(As>0&&As<=physicalAs&&physicalAs<Ag))return nc('SECTION_STEEL_AREA_INVALID');
 const axialCap=0.8*0.65*(0.85*fc*(Ag-physicalAs)+fy*As)*1000;
 const checked=(capacity,extra={})=>({...base,status:extra.ratio>1?'NG':'OK',capacity,...extra});
 if(-demand.N>axialCap)return {...base,status:'NG',ratio:-demand.N/axialCap,capacity:axialCap,reason:'TIED_AXIAL_CAP_EXCEEDED'};
 const moment=Math.hypot(demand.My,demand.Mz);
 if(moment<=1e-9){const capacity=demand.N<0?axialCap:0.85*As*fy*1000;return checked(capacity,{ratio:Math.abs(demand.N)/capacity,phi:demand.N<0?0.65:0.85,law});}
 const transform=r=>{const et=Math.max(...r.steel.map(b=>b.strain)),phi=kdsStrengthPhi(et,fy,Es);return {...r,N:r.N*phi,My:r.My*phi,Mz:r.Mz*phi,phi,et,nominal:{N:r.N,My:r.My,Mz:r.Mz}};};
 const capacity=sectionCapacityAtAxial(section,bars,material,law,demand.N,{My:demand.My,Mz:demand.Mz},transform);
 if(!capacity.ok)return nc(capacity.reason);
 const minStrain=fy<=400?0.004:2*fy/Es;
 const requiresDuctility=-demand.N<0.1*fc*Ag*1000;
 return checked(capacity.capacity,{ratio:moment/capacity.capacity,
  status:requiresDuctility&&capacity.et<minStrain||moment>capacity.capacity?'NG':'OK',
  reason:requiresDuctility&&capacity.et<minStrain?'MINIMUM_TENSION_STRAIN_NOT_SATISFIED':null,
  phi:capacity.phi,tensionStrain:capacity.et,minStrain,law,nominal:capacity.nominal,
  equilibrium:{N:capacity.N,My:capacity.My,Mz:capacity.Mz},scope:'nonprestressed-rectangular-tied-section-strength-only'});
}
