import {RC_LAP_DESIGN_LIMITS} from '../../metadata/rcLapDesignCapabilities.js';
export const MAX_SPLICE_REFINEMENT_PASSES=RC_LAP_DESIGN_LIMITS.maxRefinementPasses;
export function classALengthDeficits(checks){
 let count=0;for(const c of checks)if(c.checkId==='rc-splices'&&c.status==='NG')for(const r of c.checks||[])if(r.status==='NG'&&r.classAProof?.status==='OK'&&Number.isFinite(r.requiredLength)&&Number.isFinite(r.providedLength)&&r.requiredLength>r.providedLength+1e-10)count++;
 return count;
}
export function spliceRefinementState(enabled,trace,checks){
 const remainingLengthChecks=classALengthDeficits(checks),performedPasses=trace.filter(r=>r.ok).length,last=trace.at(-1);
 const status=!enabled?'NOT_REQUESTED':!remainingLengthChecks?(performedPasses?'RESOLVED_LENGTH_ONLY':'NO_QUALIFIED_LENGTH_DEFICIT'):performedPasses>=MAX_SPLICE_REFINEMENT_PASSES?'PASS_LIMIT':last?.ok===false?'UNRESOLVED':'PENDING';
 return {status,performedPasses,attemptedPasses:trace.length,maximumPasses:MAX_SPLICE_REFINEMENT_PASSES,remainingLengthChecks,reason:status==='UNRESOLVED'?last.reason??'SPLICE_REPAIR_UNAVAILABLE':null,wholeDesignQualified:false,basis:'current calculated A-class length deficits only; spacing, other checks and unproven A-class cases remain separate'};
}
