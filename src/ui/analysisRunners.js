import { normalizeAnalysisCase } from '../core/analysisCase.js';
import { analyzeModel, defaultCombos } from '../solver/linear3d.js';
import { normalizePDeltaMethod } from '../solver/pdelta/method.js';
import { analyzeDynamics } from '../dynamics/modal.js';
import { estimateGlobalBucklingTrace } from '../dynamics/globalBuckling.js';
import { runModalSuperpositionTha } from '../dynamics/elasticCompleteness.js';
import { NONLINEAR_CASE_KINDS } from '../nonlinear/capabilities.js';
import { runNonlinearAnalysisCase } from '../nonlinear/analysisRouter.js';

export const ANALYSIS_RUNNER_VERSION = 'p8-m0-analysis-runners-v2';

export function runAnalysisCase(model, analysisCase, options = {}) {
  const item = normalizeAnalysisCase(analysisCase || {});
  const startedAt = new Date().toISOString();
  try {
    const settings = normalizeAnalysisCaseSettings(item.kind, item.settings || {}, item.input || {});
    const runner = RUNNERS[item.kind];
    if (!runner && !NONLINEAR_CASE_KINDS.has(item.kind)) {
      return failureHandle(item, startedAt, 'UNSUPPORTED_ANALYSIS_CASE', `Unsupported analysis case kind: ${item.kind}`);
    }
    const payload = NONLINEAR_CASE_KINDS.has(item.kind)
      ? runNonlinearAnalysisCase(model, item, settings, options)
      : runner(model, settings, options);
    return successHandle(item, startedAt, payload, settings);
  } catch (error) {
    return failureHandle(item, startedAt, 'ANALYSIS_CASE_FAILED', error?.message || String(error));
  }
}

export function runAnalysisCases(model, analysisCases = [], options = {}) {
  return (analysisCases || []).map((analysisCase) => runAnalysisCase(model, analysisCase, options));
}

export function normalizeAnalysisCaseSettings(kind, settings = {}, input = {}) {
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
    };
  }
  if (kind === 'responseSpectrum') {
    const spectrum = merged.spectrum || {};
    return {
      modalModeCount: positiveInt(merged.modalModeCount ?? merged.modeCount, 12),
      massSource: merged.massSource || null,
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
    };
  }
  if (kind === 'pushover') {
    return {
      direction: merged.direction || '+x',
      controlNodeId: merged.controlNodeId || null,
      steps: positiveInt(merged.steps, 12),
      maxLoadFactor: finiteNumber(merged.maxLoadFactor, 1),
      referenceBaseShear: finiteNumber(merged.referenceBaseShear, 10),
      pattern: merged.pattern || 'triangular',
      control: merged.control || 'load-factor',
      targetDisplacement: merged.targetDisplacement,
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

const RUNNERS = {
  static(model, settings, options) {
    const modelMethod = normalizePDeltaMethod(model?.analysisSettings?.pDeltaMethod, {
      legacyEnabled: model?.analysisSettings?.includeGeometricStiffness === true,
    });
    const pDeltaMethod = settings.pDeltaMethodExplicit ? settings.pDeltaMethod : modelMethod;
    settings.pDeltaMethod = pDeltaMethod;
    settings.pDelta = pDeltaMethod !== 'off';
    const availableCombos = model?.loadCombinations?.length ? model.loadCombinations : defaultCombos(model || {});
    const selectedCombo = settings.comboId
      ? availableCombos.find((combo) => combo.id === settings.comboId)
      : null;
    if (settings.comboId && !selectedCombo) {
      return {
        ok: false,
        reason: 'STATIC_COMBINATION_NOT_FOUND',
        pDeltaMethod,
        byCombo: {},
        envelope: null,
        selection: {
          requestedComboId: settings.comboId,
          selectedComboId: null,
          availableComboIds: availableCombos.map((combo) => combo.id),
        },
        methodTrace: {
          analysisCase: {
            requestedPDeltaMethod: pDeltaMethod,
            routedPDeltaMethod: pDeltaMethod,
          },
        },
      };
    }
    const target = {
      ...(model || {}),
      loadCombinations: selectedCombo ? [selectedCombo] : (model?.loadCombinations || []),
      analysisSettings: {
        ...((model || {}).analysisSettings || {}),
        pDeltaMethod,
        includeGeometricStiffness: pDeltaMethod !== 'off',
      },
    };
    const payload = options.bridge?.analyzeModel
      ? options.bridge.analyzeModel(target)
      : analyzeModel(target);
    if (payload && typeof payload === 'object') {
      payload.selection = {
        requestedComboId: settings.comboId,
        selectedComboId: selectedCombo?.id || null,
        availableComboIds: availableCombos.map((combo) => combo.id),
      };
      payload.methodTrace = {
        ...(payload.methodTrace || {}),
        analysisCase: {
          requestedPDeltaMethod: pDeltaMethod,
          routedPDeltaMethod: payload.pDelta?.method || payload.pDeltaMethod || 'off',
          requestedComboId: settings.comboId,
          selectedComboId: selectedCombo?.id || null,
        },
      };
    }
    return payload;
  },
  modal(model, settings) {
    return analyzeDynamics(model, {
      modalModeCount: settings.modalModeCount,
      massSource: settings.massSource,
      responseSpectrum: { enabled: false },
    });
  },
  responseSpectrum(model, settings) {
    const dynamics = analyzeDynamics(model, {
      modalModeCount: settings.modalModeCount,
      massSource: settings.massSource,
      responseSpectrum: settings.spectrum,
    });
    return dynamics.rsa || {
      ok: false,
      status: 'not-available',
      designBlocked: true,
      reason: dynamics.reason || 'RSA_RESULT_UNAVAILABLE',
      method: settings.spectrum.method,
      combined: {},
      modal: [],
      review: { status: 'review-required', missing: [dynamics.reason || 'rsa-result'] },
    };
  },
  buckling(model, settings) {
    const preloadResult = settings.preloadResult || analyzeModel({
      ...model,
      analysisSettings: {
        ...(model.analysisSettings || {}),
        pDeltaMethod: 'off',
        includeGeometricStiffness: false,
      },
    });
    const preloadCombinationId = settings.preloadCombinationId
      || model.loadCombinations?.[0]?.id
      || null;
    return estimateGlobalBucklingTrace(model, {
      ...settings,
      preloadResult,
      preloadCombinationId,
      referenceAxialForces: null,
      results: null,
    });
  },
  linearTha(model, settings) {
    const modal = analyzeDynamics(model, {
      modalModeCount: settings.modalModeCount,
      massSource: settings.massSource,
      responseSpectrum: { enabled: false },
    });
    return runModalSuperpositionTha({
      modes: modal.modes || [],
      direction: settings.direction,
      dampingRatio: settings.dampingRatio,
      dt: settings.dt,
      accelerations: settings.accelerations,
      accelerationUnit: settings.accelerationUnit,
      accelerationScale: settings.accelerationScale,
      timeUnit: settings.timeUnit,
      displacementUnit: model?.unitSystem?.internal?.length || model?.units?.length || 'm',
      recordId: settings.recordId,
    });
  },
};

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
