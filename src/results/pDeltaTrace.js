import { traceStatus } from './advancedTraceUtils.js';
import { buildAnalysisCriteriaTrace, resolveCriterion } from '../core/analysisCriteria.js';

export function buildPDeltaTrace(model, analysis) {
  const settings = model?.analysisSettings || {};
  const criteria = buildAnalysisCriteriaTrace(model);
  const pDelta = analysis?.pDelta || null;
  const direct = analysis?.pDeltaDirect || analysis?.secondOrderPDelta || null;
  return {
    enabled: !!pDelta || !!direct,
    status: traceStatus(!!pDelta || !!direct, !!(pDelta?.ok || direct?.ok)),
    method: 'secondary-load-iteration solver; load-step curves split into global, story, and member P-Delta views',
    directMethod: direct ? 'geometric-stiffness-second-order-direct' : null,
    settings: {
      maxIterations: resolveCriterion(model, 'pdelta.maxIter', settings.pDeltaMaxIterations || 12),
      tolerance: resolveCriterion(model, 'pdelta.eR', settings.pDeltaTolerance || 1e-4),
      displacementTolerance: resolveCriterion(model, 'pdelta.eU', settings.pDeltaTolerance || 1e-4),
      energyTolerance: resolveCriterion(model, 'pdelta.eE', settings.pDeltaTolerance || 1e-8),
      maxAmplification: resolveCriterion(model, 'pdelta.ampLimit', settings.pDeltaMaxAmplification || 2.5),
      curveSteps: settings.pDeltaCurveSteps || settings.pDeltaLoadSteps || 5,
      thetaCaution: resolveCriterion(model, 'pdelta.thetaCaution', settings.pDeltaThetaNegligible || 0.05),
      thetaRequire: resolveCriterion(model, 'pdelta.thetaRequire', 0.1),
      thetaStrong: resolveCriterion(model, 'pdelta.thetaStrong', settings.pDeltaThetaLimit || 0.2),
      criteriaPreset: criteria.preset,
    },
    criteria,
    summary: pDelta?.summary || null,
    direct: direct ? {
      version: direct.version,
      method: direct.method,
      converged: !!direct.converged,
      reason: direct.reason,
      amplification: direct.amplification,
      loadStepCount: direct.loadStepCount,
      iterationCount: direct.iterations?.length || 0,
      split: direct.split || null,
      notes: direct.notes || [],
    } : null,
    design: pDelta?.design || null,
    curves: pDelta?.curves || null,
    combos: Object.entries(pDelta?.byCombo || {}).map(([comboId, item]) => ({
      comboId,
      converged: !!item.converged,
      reason: item.reason || null,
      amplification: item.amplification || 1,
      iterationCount: item.iterations?.length || 0,
      iterations: item.iterations || [],
      curve: item.curve || null,
    })),
  };
}
