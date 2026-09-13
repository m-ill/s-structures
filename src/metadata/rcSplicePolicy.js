import {validDirectMomentComparison} from './directMomentComparisonPolicy.js';
export const RC_SPLICE_MODEL_VERSION='p25-rc-splice-model-solve-v24-winkler-comparison-policy';
export const RC_SPLICE_BASE_WORKING_BYTES=32*1024**2;
export const RC_SPLICE_COMPARISON_WORKING_BYTES=16*1024**2;
// Admission estimates, not measured heap. Covers temporary first-order segment
// records, original-member recovery and bounded comparison candidates/copies.
export function rcSpliceWorkingBytes(model){return RC_SPLICE_BASE_WORKING_BYTES+(model?.analysisSettings?.pDeltaMethod==='direct'?RC_SPLICE_COMPARISON_WORKING_BYTES:0);}

export function validRcSpliceSecondOrder(result){
 const method=result.pDeltaMethod??'off';
 if(method==='off')return result.pDeltaIncluded!==true;
 if(method!=='direct'||result.pDeltaIncluded!==true||!validDirectMomentComparison(result))return false;
 const rows=result.secondOrderTrace;
 if(!Array.isArray(rows)||rows.length<2||rows.length>30)return false;
 if(rows.some((r,i)=>!r||r.iteration!==i||!Number.isFinite(r.axialChange)||r.axialChange<0||!Number.isFinite(r.equilibriumResidual)||r.equilibriumResidual<0||i>0&&(!Number.isFinite(r.displacementChange)||r.displacementChange<0)))return false;
 return ['axialChange','displacementChange','equilibriumResidual'].every(k=>rows.at(-1)[k]<=1e-10);
}

export const RC_SPATIAL_ABSOLUTE_TOLERANCES=Object.freeze({stressMPa:1e-9,forceKN:1e-10,slipM:1e-12});
export function validRcSpliceSpatialProof(result,{requireFrame=true}={}){
 const absolute=result.spatialAbsoluteTolerances;
 if(!absolute||Array.isArray(absolute)||Object.keys(absolute).length!==3||Object.entries(RC_SPATIAL_ABSOLUTE_TOLERANCES).some(([key,value])=>absolute[key]!==value))return false;
 const valid=(trace,tolerance,fields)=>Array.isArray(trace)&&trace.length>=2&&trace.length<=4&&tolerance===.002&&trace.every((row,i)=>row&&fields.every(k=>i===0?row[k]==null:Number.isFinite(row[k])&&row[k]>=0))&&fields.every(k=>Number.isFinite(trace.at(-1)[k])&&trace.at(-1)[k]>=0&&trace.at(-1)[k]<=tolerance);
 if(result.stressIntegrationConvergenceVerified!==true||!valid(result.spatialTrace,result.spatialTolerance,['change','displacementChange','stressChange','slipChange']))return false;
 if(requireFrame&&result.frameRefinement?.convergenceVerified!==true)return false;
 return !result.frameRefinement?.convergenceVerified||valid(result.frameTrace,result.frameRefinement.tolerance,['change']);
}
export function rcSpatialRelativeChange(a,b,quantity){
 const absolute=RC_SPATIAL_ABSOLUTE_TOLERANCES[quantity];
 if(!Number.isFinite(a)||!Number.isFinite(b)||absolute===undefined)throw Error('RC_SPATIAL_COMPARISON_INVALID');
 return Math.abs(a-b)/Math.max(absolute/.002,Math.abs(a),Math.abs(b));
}
