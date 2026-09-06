import { analyzeModel, defaultCombos } from '../../solver/linear3d.js';
import { normalizePDeltaMethod } from '../../solver/pdelta/method.js';
import { analyzeDynamics } from '../../dynamics/modal.js';
import { estimateGlobalBucklingTrace } from '../../dynamics/globalBuckling.js';
import { runModalSuperpositionTha } from '../../dynamics/elasticCompleteness.js';
import { runLinearDirectTha } from '../../dynamics/linearDirectIntegration.js';
import { runSecondOrderPDelta } from '../../solver/pdelta/secondOrder.js';
import { buildPDeltaTangentStiffness } from '../../solver/pdelta/tangentStiffness.js';
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
    const prestress = resolvePrestress(model, settings);
    if (prestress.blocked) return prestress.blocked;
    return analyzeDynamics(model, {
      modalModeCount: settings.modalModeCount,
      massSource: settings.massSource,
      responseSpectrum: { enabled: false },
      ...prestress.options,
    });
  }
  if (kind === 'responseSpectrum') {
    const prestress = resolvePrestress(model, settings);
    if (prestress.blocked) return prestress.blocked;
    const dynamics = analyzeDynamics(model, {
      modalModeCount: settings.modalModeCount,
      massSource: settings.massSource,
      responseSpectrum: settings.spectrum,
      ...prestress.options,
    });
    return dynamics.rsa ? {
      ...dynamics.rsa,
      modalAnalysis: {
        type: dynamics.type,
        modes: dynamics.modes,
        mass: dynamics.mass,
        eigen: dynamics.eigen,
        condensation: dynamics.condensation,
        diaphragmAssembly: dynamics.diaphragmAssembly,
      },
    } : {
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
    if (settings.integration === 'direct') {
      const system = modal.dynamicSystem;
      if (!modal.ok || !system) return { ok: false, status: 'blocked', reason: modal.reason || 'DIRECT_THA_DYNAMIC_SYSTEM_UNAVAILABLE', designBlocked: true };
      const integrationSystem = system.integration || system;
      const direct = runLinearDirectTha({
        mass: integrationSystem.mass,
        stiffness: integrationSystem.stiffness,
        modes: (modal.modes || []).map((mode) => ({ ...mode, dynamicVector: integrationSystem.projectModeVector(mode) })),
        dampingRatio: settings.dampingRatio,
        dampingType: settings.dampingType || settings.damping?.type || 'rayleigh',
        modalDampingRatios: settings.modalDampingRatios || settings.damping?.ratios || null,
        forceVector: integrationSystem.forceVectors[settings.direction] || integrationSystem.forceVectors.x,
        dt: settings.dt,
        accelerations: settings.accelerations,
        times: settings.times,
        targetDt: settings.targetDt,
        interpolation: settings.interpolation || 'linear',
        accelerationUnit: settings.accelerationUnit,
        accelerationScale: settings.accelerationScale,
        displacementUnit: model?.unitSystem?.internal?.length || model?.units?.length || 'm',
        energyTol: settings.energyTol,
        recordId: settings.recordId,
        signal: settings.signal,
        checkpointEvery: settings.checkpointEvery,
        onCheckpoint: settings.onCheckpoint,
        restart: settings.restart,
      });
      direct.direction = settings.direction;
      direct.modalBasis = { modeCount: modal.modes?.length || 0, stiffnessBasis: modal.provenance?.stiffnessBasis || null };
      direct.rows = direct.rows.map((row) => ({ ...row, fullDisplacement: integrationSystem.expandVector(row.displacement) }));
      return direct;
    }
    const result = runModalSuperpositionTha({
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
    result.integration = 'modal';
    return result;
  }
  throw engineError('UNSUPPORTED_ANALYSIS_CASE', `Unsupported analysis case kind: ${kind}`);
}

function resolvePrestress(model, settings) {
  if (settings.prestressed !== true && !settings.gravityCombinationId) return { options: {} };
  const combinationId = settings.gravityCombinationId;
  const combination = (model.loadCombinations || []).find((item) => item.id === combinationId);
  if (!combination) return { blocked: prestressBlocked('PRESTRESS_GRAVITY_COMBINATION_NOT_FOUND', combinationId) };
  const direct = runSecondOrderPDelta(model, combination.factors || {}, {
    loadSteps: settings.pDeltaLoadSteps,
    maxIterations: settings.maxIterations,
  });
  if (!direct.ok || direct.convergence?.converged === false) {
    return { blocked: prestressBlocked(direct.reason || 'PRESTRESS_DIRECT_PDELTA_NOT_CONVERGED', combinationId, direct) };
  }
  const tangent = buildPDeltaTangentStiffness(model, { axialForces: direct.result?.axialForces || {} });
  if (!tangent.ok) return { blocked: prestressBlocked(tangent.reason || 'PRESTRESS_TANGENT_ASSEMBLY_FAILED', combinationId, direct) };
  return {
    options: {
      prestressed: true,
      stiffnessBasis: 'gravity-tangent-Kt',
      gravityCombinationId: combinationId,
      tangentStiffness: tangent.Kt,
      prestressTrace: { direct, tangent: tangent.summary },
    },
  };
}

function prestressBlocked(reason, gravityCombinationId, direct = null) {
  return {
    ok: false,
    status: 'blocked',
    reason,
    designBlocked: true,
    designBlockers: [reason],
    provenance: { stiffnessBasis: null, gravityCombinationId },
    prestress: direct,
    modes: [],
    rsa: null,
  };
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
