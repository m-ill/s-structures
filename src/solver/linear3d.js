import { materialOf, sectionOf } from '../core/catalogs.js';
import {
  buildAnalysisCriteriaTrace,
  migrateToV3,
  resolveCriterion,
  validateModel,
} from '../core/model.js';
import { analyzeDynamics } from '../dynamics/modal.js';
import { vlen } from '../core/vector.js';
import { runDesignChecks } from '../design/steel.js';
import { resolveRigidDiaphragms } from '../core/diaphragmGroups.js';
import { buildAnalysisAudit } from './analysisAudit.js';
import {
  analyzeComponent3D,
  summarizeSolverDiagnostics,
} from './linear3dAssembly.js';
import { AXIS, dirVec, memberAxes } from './linear3dElement.js';
import {
  buildEquilibriumSummary,
  comboSnapshot,
  connectedComponentGroups,
  defaultCombos,
  makeEnvelope,
} from './linear3dPost.js';
import { buildExpandedAnalysisDomain } from './pdelta/analysisDomain.js';
import { buildCanonicalAnalysisDomain } from './domain/canonicalDomain.js';
import { normalizePDeltaMethod, pDeltaMethodTrace } from './pdelta/method.js';
import { PDELTA_SECOND_ORDER_VERSION, runSecondOrderPDelta } from './pdelta/secondOrder.js';

export { analyzeComponent3D, assembleStiffness3D } from './linear3dAssembly.js';
export { AXIS, localK12, memberAxes, solveLinear, solveLinearDetailed } from './linear3dElement.js';
export { defaultCombos, makeEnvelope } from './linear3dPost.js';

export function analyzeModel(inputModel, options = {}) {
  const prepared = prepareElasticAnalysis(inputModel);
  if (prepared.terminal) return finalizeElasticAnalysis(prepared, {});
  const byCombo = {};
  for (const combo of prepared.combos) {
    byCombo[combo.id] = solveElasticCombination(prepared, combo, options);
  }
  return finalizeElasticAnalysis(prepared, byCombo);
}

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

  if (!model.members?.length) {
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
  return result;
}

export function finalizeElasticAnalysis(prepared, byCombo = {}, options = {}) {
  const { output, model, validation, pDeltaMethod, combos } = prepared;
  if (prepared.terminal) return withAudit(output);
  output.byCombo = byCombo;
  output.envelope = options.envelopeOverride || makeEnvelope(output.byCombo, combos);
  if (options.combinationStorage) output.combinationStorage = options.combinationStorage;
  output.combinationCompleteness = buildCombinationCompleteness(output.byCombo, combos, output.envelope);
  if (pDeltaMethod !== 'off') {
    output.pDelta = options.pDeltaOverride
      ? validateDirectPDeltaOverride(options.pDeltaOverride, pDeltaMethod, combos)
      : analyzePDeltaCombinations(model, combos, { pDeltaMethod });
  }
  if (model.analysisSettings?.responseSpectrum?.enabled !== false) {
    output.dynamics = analyzeDynamics(model);
  }
  const directDesignEligible = output.pDelta?.method === 'direct'
    && output.pDelta?.designEligibility?.eligible === true
    && output.pDelta?.ok === true
    && output.combinationCompleteness.allComplete
    && envelopeCompleteFor(output.pDelta.envelope, combos).complete;
  const linearDesignEligible = output.combinationCompleteness.allComplete;
  const designEligible = pDeltaMethod === 'direct'
    ? directDesignEligible
    : pDeltaMethod === 'off'
      ? linearDesignEligible
      : false;
  const designResultSet = directDesignEligible
    ? output.pDelta.envelope
    : pDeltaMethod === 'off' && designEligible
      ? output.envelope
      : blockedDesignResultSet();
  output.design = runDesignChecks(model, output, {
    resultSet: designResultSet,
  });
  output.design.analysisSource = directDesignEligible
    ? 'direct-pdelta-envelope'
    : pDeltaMethod === 'off' && designEligible
      ? 'linear-static-envelope'
      : pDeltaMethod === 'legacy'
        ? 'blocked-legacy-pdelta-comparison-only'
        : 'blocked-incomplete-analysis';
  output.design.pDeltaTransfer = output.pDelta
    ? output.pDelta.designEligibility
    : { eligible: false, status: 'not-requested', reason: 'PDELTA_OFF' };
  output.designEligibility = designEligible
    ? {
        eligible: true,
        status: 'qualified',
        reason: null,
        source: output.design.analysisSource,
      }
    : {
        eligible: false,
        status: 'blocked',
        reason: pDeltaMethod === 'direct' && !directDesignEligible
          ? output.pDelta?.designEligibility?.reason || 'DIRECT_PDELTA_COMBINATIONS_INCOMPLETE'
          : pDeltaMethod === 'legacy'
            ? 'LEGACY_PDELTA_DESIGN_BLOCKED'
            : 'STATIC_COMBINATIONS_INCOMPLETE',
      };
  output.design.eligibility = output.designEligibility;
  output.design.designBlocked = !designEligible;
  output.design.designQualified = designEligible;
  output.design.comparisonOnly = pDeltaMethod === 'legacy';
  if (!designEligible) {
    output.design.ok = false;
    output.design.summary.ok = false;
  }

  if (!output.combinationCompleteness.allComplete) {
    validation.errors.push({
      code: 'INCOMPLETE_LOAD_COMBINATIONS',
      message: `Not every requested load combination produced a complete qualified result: ${output.combinationCompleteness.failedComboIds.join(', ')}.`,
      target: output.combinationCompleteness.failedComboIds.join(','),
    });
    output.ok = false;
  }

  if (pDeltaMethod === 'direct' && !output.pDelta?.ok) {
    validation.errors.push({
      code: output.pDelta?.reason || 'DIRECT_PDELTA_FAILED',
      message: 'The requested Direct P-Delta analysis did not produce a qualified converged result.',
      target: 'analysisSettings.pDeltaMethod',
    });
    output.ok = false;
  }

  output.analysisEligibility = {
    eligible: output.ok && (pDeltaMethod !== 'direct' || directDesignEligible),
    status: output.ok && (pDeltaMethod !== 'direct' || directDesignEligible) ? 'qualified' : 'blocked',
    reason: output.ok
      ? null
      : pDeltaMethod === 'direct' && !directDesignEligible
        ? output.pDelta?.designEligibility?.reason || 'DIRECT_PDELTA_COMBINATIONS_INCOMPLETE'
        : output.combinationCompleteness.allComplete
          ? validation.errors.at(-1)?.code || 'ANALYSIS_NOT_QUALIFIED'
          : 'INCOMPLETE_LOAD_COMBINATIONS',
  };

  return withAudit(output);
}

function validateDirectPDeltaOverride(override, pDeltaMethod, combos) {
  if (pDeltaMethod !== 'direct'
    || override?.method !== 'direct'
    || override?.provenance?.solverVersion !== PDELTA_SECOND_ORDER_VERSION) {
    throw elasticStageError('ELASTIC_PDELTA_OVERRIDE_INVALID', 'Only a versioned Direct P-Delta result may override finalization.');
  }
  const expectedIds = combos.map((combo) => combo.id).sort();
  const actualIds = Object.keys(override.byCombo || {}).sort();
  if (expectedIds.length !== actualIds.length || expectedIds.some((id, index) => id !== actualIds[index])) {
    throw elasticStageError('ELASTIC_PDELTA_OVERRIDE_COMBINATIONS_INVALID', 'Direct P-Delta override combinations do not match the prepared analysis.');
  }
  for (const comboId of expectedIds) {
    const run = override.byCombo[comboId];
    if (run?.version !== PDELTA_SECOND_ORDER_VERSION
      || run?.requestedMethod !== 'direct'
      || run?.provenance?.comboId !== comboId
      || run?.provenance?.solverVersion !== PDELTA_SECOND_ORDER_VERSION) {
      throw elasticStageError('ELASTIC_PDELTA_OVERRIDE_PROVENANCE_INVALID', `Direct P-Delta override provenance is invalid for ${comboId}.`);
    }
  }
  return override;
}

function elasticStageError(code, message) {
  return Object.assign(new Error(message), { code });
}

function withAudit(output) {
  output.audit = buildAnalysisAudit(output, {
    equilibriumLimit: resolveCriterion(output.model, 'audit.equilibriumRelative', 1e-8),
  });
  return output;
}

function appendSolverDiagnosticWarnings(warnings, comboId, result) {
  for (const item of result?.solver?.warnings || []) {
    warnings.push({
      level: 'WARNING',
      code: item.code,
      message: `${comboId}: ${item.message}`,
      target: item.target || 'solver',
    });
  }
}

