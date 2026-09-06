import { normalizeAnalysisCase } from '../core/analysisCase.js';
import { NONLINEAR_CASE_KINDS } from '../nonlinear/capabilities.js';
import { normalizeProductAnalysisCaseSettings } from '../compute/product/analysisCaseSettings.js';
import {
  executeAnalysisCase,
  executeAnalysisCaseAsync,
  hasAnalysisCaseEngine,
} from '../compute/product/analysisCaseEngine.js';

export const ANALYSIS_RUNNER_VERSION = 'p8-m10-analysis-runners-v6-p10-m7';

export function runAnalysisCase(model, analysisCase, options = {}) {
  const item = normalizeAnalysisCase(analysisCase || {});
  const startedAt = new Date().toISOString();
  try {
    const settings = normalizeAnalysisCaseSettings(item.kind, item.settings || {}, item.input || {}, item);
    if (!hasAnalysisCaseEngine(item.kind, NONLINEAR_CASE_KINDS)) {
      return failureHandle(item, startedAt, 'UNSUPPORTED_ANALYSIS_CASE', `Unsupported analysis case kind: ${item.kind}`);
    }
    const payload = executeAnalysisCase(model, item, settings, options, NONLINEAR_CASE_KINDS);
    return successHandle(item, startedAt, payload, settings, { ownedInProcessBoundary: true });
  } catch (error) {
    return failureHandle(item, startedAt, 'ANALYSIS_CASE_FAILED', error?.message || String(error));
  }
}

export function runAnalysisCases(model, analysisCases = [], options = {}) {
  return (analysisCases || []).map((analysisCase) => runAnalysisCase(model, analysisCase, options));
}

export async function runAnalysisCaseAsync(model, analysisCase, options = {}) {
  const item = normalizeAnalysisCase(analysisCase || {});
  const startedAt = new Date().toISOString();
  try {
    const settings = normalizeAnalysisCaseSettings(item.kind, item.settings || {}, item.input || {}, item);
    if (!hasAnalysisCaseEngine(item.kind, NONLINEAR_CASE_KINDS)) {
      return failureHandle(item, startedAt, 'UNSUPPORTED_ANALYSIS_CASE', `Unsupported analysis case kind: ${item.kind}`);
    }
    const payload = await executeAnalysisCaseAsync(model, item, settings, options, NONLINEAR_CASE_KINDS);
    return successHandle(item, startedAt, payload, settings, { ownedInProcessBoundary: true });
  } catch (error) {
    return failureHandle(item, startedAt, 'ANALYSIS_CASE_FAILED', error?.message || String(error));
  }
}

export function runAnalysisCasesAsync(model, analysisCases = [], options = {}) {
  return Promise.all((analysisCases || []).map((analysisCase) => runAnalysisCaseAsync(model, analysisCase, options)));
}

export function createAnalysisCaseResult(analysisCase, payload, settings = {}, options = {}) {
  const item = normalizeAnalysisCase(analysisCase || {});
  const startedAt = options.startedAt || new Date().toISOString();
  return successHandle(item, startedAt, payload, settings);
}

export function normalizeAnalysisCaseSettings(kind, settings = {}, input = {}, analysisCase = {}) {
  return normalizeProductAnalysisCaseSettings(kind, settings, input, analysisCase);
}

