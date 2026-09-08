import { migrateToV3, validateModel } from '../../core/model.js';
import { comboSnapshot } from '../linear3dPost.js';
import { buildCanonicalAnalysisDomain } from '../domain/canonicalDomain.js';
import { normalizePDeltaMethod, pDeltaMethodTrace } from '../pdelta/method.js';
import { analyzeAll } from '../linear3dFirstOrder.js';
import { elasticStageError, refreshValidationHealth, appendSolverDiagnosticWarnings, appendComponentFailureErrors, resolveRequestedCombinations } from './resultContracts.js';

export function prepareElasticAnalysis(inputModel) {
  const model = migrateToV3(inputModel);
  const validation = model.analysisSettings?.validateBeforeSolve === false
    ? { errors: [], warnings: [] }
    : validateModel(model);
  const requestedPDeltaMethod = model.analysisSettings?.pDeltaMethod;
  const pDeltaMethod = normalizePDeltaMethod(requestedPDeltaMethod, {
    legacyEnabled: model.analysisSettings?.includeGeometricStiffness === true,
  });
  const output = {
    ok: validation.errors.length === 0,
    validation,
    model,
    pDeltaMethod,
    methodTrace: {
      static: 'linear-static-3d-frame',
      pDelta: pDeltaMethodTrace(requestedPDeltaMethod, pDeltaMethod),
    },
  };

  const analysisShells = [
    ...(Array.isArray(model.shells) ? model.shells : []),
    ...(Array.isArray(model.slabs) ? model.slabs.filter((item) => item?.type === 'shell') : []),
  ];
  if (!model.members?.length && analysisShells.length === 0) {
    output.ok = false;
    output.empty = true;
    return { terminal: true, output, model, validation, pDeltaMethod, combos: [], canonicalBase: null };
  }
  if (!output.ok) return { terminal: true, output, model, validation, pDeltaMethod, combos: [], canonicalBase: null };

  const combinationSelection = resolveRequestedCombinations(model);
  output.combinationSelection = combinationSelection.trace;
  if (!combinationSelection.ok) {
    validation.errors.push({
      code: combinationSelection.reason,
      message: combinationSelection.message,
      target: 'loadCombinations',
    });
    output.ok = false;
    output.reason = combinationSelection.reason;
    output.combos = [];
    output.byCombo = {};
    output.envelope = null;
    output.analysisEligibility = {
      eligible: false,
      status: 'blocked',
      reason: combinationSelection.reason,
    };
    output.designEligibility = { ...output.analysisEligibility };
    return { terminal: true, output, model, validation, pDeltaMethod, combos: [], canonicalBase: null };
  }

  const combos = combinationSelection.combos;
  const canonicalBase = buildCanonicalAnalysisDomain(model, {
    allowInvalidReferences: model.analysisSettings?.validateBeforeSolve === false,
  });
  output.combos = combos;
  return { terminal: false, output, model, validation, pDeltaMethod, combos, canonicalBase };
}


export function solveElasticCombination(prepared, combo, options = {}) {
  if (prepared?.terminal) throw elasticStageError('ELASTIC_ANALYSIS_TERMINAL', 'A terminal elastic analysis cannot solve combinations.');
  if (!combo?.id) throw elasticStageError('ELASTIC_COMBINATION_INVALID', 'Elastic combination id is required.');
  const result = analyzeAll(prepared.model, combo.factors, {
    canonicalBase: prepared.canonicalBase,
    componentCache: options.componentCache,
    factorSession: options.factorSession,
    factorGroupKey: options.factorGroupKey,
    captureSystemsOnly: options.captureSystemsOnly === true,
    precomputedSolutions: options.precomputedSolutions,
    signal: options.signal,
  });
  result.combo = comboSnapshot(combo);
  appendSolverDiagnosticWarnings(prepared.validation.warnings, combo.id, result);
  appendComponentFailureErrors(prepared.validation.errors, combo.id, result);
  refreshValidationHealth(prepared.validation);
  return result;
}


export function captureElasticCombinationSystems(prepared, combo, options = {}) {
  if (prepared?.terminal) throw elasticStageError('ELASTIC_ANALYSIS_TERMINAL', 'A terminal elastic analysis cannot capture systems.');
  if (!combo?.id) throw elasticStageError('ELASTIC_COMBINATION_INVALID', 'Elastic combination id is required.');
  const result = analyzeAll(prepared.model, combo.factors, {
    canonicalBase: prepared.canonicalBase,
    componentCache: options.componentCache,
    factorGroupKey: options.factorGroupKey,
    captureSystemsOnly: true,
    signal: options.signal,
  });
  result.combo = comboSnapshot(combo);
  return result;
}


export function resumeElasticCombinationSystems(prepared, combo, capture, precomputedSolutions) {
  if (prepared?.terminal) throw elasticStageError('ELASTIC_ANALYSIS_TERMINAL', 'A terminal elastic analysis cannot resume combinations.');
  if (typeof capture?.resume !== 'function') {
    throw elasticStageError('ELASTIC_CAPTURE_CONTINUATION_MISSING', 'Elastic capture continuation is unavailable.');
  }
  const result = capture.resume(precomputedSolutions);
  result.combo = comboSnapshot(combo);
  appendSolverDiagnosticWarnings(prepared.validation.warnings, combo.id, result);
  appendComponentFailureErrors(prepared.validation.errors, combo.id, result);
  refreshValidationHealth(prepared.validation);
  return result;
}

