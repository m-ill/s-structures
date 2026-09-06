import { buildAdvancedElasticTrace } from '../results/advancedElasticTrace.js';

export const PDELTA_PRACTICE_VALIDATION_VERSION = 'p2-t25-t26-pdelta-validation';

export function buildPDeltaPracticeValidation(model, analysis) {
  const trace = buildAdvancedElasticTrace(model, analysis);
  const pDelta = trace.pDelta;
  const failed = pDelta.combos.filter((row) => !row.converged);
  const high = pDelta.combos.filter((row) => row.amplification > pDelta.settings.maxAmplification);
  const curveCombos = pDelta.curves?.combos || [];
  const missingCurves = pDelta.enabled && !curveCombos.length;
  const designTier = pDelta.design?.summary?.status || 'N/A';
  const designStatus = pDelta.design?.summary?.statusLegacy || designTier;
  const status = !pDelta.enabled ? 'WARN'
    : failed.length || designStatus === 'NG' ? 'NG'
      : high.length || missingCurves || designStatus === 'WARN' ? 'WARN'
        : 'OK';
  return {
    version: PDELTA_PRACTICE_VALIDATION_VERSION,
    tickets: ['T25', 'T26'],
    status,
    enabled: pDelta.enabled,
    method: pDelta.method,
    settings: pDelta.settings,
    comboCount: pDelta.combos.length,
    convergedCount: pDelta.combos.filter((row) => row.converged).length,
    curveComboCount: curveCombos.length,
    designStatus,
    designTier,
    designRowCount: pDelta.design?.rows?.length || 0,
    designStoryRowCount: pDelta.design?.storyRows?.length || 0,
    designMaxTheta: pDelta.design?.summary?.maxTheta || 0,
    designMaxBDelta: pDelta.design?.summary?.maxBDelta || 1,
    maxStoryStabilityIndex: Math.max(0, ...curveCombos.map((row) => row.summary?.maxStoryStabilityIndex || 0)),
    maxMemberAxialRatio: Math.max(0, ...curveCombos.map((row) => row.summary?.maxMemberAxialRatio || 0)),
    failedComboIds: failed.map((row) => row.comboId),
    highAmplificationComboIds: high.map((row) => row.comboId),
    missingCurves,
  };
}
