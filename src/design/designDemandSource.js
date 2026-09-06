export function designDemandSource(post, analysis) {
  return {
    resultPostprocessing: post.version,
    activeResultId: activeResultId(analysis),
  };
}

function activeResultId(analysis) {
  if (analysis?.pDelta?.envelope) return 'PDELTA_ENVELOPE';
  if (analysis?.envelope) return 'ENVELOPE';
  return Object.keys(analysis?.byCombo || {})[0] || null;
}
