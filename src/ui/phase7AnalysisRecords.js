import {
  analysisRunCanTransferToDesign,
  appendAnalysisRun,
  createAnalysisRunRecord,
  createAnalysisRunStore,
} from '../core/analysisRunRecord.js';
import { resolveMaterialRecord, resolveSectionRecord } from '../materials/registry.js';
import { modelHash } from '../core/modelHash.js';
import { createResultSelectionStore } from './resultSelectionStore.js';

export const PHASE7_ANALYSIS_RECORDS_VERSION = 'p7-m11-analysis-record-integration-v1';

export function ensurePhase7AnalysisState(target = globalThis, initialSelection = {}) {
  if (!target.__SStructuresAnalysisRunStore) {
    target.__SStructuresAnalysisRunStore = deepFreeze(createAnalysisRunStore());
  }
  target.__SStructuresAnalysisLatestAttempts ||= {};
  target.__SStructuresAnalysisResults ||= {};
  if (!target.SStructuresResultSelection) {
    target.SStructuresResultSelection = createResultSelectionStore(initialSelection);
  }
  target.SStructuresResultSelectionStore ||= target.SStructuresResultSelection;
  return {
    runStore: target.__SStructuresAnalysisRunStore,
    resultSelection: target.SStructuresResultSelection,
  };
}

export function recordPhase7AnalysisAttempt(target, model, analysisCase, result, options = {}) {
  ensurePhase7AnalysisState(target);
  const caseId = String(result?.caseId || analysisCase?.id || 'UNSPECIFIED');
  const normalizedResult = normalizeAttemptResult(result);
  const sequence = Number(target.__SStructuresAnalysisAttemptSequence || 0) + 1;
  target.__SStructuresAnalysisAttemptSequence = sequence;
  const attemptId = options.attemptId
    || result?.attemptId
    || `${caseId}:${result?.completedAt || options.finishedAt || 'unspecified'}:${sequence}`;
  const mutableRecord = createAnalysisRunRecord({
    model: analysisModelSnapshot(model),
    analysisCase,
    result: normalizedResult,
    attemptId,
    startedAt: result?.startedAt || options.startedAt || null,
    finishedAt: result?.completedAt || options.finishedAt || null,
  });
  mutableRecord.provenance = {
    ...mutableRecord.provenance,
    ...referencedLibraryProvenance(model),
    resultQualification: {
      value: mutableRecord.qualification,
      source: 'analysis-run-record',
      requestedValue: result?.qualification || null,
    },
  };
  const record = deepFreeze(mutableRecord);
  const previousSuccessful = target.__SStructuresAnalysisRunStore.lastSuccessful?.[caseId] || null;
  const previousPublished = target.__SStructuresAnalysisResults[caseId] || null;
  target.__SStructuresAnalysisRunStore = deepFreeze(appendAnalysisRun(target.__SStructuresAnalysisRunStore, record));
  const publishedResult = deepFreeze({
    ...clone(normalizedResult),
    ok: record.runStatus === 'ok',
    qualification: record.qualification,
    designTransferAllowed: record.designTransferAllowed,
    runRecordId: record.id,
    analysisProvenance: clone(record.provenance),
  });
  target.__SStructuresAnalysisLatestAttempts[caseId] = publishedResult;

  let retainedResult = null;
  if (record.runStatus === 'ok') target.__SStructuresAnalysisResults[caseId] = publishedResult;
  else if (previousSuccessful || successfulPublishedResult(previousPublished)) {
    retainedResult = previousPublished || resultFromRecord(previousSuccessful);
  }
  else target.__SStructuresAnalysisResults[caseId] = publishedResult;

  if (record.runStatus === 'ok') {
    target.SStructuresResultSelection.set({ activeCaseId: caseId, activeResultId: record.id }, 'analysis-run');
  } else {
    const currentSelection = target.SStructuresResultSelection.getState();
    const retainedResultId = previousSuccessful?.id || previousPublished?.runRecordId || null;
    target.SStructuresResultSelection.set({
      activeCaseId: caseId,
      activeResultId: retainedResultId || (currentSelection.activeCaseId === caseId ? currentSelection.activeResultId : null),
    }, 'analysis-run-failed');
  }
  return { version: PHASE7_ANALYSIS_RECORDS_VERSION, result: publishedResult, record, retainedResult, previousSuccessful };
}

export function getPhase7AnalysisRunStore(target = globalThis) {
  ensurePhase7AnalysisState(target);
  return clone(target.__SStructuresAnalysisRunStore);
}

export function getPhase7LatestAttempts(target = globalThis) {
  ensurePhase7AnalysisState(target);
  return clone(target.__SStructuresAnalysisLatestAttempts);
}

export function findPhase7AnalysisRun(target = globalThis, input = {}) {
  ensurePhase7AnalysisState(target);
  const store = target.__SStructuresAnalysisRunStore;
  const stringCaseId = typeof input === 'string' && store.attempts?.[input] ? input : null;
  const recordId = typeof input === 'string' && !stringCaseId ? input : input.runRecordId || input.recordId;
  if (recordId) {
    for (const rows of Object.values(store.attempts || {})) {
      const found = rows.find((record) => record.id === recordId);
      if (found) return clone(found);
    }
    return null;
  }
  const caseId = stringCaseId || (typeof input === 'string' ? input : input.analysisCaseId || input.caseId);
  if (!caseId) return null;
  if (input.latestAttempt || input.attempt === 'latest') {
    const attempts = store.attempts?.[caseId] || [];
    return attempts.length ? clone(attempts[attempts.length - 1]) : null;
  }
  return clone(store.lastSuccessful?.[caseId] || null);
}

