import {
  NONLINEAR_CASE_KINDS,
  NONLINEAR_ENGINE_IDS,
  evaluateNonlinearCapability,
} from './capabilities.js';
import { runLegacyPreliminaryPushover } from './legacy/preliminaryPushover.js';
import { runLegacySdofNewmarkTrace } from './legacy/sdofNewmarkTrace.js';
import { runProductionPushover } from './pushover/productionPushover.js';
import { runProductionNlth } from './dynamics/productionNlth.js';

export const NONLINEAR_ANALYSIS_ROUTER_VERSION = 'p8-m8-nonlinear-analysis-router-v3';

const DEFAULT_ADAPTERS = Object.freeze({
  [NONLINEAR_ENGINE_IDS.legacyPushover]: runLegacyPreliminaryPushover,
  [NONLINEAR_ENGINE_IDS.legacySdofNlth]: (_model, settings) => runLegacySdofNewmarkTrace(settings),
  [NONLINEAR_ENGINE_IDS.productionPushover]: (model, settings, context) => runProductionPushover(
    model,
    context.analysisCase,
    { ...settings, ...context.options },
  ),
  [NONLINEAR_ENGINE_IDS.productionNlth]: (model, settings, context) => runProductionNlth(
    model,
    context.analysisCase,
    { ...settings, ...context.options },
  ),
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
  if ([NONLINEAR_ENGINE_IDS.productionPushover, NONLINEAR_ENGINE_IDS.productionNlth].includes(analysisCase.engineId)) {
    return blockedResult(analysisCase, {
      ...validation,
      ok: false,
      code: 'NONLINEAR_ASYNC_RUNNER_REQUIRED',
      message: `Engine ${analysisCase.engineId} is available only through runNonlinearAnalysisCaseAsync().`,
      asyncRequired: true,
    });
  }
  const adapter = resolveAdapter(validation, options);
  if (typeof adapter !== 'function') {
    return blockedResult(analysisCase, {
      ...validation,
      ok: false,
      code: validation.capability?.production ? 'PRODUCTION_BACKEND_UNAVAILABLE' : 'NONLINEAR_ENGINE_NOT_AVAILABLE',
      message: `Execution adapter is unavailable for ${validation.engineId}.`,
    });
  }
  try {
    const result = invokeAdapter(adapter, model, analysisCase, settings, options, validation);
    if (isPromiseLike(result)) {
      return blockedResult(analysisCase, {
        ...validation,
        ok: false,
        code: 'NONLINEAR_ASYNC_RUNNER_REQUIRED',
        message: `Engine ${validation.engineId} returned an asynchronous result. Use runNonlinearAnalysisCaseAsync().`,
        asyncRequired: true,
      });
    }
    return routedResult(result, validation, 'sync');
  } catch (error) {
    return blockedResult(analysisCase, {
      ...validation,
      ok: false,
      code: 'NONLINEAR_ENGINE_FAILED',
      message: error?.message || String(error),
    }, 'failed');
  }
}

export async function runNonlinearAnalysisCaseAsync(model, analysisCase = {}, settings = {}, options = {}) {
  const validation = validateNonlinearAnalysisCase(analysisCase, settings);
  if (!validation.ok) return blockedResult(analysisCase, validation);
  const adapter = resolveAdapter(validation, options);
  if (typeof adapter !== 'function') {
    return blockedResult(analysisCase, {
      ...validation,
      ok: false,
      code: validation.capability?.production ? 'PRODUCTION_BACKEND_UNAVAILABLE' : 'NONLINEAR_ENGINE_NOT_AVAILABLE',
      message: `Execution adapter is unavailable for ${validation.engineId}.`,
    });
  }
  try {
    const result = await invokeAdapter(adapter, model, analysisCase, settings, options, validation);
    return routedResult(result, validation, 'async');
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
    asyncRequired: decision.asyncRequired === true,
    routing: {
      requestedEngineId: engineId,
      executedEngineId: null,
      fallbackPolicy: 'forbidden',
      fallbackUsed: false,
      routerVersion: NONLINEAR_ANALYSIS_ROUTER_VERSION,
      executionMode: decision.asyncRequired === true ? 'async-required' : null,
    },
    limitations: capability?.limitations || [],
  };
}

function resolveAdapter(validation, options) {
  const adapters = options.nonlinearAdapters || DEFAULT_ADAPTERS;
  return adapters[validation.engineId];
}

function invokeAdapter(adapter, model, analysisCase, settings, options, validation) {
  return adapter(model, {
    ...settings,
    requestedControl: validation.requestedControl,
  }, {
    analysisCase,
    options,
    validation,
  });
}

function routedResult(result, validation, executionMode) {
  const payload = result && typeof result === 'object' ? result : { ok: true, value: result };
  const hasExecutedEngineId = Object.prototype.hasOwnProperty.call(payload.routing || {}, 'executedEngineId');
  return {
    ...payload,
    routing: {
      ...(payload.routing || {}),
      requestedEngineId: validation.engineId,
      executedEngineId: hasExecutedEngineId
        ? payload.routing.executedEngineId
        : payload?.engine?.id || validation.engineId,
      fallbackPolicy: 'forbidden',
      fallbackUsed: false,
      routerVersion: NONLINEAR_ANALYSIS_ROUTER_VERSION,
      executionMode,
    },
  };
}

function isPromiseLike(value) {
  return value != null && typeof value.then === 'function';
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
