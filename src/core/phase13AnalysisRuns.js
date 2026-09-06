import { buildAnalysisDomainHashes } from './analysisDomainHashes.js';
import { createAnalysisRunRecord } from './analysisRunRecord.js';
import { stableHash } from './stableHash.js';
import { modelHash } from './modelHash.js';

export const PHASE13_ANALYSIS_RUN_VERSION = 'p13-m1-analysis-run-v1';
export const PHASE13_ANALYSIS_RUN_STORE_VERSION = 'p13-m1-analysis-run-store-v1';
export const PHASE13_RUN_STATUSES = Object.freeze([
  'queued', 'running', 'completed', 'failed', 'cancelled', 'blocked',
]);

export function createPhase13AnalysisRunStore(input = {}) {
  const runs = Object.fromEntries(Object.entries(input.runs || {}).map(([id, row]) => [id, clone(row)]));
  const order = (input.order || Object.keys(runs)).filter((id) => runs[id]);
  const store = {
    version: PHASE13_ANALYSIS_RUN_STORE_VERSION,
    runs,
    order,
    activeRunId: runs[input.activeRunId]?.status === 'running' ? input.activeRunId : null,
    lastSuccessfulByCase: Object.fromEntries(
      Object.entries(input.lastSuccessfulByCase || {}).filter(([, id]) => runs[id]?.status === 'completed'),
    ),
  };
  return deepFreeze(store);
}

export function beginPhase13AnalysisRun(store, input = {}) {
  const current = createPhase13AnalysisRunStore(store);
  const caseId = String(input.analysisCase?.id || input.caseId || 'UNSPECIFIED');
  const id = String(input.runId || `${caseId}:${input.startedAt || Date.now()}`);
  if (current.runs[id]) throw runError('P13_RUN_ID_DUPLICATE', `Analysis run ${id} already exists.`);
  const snapshot = buildRunInputSnapshot(input.model || {}, input.analysisCase || {}, input);
  const record = withIntegrity({
    version: PHASE13_ANALYSIS_RUN_VERSION,
    id,
    caseId,
    kind: input.analysisCase?.kind || input.kind || 'LinearStatic',
    status: 'running',
    qualification: 'pending',
    designTransferAllowed: false,
    startedAt: input.startedAt || null,
    finishedAt: null,
    progress: { stage: 'preflight', ratio: 0, message: null },
    input: snapshot,
    result: null,
    baseRecord: null,
    failure: null,
  });
  return { store: replaceRun(current, record, { append: true, activeRunId: id }), record };
}

export function updatePhase13AnalysisRunProgress(store, runId, progress = {}) {
  const current = createPhase13AnalysisRunStore(store);
  const record = requireRun(current, runId);
  if (record.status !== 'running') return current;
  const ratio = clamp01(progress.ratio ?? progress.progress ?? record.progress?.ratio ?? 0);
  const next = withIntegrity({
    ...clone(record),
    progress: {
      stage: String(progress.stage || record.progress?.stage || 'running'),
      ratio: Math.max(Number(record.progress?.ratio || 0), ratio),
      message: progress.message == null ? record.progress?.message || null : String(progress.message),
    },
  });
  return replaceRun(current, next);
}

export function completePhase13AnalysisRun(store, runId, input = {}) {
  return finishRun(store, runId, { ...input, terminalStatus: 'completed', result: { ...clone(input.result), ok: true } });
}

export function failPhase13AnalysisRun(store, runId, input = {}) {
  return finishRun(store, runId, { ...input, terminalStatus: 'failed', result: { ...clone(input.result), ok: false } });
}

export function cancelPhase13AnalysisRun(store, runId, input = {}) {
  return finishRun(store, runId, {
    ...input,
    terminalStatus: 'cancelled',
    result: {
      ...clone(input.result),
      ok: false,
      code: input.code || 'ANALYSIS_CANCELLED',
      message: input.message || 'Analysis run was cancelled.',
    },
  });
}

