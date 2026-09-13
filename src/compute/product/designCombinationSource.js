// Select the actual solver result; never substitute first-order data for Direct.
export function selectDesignCombination(payload,comboId,method) {
 if(payload?.pDeltaMethod&&payload.pDeltaMethod!==method)return null;
 if(method==='direct') {
  const run=payload?.pDelta?.byCombo?.[comboId];
  if(payload?.pDelta?.method!=='direct'||!payload.pDelta.ok||!run?.ok||!run.converged||!run.result?.ok||!run.result.anyOk)return null;
  return run.result;
 }
 return method==='off'&&(!payload?.pDelta?.method||payload.pDelta.method==='off')?payload?.byCombo?.[comboId]||null:null;
}