function appendComponentFailureErrors(errors, comboId, result) {
  for (const failure of result?.failedComponents || []) {
    const code = failure.reason || 'COMPONENT_SOLVE_FAILED';
    const memberIds = failure.memberIds || [];
    errors.push({
      level: 'ERROR',
      code,
      message: `${comboId}: component analysis failed (${code})${memberIds.length ? ` for members ${memberIds.join(', ')}` : ''}.`,
      target: memberIds.join(',') || comboId,
    });
  }
}

function resolveRequestedCombinations(model) {
  const authored = Array.isArray(model.loadCombinations) ? model.loadCombinations : [];
  if (authored.length) {
    return {
      ok: true,
      combos: authored,
      trace: { source: 'authored-or-analysis-case', explicit: true, comboIds: authored.map((combo) => combo.id) },
    };
  }

  const settings = model.analysisSettings || {};
  const selection = settings.caseSelection
    ?? settings.loadCaseSelection
    ?? settings.selectedLoadCaseId
    ?? settings.loadCaseId
    ?? null;
  if (selection && typeof selection === 'object' && selection.factors && Object.keys(selection.factors).length) {
    const combo = {
      id: selection.id || selection.comboId || 'EXPLICIT_CASE_SELECTION',
      name: selection.name || selection.id || 'Explicit case selection',
      type: selection.type || 'analysis-case',
      factors: { ...selection.factors },
    };
    return {
      ok: true,
      combos: [combo],
      trace: { source: 'explicit-case-selection', explicit: true, comboIds: [combo.id] },
    };
  }
  if (typeof selection === 'string' && selection) {
    const loadCase = (model.loadCases || []).find((item) => item.id === selection);
    if (loadCase) {
      const combo = {
        id: `CASE:${loadCase.id}`,
        name: `1.0 x ${loadCase.name || loadCase.id}`,
        type: 'analysis-case',
        factors: { [loadCase.id]: 1 },
      };
      return {
        ok: true,
        combos: [combo],
        trace: { source: 'explicit-load-case-selection', explicit: true, comboIds: [combo.id] },
      };
    }
  }

  if (model.projectSetup?.status === 'load-setup-required') {
    return {
      ok: false,
      reason: 'LOAD_SETUP_REQUIRED',
      message: 'Load combinations must be authored or an explicit analysis case/load case must be selected before analysis.',
      combos: [],
      trace: {
        source: 'blocked-load-setup-required',
        explicit: false,
        comboIds: [],
        availableLoadCaseIds: (model.loadCases || []).map((item) => item.id),
      },
    };
  }

  const generated = defaultCombos(model);
  return {
    ok: true,
    combos: generated,
    trace: { source: 'legacy-default', explicit: false, comboIds: generated.map((combo) => combo.id) },
  };
}

function buildCombinationCompleteness(byCombo, combos, envelope) {
  const rows = combos.map((combo) => {
    const result = byCombo[combo.id];
    const reasons = resultCompletenessReasons(result);
    return {
      comboId: combo.id,
      complete: reasons.length === 0,
      status: reasons.length ? 'incomplete' : 'complete',
      reasons,
    };
  });
  const envelopeState = envelopeCompleteFor(envelope, combos);
  const failedComboIds = rows.filter((row) => !row.complete).map((row) => row.comboId);
  return {
    version: 'p7-m8-all-requested-combinations-v1',
    requestedComboIds: combos.map((combo) => combo.id),
    requestedCount: combos.length,
    completeCount: rows.filter((row) => row.complete).length,
    failedComboIds,
    rows,
    envelope: envelopeState,
    allComplete: rows.length === combos.length
      && rows.every((row) => row.complete)
      && envelopeState.complete,
  };
}

function resultCompletenessReasons(result) {
  const reasons = [];
  if (!result) return ['MISSING_RESULT'];
  if (result.ok !== true) reasons.push(result.reason || 'RESULT_NOT_OK');
  if (result.anyOk !== true) reasons.push('NO_SOLVED_COMPONENT');
  if (collectionSize(result.unstableMembers) > 0) reasons.push('UNSTABLE_MEMBERS');
  if (result.summary?.equilibriumOk === false || failedStatus(result.summary?.equilibriumStatus)) {
    reasons.push('EQUILIBRIUM_AUDIT_FAILED');
  }
  if (Number.isFinite(Number(result.summary?.equilibriumResidual))
    && Number.isFinite(Number(result.summary?.equilibriumLimit))
    && Number(result.summary.equilibriumResidual) > Number(result.summary.equilibriumLimit)) {
    reasons.push('EQUILIBRIUM_LIMIT_EXCEEDED');
  }
  if (result.recovery?.qualified === false) reasons.push(result.recovery.reason || 'RECOVERY_NOT_QUALIFIED');
  if (result.completeness?.complete === false || result.completeness?.ok === false || failedStatus(result.completeness?.status)) {
    reasons.push(result.completeness?.reason || 'RESULT_COMPLETENESS_FAILED');
  }
  if (result.audit?.ok === false || failedStatus(result.audit?.status)) reasons.push(result.audit?.reason || 'RESULT_AUDIT_FAILED');
  if (result.provenance?.complete === false || result.provenance?.qualified === false) reasons.push('PROVENANCE_INCOMPLETE');
  if (result.eligibility?.eligible === false) reasons.push(result.eligibility.reason || 'RESULT_NOT_ELIGIBLE');
  return [...new Set(reasons)];
}

function envelopeCompleteFor(envelope, combos) {
  const reasons = [];
  if (!envelope) return { complete: false, status: 'incomplete', reasons: ['MISSING_ENVELOPE'], sourceComboIds: [] };
  if (envelope.ok !== true || envelope.anyOk !== true) reasons.push('ENVELOPE_NOT_OK');
  if (envelope.complete === false || envelope.incomplete === true) reasons.push('ENVELOPE_INCOMPLETE');
  if (envelope.designBlocked === true) reasons.push('ENVELOPE_DESIGN_BLOCKED');
  const requested = new Set(combos.map((combo) => combo.id));
  const envelopeSources = Array.isArray(envelope.sources)
    ? envelope.sources
    : Array.isArray(envelope.successfulSources)
      ? envelope.successfulSources
      : [];
  const sourceComboIds = envelopeSources.map((source) => source.id).filter(Boolean);
  const missingSources = [...requested].filter((id) => !sourceComboIds.includes(id));
  const unexpectedSources = sourceComboIds.filter((id) => !requested.has(id));
  if (missingSources.length) reasons.push('ENVELOPE_MISSING_REQUESTED_SOURCES');
  if (unexpectedSources.length) reasons.push('ENVELOPE_HAS_UNREQUESTED_SOURCES');
  if (Number.isFinite(Number(envelope.requestedComboCount))
    && Number(envelope.requestedComboCount) !== combos.length) {
    reasons.push('ENVELOPE_REQUEST_COUNT_MISMATCH');
  }
  if (Number.isFinite(Number(envelope.successfulComboCount))
    && Number(envelope.successfulComboCount) !== combos.length) {
    reasons.push('ENVELOPE_SUCCESS_COUNT_MISMATCH');
  }
  if (envelope.completeness?.complete === false || envelope.completeness?.ok === false || failedStatus(envelope.completeness?.status)) {
    reasons.push(envelope.completeness?.reason || 'ENVELOPE_COMPLETENESS_FAILED');
  }
  if (envelope.audit?.ok === false || failedStatus(envelope.audit?.status)) reasons.push(envelope.audit?.reason || 'ENVELOPE_AUDIT_FAILED');
  if (envelope.provenance?.complete === false || envelope.provenance?.qualified === false) reasons.push('ENVELOPE_PROVENANCE_INCOMPLETE');
  return {
    complete: reasons.length === 0,
    status: reasons.length ? 'incomplete' : 'complete',
    reasons: [...new Set(reasons)],
    sourceComboIds,
    missingSources,
    unexpectedSources,
  };
}

function blockedDesignResultSet() {
  return {
    ok: false,
    anyOk: false,
    memberResults: {},
    reactions: {},
    disp: {},
    combo: null,
    designBlocked: true,
  };
}

function collectionSize(value) {
  if (!value) return 0;
  if (typeof value.size === 'number') return value.size;
  if (Array.isArray(value)) return value.length;
  return Object.keys(value).length;
}

function failedStatus(value) {
  const status = String(value || '').toUpperCase();
  return ['FAIL', 'FAILED', 'BLOCKED', 'INCOMPLETE', 'NOT_QUALIFIED'].includes(status);
}

export function analyzeAll(model, factors = null, options = {}) {
  if (!options.skipUnilateral && hasUnilateralMembers(model)) {
    return analyzeUnilateralMembers(model, factors, options);
  }
  return analyzeAllOnce(model, factors, options);
}

