import { normalizeModalCombinationMethod } from '../../dynamics/modalCombination.js';
import { normalizePDeltaMethod } from '../../solver/pdelta/method.js';

export const ANALYSIS_CASE_SETTINGS_VERSION = 'p14-analysis-case-settings-v1';

/**
 * Normalize user-facing analysis case input at the product boundary.
 *
 * UI and agent adapters both call this module so the numerical backends never
 * leak into presentation code and both surfaces receive byte-identical input.
 */
export function normalizeProductAnalysisCaseSettings(kind, settings = {}, input = {}, analysisCase = {}) {
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
        method: normalizeModalCombinationMethod(spectrum.method || merged.method || 'SRSS'),
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
      dampingType: merged.dampingType === 'modal' || merged.damping?.type === 'modal' ? 'modal' : 'rayleigh',
      modalDampingRatios: merged.modalDampingRatios || merged.damping?.ratios || null,
      dt: finiteNumber(merged.dt ?? record.dt, 0.02),
      accelerations: accelerationArray(merged.accelerations ?? record.accelerations),
      times: Array.isArray(merged.times ?? record.times) ? accelerationArray(merged.times ?? record.times) : null,
      targetDt: merged.targetDt == null ? null : finiteNumber(merged.targetDt, null),
      interpolation: merged.interpolation || record.interpolation || 'linear',
      accelerationUnit: merged.accelerationUnit || record.accelerationUnit || record.unit || 'model',
      accelerationScale: finiteNumber(merged.accelerationScale ?? merged.scale ?? record.scale, 1),
      timeUnit: merged.timeUnit || record.timeUnit || 's',
      recordId: merged.recordId || record.id || (typeof merged.record === 'string' ? merged.record : null),
      massSource: merged.massSource || null,
      energyTol: finiteNumber(merged.energyTol, 1e-8),
      checkpointEvery: positiveInt(merged.checkpointEvery, 0),
      restart: merged.restart || null,
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
  if (kind === 'nonlinearStatic' || kind === 'nonlinearTimeHistory') return { ...merged };
  return merged;
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
