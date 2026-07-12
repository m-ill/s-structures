import {
  NONLINEAR_CASE_KINDS,
  NONLINEAR_ENGINE_IDS,
  evaluateNonlinearCapability,
} from './capabilities.js';
import { runLegacyPreliminaryPushover } from './legacy/preliminaryPushover.js';
import { runLegacySdofNewmarkTrace } from './legacy/sdofNewmarkTrace.js';

export const NONLINEAR_ANALYSIS_ROUTER_VERSION = 'p8-m0-nonlinear-analysis-router-v1';

const DEFAULT_ADAPTERS = Object.freeze({
  [NONLINEAR_ENGINE_IDS.legacyPushover]: runLegacyPreliminaryPushover,
  [NONLINEAR_ENGINE_IDS.legacySdofNlth]: (_model, settings) => runLegacySdofNewmarkTrace(settings),
});

export function validateNonlinearAnalysisCase(analysisCase = {}, settings = {}) {
  const kind = analysisCase.kind;
  if (!NONLINEAR_CASE_KINDS.has(kind)) {
    return { ok: false, code: 'NONLINEAR_CASE_REQUIRED', message: `Analysis case ${kind || '(missing)'} is not nonlinear.` };
  }
  const engineId = typeof analysisCase.engineId === 'string' ? analysisCase.engineId.trim() : '';
  if (!engineId) {
    return {
      ok: false,
      code: 'NONLINEAR_ENGINE_REQUIRED',
      message: 'Nonlinear analysis case requires an explicit engineId.',
      engineId: null,
      capability: null,
    };
  }
  const decision = evaluateNonlinearCapability({ kind, engineId });
  if (!decision.ok) return decision;
  const requestedControl = normalizeRequestedControl(kind, analysisCase, settings);
  if (requestedControl && !decision.capability.supportedControls.includes(requestedControl)) {
    return {
      ok: false,
      code: 'NONLINEAR_CAPABILITY_UNSUPPORTED',
      message: `Engine ${engineId} does not execute ${requestedControl} control.`,
      engineId,
      capability: decision.capability,
      requestedControl,
    };
  }
  return { ...decision, requestedControl };
}

export function runNonlinearAnalysisCase(model, analysisCase = {}, settings = {}, options = {}) {
  const validation = validateNonlinearAnalysisCase(analysisCase, settings);
  if (!validation.ok) return blockedResult(analysisCase, validation);
  const adapters = options.nonlinearAdapters || DEFAULT_ADAPTERS;
  const adapter = adapters[validation.engineId];
  if (typeof adapter !== 'function') {
    return blockedResult(analysisCase, {
      ...validation,
      ok: false,
      code: validation.capability?.production ? 'PRODUCTION_BACKEND_UNAVAILABLE' : 'NONLINEAR_ENGINE_NOT_AVAILABLE',
      message: `Execution adapter is unavailable for ${validation.engineId}.`,
    });
  }
  try {
    const result = adapter(model, {
      ...settings,
      requestedControl: validation.requestedControl,
    });
    return {
      ...result,
      routing: {
        requestedEngineId: validation.engineId,
        executedEngineId: result?.engine?.id || validation.engineId,
        fallbackPolicy: 'forbidden',
        fallbackUsed: false,
        routerVersion: NONLINEAR_ANALYSIS_ROUTER_VERSION,
      },
    };
  } catch (error) {
    return blockedResult(analysisCase, {
      ...validation,
      ok: false,
      code: 'NONLINEAR_ENGINE_FAILED',
      message: error?.message || String(error),
    }, 'failed');
  }
}

function blockedResult(analysisCase, decision, status = 'unsupported') {
  const capability = decision.capability || null;
  const engineId = decision.engineId || analysisCase.engineId || null;
  return {
    ok: false,
    status,
    qualification: status === 'failed' ? 'invalid' : capability?.qualification || 'unsupported',
    designBlocked: true,
    designBlockReason: decision.code,
    modelBound: capability?.modelBound ?? null,
    reason: decision.code,
    message: decision.message,
    engine: {
      id: engineId,
      version: null,
      capabilityVersion: capability?.version || null,
      formulation: capability?.formulation || analysisCase.formulation || null,
    },
    capability,
    routing: {
      requestedEngineId: engineId,
      executedEngineId: null,
      fallbackPolicy: 'forbidden',
      fallbackUsed: false,
      routerVersion: NONLINEAR_ANALYSIS_ROUTER_VERSION,
    },
    limitations: capability?.limitations || [],
  };
}

function normalizeRequestedControl(kind, analysisCase, settings) {
  if (kind === 'pushover') {
    const value = settings.control || analysisCase.control?.type || 'load-factor';
    if (value === 'load' || value === 'load-control') return 'load-factor';
    return value;
  }
  if (kind === 'nonlinearStatic') {
    const value = analysisCase.control?.type || settings.control || 'load';
    if (value === 'load-factor' || value === 'load-control') return 'load';
    return value;
  }
  if (kind === 'nlth' || kind === 'nonlinearTimeHistory') return 'time-step';
  return null;
}