function analyzeAllOnce(model, factors = null, options = {}) {
  const domain = options.expandedDomain || buildExpandedAnalysisDomain(model, factors, options);
  const { nodes, members, loads, solverModel } = domain;
  if (!domain.ok) return {
    ok: false,
    anyOk: false,
    reason: domain.reason || 'CANONICAL_DOMAIN_INVALID',
    analysisDomain: domain.adapterIdentity || null,
    domainErrors: [...(domain.elementErrors || []), ...(domain.constraint?.errors || []), ...(domain.capabilities?.blocking || [])],
    unstableMembers: new Set(),
    failedComponents: [],
  };
  if (!members.length) return {
    ok: false,
    empty: true,
    anyOk: false,
    reason: 'NO_SOLVED_COMPONENT',
    unstableMembers: new Set(),
    failedComponents: [],
    analysisDomain: domain.adapterIdentity,
  };

  const analysisSettings = model.analysisSettings || {};
  const materialCache = new Map();
  const sectionCache = new Map();

  const ctx = {
    mat: (id) => cachedCatalogValue(materialCache, id, () => materialOf(solverModel, id)),
    sec: (id) => cachedCatalogValue(sectionCache, id, () => sectionOf(solverModel, id)),
    stations: Math.max(21, analysisSettings.memberStations | 0 || 21),
    criteriaModel: model,
    solver: analysisSettings.solver || analysisSettings.linearSolver,
    sparse: analysisSettings.useSparseSolver,
    sparseThreshold: analysisSettings.sparseThreshold,
    componentCache: options.componentCache,
    factorSession: options.factorSession,
    factorGroupKey: options.factorGroupKey,
    captureSystemsOnly: options.captureSystemsOnly === true,
    precomputedSolutions: options.precomputedSolutions,
    signal: options.signal,
  };
  const diaphragms = resolveRigidDiaphragms(model, nodes);
  ctx.diaphragms = diaphragms;

  const groups = connectedComponentGroups(nodes, members, diaphragms.map((group) => group.nodeIds));
  const out = {
    ok: true,
    disp: {},
    reactions: {},
    memberResults: {},
    solver: {
      type: 'linear_static_3d_frame',
      components: [],
    },
    elasticExpansion: domain.expansion.trace,
    analysisDomain: domain.adapterIdentity,
    unstableMembers: new Set(),
    failedComponents: [],
    dmax: 0,
    anyOk: false,
    maxRatio: 0,
    ngCount: 0,
    okCount: 0,
  };
  if (options.captureSystemsOnly) out.systemCaptures = [];
  const capturedComponents = [];

  for (const group of Object.values(groups)) {
    const ns = nodes.filter((node) => group.nids.has(node.id));
    const ms = members.filter((member) => group.mids.has(member.id));
    const ls = loads.filter((load) => (
      (load.node && group.nids.has(load.node)) ||
      (load.member && group.mids.has(load.member))
    ));
    const componentKey = [
      [...group.nids].map(String).sort().join(','),
      [...group.mids].map(String).sort().join(','),
    ].join('::');
    const result = analyzeComponent3D(ns, ms, ls, { ...ctx, componentKey });
    if (result.capture) {
      out.anyOk = true;
      out.systemCaptures.push(result.capture);
      capturedComponents.push({ group, ms, capture: result.capture, resume: result.resume });
      continue;
    }
    if (!result.ok) {
      group.mids.forEach((id) => out.unstableMembers.add(id));
      out.failedComponents.push({
        reason: result.reason || 'COMPONENT_SOLVE_FAILED',
        memberIds: [...group.mids],
        nodeIds: [...group.nids],
        solver: result.solver || null,
      });
      continue;
    }
    out.anyOk = true;
    out.solver.components.push(result.solver);
    Object.assign(out.disp, result.disp);
    Object.assign(out.reactions, result.reactions);
    Object.entries(result.memberResults).forEach(([id, row]) => {
      if (!ms.find((member) => member.id === id)?.generated) out.memberResults[id] = row;
    });
  }

  if (options.captureSystemsOnly) {
    out.ok = out.failedComponents.length === 0 && out.systemCaptures.length > 0;
    out.reason = out.ok ? null : out.failedComponents[0]?.reason || 'NO_CAPTURED_COMPONENT_SYSTEM';
    out.resume = (precomputedSolutions) => {
      out.ok = true;
      out.anyOk = false;
      out.reason = null;
      out.disp = {};
      out.reactions = {};
      out.memberResults = {};
      out.unstableMembers = new Set();
      out.failedComponents = [];
      out.solver = { type: 'linear_static_3d_frame', components: [] };
      for (const row of capturedComponents) {
        const replay = typeof precomputedSolutions?.get === 'function'
          ? precomputedSolutions.get(row.capture.componentKey)
          : precomputedSolutions?.[row.capture.componentKey];
        const result = replay
          ? row.resume(replay)
          : { ok: false, reason: 'HYBRID_ELASTIC_PRECOMPUTED_SOLUTION_MISSING' };
        if (!result.ok) {
          row.group.mids.forEach((id) => out.unstableMembers.add(id));
          out.failedComponents.push({
            reason: result.reason || 'COMPONENT_SOLVE_FAILED',
            memberIds: [...row.group.mids],
            nodeIds: [...row.group.nids],
            solver: result.solver || null,
          });
          continue;
        }
        out.anyOk = true;
        out.solver.components.push(result.solver);
        Object.assign(out.disp, result.disp);
        Object.assign(out.reactions, result.reactions);
        Object.entries(result.memberResults).forEach(([id, memberResult]) => {
          if (!row.ms.find((member) => member.id === id)?.generated) out.memberResults[id] = memberResult;
        });
      }
      delete out.systemCaptures;
      delete out.resume;
      return finalizeSolvedOutput();
    };
    out.solver = {
      type: 'elastic-component-system-capture',
      componentCount: out.systemCaptures.length,
      solved: false,
    };
    return out;
  }

  return finalizeSolvedOutput();

  function finalizeSolvedOutput() {
    out.dmax = 0;
    out.maxRatio = 0;
    out.ngCount = 0;
    out.okCount = 0;
    for (const id of Object.keys(out.disp)) {
      out.dmax = Math.max(out.dmax, vlen(out.disp[id].slice(0, 3)));
    }
    for (const id of Object.keys(out.memberResults)) {
      const memberResult = out.memberResults[id];
      out.dmax = Math.max(out.dmax, memberResult.dmaxM);
      out.maxRatio = Math.max(out.maxRatio, memberResult.check.ratio);
      if (memberResult.check.ok) out.okCount += 1;
      else out.ngCount += 1;
    }

    if (!out.anyOk) {
      out.ok = false;
      out.reason = 'NO_SOLVED_COMPONENT';
    } else if (out.unstableMembers.size) {
      out.ok = false;
      out.reason = 'UNSTABLE_COMPONENT';
    }
    out.solver = summarizeSolverDiagnostics(out.solver.components);
    out.semiRigidDiaphragm = domain.semiRigid;
    out.shellFrameAssembly = domain.shellAssembly;
    out.summary = buildEquilibriumSummary(nodes, members, loads, out, {
      equilibriumLimit: resolveCriterion(model, 'audit.equilibriumRelative', 1e-8),
    });
    return out;
  }
}

function cachedCatalogValue(cache, id, resolve) {
  if (!cache.has(id)) cache.set(id, resolve());
  return cache.get(id);
}

function analyzeUnilateralMembers(model, factors = null, options = {}) {
  const unilateral = (model.members || []).filter((member) => ['tensionOnly', 'compressionOnly'].includes(member.behavior || member.type));
  const maxIterations = Math.max(1, model.analysisSettings?.unilateralMaxIterations | 0 || 10);
  const tolerance = Number(model.analysisSettings?.unilateralTolerance) >= 0 ? Number(model.analysisSettings.unilateralTolerance) : 1e-7;
  const active = new Set((model.members || []).map((member) => member.id));
  const iterations = [];
  let result = null;
  let converged = false;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    result = analyzeAllOnce(model, factors, { ...options, skipUnilateral: true, activeMemberIds: active });
    const newlyInactive = [];
    if (result.ok) {
      for (const member of unilateral) {
        if (!active.has(member.id)) continue;
        const axial = signedAxial(result.memberResults?.[member.id]);
        const behavior = member.behavior || member.type;
        if (behavior === 'tensionOnly' && axial < -tolerance) newlyInactive.push({ memberId: member.id, axial, reason: 'compression-in-tension-only' });
        if (behavior === 'compressionOnly' && axial > tolerance) newlyInactive.push({ memberId: member.id, axial, reason: 'tension-in-compression-only' });
      }
    }
    for (const row of newlyInactive) active.delete(row.memberId);
    iterations.push({
      iteration,
      ok: !!result.ok,
      activeMemberIds: [...active].sort(),
      newlyInactive,
      inactiveMemberIds: unilateral.map((member) => member.id).filter((id) => !active.has(id)).sort(),
    });
    if (!result.ok || !newlyInactive.length) {
      converged = !!result.ok;
      break;
    }
  }

  const lastIteration = iterations[iterations.length - 1];
  if (!result || (!converged && lastIteration?.newlyInactive?.length)) {
    result = analyzeAllOnce(model, factors, { ...options, skipUnilateral: true, activeMemberIds: active });
  }
  result.unilateral = {
    version: 'p3-m11-unilateral-member-iteration',
    enabled: true,
    converged,
    maxIterations,
    iterationCount: iterations.length,
    activeMemberIds: [...active].sort(),
    inactiveMemberIds: unilateral.map((member) => member.id).filter((id) => !active.has(id)).sort(),
    iterations,
    warning: converged ? null : 'UNILATERAL_NOT_CONVERGED',
  };
  return result;
}

