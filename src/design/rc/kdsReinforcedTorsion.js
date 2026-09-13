import {torsionPerimeterDetail} from './torsionPerimeterDetail.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {resolveMaterialRecord} from '../../materials/registry.js';
import {torsionSteelAllocation} from './torsionAllocation.js';
// KDS 14 20 22:2022 4.5, solid nonprestressed normal-weight section,
// theta=45 degrees, no redistribution or flexural compression credit.
// Inputs mm/mm2/MPa/kN/kN.m. Detailing is a separate mandatory gate.
export function kdsReinforcedTorsion({B,H,fck,fy,fyt,cover,tieDiameter,tieArea,spacing,d,V,T,longitudinalArea}) {
 const base={codeReferences:getKcscRuleSources(['142022','142010']).map(r=>({...r,clause:r.id==='142022'?'4.5.1; 4.5.2; 4.5.3; 4.5.4; Eq.4.5-1; Eq.4.5-4; Eq.4.5-5; Eq.4.5-6; Eq.4.5-7':'4.2.3(2)'})),qualification:'clause-scoped-reinforcement-demand',designTransferAllowed:false,methodReviewRequired:true,units:{length:'mm',area:'mm2',stress:'MPa',force:'kN',torque:'kN.m'}};
 const nc=reason=>({...base,status:'NOT_CHECKED',strengthStatus:'NOT_CHECKED',ratio:null,reason});
 if(![B,H,fck,fy,fyt,cover,tieDiameter,tieArea,spacing,d].every(v=>Number.isFinite(v)&&v>0)||![V,T,longitudinalArea].every(v=>Number.isFinite(v)&&v>=0)||fck<18||fck>90||fy>500||fyt>500||d>=H)return nc('TORSION_REINFORCED_INPUT_SCOPE');
 const coreB=B-2*cover-tieDiameter,coreH=H-2*cover-tieDiameter;
 if(coreB<=0||coreH<=0)return nc('TORSION_CLOSED_STIRRUP_CORE_REQUIRED');
 const Aoh=coreB*coreH,Ao=.85*Aoh,ph=2*(coreB+coreH),root=Math.min(Math.sqrt(fck),8.4),phi=.75;
 const Vc=root*B*d/6000,requiredVs=Math.max(0,V/phi-Vc),requiredAv=requiredVs*1000*spacing/(fyt*d);
 const requiredAtPerSpacing=T*1e6/(phi*2*Ao*fyt),requiredAt=requiredAtPerSpacing*spacing;
 const requiredLongitudinalArea=requiredAtPerSpacing*ph*fyt/fy;
 const minimumLongitudinalArea=Math.max(0,.42*root*B*H/fy-Math.max(requiredAtPerSpacing,.175*B/fyt)*ph*fyt/fy);
 const minimumTransverseArea=Math.max(.0625*root,.35)*B*spacing/fyt,requiredCombinedTransverseArea=Math.max(requiredAv+2*requiredAt,minimumTransverseArea);
 const sectionStress=Math.hypot(V*1000/(B*d),T*1e6*ph/(1.7*Aoh*Aoh)),sectionStressLimit=phi*(Vc*1000/(B*d)+2*root/3);
 const maxTorsionSpacing=Math.min(ph/8,300),maxShearSpacing=Math.min(d/2,600)*(requiredVs>root*B*d/3000?.5:1),maxSpacing=Math.min(maxTorsionSpacing,maxShearSpacing);
 const providedCombinedTransverseArea=2*tieArea,requiredLongitudinal=Math.max(requiredLongitudinalArea,minimumLongitudinalArea),VsUpperBound=.2*(1-fck/250)*fck*B*d/1000;
 const ratios={section:sectionStress/sectionStressLimit,transverse:requiredCombinedTransverseArea/providedCombinedTransverseArea,longitudinal:requiredLongitudinal/Math.max(longitudinalArea,1e-20),shearUpperBound:requiredVs/VsUpperBound,spacing:spacing/maxSpacing};
 const failures=Object.entries(ratios).filter(([k,v])=>v>1||(k==='spacing'&&spacing>=maxTorsionSpacing)).map(([k])=>k);
 return {...base,status:failures.length?'NG':'NOT_CHECKED',strengthStatus:failures.length?'NG':'OK',ratio:Math.max(...Object.values(ratios)),reason:failures.length?'TORSION_STRENGTH_OR_REINFORCEMENT_NOT_SATISFIED':'TORSION_DETAIL_AND_ADDITIONAL_REINFORCEMENT_VERIFICATION_REQUIRED',failures,ratios,phi,theta:45,Aoh,Ao,ph,Vc,requiredVs,VsUpperBound,requiredAv,requiredAtPerSpacing,requiredAt,requiredLongitudinalArea,minimumLongitudinalArea,requiredLongitudinal,providedLongitudinalArea:longitudinalArea,minimumTransverseArea,requiredCombinedTransverseArea,providedCombinedTransverseArea,sectionStress,sectionStressLimit,maxSpacing,maxTorsionSpacing,maxShearSpacing,scope:'solid rectangular, normal-weight, zero axial force, one shear plane; allocation and full detailing mandatory'};
}
export function evaluateReinforcedTorsionAt(model,member,section,detail,tuple,{preparedDetails}={}) {
 const nc=reason=>({status:'NOT_CHECKED',strengthStatus:'NOT_CHECKED',ratio:null,reason});
 if(detail.torsionDesignMode!=='solid-rectangular-45deg'||detail.concreteWeight!=='normal'||detail.stirrupForm!=='closed-rectangular-two-leg'||detail.stirrups?.legs!==2||detail.reinforcementForm!=='single-deformed')return nc('TORSION_REINFORCED_PROFILE_REQUIRED');
 if(!['N','Vy','Vz','T'].every(k=>Number.isFinite(tuple[k]))||Math.abs(tuple.N)>1e-9||Math.abs(tuple.Vy)>1e-9&&Math.abs(tuple.Vz)>1e-9)return nc('TORSION_ZERO_AXIAL_SINGLE_SHEAR_PLANE_REQUIRED');
 let allocation;try{allocation=torsionSteelAllocation(detail);}catch{return nc('TORSION_LONGITUDINAL_ALLOCATION_REQUIRED');}
 const swapped=Math.abs(tuple.Vz)>1e-9,coord=swapped?'z':'y',B=section.params[swapped?'H':'B']||(section.params.B),H=section.params[swapped?'B':'H']||section.params.B;
 const groups=[-1,1].map(sign=>detail.bars.filter(b=>sign*b[coord]>0));if(groups.some(g=>!g.length))return nc('BOTH_FACE_REINFORCEMENT_REQUIRED');
 const centers=groups.map(g=>g.reduce((s,b)=>s+b[coord]*b.area,0)/g.reduce((s,b)=>s+b.area,0)),d=Math.min(H/2-centers[0]*1000,H/2+centers[1]*1000);
 const concrete=resolveMaterialRecord(model,member.matId),steel=resolveMaterialRecord(model,detail.barMaterialId),ties=resolveMaterialRecord(model,detail.stirrupMaterialId||detail.barMaterialId),st=detail.stirrups;
 const result={...kdsReinforcedTorsion({B,H,fck:concrete?.strength?.concrete?.fck,fy:steel?.strength?.steel?.Fy,fyt:ties?.strength?.steel?.Fy,cover:detail.cover*1000,tieDiameter:st.diameter*1000,tieArea:(st.area??Math.PI*st.diameter**2/4)*1e6,spacing:st.spacing*1000,d,V:Math.abs(tuple[swapped?'Vz':'Vy']),T:Math.abs(tuple.T),longitudinalArea:allocation.reservedArea*1e6}),torsionSectionWidth:B,effectiveDepth:d,allocationFraction:allocation.fraction,reinforcementAllocation:'same fraction reserved from every longitudinal bar; deducted from member section strength',shearAxis:swapped?'z':'y',detailId:detail.id,detailVersion:detail.version,concurrentDemand:tuple};
 const perimeterDetail=torsionPerimeterDetail({B:section.params.B/1000,H:(section.params.H||section.params.B)/1000,cover:detail.cover,tieDiameter:st.diameter,insideRadius:detail.tieBendInsideRadius,spacing:st.spacing,bars:detail.bars},{preparedLayout:preparedDetails?.reinforcement?.[`${detail.id}@${detail.version}`]?.perimeterLayout});
 return {...result,perimeterDetail,...(perimeterDetail.status==='NG'&&result.status!=='NG'?{status:'NG',strengthRatio:result.ratio,ratio:Math.max(result.ratio??0,perimeterDetail.ratio??0),reason:'TORSION_LONGITUDINAL_DISTRIBUTION_NOT_SATISFIED'}:{}),codeReferences:[...(result.codeReferences||[]),...(perimeterDetail.codeReferences||[])]};
}
