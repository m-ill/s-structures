import { traceStatus } from './advancedTraceUtils.js';

export function buildPDeltaTrace(model, analysis) {
  const settings = model?.analysisSettings || {};
  const pDelta = analysis?.pDelta || null;
  return {
    enabled: !!pDelta,
    status: traceStatus(!!pDelta, !!pDelta?.ok),
    method: 'iterative secondary lateral load from axial force and drift',
    settings: {
      maxIterations: settings.pDeltaMaxIterations || 12,
      tolerance: settings.pDeltaTolerance || 1e-4,
      maxAmplification: settings.pDeltaMaxAmplification || 2.5,
    },
    summary: pDelta?.summary || null,
    combos: Object.entries(pDelta?.byCombo || {}).map(([comboId, item]) => ({
      comboId,
      converged: !!item.converged,
      reason: item.reason || null,
      amplification: item.amplification || 1,
      iterationCount: item.iterations?.length || 0,
      iterations: item.iterations || [],
    })),
  };
}
