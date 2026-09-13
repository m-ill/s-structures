// Admission for design methods based on the unshifted member centreline.
// This does not resolve rigid-arm transforms or replace solver validation.
export function requiresOffsetAwareDesign(member={}){
 if(member.offsets||member.offsetI!==undefined||member.offsetJ!==undefined)return true; // Preserve rejection of legacy ambiguous inputs.
 const insertion=member.insertionPoint;
 if(insertion!=null&&(typeof insertion==='string'?insertion:insertion.position)!=='centroid')return true;
 const offset=member.endOffset;if(offset==null)return false;
 if(typeof offset!=='object'||Array.isArray(offset)||!['local','global'].includes(offset.frame??'local')||!Number.isFinite(offset.rigidFactor??1)||Math.abs((offset.rigidFactor??1)-1)>1e-12)return true;
 return ['i','j'].some(end=>{
  const value=offset[end];if(value==null)return false;if(typeof value==='number')return value!==0;
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['dx','dy','dz'].includes(k)))return true;
  return ['dx','dy','dz'].some(k=>(value[k]??0)!==0);
 });
}
