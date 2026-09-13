import {arcBarContactCoverage} from './arcBarContactCoverage.js';
export function closureHookContactCoverage(detail,prepared){
 const closure=prepared?.outerHoop?.closureGeometry,hooks=closure?.hooks;
 const invalid=()=>({status:'NOT_CHECKED',reason:'CLOSURE_HOOK_ARC_REQUIRED',checks:[],commonBarIndices:[],fabricationApproved:false,methodReviewRequired:true});
 if(!Array.isArray(hooks)||hooks.length!==2)return invalid();
 const arcs=hooks.map(h=>h.primitives?.filter(p=>p.kind==='arc'));
 if(hooks.some(h=>h.status!=='OK')||arcs.some(a=>a?.length!==1))return invalid();
 const result=arcBarContactCoverage(detail,prepared,{arcs:arcs.map(a=>a[0]),diameter:closure.diameter});
 if(result.checks.length!==2)return {...result,commonBarIndices:[]};
 const checks=result.checks.map((c,i)=>({...c,hook:i===0?'start':'end'}));
 const commonBarIndices=checks[0].contactedBarIndices.filter(i=>checks[1].contactedBarIndices.includes(i));
 return {...result,status:commonBarIndices.length?'OK':'NOT_CHECKED',reason:commonBarIndices.length?null:'BOTH_CLOSURE_HOOKS_COMMON_BAR_CONTACT_REQUIRED',scope:'two closure hooks enclosing and contacting a common straight longitudinal path at every nominal station',checks,commonBarIndices};
}
