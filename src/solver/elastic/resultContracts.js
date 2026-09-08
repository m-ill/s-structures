import { resolveCriterion } from '../../core/model.js';
import { buildAnalysisAudit } from '../analysisAudit.js';
import { defaultCombos } from '../linear3dPost.js';
import { PDELTA_SECOND_ORDER_VERSION } from '../pdelta/secondOrder.js';
import { summarizeValidationHealth } from '../../core/validationHealth.js';

export function validateDirectPDeltaOverride(override, pDeltaMethod, combos) {
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


export function elasticStageError(code, message) {
  return Object.assign(new Error(message), { code });
}


export function withAudit(output) {
  if (output.validation) {
    refreshValidationHealth(output.validation);
    if (!output.validation.ok) output.ok = false;
  }
  output.audit = buildAnalysisAudit(output, {
    equilibriumLimit: resolveCriterion(output.model, 'audit.equilibriumRelative', 1e-8),
  });
  return output;
}


export function refreshValidationHealth(validation) {
  validation.ok = (validation.errors || []).length === 0;
  Object.assign(validation, summarizeValidationHealth(validation));
  return validation;
}


export function appendSolverDiagnosticWarnings(warnings, comboId, result) {
  for (const item of result?.solver?.warnings || []) {
    warnings.push({
      ...item,
      level: 'WARNING',
      code: item.code,
      message: `${comboId}: ${item.message}`,
      target: item.target || 'solver',
    });
  }
}


export function appendComponentFailureErrors(errors, comboId, result) {
  for (const failure of result?.failedComponents || []) {
    const code = failure.reason || 'COMPONENT_SOLVE_FAILED';
    const memberIds = failure.memberIds || [];
    errors.push({
      level: 'ERROR',
      code,
      message: `${comboId}: component analysis failed (${code})${memberIds.length ? ` for members ${memberIds.join(', ')}` : ''}.`,
      target: memberIds.join(',') || comboId,
      nodeIds: [...(failure.nodeIds || [])],
      location: failure.location || null,
      solver: failure.solver || null,
    });
  }
}


export function resolveRequestedCombinations(model) {
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


export function buildCombinationCompleteness(byCombo, combos, envelope) {
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


export function firstOrderPDeltaDesignInputs(byCombo = {}) {
  return Object.fromEntries(Object.entries(byCombo).map(([comboId, result]) => [comboId, {
    result,
    linear: result,
    converged: !!result && result.ok !== false && result.anyOk !== false,
    iterations: [],
    reason: result?.reason || null,
  }]));
}


export function resultCompletenessReasons(result) {
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


export function envelopeCompleteFor(envelope, combos) {
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


export function blockedDesignResultSet() {
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


export function collectionSize(value) {
  if (!value) return 0;
  if (typeof value.size === 'number') return value.size;
  if (Array.isArray(value)) return value.length;
  return Object.keys(value).length;
}


export function failedStatus(value) {
  const status = String(value || '').toUpperCase();
  return ['FAIL', 'FAILED', 'BLOCKED', 'INCOMPLETE', 'NOT_QUALIFIED'].includes(status);
}

