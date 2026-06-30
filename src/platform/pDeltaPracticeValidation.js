import { buildAdvancedElasticTrace } from '../results/advancedElasticTrace.js';

export const PDELTA_PRACTICE_VALIDATION_VERSION = 'p2-t25-t26-pdelta-validation';

export function buildPDeltaPracticeValidation(model, analysis) {
  const trace = buildAdvancedElasticTrace(model, analysis);
  const pDelta = trace.pDelta;
  const failed = pDelta.combos.filter((row) => !row.converged);
  const high = pDelta.combos.filter((row) => row.amplification > pDelta.settings.maxAmplification);
  const status = !pDelta.enabled ? 'WARN' : failed.length ? 'NG' : high.length ? 'WARN' : 'OK';
  return {
    version: PDELTA_PRACTICE_VALIDATION_VERSION,
    tickets: ['T25', 'T26'],
    status,
    enabled: pDelta.enabled,
    method: pDelta.method,
    settings: pDelta.settings,
    comboCount: pDelta.combos.length,
    convergedCount: pDelta.combos.filter((row) => row.converged).length,
    failedComboIds: failed.map((row) => row.comboId),
    highAmplificationComboIds: high.map((row) => row.comboId),
  };
}