function hasUnilateralMembers(model = {}) {
  return (model.members || []).some((member) => ['tensionOnly', 'compressionOnly'].includes(member.behavior || member.type));
}

function signedAxial(memberResult) {
  const values = memberResult?.N || [];
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

export function analyzePDeltaCombinations(model, combos, options = {}) {
  const requestedMethod = options.pDeltaMethod ?? model.analysisSettings?.pDeltaMethod;
  const method = normalizePDeltaMethod(requestedMethod, {
    legacyEnabled: requestedMethod == null,
    fallback: 'legacy',
  });
  if (method === 'direct') return analyzeDirectPDeltaCombinations(model, combos, options);
  if (method === 'off') {
    return {
      enabled: false,
      method: 'off',
      solverMethod: null,
      ok: true,
      byCombo: {},
      envelope: null,
      provenance: {
        requestedMethod: requestedMethod ?? 'off',
        routedMethod: 'off',
        solver: null,
      },
      designEligibility: { eligible: false, status: 'not-requested', reason: 'PDELTA_OFF' },
    };
  }

  const byCombo = {};
  const criteria = buildAnalysisCriteriaTrace(model);
  for (const combo of combos) {
    byCombo[combo.id] = analyzePDelta(model, combo.factors, model.analysisSettings || {});
    byCombo[combo.id].combo = comboSnapshot(combo);
    byCombo[combo.id].requestedMethod = 'legacy';
    byCombo[combo.id].provenance = {
      requestedMethod: 'legacy',
      routedMethod: 'legacy',
      solver: 'analyzePDelta',
      solverMethod: 'equivalent-lateral-load-iteration-legacy',
    };
    if (byCombo[combo.id].result) byCombo[combo.id].result.combo = comboSnapshot(combo);
    byCombo[combo.id].curve = buildPDeltaLoadStepCurve(model, combo.factors, byCombo[combo.id], model.analysisSettings || {});
  }
  const finalByCombo = {};
  for (const combo of combos) {
    finalByCombo[combo.id] = byCombo[combo.id].result;
  }
  const envelope = makeEnvelope(finalByCombo, combos);
  const summary = summarizePDelta(byCombo);
  const design = buildPDeltaDesignSummary(model, combos, byCombo, model.analysisSettings || {});
  const allCompared = combos.length > 0
    && combos.every((combo) => byCombo[combo.id]?.ok === true && byCombo[combo.id]?.converged === true);
  if (envelope) {
    envelope.designBlocked = true;
    envelope.designQualified = false;
    envelope.comparisonOnly = true;
    envelope.designBlockers = [
      ...(envelope.designBlockers || []),
      { comboId: null, status: 'BLOCKED', reason: 'LEGACY_PDELTA_DESIGN_BLOCKED' },
    ];
  }
  design.designBlocked = true;
  design.designQualified = false;
  design.reason = 'LEGACY_PDELTA_DESIGN_BLOCKED';
  return {
    enabled: true,
    method: 'legacy',
    solverMethod: 'equivalent-lateral-load-iteration-legacy',
    curveMethod: 'load-step-global-story-member-pdelta',
    ok: allCompared,
    comparisonOnly: true,
    byCombo,
    curves: summarizePDeltaCurves(byCombo),
    criteria,
    design,
    envelope,
    summary,
    provenance: {
      requestedMethod: requestedMethod ?? 'legacy',
      routedMethod: 'legacy',
      solver: 'analyzePDelta',
      solverMethod: 'equivalent-lateral-load-iteration-legacy',
    },
    convergence: {
      converged: Object.values(byCombo).every((item) => item.converged),
      convergedCount: Object.values(byCombo).filter((item) => item.converged).length,
      comboCount: combos.length,
    },
    designEligibility: {
      eligible: false,
      status: 'preliminary',
      reason: 'LEGACY_PDELTA_DESIGN_BLOCKED',
      source: 'legacy-pdelta-envelope',
      message: 'Legacy equivalent-load P-Delta is available for comparison only; use converged Direct P-Delta for design transfer.',
    },
  };
}

export function buildDirectPDeltaAnalysis(model, combos, runByCombo, options = {}) {
  return analyzeDirectPDeltaCombinations(model, combos, { ...options, runByCombo });
}

function analyzeDirectPDeltaCombinations(model, combos, options = {}) {
  const byCombo = {};
  const finalByCombo = {};
  const settings = { ...(model.analysisSettings || {}), ...options, pDeltaMethod: 'direct' };
  for (const combo of combos) {
    const comboInfo = comboSnapshot(combo);
    const run = options.runByCombo?.[combo.id] || runSecondOrderPDelta(model, combo.factors, settings);
    run.combo = comboInfo;
    run.requestedMethod = 'direct';
    run.provenance = {
      ...(run.provenance || {}),
      requestedMethod: 'direct',
      routedMethod: 'direct',
      solver: 'runSecondOrderPDelta',
      solverMethod: run.method,
      solverVersion: run.version,
      comboId: combo.id,
    };
    if (run.result) {
      run.result.combo = comboInfo;
      run.result.method = 'direct';
      run.result.solverMethod = run.method;
      run.result.provenance = { ...run.provenance };
      run.result.convergence = run.convergence;
      finalByCombo[combo.id] = run.result;
    }
    byCombo[combo.id] = run;
  }

  const envelope = makeEnvelope(finalByCombo, combos);
  const runs = Object.values(byCombo);
  const convergedCount = runs.filter((item) => item.converged).length;
  const qualifiedCount = runs.filter((item) => item.designEligibility?.eligible).length;
  const allQualified = combos.length > 0
    && runs.length === combos.length
    && qualifiedCount === combos.length;
  const failed = runs.find((item) => !item.ok || !item.converged || !item.designEligibility?.eligible);
  const graphs = buildDirectPDeltaGraphs(byCombo);
  if (envelope) {
    envelope.method = 'direct';
    envelope.solverMethod = 'geometric-stiffness-second-order-direct';
    envelope.provenance = {
      requestedMethod: 'direct',
      routedMethod: 'direct',
      solver: 'runSecondOrderPDelta',
      solverVersion: PDELTA_SECOND_ORDER_VERSION,
      comboIds: combos.map((combo) => combo.id),
    };
  }
  const envelopeState = envelopeCompleteFor(envelope, combos);
  const fullyQualified = allQualified && envelopeState.complete;
  const design = buildPDeltaDesignSummary(model, combos, byCombo, settings);
  design.designBlocked = !fullyQualified;
  design.designQualified = fullyQualified;
  design.reason = fullyQualified
    ? null
    : failed?.designEligibility?.reason || failed?.reason || envelopeState.reasons[0] || 'DIRECT_PDELTA_NOT_QUALIFIED';

  return {
    enabled: true,
    method: 'direct',
    solverMethod: 'geometric-stiffness-second-order-direct',
    curveMethod: 'direct-load-step-tangent-response',
    ok: fullyQualified,
    reason: fullyQualified
      ? 'CONVERGED'
      : failed?.reason || envelopeState.reasons[0] || 'NO_DIRECT_RESULTS',
    byCombo,
    envelope,
    graphs,
    curves: graphs,
    criteria: buildAnalysisCriteriaTrace(model),
    design,
    summary: {
      ...summarizePDelta(byCombo),
      convergedCount,
      qualifiedCount,
      comboCount: runs.length,
      envelope: envelopeState,
    },
    convergence: {
      converged: runs.length > 0 && convergedCount === runs.length,
      convergedCount,
      qualifiedCount,
      comboCount: runs.length,
      byCombo: Object.fromEntries(Object.entries(byCombo).map(([comboId, item]) => [comboId, item.convergence])),
    },
    provenance: {
      requestedMethod: 'direct',
      routedMethod: 'direct',
      solver: 'runSecondOrderPDelta',
      solverMethod: 'geometric-stiffness-second-order-direct',
      solverVersion: PDELTA_SECOND_ORDER_VERSION,
    },
    designEligibility: fullyQualified
      ? { eligible: true, status: 'qualified', reason: null, source: 'direct-pdelta-envelope' }
      : {
          eligible: false,
          status: 'blocked',
          reason: failed?.designEligibility?.reason || failed?.reason || 'DIRECT_PDELTA_NOT_QUALIFIED',
          message: failed?.designEligibility?.message || 'Direct P-Delta results are incomplete or not converged.',
        },
  };
}

function buildDirectPDeltaGraphs(byCombo = {}) {
  const combinations = Object.entries(byCombo).map(([comboId, item]) => {
    const globalPoints = [{
      loadFactor: 0,
      maxDisplacement: 0,
      converged: true,
    }];
    for (const step of item.steps || []) {
      const last = [...(step.iterations || [])].reverse().find((iteration) => iteration.ok);
      globalPoints.push({
        loadFactor: step.lambda,
        maxDisplacement: last?.maxLateralDisplacement ?? last?.maxDisplacement ?? null,
        maxLateralDisplacement: last?.maxLateralDisplacement ?? null,
        maxVerticalDisplacement: last?.maxVerticalDisplacement ?? null,
        maxTotalDisplacement: last?.maxDisplacement ?? null,
        responseComponent: 'global-lateral-resultant',
        converged: !!step.converged,
        iterationCount: step.iterations?.length || 0,
      });
    }
    return {
      comboId,
      method: 'direct',
      globalPoints,
      storyRows: item.split?.storyRows || [],
      memberRows: item.split?.memberRows || [],
      summary: {
        loadStepCount: globalPoints.length,
        storyCount: item.split?.storyRows?.length || 0,
        memberCount: item.split?.memberRows?.length || 0,
        amplification: item.amplification ?? null,
        converged: !!item.converged,
      },
    };
  });
  return {
    version: 'p7-m8-direct-pdelta-graphs-v1',
    method: 'direct',
    combos: combinations.map((item) => ({
      comboId: item.comboId,
      globalPointCount: item.globalPoints.length,
      storyCount: item.storyRows.length,
      memberCount: item.memberRows.length,
      summary: item.summary,
    })),
    global: combinations.map(({ comboId, globalPoints }) => ({ comboId, points: globalPoints })),
    stories: combinations.map(({ comboId, storyRows }) => ({ comboId, rows: storyRows })),
    members: combinations.map(({ comboId, memberRows }) => ({ comboId, rows: memberRows })),
    combinations,
  };
}

export function buildPDeltaDesignSummary(model, combos = [], byCombo = {}, settings = {}) {
  const direct = normalizePDeltaMethod(settings.pDeltaMethod, { fallback: 'legacy' }) === 'direct';
  const thetaCaution = positiveNumber(resolveCriterion(model, 'pdelta.thetaCaution'), settings.pDeltaThetaNegligible, 0.05);
  const thetaRequire = positiveNumber(resolveCriterion(model, 'pdelta.thetaRequire'), 0.1);
  const thetaStrong = positiveNumber(resolveCriterion(model, 'pdelta.thetaStrong'), settings.pDeltaThetaLimit, 0.2);
  const rows = [];
  const storyRows = [];
  const memberForceRows = [];

  for (const combo of combos || []) {
    const item = byCombo?.[combo.id];
    const result = item?.result || null;
    const firstOrder = item?.linear || null;
    const comboStoryRows = pDeltaDesignStoryRows(model, result, combo, { thetaCaution, thetaRequire, thetaStrong });
    storyRows.push(...comboStoryRows);
    memberForceRows.push(...pDeltaDesignMemberForceRows(model, firstOrder, result, combo));

    const directions = uniqueStrings(comboStoryRows.map((row) => row.direction));
    if (!directions.length) {
      rows.push({
        comboId: combo.id,
        comboName: combo.name || combo.id,
        direction: '-',
        governingStory: '-',
        maxTheta: 0,
        maxBDelta: 1,
        maxPDeltaShear: 0,
        maxPDeltaMoment: 0,
        converged: !!item?.converged,
        iterationCount: item?.iterations?.length || 0,
        status: item?.converged ? 'N/A' : 'NG',
        reason: item?.converged ? 'NO_LATERAL_STORY_SHEAR' : item?.reason || 'PDELTA_NOT_CONVERGED',
      });
    }
    for (const direction of directions) {
      const directionalRows = comboStoryRows.filter((row) => row.direction === direction);
      const governing = directionalRows.reduce((best, row) => (
        !best || row.theta > best.theta ? row : best
      ), null);
      const status = !item?.converged ? 'NG' : pDeltaDesignStatus(governing?.theta || 0, thetaCaution, thetaStrong);
      rows.push({
        comboId: combo.id,
        comboName: combo.name || combo.id,
        direction,
        governingStory: governing?.storyId || '-',
        maxTheta: governing?.theta || 0,
        maxBDelta: governing?.bDelta || 1,
        maxPDeltaShear: Math.max(0, ...directionalRows.map((row) => row.pDeltaShear)),
        maxPDeltaMoment: Math.max(0, ...directionalRows.map((row) => row.pDeltaMoment)),
        converged: !!item?.converged,
        iterationCount: item?.iterations?.length || 0,
        status,
      });
    }
  }

  const governing = rows.reduce((best, row) => (
    !best || row.maxTheta > best.maxTheta ? row : best
  ), null);
  return {
    version: 'pdelta-design-summary-v1',
    method: direct
      ? 'direct-geometric-stiffness-combination-final'
      : 'legacy-equivalent-load-iteration-diagnostic',
    thetaLimits: {
      caution: thetaCaution,
      require: thetaRequire,
      strong: thetaStrong,
      negligible: thetaCaution,
      limit: thetaStrong,
    },
    summary: {
      comboCount: combos.length,
      rowCount: rows.length,
      storyRowCount: storyRows.length,
      memberForceRowCount: memberForceRows.length,
      maxTheta: governing?.maxTheta || 0,
      maxBDelta: governing?.maxBDelta || 1,
      maxPDeltaShear: Math.max(0, ...rows.map((row) => row.maxPDeltaShear)),
      maxPDeltaMoment: Math.max(0, ...rows.map((row) => row.maxPDeltaMoment)),
      governing,
      status: worstStatus(rows.map((row) => row.status)),
    },
    rows,
    storyRows,
    memberForceRows,
    notes: direct
      ? [
          'Values are recovered from the final converged Direct tangent-stiffness result for each factored combination.',
          'Automatic design transfer is allowed only when every requested combination has qualified reaction and member-station recovery.',
          'Member chord-drift rows are diagnostics; design checks use recovered final second-order member forces.',
        ]
      : [
          'Legacy equivalent-load iteration is retained for compatibility and is explicitly identified as legacy.',
          'Legacy design transfer uses the legacy combination envelope and never represents the Direct tangent method.',
          'Member diagnostic N-delta/L curves are not design forces.',
        ],
  };
}

export function analyzePDelta(model, factors = null, settings = {}) {
  const criteria = buildAnalysisCriteriaTrace(model);
  const maxIterations = Math.max(1, Math.trunc(positiveNumber(resolveCriterion(model, 'pdelta.maxIter'), settings.pDeltaMaxIterations, 12)));
  const tolerance = positiveNumber(resolveCriterion(model, 'pdelta.eR'), settings.pDeltaTolerance, 1e-4);
  const maxAmplification = positiveNumber(resolveCriterion(model, 'pdelta.ampLimit'), settings.pDeltaMaxAmplification, 2.5);
  const linear = analyzeAll(model, factors);
  const iterations = [{
    iteration: 0,
    maxDisplacement: linear.summary?.maxDisplacement || 0,
    amplification: 1,
    secondaryLoad: 0,
    residual: null,
  }];
  if (!linear.ok) {
    return {
      ok: false,
      converged: false,
      reason: linear.reason || 'LINEAR_FAILED',
      method: 'equivalent-lateral-load-iteration-legacy',
      linear,
      result: linear,
      iterations,
      amplification: 1,
      criteria,
      convergence: { converged: false, reason: linear.reason || 'LINEAR_FAILED', iterationCount: 0 },
      warnings: [{ code: 'PDELTA_LINEAR_FAILED', message: 'Linear seed result failed.' }],
    };
  }

  let previous = linear;
  let result = linear;
  let converged = false;
  let reason = 'MAX_ITERATIONS';

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const pLoads = makePDeltaLoads(model, previous, { iteration });
    const next = analyzeAll(model, factors, { extraLoads: pLoads.loads });
    if (!next.ok) {
      result = next;
      reason = next.reason || 'PDELTA_FAILED';
      iterations.push({
        iteration,
        maxDisplacement: null,
        amplification: null,
        secondaryLoad: pLoads.total,
        memberRows: pLoads.memberRows,
        residual: null,
      });
      break;
    }
    const previousD = previous.summary?.maxDisplacement || 0;
    const nextD = next.summary?.maxDisplacement || 0;
    const linearD = linear.summary?.maxDisplacement || 0;
    const residual = Math.abs(nextD - previousD) / Math.max(1e-12, Math.abs(nextD));
    const amplification = linearD > 0 ? nextD / linearD : 1;
    next.pDeltaLoads = pLoads.loads;
    next.pDeltaMemberRows = pLoads.memberRows;
    next.pDelta = {
      iteration,
      secondaryLoad: pLoads.total,
      amplification,
      residual,
    };
    iterations.push({
      iteration,
      maxDisplacement: nextD,
      amplification,
      secondaryLoad: pLoads.total,
      memberRows: pLoads.memberRows,
      residual,
    });
    result = next;
    previous = next;
    if (residual <= tolerance) {
      converged = true;
      reason = 'CONVERGED';
      break;
    }
    if (amplification > maxAmplification) {
      reason = 'AMPLIFICATION_LIMIT';
      break;
    }
  }

  const finalAmp = iterations.at(-1)?.amplification ?? 1;
  const warnings = [];
  if (!converged) warnings.push({ code: 'PDELTA_NOT_CONVERGED', message: reason });
  if (finalAmp > maxAmplification) warnings.push({ code: 'PDELTA_HIGH_AMPLIFICATION', message: `Amplification ${finalAmp.toFixed(3)} exceeds limit.` });

  result.pDelta = {
    enabled: true,
    method: 'legacy',
    solverMethod: 'equivalent-lateral-load-iteration-legacy',
    converged,
    reason,
    amplification: finalAmp,
    iterations,
    criteria,
    warnings,
  };

  return {
    ok: result.ok && converged,
    converged,
    reason,
    method: 'equivalent-lateral-load-iteration-legacy',
    linear,
    result,
    iterations,
    amplification: finalAmp,
    criteria,
    convergence: {
      converged,
      reason,
      iterationCount: Math.max(0, iterations.length - 1),
      criteria: { tolerance, maxIterations, maxAmplification },
    },
    warnings,
  };
}

