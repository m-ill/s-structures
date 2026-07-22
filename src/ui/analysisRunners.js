import { normalizeAnalysisCase } from '../core/analysisCase.js';
import { NONLINEAR_CASE_KINDS } from '../nonlinear/capabilities.js';
import {
  executeAnalysisCase,
  executeAnalysisCaseAsync,
  hasAnalysisCaseEngine,
  normalizeAnalysisPDeltaMethod as normalizePDeltaMethod,
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
    return successHandle(item, startedAt, payload, settings);
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
    return successHandle(item, startedAt, payload, settings);
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
  const merged = { ...(settings || {}), ...(input || {}) };
  if (kind === 'static') {
    const pDeltaMethodExplicit = Object.prototype.hasOwnProperty.call(merged, 'pDeltaMethod')
      || Object.prototype.hasOwnProperty.call(merged, 'pDelta');
    const pDeltaMethod = normalizePDeltaMethod(merged.pDeltaMethod ?? merged.pDelta, { fallback: 'off' });
    const normalized = {
      comboId: merged.comboId || null,
      pDeltaMethod,
      pDelta: pDeltaMethod !== 'off',
    };
    Object.defineProperty(normalized, 'pDeltaMethodExplicit', { value: pDeltaMethodExplicit });
    return normalized;
  }
  if (kind === 'modal') {
    return {
      modalModeCount: positiveInt(merged.modalModeCount ?? merged.modeCount, 12),
      massSource: merged.massSource || null,
      prestressed: merged.prestressed === true || merged.gravityCombinationId != null,
      gravityCombinationId: merged.gravityCombinationId || merged.gravityComboId || null,
    };
  }
  if (kind === 'responseSpectrum') {
    const spectrum = merged.spectrum || {};
    return {
      modalModeCount: positiveInt(merged.modalModeCount ?? merged.modeCount, 12),
      massSource: merged.massSource || null,
      prestressed: merged.prestressed === true || merged.gravityCombinationId != null,
      gravityCombinationId: merged.gravityCombinationId || merged.gravityComboId || null,
      spectrum: {
        enabled: true,
        method: spectrum.method || merged.method || 'SRSS',
        directions: spectrum.directions || merged.directions || ['x', 'y'],
        dampingRatio: finiteNumber(spectrum.dampingRatio ?? merged.dampingRatio, 0.05),
        scale: finiteNumber(spectrum.scale ?? merged.scale, 9.80665),
        points: Array.isArray(spectrum.points) ? spectrum.points : merged.points,
      },
    };
  }
  if (kind === 'buckling') {
    return {
      maxIterations: positiveInt(merged.maxIterations, 30),
      modeCount: positiveInt(merged.modeCount ?? merged.numberOfModes, 3),
      preloadCombinationId: merged.preloadCombinationId || merged.comboId || merged.combinationId || null,
      preloadResult: merged.preloadResult || null,
      referenceAxialForces: merged.referenceAxialForces || null,
      results: merged.results || null,
    };
  }
  if (kind === 'linearTha') {
    const record = merged.record && typeof merged.record === 'object' ? merged.record : {};
    return {
      integration: merged.integration === 'direct' ? 'direct' : 'modal',
      modalModeCount: positiveInt(merged.modalModeCount ?? merged.modeCount, 12),
      direction: merged.direction || 'x',
      dampingRatio: finiteNumber(merged.dampingRatio, 0.05),
      dt: finiteNumber(merged.dt ?? record.dt, 0.02),
      accelerations: accelerationArray(merged.accelerations ?? record.accelerations),
      accelerationUnit: merged.accelerationUnit || record.accelerationUnit || record.unit || 'model',
      accelerationScale: finiteNumber(merged.accelerationScale ?? merged.scale ?? record.scale, 1),
      timeUnit: merged.timeUnit || record.timeUnit || 's',
      recordId: merged.recordId || record.id || (typeof merged.record === 'string' ? merged.record : null),
      massSource: merged.massSource || null,
      energyTol: finiteNumber(merged.energyTol, 1e-8),
    };
  }
  if (kind === 'pushover') {
    const caseControl = analysisCase.control || {};
    const lateralPattern = analysisCase.inputRefs?.lateralPattern || {};
    return {
      ...merged,
      direction: merged.direction || caseControl.direction || lateralPattern.direction || '+x',
      controlNodeId: merged.controlNodeId || caseControl.nodeId || caseControl.controlNodeId || null,
      steps: positiveInt(merged.steps, 12),
      maxLoadFactor: finiteNumber(merged.maxLoadFactor, 1),
      referenceBaseShear: finiteNumber(merged.referenceBaseShear, 10),
      pattern: merged.pattern || lateralPattern.type || lateralPattern.pattern || 'triangular',
      control: merged.control || caseControl.type || 'load-factor',
      targetDisplacement: merged.targetDisplacement ?? caseControl.targetDisplacement,
      gravityCombinationId: merged.gravityCombinationId || analysisCase.inputRefs?.gravityCombinationId || null,
      plasticMomentScale: merged.plasticMomentScale,
      hingeDegradation: merged.hingeDegradation,
    };
  }
  if (kind === 'nlth') {
    const scale = finiteNumber(merged.scale ?? merged.record?.scale, 1);
    const accelerations = accelerationArray(merged.accelerations ?? merged.record?.accelerations);
    return {
      record: merged.record?.id || merged.record || null,
      scale,
      accelerations: accelerations.map((value) => value * scale),
      dt: finiteNumber(merged.dt ?? merged.record?.dt, 0.02),
      mass: finiteNumber(merged.mass, 1),
      stiffness: finiteNumber(merged.stiffness, 100),
      damping: finiteNumber(merged.damping, 0),
      yieldForce: merged.yieldForce,
      postYieldRatio: finiteNumber(merged.postYieldRatio, 0.02),
      tolerance: merged.tolerance,
      maxIterations: merged.maxIterations,
      energyJumpLimit: merged.energyJumpLimit,
    };
  }
  if (kind === 'nonlinearStatic' || kind === 'nonlinearTimeHistory') {
    return { ...merged };
  }
  return merged;
}

export function summarizeAnalysisResult(kind, payload = {}) {
  if (kind === 'static') {
    return {
      ok: !!payload.ok,
      comboCount: Object.keys(payload.byCombo || {}).length,
      comboIds: Object.keys(payload.byCombo || {}),
      hasEnvelope: !!payload.envelope,
      pDelta: !!payload.pDelta,
      pDeltaMethod: payload.pDelta?.method || payload.pDeltaMethod || 'off',
    };
  }
  if (kind === 'modal') {
    return {
      ok: !!payload.ok,
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

function successHandle(item, startedAt, payload, settings) {
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
  const designBlocked = payload?.designBlocked === true || legacyPreliminary || unsupported;
  return {
    version: ANALYSIS_RUNNER_VERSION,
    caseId: item.id,
    kind: item.kind,
    ok: !failed && !unsupported,
    status: unsupported ? 'unsupported' : failed ? 'failed' : preliminary ? 'preliminary' : summary.ok === false ? 'review-required' : 'ok',
    qualification,
    designBlocked,
    designBlockReason: payload?.designBlockReason || payload?.designTransfer?.reason || payload?.review?.designBlockReason || null,
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
  return {
    version: ANALYSIS_RUNNER_VERSION,
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

function positiveInt(value, fallback) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function finiteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function accelerationArray(value) {
  return Array.isArray(value) ? value.map(Number) : [];
}

function max(values) {
  return values.length ? Math.max(0, ...values) : 0;
}