export function getPhase13RunState(store, input = {}) {
  const current = createPhase13AnalysisRunStore(store);
  const caseId = String(input.analysisCase?.id || input.caseId || 'UNSPECIFIED');
  const attempts = current.order.map((id) => current.runs[id]).filter((row) => row.caseId === caseId);
  const latestAttempt = attempts.at(-1) || null;
  const successfulId = current.lastSuccessfulByCase[caseId] || null;
  const lastSuccessful = successfulId ? current.runs[successfulId] : null;
  if (latestAttempt?.status === 'running') return state('running', latestAttempt, lastSuccessful, []);
  if (!lastSuccessful) {
    const execution = latestAttempt?.status || 'not-run';
    return state(execution, latestAttempt, null, latestAttempt?.failure ? [latestAttempt.failure.code] : []);
  }
  const freshness = evaluatePhase13RunFreshness(lastSuccessful, input.model || {}, input.analysisCase || {}, input);
  return state(freshness.current ? 'current' : 'stale', latestAttempt, lastSuccessful, freshness.reasons);
}

export function evaluatePhase13RunFreshness(record, model = {}, analysisCase = {}, options = {}) {
  if (!record?.input) return { current: false, reasons: ['RUN_INPUT_SNAPSHOT_MISSING'] };
  const current = buildRunInputSnapshot(model, analysisCase, options);
  const reasons = [];
  if (record.input.modelHash !== current.modelHash) reasons.push('MODEL_HASH_CHANGED');
  if (record.input.caseHash !== current.caseHash) reasons.push('CASE_HASH_CHANGED');
  if (record.input.buildHash && current.buildHash && record.input.buildHash !== current.buildHash) reasons.push('BUILD_HASH_CHANGED');
  return { current: reasons.length === 0, reasons, input: current };
}

export function buildPhase13PublishedRunSet(records = []) {
  const rows = records.filter(Boolean);
  const runIds = [...new Set(rows.map((row) => row.id || row.runId || row.baseRecord?.id).filter(Boolean))];
  if (runIds.length > 1) throw runError('P13_MIXED_RUN_SET', `Mixed run publication is forbidden: ${runIds.join(', ')}`);
  if (rows.some((row) => row.status && row.status !== 'completed')) {
    throw runError('P13_NON_CURRENT_RUN_SET', 'Only completed run records can be published.');
  }
  return deepFreeze({ version: 'p13-m1-published-run-set-v1', runId: runIds[0] || null, records: rows.map(clone) });
}

export function migrateLegacyAnalysisRunStore(legacy = {}) {
  let store = createPhase13AnalysisRunStore();
  const rows = Object.values(legacy.attempts || {}).flat();
  for (const legacyRecord of rows) {
    const id = String(legacyRecord.id);
    if (store.runs[id]) continue;
    const status = legacyRecord.runStatus === 'ok' ? 'completed' : 'failed';
    const record = withIntegrity({
      version: PHASE13_ANALYSIS_RUN_VERSION,
      id,
      caseId: String(legacyRecord.caseId || 'UNSPECIFIED'),
      kind: legacyRecord.kind || null,
      status,
      qualification: legacyRecord.qualification || 'invalid',
      designTransferAllowed: legacyRecord.designTransferAllowed === true,
      startedAt: legacyRecord.startedAt || null,
      finishedAt: legacyRecord.finishedAt || null,
      progress: { stage: status, ratio: 1, message: null },
      input: {
        modelHash: legacyRecord.modelHash || null,
        caseHash: legacyRecord.caseHash || null,
        domainHashes: clone(legacyRecord.domainHashes || null),
        revisionId: null,
        settingsHash: stableHash(legacyRecord.provenance?.analysisSettings || {}).slice(0, 24),
        buildHash: null,
      },
      result: clone(legacyRecord.result || null),
      baseRecord: clone(legacyRecord),
      failure: clone(legacyRecord.failure || null),
    });
    store = replaceRun(store, record, { append: true });
    if (status === 'completed') store = setLastSuccessful(store, record.caseId, id);
  }
  return store;
}

