export const RESULT_POSTPROCESSING_VERSION = 'p2-m6-result-postprocessing';

export function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function resultEntries(analysis) {
  const rows = Object.entries(analysis?.byCombo || {})
    .filter(([, result]) => result?.ok && result?.anyOk);
  if (rows.length) return rows;
  return analysis?.envelope ? [['ENVELOPE', analysis.envelope]] : [];
}

export function comboFactors(result) {
  return result?.combo?.factors || {};
}

export function factorFor(factors = {}, caseId = 'LC1') {
  return finite(factors[caseId], 0);
}
