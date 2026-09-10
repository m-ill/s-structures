// Pure selection contract shared by numbers, plots, and the native canvas.
export function resultCanDisplay(result) {
  return !!result && result.ok !== false && !['failed','cancelled','stale','running','unsupported','not-run','interrupted'].includes(result.status);
}
export function latestDisplayResult(target, caseId) {
  const analysisCase = target.SStructuresEngine?.getAnalysisCases?.().find(row => row.id === caseId);
  const latest = target.__SStructuresAnalysisLatestAttempts?.[caseId] || target.__SStructuresAnalysisResults?.[caseId] || null;
  if (['running','stale','cancelled','interrupted'].includes(analysisCase?.status)) return {caseId,kind:analysisCase.kind,status:analysisCase.status,ok:false};
  return latest;
}
export function selectStaticResult(payload = {}, comboId = null) {
  const second = payload.pDelta?.enabled === true;
  const family = second ? payload.pDelta : payload;
  const ids = Object.keys(family.byCombo || {});
  const selected = comboId || (ids.length === 1 ? ids[0] : 'ENVELOPE');
  const entry = selected === 'ENVELOPE' ? family.envelope : family.byCombo?.[selected];
  const result = second && selected !== 'ENVELOPE' ? entry?.result : entry;
  return { comboId: selected, method: second ? family.method || 'legacy' : 'off',
    available: !!result && result.ok !== false, result: result?.ok === false ? null : result || null };
}