function finishRun(store, runId, input) {
  const current = createPhase13AnalysisRunStore(store);
  const record = requireRun(current, runId);
  if (record.status !== 'running') return current;
  const result = clone(input.result || {});
  const baseRecord = createAnalysisRunRecord({
    model: input.model || {},
    analysisCase: input.analysisCase || { id: record.caseId, kind: record.kind },
    result,
    attemptId: record.id,
    startedAt: record.startedAt,
    finishedAt: input.finishedAt || null,
  });
  const terminal = input.terminalStatus;
  const next = withIntegrity({
    ...clone(record),
    status: terminal,
    qualification: terminal === 'completed' ? baseRecord.qualification : 'invalid',
    designTransferAllowed: terminal === 'completed' && baseRecord.designTransferAllowed === true,
    finishedAt: input.finishedAt || null,
    progress: { stage: terminal, ratio: terminal === 'completed' ? 1 : record.progress?.ratio || 0, message: null },
    result: terminal === 'completed' ? result : null,
    baseRecord,
    failure: terminal === 'completed' ? null : baseRecord.failure,
  });
  let updated = replaceRun(current, next, { activeRunId: current.activeRunId === runId ? null : current.activeRunId });
  if (terminal === 'completed') updated = setLastSuccessful(updated, record.caseId, record.id);
  return updated;
}

function buildRunInputSnapshot(model, analysisCase, options = {}) {
  return deepFreeze({
    modelHash: modelHash(model || {}),
    caseHash: stableHash(analysisCase || {}).slice(0, 24),
    domainHashes: buildAnalysisDomainHashes(model || {}, analysisCase || {}),
    revisionId: options.revisionId || model?.meta?.revisionId || null,
    settingsHash: stableHash(options.settings || analysisCase?.settings || {}).slice(0, 24),
    buildHash: options.buildHash || null,
  });
}

function replaceRun(store, record, options = {}) {
  const runs = { ...store.runs, [record.id]: clone(record) };
  const order = options.append ? [...store.order, record.id] : [...store.order];
  return createPhase13AnalysisRunStore({
    ...store,
    runs,
    order,
    activeRunId: Object.prototype.hasOwnProperty.call(options, 'activeRunId') ? options.activeRunId : store.activeRunId,
  });
}

function setLastSuccessful(store, caseId, runId) {
  const existingId = store.lastSuccessfulByCase[caseId];
  if (existingId && store.order.indexOf(existingId) > store.order.indexOf(runId)) return store;
  return createPhase13AnalysisRunStore({
    ...store,
    lastSuccessfulByCase: { ...store.lastSuccessfulByCase, [caseId]: runId },
  });
}

function requireRun(store, runId) {
  const record = store.runs[String(runId)];
  if (!record) throw runError('P13_RUN_NOT_FOUND', `Analysis run ${runId} was not found.`);
  return record;
}

function state(execution, latestAttempt, lastSuccessful, staleReasons) {
  return deepFreeze({
    version: 'p13-m1-run-state-v1',
    execution,
    runId: lastSuccessful?.id || latestAttempt?.id || null,
    latestAttemptId: latestAttempt?.id || null,
    latestAttemptStatus: latestAttempt?.status || 'not-run',
    lastSuccessfulRunId: lastSuccessful?.id || null,
    current: execution === 'current',
    stale: execution === 'stale',
    staleReasons: [...staleReasons],
    qualification: lastSuccessful?.qualification || latestAttempt?.qualification || null,
    designTransferAllowed: execution === 'current' && lastSuccessful?.designTransferAllowed === true,
  });
}

function withIntegrity(record) {
  const copy = clone(record);
  delete copy.integrityHash;
  return deepFreeze({ ...copy, integrityHash: stableHash(copy).slice(0, 24) });
}

function clamp01(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

function runError(code, message) {
  return Object.assign(new Error(message), { code });
}

function clone(value) {
  if (value == null) return value;
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