export function makePDeltaLoads(model, result, options = {}) {
  const nodes = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  const loads = [];
  const memberRows = [];
  let total = 0;
  const iteration = options.iteration || 1;
  for (const member of model.members || []) {
    const demand = result.memberResults?.[member.id];
    const a = nodes[member.n1];
    const b = nodes[member.n2];
    if (!demand || !a || !b) continue;
    const axis = demand.ax || memberAxes(a, b, member.localAxis);
    if (Math.abs(axis.x?.[2] || 0) < 0.5) continue;
    const length = axis.L || Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
    if (!(length > 1e-9)) continue;
    const top = (b.z || 0) >= (a.z || 0) ? b : a;
    const bottom = top === b ? a : b;
    const topDisp = result.disp?.[top.id] || [0, 0, 0];
    const bottomDisp = result.disp?.[bottom.id] || [0, 0, 0];
    const drift = [
      topDisp[0] - bottomDisp[0],
      topDisp[1] - bottomDisp[1],
      0,
    ];
    const driftMagnitude = Math.hypot(drift[0], drift[1]);
    if (driftMagnitude < 1e-12) continue;
    const axial = compressionAxialForce(demand);
    if (axial < 1e-9) continue;
    const force = axial * driftMagnitude / length;
    if (!(force > 1e-12)) continue;
    total += force;
    const row = {
      iteration,
      memberId: member.id,
      topNodeId: top.id,
      bottomNodeId: bottom.id,
      axial,
      length,
      drift: driftMagnitude,
      driftX: drift[0],
      driftY: drift[1],
      force,
      direction: [drift[0] / driftMagnitude, drift[1] / driftMagnitude, 0],
    };
    memberRows.push(row);
    loads.push({
      id: `PD${iteration}_${member.id}`,
      type: 'nodal',
      node: top.id,
      P: force,
      direction: row.direction,
      case: 'PDELTA',
      source: 'pdelta',
      member: member.id,
    });
  }
  return { loads, total, memberRows };
}