export function phase7DesignTransferDecision(target = globalThis, input = {}) {
  const record = input?.record?.runStatus ? clone(input.record) : findPhase7AnalysisRun(target, input);
  if (!record) {
    return { ok: false, allowed: false, code: 'ANALYSIS_RUN_RECORD_NOT_FOUND', record: null };
  }
  const currentModel = resolveCurrentModel(target, input);
  const currentModelHash = currentModel == null ? null : phase7ModelHash(currentModel);
  const recordEligible = analysisRunCanTransferToDesign(record);
  const currentModelMatches = currentModelHash == null || currentModelHash === record.modelHash;
  const allowed = recordEligible && currentModelMatches;
  const code = allowed
    ? null
    : recordEligible && !currentModelMatches
      ? 'ANALYSIS_RESULT_MODEL_CHANGED'
      : 'ANALYSIS_RESULT_NOT_VERIFIED';
  return {
    ok: allowed,
    allowed,
    code,
    record,
    qualification: record.qualification,
    runStatus: record.runStatus,
    modelHash: record.modelHash,
    currentModelHash,
    currentModelMatches,
    message: allowed
      ? null
      : code === 'ANALYSIS_RESULT_MODEL_CHANGED'
        ? 'Design transfer requires the current model to match the immutable analysis run record.'
        : `Design transfer requires a successful verified result; received ${record.runStatus}/${record.qualification}.`,
  };
}

export function phase7ModelHash(model = {}) {
  return modelHash(analysisModelSnapshot(model));
}

function normalizeAttemptResult(result = {}) {
  const status = normalizedStatus(result.status);
  const designBlocked = result.designBlocked === true || result.payload?.designBlocked === true;
  const ok = result.ok === true || (result.ok !== false && status !== 'failed');
  let qualification = normalizedQualification(result.qualification);
  if (!qualification && (
    status === 'review-required'
    || designBlocked
    || result.review?.productionReady === false
    || result.payload?.review?.productionReady === false
  )) qualification = 'preliminary';
  const publishedStatus = status === 'failed'
    ? 'failed'
    : status && status !== 'ok'
      ? status
      : designBlocked
        ? 'designBlocked'
        : qualification === 'preliminary'
          ? 'preliminary'
          : status || 'ok';
  const normalized = {
    ...clone(result),
    status: publishedStatus,
    ok,
    designBlocked,
  };
  if (qualification) normalized.qualification = qualification;
  else delete normalized.qualification;
  return normalized;
}

function resultFromRecord(record) {
  return record?.result ? deepFreeze({
    ...clone(record.result),
    qualification: record.qualification,
    designTransferAllowed: record.designTransferAllowed,
    runRecordId: record.id,
    analysisProvenance: clone(record.provenance),
  }) : null;
}

function referencedLibraryProvenance(model = {}) {
  const materialRefs = [...new Set((model.members || []).map((member) => member.matId).filter(Boolean))];
  const sectionRefs = [...new Set((model.members || []).map((member) => member.secId).filter(Boolean))];
  return {
    referencedMaterials: materialRefs.map((reference) => libraryReferenceSnapshot(reference, resolveMaterialRecord(model, reference))),
    referencedSections: sectionRefs.map((reference) => libraryReferenceSnapshot(reference, resolveSectionRecord(model, reference))),
  };
}

function libraryReferenceSnapshot(reference, record) {
  return {
    reference,
    resolved: record ? `${record.id}@${record.version || 1}` : null,
    id: record?.id || null,
    version: record?.version || null,
    source: clone(record?.source || null),
    elastic: clone(record?.elastic || null),
    strength: clone(record?.strength || null),
    properties: clone(record?.properties || null),
    unresolved: !record,
  };
}

function successfulPublishedResult(result) {
  return Boolean(result && result.status !== 'failed' && result.ok !== false);
}

function resolveCurrentModel(target, input = {}) {
  if (Object.prototype.hasOwnProperty.call(input, 'currentModel')) return input.currentModel;
  if (typeof target?.SStructuresEngine?.getCurrentModel === 'function') return target.SStructuresEngine.getCurrentModel();
  if (typeof target?.model === 'function') return target.model();
  return null;
}

function analysisModelSnapshot(model = {}) {
  const snapshot = clone(model) || {};
  if (Array.isArray(snapshot.analysisCases)) {
    snapshot.analysisCases = snapshot.analysisCases.map((item) => {
      const next = { ...item };
      delete next.status;
      delete next.lastRun;
      delete next.staleReason;
      return next;
    });
  }
  return snapshot;
}

function normalizedQualification(value) {
  const qualification = String(value || '').trim().toLowerCase();
  return ['verified', 'candidate', 'preliminary', 'legacy-preliminary', 'implemented', 'blocked', 'unsupported', 'invalid'].includes(qualification)
    ? qualification
    : null;
}

function normalizedStatus(value) {
  const status = String(value || '').trim();
  if (!status) return '';
  const lower = status.toLowerCase();
  if (lower === 'designblocked' || lower === 'design-blocked') return 'designBlocked';
  return lower;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
