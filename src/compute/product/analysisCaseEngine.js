import { analyzeModel, defaultCombos } from '../../solver/linear3d.js';
import { normalizePDeltaMethod } from '../../solver/pdelta/method.js';
import { analyzeDynamics } from '../../dynamics/modal.js';
import { estimateGlobalBucklingTrace } from '../../dynamics/globalBuckling.js';
import { runModalSuperpositionTha } from '../../dynamics/elasticCompleteness.js';
import {
  runNonlinearAnalysisCase,
  runNonlinearAnalysisCaseAsync,
} from '../../nonlinear/analysisRouter.js';

export const ANALYSIS_CASE_ENGINE_VERSION = 'p9-m9-analysis-case-engine-v1';
export { normalizePDeltaMethod as normalizeAnalysisPDeltaMethod };

const LINEAR_KINDS = new Set(['static', 'modal', 'responseSpectrum', 'buckling', 'linearTha']);

export function hasAnalysisCaseEngine(kind, nonlinearKinds = new Set()) {
  return LINEAR_KINDS.has(kind) || nonlinearKinds.has(kind);
}

export function executeAnalysisCase(model, analysisCase, settings, options = {}, nonlinearKinds = new Set()) {
  if (nonlinearKinds.has(analysisCase.kind)) {
    return runNonlinearAnalysisCase(model, analysisCase, settings, options);
  }
  return executeLinearCase(model, analysisCase.kind, settings, options);
}

export async function executeAnalysisCaseAsync(model, analysisCase, settings, options = {}, nonlinearKinds = new Set()) {
  if (nonlinearKinds.has(analysisCase.kind)) {
    return runNonlinearAnalysisCaseAsync(model, analysisCase, settings, options);
  }
  return executeLinearCase(model, analysisCase.kind, settings, options);
}

function executeLinearCase(model, kind, settings, options) {
  if (kind === 'static') return runStatic(model, settings, options);
  if (kind === 'modal') {
    return analyzeDynamics(model, {
      modalModeCount: settings.modalModeCount,
      massSource: settings.massSource,
      responseSpectrum: { enabled: false },
    });
  }
  if (kind === 'responseSpectrum') {
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
  }
  if (kind === 'buckling') {
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
  }
  if (kind === 'linearTha') {
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
  }
  throw engineError('UNSUPPORTED_ANALYSIS_CASE', `Unsupported analysis case kind: ${kind}`);
}

function runStatic(model, settings, options) {
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
}

function engineError(code, message) {
  return Object.assign(new Error(message), { code });
}