export function buildPDeltaLoadStepCurve(model, factors = null, pDeltaResult = null, settings = {}) {
  const split = splitPDeltaFactors(model, factors || {});
  const loadFactors = pDeltaLoadFactors(settings);
  const globalPoints = [];
  const stories = new Map();
  const members = new Map();

  for (const loadFactor of loadFactors) {
    const stepFactors = composePDeltaStepFactors(split, loadFactor);
    const firstOrder = loadFactor === 1 && pDeltaResult?.linear
      ? pDeltaResult.linear
      : analyzeAll(model, stepFactors);
    const secondOrderRun = loadFactor === 1 && pDeltaResult?.result
      ? pDeltaResult
      : analyzePDelta(model, stepFactors, settings);
    const secondOrder = secondOrderRun?.result || null;
    const firstGlobal = pDeltaGlobalPoint(model, firstOrder, loadFactor);
    const secondGlobal = pDeltaGlobalPoint(model, secondOrder, loadFactor);
    globalPoints.push({
      loadFactor,
      ok: !!(firstOrder?.ok && secondOrder?.ok),
      converged: !!secondOrderRun?.converged,
      firstOrder: firstGlobal,
      secondOrder: secondGlobal,
      amplification: firstGlobal.roofDisplacement > 1e-12
        ? secondGlobal.roofDisplacement / firstGlobal.roofDisplacement
        : 1,
    });

    for (const row of pDeltaStoryRows(model, secondOrder, loadFactor)) {
      if (!stories.has(row.storyId)) stories.set(row.storyId, []);
      stories.get(row.storyId).push(row);
    }
    for (const row of pDeltaMemberContributionRows(model, secondOrder, loadFactor)) {
      if (!members.has(row.memberId)) members.set(row.memberId, []);
      members.get(row.memberId).push(row);
    }
  }

  const storySeries = [...stories.entries()].map(([storyId, points]) => ({ storyId, points }));
  const memberSeries = [...members.entries()].map(([memberId, points]) => ({ memberId, points }));
  return {
    version: 'pdelta-load-step-curves-v1',
    method: 'load-step curve postprocess from secondary-load P-Delta results',
    split,
    global: {
      title: 'Global P-Delta Response Curve',
      x: 'roofDisplacement',
      y: 'baseShear',
      points: globalPoints,
    },
    stories: storySeries,
    members: memberSeries,
    summary: summarizeSinglePDeltaCurve(globalPoints, storySeries, memberSeries),
  };
}

function pDeltaLoadFactors(settings = {}) {
  const divisions = Math.min(20, Math.max(1, settings.pDeltaCurveSteps | 0 || settings.pDeltaLoadSteps | 0 || 5));
  return Array.from({ length: divisions + 1 }, (_item, index) => Number((index / divisions).toFixed(6)));
}

function splitPDeltaFactors(model, factors = {}) {
  const loadCaseById = Object.fromEntries((model.loadCases || []).map((item) => [item.id, item]));
  const gravity = {};
  const lateral = {};
  for (const [caseId, factor] of Object.entries(factors || {})) {
    const category = classifyPDeltaLoadCase(model, loadCaseById[caseId], caseId);
    if (category === 'lateral') lateral[caseId] = factor;
    else gravity[caseId] = factor;
  }
  if (!Object.keys(lateral).length) {
    return {
      gravity: {},
      lateral: { ...(factors || {}) },
      fallback: 'scale-all-load-cases',
    };
  }
  return { gravity, lateral, fallback: null };
}

function classifyPDeltaLoadCase(model, loadCase, caseId) {
  const type = String(loadCase?.type || '').toLowerCase();
  if (/(wind|seismic|earthquake|lateral|eq)/.test(type)) return 'lateral';
  if (/(dead|live|roof|snow|gravity|vertical)/.test(type)) return 'gravity';
  let horizontal = 0;
  let vertical = 0;
  for (const load of model.loads || []) {
    if ((load.case || 'LC1') !== caseId) continue;
    const direction = load.direction || AXIS[load.dir || '-z'] || [0, 0, -1];
    const hx = Math.hypot(Number(direction[0]) || 0, Number(direction[1]) || 0);
    const vz = Math.abs(Number(direction[2]) || 0);
    if (hx > vz) horizontal += Math.abs(Number(load.P ?? load.w ?? load.M) || 0);
    else vertical += Math.abs(Number(load.P ?? load.w ?? load.M) || 0);
  }
  return horizontal > vertical ? 'lateral' : 'gravity';
}

function composePDeltaStepFactors(split, loadFactor) {
  const factors = {};
  for (const [caseId, factor] of Object.entries(split.gravity || {})) factors[caseId] = factor;
  for (const [caseId, factor] of Object.entries(split.lateral || {})) factors[caseId] = factor * loadFactor;
  return factors;
}

function pDeltaGlobalPoint(model, result, loadFactor) {
  const bounds = modelVerticalBounds(model);
  const roofNodes = (model.nodes || []).filter((node) => Math.abs((node.z || 0) - bounds.maxZ) <= 1e-8);
  let roofDisplacement = 0;
  for (const node of roofNodes) {
    const d = result?.disp?.[node.id] || [0, 0, 0];
    roofDisplacement = Math.max(roofDisplacement, Math.hypot(Number(d[0]) || 0, Number(d[1]) || 0));
  }
  const base = pDeltaBaseShear(result);
  return {
    loadFactor,
    roofDisplacement,
    roofDriftRatio: bounds.height > 1e-12 ? roofDisplacement / bounds.height : 0,
    baseShear: base.baseShear,
    baseShearX: base.baseShearX,
    baseShearY: base.baseShearY,
  };
}

