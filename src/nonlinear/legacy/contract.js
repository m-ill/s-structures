import {
  NONLINEAR_CAPABILITY_VERSION,
  NONLINEAR_ENGINE_IDS,
  getNonlinearCapability,
} from '../capabilities.js';

export const LEGACY_NONLINEAR_RESULT_VERSION = 'p8-m0-legacy-nonlinear-result-v1';
export const LEGACY_PUSHOVER_ENGINE_ID = NONLINEAR_ENGINE_IDS.legacyPushover;
export const LEGACY_SDOF_NLTH_ENGINE_ID = NONLINEAR_ENGINE_IDS.legacySdofNlth;

export function qualifyLegacyNonlinearResult(result = {}, options = {}) {
  const engineId = options.engineId;
  const capability = getNonlinearCapability(engineId);
  if (!capability || capability.production || capability.qualification !== 'legacy-preliminary') {
    const error = new Error(`Legacy result qualification requires a registered legacy engine: ${engineId || '(missing)'}`);
    error.code = 'LEGACY_NONLINEAR_ENGINE_INVALID';
    throw error;
  }
  const limitations = unique([
    ...(capability.limitations || []),
    ...(result.limitations || []),
    ...(options.limitations || []),
  ]);
  const failed = result.ok === false
    || result.converged === false
    || result.status === 'failed'
    || (result.warnings || []).some((warning) => warning?.code === 'PUSHOVER_STEP_FAILED');
  const requestedControl = options.requestedControl || result.requestedControl || null;
  const executedControl = options.executedControl || capability.formulation?.control || null;
  const designBlockReason = options.designBlockReason || 'LEGACY_NONLINEAR_ENGINE';
  return {
    ...result,
    ok: !failed,
    status: failed ? 'failed' : 'completed',
    qualification: 'legacy-preliminary',
    designBlocked: true,
    designBlockReason,
    modelBound: capability.modelBound,
    engine: {
      id: capability.engineId,
      version: options.engineVersion || result.version || null,
      capabilityVersion: NONLINEAR_CAPABILITY_VERSION,
      formulation: capability.formulation,
    },
    executionControl: requestedControl || executedControl ? {
      requested: requestedControl,
      executed: executedControl,
      intentOnly: Boolean(requestedControl && requestedControl !== executedControl),
    } : null,
    algorithm: options.algorithm || result.method || capability.formulation?.equilibrium || null,
    capability,
    routing: {
      requestedEngineId: engineId,
      executedEngineId: engineId,
      fallbackPolicy: 'forbidden',
      fallbackUsed: false,
    },
    review: {
      ...(result.review || {}),
      status: failed ? 'failed' : 'review-required',
      productionReady: false,
      designBlockReason,
    },
    designTransfer: {
      allowed: false,
      reason: designBlockReason,
    },
    limitations,
    legacy: {
      version: LEGACY_NONLINEAR_RESULT_VERSION,
      isolated: true,
      automaticProductionFallback: false,
    },
    legacyCompatibility: {
      api: options.api || null,
      resultShapeVersion: options.resultShapeVersion || result.version || null,
      numericFieldsPreserved: true,
    },
  };
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}