export function summarizeAnalysisResult(kind, payload = {}) {
  if (kind === 'static') {
    const designBlocked = payload.designBlocked === true
      || payload.shellFemQualification?.designTransferAllowed === false;
    return {
      ok: !!payload.ok && !designBlocked,
      designBlocked,
      designBlockReason: designBlocked
        ? payload.designBlockReason
          || payload.designEligibility?.reason
          || payload.shellFemQualification?.blockers?.[0]
          || null
        : null,
      designEligibility: payload.designEligibility || null,
      shellFemQualification: payload.shellFemQualification || null,
      comboCount: Object.keys(payload.byCombo || {}).length,
      comboIds: Object.keys(payload.byCombo || {}),
      hasEnvelope: !!payload.envelope,
      pDelta: !!payload.pDelta,
      pDeltaMethod: payload.pDelta?.method || payload.pDeltaMethod || 'off',
    };
  }
  if (kind === 'modal') {
    return {
      ok: !!payload.ok && payload.designBlocked !== true,
      designBlocked: payload.designBlocked === true,
      designBlockReason: payload.designBlockReason || payload.designBlockers?.[0] || null,
      shellFemQualification: payload.shellFemQualification || null,
      modeCount: (payload.modes || []).length,
      firstPeriod: payload.modes?.[0]?.period ?? null,
      modalDofCount: payload.mass?.modalDofCount || 0,
    };
  }
  if (kind === 'responseSpectrum') {
    const directions = Object.keys(payload?.combined || {});
    const unavailable = !payload
      || payload.ok === false
      || ['failed', 'not-available', 'unsupported', 'blocked'].includes(payload.status)
      || directions.length === 0;
    return {
      ok: !unavailable
        && payload.designBlocked !== true
        && payload.review?.status !== 'review-required',
      method: payload?.method || null,
      status: payload?.status || 'not-available',
      designBlocked: payload?.designBlocked === true,
      directions,
      maxParticipatingMassRatio: max(Object.values(payload?.combined || {}).map((row) => row.participatingMassRatio || 0)),
    };
  }
  if (kind === 'buckling') {
    return {
      ok: payload.status === 'available',
      status: payload.status || 'not-available',
      criticalLoadFactor: payload.criticalLoadFactor ?? null,
      referenceCompressionCount: (payload.referenceCompression || []).length,
    };
  }
  if (kind === 'linearTha') {
    return {
      ok: payload.review?.status !== 'review-required',
      status: payload.status || 'blocked',
      maturity: payload.maturity || null,
      designBlocked: payload.designBlocked === true,
      rowCount: (payload.rows || []).length,
      maxDisplacement: payload.maxDisplacement || 0,
      modeCount: (payload.modal || []).length,
      integration: payload.integration || 'modal',
      energyQualified: payload.energy?.qualified ?? null,
    };
  }
  if (kind === 'pushover') {
    return {
      ok: !!payload.ok,
      engineId: payload.engine?.id || null,
      qualification: payload.qualification || null,
      designBlocked: payload.designBlocked === true,
      modelBound: payload.modelBound === true,
      stepCount: payload.summary?.stepCount || (payload.curve || []).length,
      maxBaseShear: payload.summary?.maxBaseShear || 0,
      maxControlDisplacement: payload.summary?.maxControlDisplacement || 0,
    };
  }
  if (kind === 'nlth') {
    return {
      ok: !!payload.converged,
      engineId: payload.engine?.id || null,
      qualification: payload.qualification || null,
      designBlocked: payload.designBlocked === true,
      modelBound: payload.modelBound === true,
      rowCount: (payload.rows || []).length,
      maxDisplacement: payload.maxDisplacement || 0,
      yielded: !!payload.summary?.yielded,
    };
  }
  if (kind === 'nonlinearTimeHistory') {
    return {
      ok: payload.ok === true,
      engineId: payload.engine?.id || null,
      qualification: payload.qualification || null,
      designBlocked: payload.designBlocked === true,
      modelBound: payload.modelBound === true,
      outputStepCount: payload.summary?.outputStepCount || 0,
      internalStepCount: payload.summary?.internalStepCount || 0,
      rejectedStepCount: payload.summary?.rejectedStepCount || 0,
      completedTime: payload.summary?.completedTime ?? null,
      matrixClass: payload.summary?.matrixClass || null,
      historyManifestHash: payload.history?.manifestHash || null,
    };
  }
  return { ok: !!payload.ok };
}

export function analysisResultView(kind, payload = {}) {
  if (kind === 'static') return 'static-results';
  if (kind === 'modal') return 'modal-results';
  if (kind === 'responseSpectrum') return 'response-spectrum-results';
  if (kind === 'buckling') return 'buckling-results';
  if (kind === 'linearTha' || kind === 'nlth' || kind === 'nonlinearTimeHistory') return 'time-history-results';
  if (kind === 'pushover' || kind === 'nonlinearStatic') return 'pushover-results';
  return payload?.view || 'analysis-results';
}