function pDeltaBaseShear(result) {
  let sx = 0;
  let sy = 0;
  for (const reaction of Object.values(result?.reactions || {})) {
    sx += Number(reaction.rx) || 0;
    sy += Number(reaction.ry) || 0;
  }
  return {
    baseShearX: sx,
    baseShearY: sy,
    baseShear: Math.hypot(sx, sy),
  };
}

function pDeltaStoryRows(model, result, loadFactor) {
  if (!result?.ok) return [];
  const levels = uniqueSorted((model.nodes || []).map((node) => Number(node.z) || 0));
  if (levels.length < 2) return [];
  const base = pDeltaBaseShear(result);
  return levels.slice(1).map((topZ, index) => {
    const bottomZ = levels[index];
    const height = topZ - bottomZ;
    const top = averageHorizontalDisplacementAtZ(model, result, topZ);
    const bottom = averageHorizontalDisplacementAtZ(model, result, bottomZ);
    const storyDriftX = top.x - bottom.x;
    const storyDriftY = top.y - bottom.y;
    const storyDrift = Math.hypot(storyDriftX, storyDriftY);
    const gravityLoad = storyCompressionLoad(model, result, bottomZ, topZ);
    const pDeltaShear = height > 1e-12 ? gravityLoad * storyDrift / height : 0;
    const pDeltaMoment = gravityLoad * storyDrift;
    const storyShear = base.baseShear;
    const stabilityIndex = storyShear > 1e-12 && height > 1e-12 ? (gravityLoad * storyDrift) / (storyShear * height) : 0;
    return {
      loadFactor,
      storyId: `ST${index + 1}`,
      bottomZ,
      topZ,
      height,
      storyDrift,
      storyDriftX,
      storyDriftY,
      storyDriftRatio: height > 1e-12 ? storyDrift / height : 0,
      storyShear,
      gravityLoad,
      pDeltaShear,
      pDeltaMoment,
      stabilityIndex,
      bDelta: stabilityIndex < 1 ? 1 / (1 - stabilityIndex) : null,
    };
  });
}

function pDeltaDesignStoryRows(model, result, combo, options = {}) {
  if (!result?.ok) return [];
  const levels = uniqueSorted((model.nodes || []).map((node) => Number(node.z) || 0));
  if (levels.length < 2) return [];
  const shears = storyShearVectors(model, combo?.factors || {}, levels);
  const rows = [];
  for (let index = 1; index < levels.length; index += 1) {
    const bottomZ = levels[index - 1];
    const topZ = levels[index];
    const height = topZ - bottomZ;
    if (!(height > 1e-12)) continue;
    const top = averageHorizontalDisplacementAtZ(model, result, topZ);
    const bottom = averageHorizontalDisplacementAtZ(model, result, bottomZ);
    const drift = {
      X: top.x - bottom.x,
      Y: top.y - bottom.y,
    };
    const gravityLoad = storyCompressionLoad(model, result, bottomZ, topZ);
    const shear = shears.get(topZ) || { x: 0, y: 0 };
    for (const direction of ['X', 'Y']) {
      const storyDriftSigned = direction === 'X' ? drift.X : drift.Y;
      const storyDrift = Math.abs(storyDriftSigned);
      const storyShearSigned = direction === 'X' ? shear.x : shear.y;
      const storyShear = Math.abs(storyShearSigned);
      const pDeltaMoment = gravityLoad * storyDrift;
      const pDeltaShear = pDeltaMoment / height;
      const theta = storyShear > 1e-12 ? pDeltaShear / storyShear : 0;
      if (!(storyDrift > 1e-12 || storyShear > 1e-12 || pDeltaShear > 1e-12)) continue;
      rows.push({
        comboId: combo.id,
        comboName: combo.name || combo.id,
        direction,
        storyId: `ST${index}`,
        bottomZ,
        topZ,
        height,
        gravityLoad,
        storyDrift,
        storyDriftSigned,
        storyDriftRatio: storyDrift / height,
        storyShear,
        storyShearSigned,
        pDeltaMoment,
        pDeltaShear,
        theta,
        bDelta: theta < 1 ? 1 / (1 - theta) : null,
        requiresSecondOrder: theta >= positiveNumber(options.thetaRequire, 0.1),
        status: pDeltaDesignStatus(theta, options.thetaCaution, options.thetaStrong),
      });
    }
  }
  return rows;
}

function pDeltaDesignMemberForceRows(model, firstOrder, secondOrder, combo) {
  if (!secondOrder?.memberResults) return [];
  return (model.members || [])
    .map((member) => {
      const first = firstOrder?.memberResults?.[member.id] || null;
      const second = secondOrder.memberResults?.[member.id] || null;
      if (!second) return null;
      return {
        comboId: combo.id,
        comboName: combo.name || combo.id,
        memberId: member.id,
        firstOrder: memberForceEnvelope(first),
        secondOrder: memberForceEnvelope(second),
        amplification: {
          N: forceAmplification(first?.Nmax, second.Nmax),
          Vy: forceAmplification(first?.Vymax, second.Vymax),
          Vz: forceAmplification(first?.Vzmax, second.Vzmax),
          My: forceAmplification(first?.Mymax, second.Mymax),
          Mz: forceAmplification(first?.Mzmax, second.Mzmax),
        },
      };
    })
    .filter(Boolean);
}

function memberForceEnvelope(result) {
  if (!result) return null;
  return {
    N: Number(result.Nmax) || 0,
    Vy: Number(result.Vymax) || 0,
    Vz: Number(result.Vzmax) || 0,
    My: Number(result.Mymax) || 0,
    Mz: Number(result.Mzmax) || 0,
  };
}

function forceAmplification(first, second) {
  const a = Math.abs(Number(first) || 0);
  const b = Math.abs(Number(second) || 0);
  if (a <= 1e-12) return b > 1e-12 ? null : 1;
  return b / a;
}

function pDeltaMemberContributionRows(model, result, loadFactor) {
  if (!result?.ok) return [];
  const nodes = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  const rows = [];
  for (const member of model.members || []) {
    const demand = result.memberResults?.[member.id];
    const a = nodes[member.n1];
    const b = nodes[member.n2];
    if (!demand || !a || !b) continue;
    const axes = demand.ax || memberAxes(a, b, member.localAxis);
    const length = axes.L || Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
    if (!(length > 1e-12)) continue;
    const da = result.disp?.[a.id] || [0, 0, 0];
    const db = result.disp?.[b.id] || [0, 0, 0];
    const du = [
      (Number(db[0]) || 0) - (Number(da[0]) || 0),
      (Number(db[1]) || 0) - (Number(da[1]) || 0),
      (Number(db[2]) || 0) - (Number(da[2]) || 0),
    ];
    const axialForce = compressionAxialForce(demand);
    const localChordDriftY = dot3(du, axes.y);
    const localChordDriftZ = dot3(du, axes.z);
    const pDeltaShearY = axialForce * localChordDriftY / length;
    const pDeltaShearZ = axialForce * localChordDriftZ / length;
    const pDeltaShear = Math.hypot(pDeltaShearY, pDeltaShearZ);
    const critical = memberEulerCriticalLoad(model, member, length);
    const axialRatio = critical > 1e-12 ? axialForce / critical : null;
    rows.push({
      loadFactor,
      memberId: member.id,
      axialForce,
      length,
      localChordDriftY,
      localChordDriftZ,
      localChordDrift: Math.hypot(localChordDriftY, localChordDriftZ),
      pDeltaShearY,
      pDeltaShearZ,
      pDeltaShear,
      pDeltaMomentY: axialForce * localChordDriftZ,
      pDeltaMomentZ: axialForce * localChordDriftY,
      criticalLoad: Number.isFinite(critical) && critical > 0 ? critical : null,
      axialRatio,
      amplificationB: axialRatio != null && axialRatio < 1 ? 1 / (1 - axialRatio) : null,
    });
  }
  return rows;
}

function averageHorizontalDisplacementAtZ(model, result, z) {
  const nodes = (model.nodes || []).filter((node) => Math.abs((node.z || 0) - z) <= 1e-8);
  if (!nodes.length) return { x: 0, y: 0 };
  const sum = nodes.reduce((acc, node) => {
    const d = result?.disp?.[node.id] || [0, 0, 0];
    acc.x += Number(d[0]) || 0;
    acc.y += Number(d[1]) || 0;
    return acc;
  }, { x: 0, y: 0 });
  return { x: sum.x / nodes.length, y: sum.y / nodes.length };
}

