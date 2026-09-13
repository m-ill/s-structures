// Borrowed read-only presentation views. Presence of prepared RC results is
// authoritative even when empty; fallback is only for older result payloads.
export const hasPreparedRcResults=analysis=>Object.hasOwn(analysis?.design||{},'practicalMemberResults');
export function selectRcMemberResults(analysis){
 return hasPreparedRcResults(analysis)?analysis.design.practicalMemberResults||{}:analysis?.design?.concrete?.memberResults||{};
}
export function selectMemberDesignResult(analysis,memberId,legacyFallback=null){
 return analysis?.design?.steel?.memberResults?.[memberId]||selectRcMemberResults(analysis)[memberId]||(hasPreparedRcResults(analysis)?null:legacyFallback);
}

export function selectRcDesign(analysis){
 if(!hasPreparedRcResults(analysis))return analysis?.design?.concrete??null;
 const summary=analysis.design.practicalRcSummary??null;
 return {memberResults:selectRcMemberResults(analysis),summary,ok:summary?.ok===true,basis:'provided-practical-checks'};
}