function successHandle(item, startedAt, payload, settings, provenanceOptions = {}) {
  const executionProvenance = buildPublicAnalysisExecutionProvenance(payload, provenanceOptions);
  const summary = summarizeAnalysisResult(item.kind, payload);
  const unsupported = payload?.status === 'unsupported';
  const failed = !unsupported && (payload?.ok === false || ['failed', 'not-available'].includes(payload?.status));
  const legacyPreliminary = payload?.qualification === 'legacy-preliminary';
  const preliminary = !failed
    && !unsupported
    && payload?.status !== 'blocked'
    && (legacyPreliminary || payload?.status === 'preliminary' || payload?.maturity === 'preliminary');
  const qualification = unsupported
    ? payload?.qualification || 'unsupported'
    : failed
      ? payload?.qualification || 'failed'
      : payload?.qualification || (preliminary ? 'preliminary' : summary.ok === false ? 'blocked' : 'candidate');
  const designBlocked = payload?.designBlocked === true
    || payload?.shellFemQualification?.designTransferAllowed === false
    || legacyPreliminary
    || unsupported;
  const designBlockReason = designBlocked
    ? payload?.designBlockReason
      || payload?.designEligibility?.reason
      || payload?.shellFemQualification?.blockers?.[0]
      || payload?.designTransfer?.reason
      || payload?.review?.designBlockReason
      || null
    : null;
  return {
    version: ANALYSIS_RUNNER_VERSION,
    externalRuntimeUsed: executionProvenance.externalRuntimeUsed,
    networkFallbackUsed: executionProvenance.networkFallbackUsed,
    executionProvenance,
    caseId: item.id,
    kind: item.kind,
    ok: !failed && !unsupported,
    status: unsupported ? 'unsupported' : failed ? 'failed' : preliminary ? 'preliminary' : summary.ok === false ? 'review-required' : 'ok',
    qualification,
    designBlocked,
    designBlockReason,
    engine: payload?.engine || null,
    modelBound: payload?.modelBound ?? null,
    capability: payload?.capability || null,
    routing: payload?.routing || null,
    provenance: payload?.provenance || null,
    startedAt,
    completedAt: new Date().toISOString(),
    settings,
    summary,
    view: analysisResultView(item.kind, payload),
    message: failed || unsupported
      ? (payload.message || payload.reason || payload.review?.missing?.join(', ') || 'Analysis case did not produce an available result.')
      : null,
    payload,
  };
}

function failureHandle(item, startedAt, code, message) {
  const executionProvenance = buildPublicAnalysisExecutionProvenance();
  return {
    version: ANALYSIS_RUNNER_VERSION,
    externalRuntimeUsed: executionProvenance.externalRuntimeUsed,
    networkFallbackUsed: executionProvenance.networkFallbackUsed,
    executionProvenance,
    caseId: item.id,
    kind: item.kind,
    ok: false,
    status: 'failed',
    qualification: 'failed',
    designBlocked: true,
    designBlockReason: code,
    engine: item.engineId ? { id: item.engineId, version: null, formulation: item.formulation || null } : null,
    startedAt,
    completedAt: new Date().toISOString(),
    error: { code, message },
    summary: { ok: false },
    view: analysisResultView(item.kind, null),
    payload: null,
  };
}

function buildPublicAnalysisExecutionProvenance(payload = {}, options = {}) {
  const ownedInProcessBoundary = options.ownedInProcessBoundary === true;
  const externalRuntime = observeExecutionBoolean(payload, 'externalRuntimeUsed', ownedInProcessBoundary);
  const networkFallback = observeExecutionBoolean(payload, 'networkFallbackUsed', ownedInProcessBoundary);
  return {
    origin: 'S_STRUCTURES_PUBLIC_ANALYSIS_RUNNER',
    runnerVersion: ANALYSIS_RUNNER_VERSION,
    externalRuntimeUsed: externalRuntime.value,
    networkFallbackUsed: networkFallback.value,
    observationSource: externalRuntime.malformed || networkFallback.malformed
      ? 'INVALID_ENGINE_PAYLOAD'
      : externalRuntime.value || networkFallback.value
        ? 'ENGINE_PAYLOAD_AND_PUBLIC_RUNNER_BOUNDARY'
        : ownedInProcessBoundary
          ? 'OWNED_IN_PROCESS_PUBLIC_RUNNER_BOUNDARY'
          : 'UNOBSERVED_CALLER_SUPPLIED_RESULT',
  };
}

function observeExecutionBoolean(payload, key, ownedInProcessBoundary) {
  const candidates = [
    payload?.[key],
    payload?.executionProvenance?.[key],
    payload?.provenance?.[key],
  ].filter((value) => value !== undefined);
  if (candidates.some((value) => typeof value !== 'boolean')) return { value: null, malformed: true };
  if (candidates.length) return { value: candidates.some((value) => value), malformed: false };
  return { value: ownedInProcessBoundary ? false : null, malformed: false };
}

function max(values) {
  return values.length ? Math.max(0, ...values) : 0;
}
