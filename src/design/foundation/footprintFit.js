import {readFootprintLimits,FOOTPRINT_LIMIT_FIELDS} from '../../metadata/footprintLimits.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
export function evaluateFootprintFit(footing){
 const base={qualification:'explicit-project-geometry-constraint',methodReviewRequired:true,siteFitVerified:false,designTransferAllowed:false,codeReferences:getKcscRuleSources(['142070']).map(r=>({...r,clause:'4.2.1'})),scope:'B/L versus explicitly provided limits at the current location and orientation; no cadastral boundary, setback, neighbor collision or excavation validation'};
 let limits;try{limits=readFootprintLimits(footing);}catch{}
 if(!limits)return {...base,status:'NOT_CHECKED',ratio:null,reason:'FOOTPRINT_LIMIT_INPUT_REQUIRED',blockerKind:'input-required',requiredInputFields:FOOTPRINT_LIMIT_FIELDS,inputTargets:[{type:'foundation-record',id:footing.id,version:footing.version}]};
 if(![footing.B,footing.L].every(v=>Number.isFinite(v)&&v>0))return {...base,status:'NOT_CHECKED',ratio:null,reason:'FOOTPRINT_DIMENSIONS_REQUIRED'};
 const axes=['B','L'].map(axis=>({axis,demand:footing[axis],capacity:limits[axis],ratio:Number.isFinite(footing[axis]/limits[axis])?footing[axis]/limits[axis]:null,status:footing[axis]>limits[axis]?'NG':'OK'}));
 const failed=axes.some(a=>a.status==='NG');
 return {...base,status:failed?'NG':'OK',ratio:axes.every(a=>a.ratio!==null)?Math.max(...axes.map(a=>a.ratio)):null,axisChecks:axes,reason:failed?'FOOTPRINT_DECLARED_LIMIT_EXCEEDED':null,reference:limits.reference,units:{dimensions:'m'}};
}
