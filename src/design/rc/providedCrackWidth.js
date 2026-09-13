import {solveCrackedElasticSection} from './crackedElasticSection.js';
import {crackWidthBasis,kdsCrackWidth} from './kdsCrackWidth.js';
import {toRcSectionDemand,RC_FRAME_CONVENTION_VERSION} from '../../core/rcFrameConvention.js';
import {resolveMaterialRecord} from '../../materials/registry.js';
import {prepareSustainedSectionStress} from './sustainedSectionStress.js';

export function evaluateCrackWidthStation(model,member,detail,tuple,{B,H},sourceSets){
 const base={...crackWidthBasis(),detailId:detail.id,detailVersion:detail.version,concurrentDemand:tuple,methodReviewRequired:true};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(!['flexural-member','compression-member'].includes(detail.memberRole)||detail.reinforcementForm!=='single-deformed'||detail.crackSpecialRequirements!=='ordinary-no-special-water-or-appearance'||detail.temperatureReinforcementRequired!==false)return nc('CRACK_WIDTH_ORDINARY_LONGITUDINAL_SCOPE_REQUIRED');
 if(!Number.isFinite(detail.crackEffectiveTensileStrength)||detail.crackEffectiveTensileStrength<=0||!detail.crackTensileStrengthReference?.trim()||!detail.crackSustainedLoadReference?.trim()||!Number.isFinite(detail.crackEvaluationFactor)||detail.crackEvaluationFactor<1)return nc('CRACK_WIDTH_MATERIAL_AND_SUSTAINED_BASIS_REQUIRED');
 if(!['dry','wet','corrosive','highly-corrosive'].includes(detail.crackWidthEnvironment))return nc('CRACK_WIDTH_ENVIRONMENT_REQUIRED');
 const combo=model.loadCombinations?.find(c=>c.id===detail.serviceSustainedComboId&&c.enabled!==false);
 if(combo?.type!=='service'||!Object.values(combo.factors||{}).some(v=>v>0)||Object.entries(combo.factors||{}).some(([id,v])=>!Number.isFinite(v)||v<0||v>1||v!==0&&!model.loadCases?.some(c=>c.id===id&&c.enabled!==false)))return nc('CRACK_WIDTH_SUSTAINED_COMBINATION_REQUIRED');
 const dead=(model.loadCases||[]).filter(c=>c.enabled!==false&&c.type==='dead');
 if(dead.some(c=>combo.factors?.[c.id]!==1))return nc('CRACK_WIDTH_SUSTAINED_DEAD_LOAD_REQUIRED');
 if(tuple.comboId!==combo.id){
  if(!sourceSets?.[combo.id]?.ok||sourceSets[combo.id].combo?.id!==combo.id)return nc('CRACK_WIDTH_SUSTAINED_RESULT_REQUIRED');
  return {...base,status:'N_A',ratio:null,reason:'CRACK_WIDTH_OWNED_BY_SUSTAINED_COMBINATION',applicability:{requiredCompanion:{comboId:combo.id,memberId:member.id,checkId:'rc-serviceability'}}};
 }
 const source=sourceSets?.[combo.id],timeEffect=source?.stiffnessProvenance?.timeEffect;
 let sustainedStress=null;
 if(['sustained-effective-modulus','attachment-effective-modulus'].includes(timeEffect)){
  const preparedSectionStress=prepareSustainedSectionStress(model,member,detail,tuple,{B,H},source);
  if(!preparedSectionStress.ok||preparedSectionStress.initialStrains.concrete!==0)return {...nc(preparedSectionStress.ok?'CRACK_WIDTH_SHRINKAGE_MEAN_STRAIN_REQUIRED':'CRACK_WIDTH_TIME_DEPENDENT_SECTION_STRESS_REQUIRED'),incomplete:true,sourceTimeEffect:timeEffect,appliedCreepEffect:source.creepEffects?.[member.id]??null,preparedSectionStress,scope:'same-state sustained section stress prepared; differential shrinkage mean crack strain remains'};
  sustainedStress=preparedSectionStress;
 }
 let demand;try{demand=toRcSectionDemand(tuple);}catch(error){return nc(error.code);}
 const concrete=resolveMaterialRecord(model,member.matId),steel=resolveMaterialRecord(model,detail.barMaterialId),Ec=concrete?.elastic?.E,Es=steel?.elastic?.E,fy=steel?.strength?.steel?.Fy;
 if(!Number.isFinite(fy)||fy<=0)return nc('CRACK_WIDTH_STEEL_STRENGTH_REQUIRED');
 // The appendix effective tension area here has a neutral axis parallel to a face.
 // Biaxial demand must use a separate verified effective-area construction.
 if(Math.abs(demand.My)>1e-8&&Math.abs(demand.Mz)>1e-8)return nc('CRACK_WIDTH_BIAXIAL_EFFECTIVE_AREA_REQUIRED');
 const rotate=Math.abs(demand.My)>Math.abs(demand.Mz),height=rotate?B:H,width=rotate?H:B;
 const bars=detail.bars?.map(b=>({...b,y:rotate?-b.z:b.y,z:rotate?b.y:b.z}));
 if(!bars?.length||bars.some(b=>!Number.isFinite(b.diameter)||b.diameter<=0))return nc('CRACK_WIDTH_BAR_DIAMETER_REQUIRED');
 const local={N:demand.N,My:0,Mz:rotate?demand.My:demand.Mz};
 const section=sustainedStress?(rotate?{...sustainedStress,strain:[sustainedStress.strain[0],-sustainedStress.strain[2],sustainedStress.strain[1]],recovered:{N:sustainedStress.recovered.N,My:-sustainedStress.recovered.Mz,Mz:sustainedStress.recovered.My}}:sustainedStress):solveCrackedElasticSection({B:width/1000,H:height/1000,Ec,Es,bars,demand:local,includeBarForces:true});
 if(!section.ok)return nc(section.reason);
 const trace={sectionDemand:{N:demand.N,My:demand.My,Mz:demand.Mz},frameConventionVersion:RC_FRAME_CONVENTION_VERSION,sectionResponse:{strain:section.strain,recovered:section.recovered,residual:section.residual,version:section.version,basis:section.basis},axis:rotate?'local-z':'local-y',sustainedComboId:combo.id,tensileStrengthReference:detail.crackTensileStrengthReference,sustainedLoadReference:detail.crackSustainedLoadReference};
 const stresses=bars.map((b,i)=>section.steelForces[i]/(b.area*1000));
 if(sustainedStress)Object.assign(trace,{preparedSectionStress:sustainedStress,sourceTimeEffect:timeEffect,appliedCreepEffect:sustainedStress.appliedCreepEffect,sectionConcreteModulus:sustainedStress.appliedConcreteModulus,meanStrainConcreteModulus:Ec,meanStrainBasis:'appendix Eq.4.1-7 with sustained cracked-section steel stress; modular ratio Es/material Ec; effective-modulus method review separate'});
 if(stresses.some(s=>Math.abs(s)>fy))return {...nc('CRACK_WIDTH_ELASTIC_STEEL_RANGE_EXCEEDED'),...trace};
 const [e,secondaryCurvature,curvature]=section.strain,edge=[e-curvature*height/2000,e+curvature*height/2000];
 const corners=edge.flatMap(v=>[v-secondaryCurvature*width/2000,v+secondaryCurvature*width/2000]);
 const fc=concrete?.strength?.concrete?.fck;
 if(!Number.isFinite(fc)||fc<=0||-Math.min(...corners)*(sustainedStress?.appliedConcreteModulus??Ec)>fc)return {...nc('CRACK_WIDTH_ELASTIC_CONCRETE_RANGE_EXCEEDED'),...trace};
 if(Math.max(...corners)<=0)return {...base,...trace,status:'OK',reason:null,ratio:0,demand:0,capacity:null,units:{length:'mm'},scope:'no longitudinal tensile strain under selected sustained demand; shrinkage and thermal effects excluded',tensileZone:false};
 const strainRoundoff=64*Number.EPSILON*Math.max(1e-15,...corners.map(Math.abs));
 if(Math.abs(secondaryCurvature)*width/2000>strainRoundoff)return {...nc('CRACK_WIDTH_BIAXIAL_EFFECTIVE_AREA_REQUIRED'),...trace};
 const signs=edge[0]>0&&edge[1]>0?[-1,1]:[edge[1]>0?1:-1],checks=[];
 for(const sign of signs){
  const tension=bars.map((b,i)=>({...b,stress:stresses[i]})).filter(b=>b.y*sign>=0&&b.stress>0);
  if(!tension.length)return {...nc('CRACK_WIDTH_TENSION_REINFORCEMENT_REQUIRED'),...trace,tensionFace:sign,reinforcementDiagnostic:{tensionFace:sign,steelStresses:stresses,barDepthsFromFace:bars.map(b=>height/2-b.y*sign*1000),units:{length:'mm',stress:'MPa'},automaticRepairQualified:false}};
  const extreme=Math.max(...tension.map(b=>b.y*sign)),outer=tension.filter(b=>Math.abs(b.y*sign-extreme)<1e-9).sort((a,b)=>a.z-b.z);
  const neutralAxis=edge.every(v=>v>=0)?0:height/2-e/(Math.abs(curvature))*1000;
  const effectiveDepth=height/2+tension.reduce((s,b)=>s+b.area*b.y*sign*1000,0)/tension.reduce((s,b)=>s+b.area,0);
  const effectiveZone=Math.min(2.5*(height-effectiveDepth),neutralAxis===0?height/2:(height-neutralAxis)/3);
  // Appendix symbol As is the flexural tension reinforcement area (sort140),
  // Eq.4.1-5 divides it by Acte. Eq.4.1-6 reduces the concrete area, not As;
  // do not discard tension bars whose centres fall outside dcte.
  const tensileSteelArea=tension.reduce((s,b)=>s+b.area*1e6,0);
  const reinforcementDiagnostic={tensionFace:sign,neutralAxis,effectiveDepth,effectiveZone,tensileSteelArea,barDepthsFromFace:tension.map(b=>height/2-b.y*sign*1000),steelStresses:tension.map(b=>b.stress),areaBasis:'KDS142030:2021 appendix symbol As and Eq.4.1-5; tension reinforcement before concrete effective-depth reduction',units:{length:'mm',stress:'MPa',area:'mm2'},automaticRepairQualified:false};
  const diameter=tension.reduce((s,b)=>s+b.diameter**2,0)/tension.reduce((s,b)=>s+b.diameter,0)*1000;
  const cover=Math.min(...outer.map(b=>Math.min(height/2-Math.abs(b.y)*1000,width/2-Math.abs(b.z)*1000)-b.diameter*500));
  const spacing=outer.length===1?width:Math.max(...outer.slice(1).map((b,i)=>(b.z-outer[i].z)*1000));
  const loadCoefficient=edge.every(v=>v>=0)?(Math.max(...edge)+Math.min(...edge))/(2*Math.max(...edge)):.5;
  checks.push({...kdsCrackWidth({cover,diameter,spacing,H:height,neutralAxis,effectiveDepth,steelArea:tensileSteelArea,width,steelStress:Math.max(...tension.map(b=>b.stress)),Es,Ec,effectiveTensileStrength:detail.crackEffectiveTensileStrength,environment:detail.crackWidthEnvironment,loadCoefficient,evaluationFactor:detail.crackEvaluationFactor}),tensionFace:sign,neutralAxis,effectiveDepth,reinforcementDiagnostic});
 }
 const worst=checks.find(c=>c.status==='NOT_CHECKED')||checks.reduce((a,b)=>a.ratio>=b.ratio?a:b);
 return {...worst,...base,...trace,status:worst.status,reason:worst.reason,checks};
}
