import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
export const CRACK_WIDTH_VERSION='p25-kds-appendix-crack-width-v1';
export function crackWidthBasis(){
 return {version:CRACK_WIDTH_VERSION,codeReferences:getKcscRuleSources(['142030']).map(r=>({...r,clause:'4.1.1; 4.1.2; 4.1.3; Eq.4.1-1..7; Table 4.1-1 (Appendix)',documentPart:'appendix'})),qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
}
// KDS 14 20 30:2021 appendix. All section dimensions are mm; stresses MPa.
// Effective tensile strength and evaluation factor are explicit project inputs.
export function kdsCrackWidth({cover,diameter,spacing,H,neutralAxis,effectiveDepth,steelArea,width,steelStress,Es,Ec,effectiveTensileStrength,environment,loadCoefficient,evaluationFactor}={}){
 const base=crackWidthBasis(),nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(!Number.isFinite(evaluationFactor)||evaluationFactor<1)return nc('CRACK_WIDTH_EVALUATION_FACTOR_REQUIRED');
 if(![cover,diameter,spacing,H,effectiveDepth,steelArea,width,steelStress,Es,Ec,effectiveTensileStrength,evaluationFactor].every(v=>Number.isFinite(v)&&v>0)||Es<=Ec||!Number.isFinite(neutralAxis)||neutralAxis<0||neutralAxis>=H||effectiveDepth>=H||!Number.isFinite(loadCoefficient)||loadCoefficient<.5||loadCoefficient>1)return nc('CRACK_WIDTH_SECTION_INPUT_REQUIRED');
 const limits={dry:[.4,.006],wet:[.3,.005],corrosive:[.3,.004],'highly-corrosive':[.3,.0035]};
 if(!Object.hasOwn(limits,environment))return nc('CRACK_WIDTH_ENVIRONMENT_REQUIRED');
 const effectiveConcreteDepth=Math.min(2.5*(H-effectiveDepth),neutralAxis===0?H/2:(H-neutralAxis)/3);
 const effectiveConcreteArea=width*effectiveConcreteDepth,effectiveRatio=steelArea/effectiveConcreteArea;
 if(!(effectiveRatio>0&&effectiveRatio<1))return nc('CRACK_WIDTH_EFFECTIVE_AREA_INVALID');
 const spacingThreshold=5*(cover+diameter/2),spacingEquation=spacing<=spacingThreshold?'4.1-3':'4.1-4';
 const meanSpacing=spacing<=spacingThreshold?2*cover+.25*.8*loadCoefficient*diameter/effectiveRatio:.75*(H-neutralAxis);
 const modularRatio=Es/Ec,steelStrain=steelStress/Es;
 const meanStrainDifference=Math.max(steelStrain-.4*effectiveTensileStrength/(Es*effectiveRatio)*(1+modularRatio*effectiveRatio),.6*steelStrain);
 const demand=evaluationFactor*meanSpacing*meanStrainDifference,capacity=Math.max(limits[environment][0],limits[environment][1]*cover),ratio=demand/capacity;
 if(![effectiveConcreteDepth,effectiveConcreteArea,effectiveRatio,meanSpacing,meanStrainDifference,demand,capacity,ratio].every(Number.isFinite))return nc('CRACK_WIDTH_RESULT_NONFINITE');
 return {...base,status:ratio>1?'NG':'OK',reason:null,ratio,demand,capacity,effectiveConcreteDepth,effectiveConcreteArea,effectiveRatio,meanSpacing,meanStrainDifference,spacingThreshold,spacingEquation,modularRatio,loadCoefficient,evaluationFactor,effectiveTensileStrength,steelStress,environment,units:{length:'mm',stress:'MPa'},scope:'deformed-rebar sustained-load longitudinal crack width; thermal, shrinkage, water-tightness and orthogonal reinforcement separate'};
}