function storyCompressionLoad(model, result, bottomZ, topZ) {
  const nodes = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  let total = 0;
  for (const member of model.members || []) {
    const a = nodes[member.n1];
    const b = nodes[member.n2];
    const demand = result?.memberResults?.[member.id];
    if (!a || !b || !demand) continue;
    const z1 = Number(a.z) || 0;
    const z2 = Number(b.z) || 0;
    if (Math.min(z1, z2) > bottomZ + 1e-8 || Math.max(z1, z2) < topZ - 1e-8) continue;
    const axes = demand.ax || memberAxes(a, b, member.localAxis);
    if (Math.abs(axes.x?.[2] || 0) < 0.5) continue;
    total += compressionAxialForce(demand);
  }
  return total;
}

function storyShearVectors(model, factors = {}, levels = []) {
  const floorLoads = lateralFloorLoads(model, factors);
  const shears = new Map();
  for (const topZ of levels.slice(1)) {
    const shear = { x: 0, y: 0 };
    for (const [zKey, load] of floorLoads.entries()) {
      const z = Number(zKey);
      if (z >= topZ - 1e-8) {
        shear.x += load.x;
        shear.y += load.y;
      }
    }
    shears.set(topZ, shear);
  }
  return shears;
}

function lateralFloorLoads(model, factors = {}) {
  const nodes = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  const members = Object.fromEntries((model.members || []).map((member) => [member.id, member]));
  const loadsByZ = new Map();
  const add = (z, x, y) => {
    if (!(Number.isFinite(z) && (Math.abs(x) > 1e-12 || Math.abs(y) > 1e-12))) return;
    const key = nearestLevelKey(model, z);
    const row = loadsByZ.get(key) || { x: 0, y: 0 };
    row.x += x;
    row.y += y;
    loadsByZ.set(key, row);
  };
  for (const load of model.loads || []) {
    const scale = Number(factors[load.case || 'LC1'] ?? 0);
    if (!scale) continue;
    const direction = dirVec(load);
    const hx = Number(direction[0]) || 0;
    const hy = Number(direction[1]) || 0;
    if (Math.hypot(hx, hy) <= 1e-12) continue;
    if (load.type === 'nodal') {
      const node = nodes[load.node];
      if (!node) continue;
      add(Number(node.z) || 0, hx * Number(load.P || 0) * scale, hy * Number(load.P || 0) * scale);
    } else if (load.type === 'point') {
      const member = members[load.member];
      const a = member ? nodes[member.n1] : null;
      const b = member ? nodes[member.n2] : null;
      if (!a || !b) continue;
      const t = Math.max(0, Math.min(1, Number(load.t ?? load.at ?? 0.5)));
      const p = Number(load.P || 0) * scale;
      add(Number(a.z) || 0, hx * p * (1 - t), hy * p * (1 - t));
      add(Number(b.z) || 0, hx * p * t, hy * p * t);
    } else if (load.type === 'udl') {
      const member = members[load.member];
      const a = member ? nodes[member.n1] : null;
      const b = member ? nodes[member.n2] : null;
      if (!a || !b) continue;
      const length = Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0), (b.z || 0) - (a.z || 0));
      const total = Number(load.w || 0) * length * scale;
      add(Number(a.z) || 0, hx * total * 0.5, hy * total * 0.5);
      add(Number(b.z) || 0, hx * total * 0.5, hy * total * 0.5);
    }
  }
  return loadsByZ;
}

function nearestLevelKey(model, z) {
  const levels = uniqueSorted((model.nodes || []).map((node) => Number(node.z) || 0));
  if (!levels.length) return Number(z.toFixed(8));
  return levels.reduce((best, level) => (
    Math.abs(level - z) < Math.abs(best - z) ? level : best
  ), levels[0]);
}

function compressionAxialForce(memberResult) {
  const values = (memberResult?.N || [])
    .map((value) => Number(value))
    .filter(Number.isFinite);
  if (!values.length) return Math.max(0, -signedAxial(memberResult));
  return Math.max(0, ...values.map((value) => -value));
}

function pDeltaDesignStatus(theta, negligible = 0.1, limit = 0.25) {
  const value = Number(theta) || 0;
  if (value >= limit || value >= 1) return 'NG';
  if (value >= negligible) return 'WARN';
  return 'OK';
}

function worstStatus(statuses = []) {
  if (statuses.includes('NG')) return 'NG';
  if (statuses.includes('WARN')) return 'WARN';
  if (statuses.includes('OK')) return 'OK';
  return 'N/A';
}

function memberEulerCriticalLoad(model, member, length) {
  const material = materialOf(model, member.matId);
  const section = sectionOf(model, member.secId);
  const ky = positiveNumber(member.Ky, member.design?.Ky, model.designSettings?.defaultKy, model.analysisSettings?.defaultKy, 1);
  const kz = positiveNumber(member.Kz, member.design?.Kz, model.designSettings?.defaultKz, model.analysisSettings?.defaultKz, 1);
  const pcry = section.Iy > 0 ? (Math.PI ** 2 * material.E * section.Iy) / ((ky * length) ** 2) : null;
  const pcrz = section.Iz > 0 ? (Math.PI ** 2 * material.E * section.Iz) / ((kz * length) ** 2) : null;
  const candidates = [pcry, pcrz].filter((value) => value > 0 && Number.isFinite(value));
  return candidates.length ? Math.min(...candidates) : 0;
}

function summarizeSinglePDeltaCurve(globalPoints, stories, members) {
  const storyPoints = stories.flatMap((item) => item.points || []);
  const memberPoints = members.flatMap((item) => item.points || []);
  return {
    loadStepCount: globalPoints.length,
    maxRoofDisplacement: Math.max(0, ...globalPoints.map((point) => point.secondOrder?.roofDisplacement || 0)),
    maxRoofDriftRatio: Math.max(0, ...globalPoints.map((point) => point.secondOrder?.roofDriftRatio || 0)),
    maxBaseShear: Math.max(0, ...globalPoints.map((point) => point.secondOrder?.baseShear || 0)),
    maxStoryStabilityIndex: Math.max(0, ...storyPoints.map((point) => point.stabilityIndex || 0)),
    maxMemberPDeltaShear: Math.max(0, ...memberPoints.map((point) => point.pDeltaShear || 0)),
    maxMemberAxialRatio: Math.max(0, ...memberPoints.map((point) => point.axialRatio || 0).filter(Number.isFinite)),
  };
}

function summarizePDeltaCurves(byCombo) {
  const curves = Object.entries(byCombo || {}).map(([comboId, item]) => ({ comboId, curve: item.curve })).filter((item) => item.curve);
  return {
    version: 'pdelta-curve-summary-v1',
    combos: curves.map(({ comboId, curve }) => ({
      comboId,
      globalPointCount: curve.global?.points?.length || 0,
      storyCount: curve.stories?.length || 0,
      memberCount: curve.members?.length || 0,
      summary: curve.summary,
    })),
    global: curves.map(({ comboId, curve }) => ({ comboId, points: curve.global?.points || [] })),
  };
}

function modelVerticalBounds(model) {
  const zs = (model.nodes || []).map((node) => Number(node.z) || 0);
  const minZ = zs.length ? Math.min(...zs) : 0;
  const maxZ = zs.length ? Math.max(...zs) : 0;
  return { minZ, maxZ, height: Math.max(0, maxZ - minZ) };
}

function uniqueSorted(values) {
  const next = [];
  for (const value of values) {
    if (!next.some((item) => Math.abs(item - value) <= 1e-8)) next.push(value);
  }
  return next.sort((a, b) => a - b);
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function dot3(a, b) {
  return (Number(a?.[0]) || 0) * (Number(b?.[0]) || 0)
    + (Number(a?.[1]) || 0) * (Number(b?.[1]) || 0)
    + (Number(a?.[2]) || 0) * (Number(b?.[2]) || 0);
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 1;
}

function summarizePDelta(byCombo) {
  let governing = null;
  let convergedCount = 0;
  let maxAmplification = 1;
  let maxStoryStabilityIndex = 0;
  let maxMemberAxialRatio = 0;
  for (const [comboId, item] of Object.entries(byCombo || {})) {
    if (item.converged) convergedCount += 1;
    if (Number(item.amplification) > maxAmplification) maxAmplification = item.amplification;
    if (Number(item.curve?.summary?.maxStoryStabilityIndex) > maxStoryStabilityIndex) {
      maxStoryStabilityIndex = item.curve.summary.maxStoryStabilityIndex;
    }
    if (Number(item.curve?.summary?.maxMemberAxialRatio) > maxMemberAxialRatio) {
      maxMemberAxialRatio = item.curve.summary.maxMemberAxialRatio;
    }
    if (!governing || Number(item.amplification) > Number(governing.amplification)) {
      governing = { comboId, amplification: item.amplification, converged: item.converged, reason: item.reason };
    }
  }
  return {
    convergedCount,
    comboCount: Object.keys(byCombo || {}).length,
    maxAmplification,
    maxStoryStabilityIndex,
    maxMemberAxialRatio,
    governing,
  };
}
