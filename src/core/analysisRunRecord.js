import { stableHash } from './stableHash.js';
import {
  VERIFICATION_MATRIX_RECORD_VERSION,
  modelHash,
} from '../verification/matrix/record.js';

export const ANALYSIS_RUN_RECORD_VERSION = 'p7-m11-analysis-run-record-v1';

export function createAnalysisRunRecord({
  model,
  analysisCase = {},
  result = null,
  attemptId = null,
  startedAt = null,
  finishedAt = null,
} = {}) {
  const caseId = String(analysisCase.id || result?.caseId || 'UNSPECIFIED');
  const runStatus = result?.ok ? 'ok' : 'failed';
  const runModelHash = modelHash(model || {});
  const qualification = resultQualification(result, runModelHash);
  const record = {
    version: ANALYSIS_RUN_RECORD_VERSION,
    id: attemptId || `${caseId}:${finishedAt || startedAt || 'unspecified'}`,
    caseId,
    kind: analysisCase.kind || result?.kind || null,
    runStatus,
    qualification,
    designTransferAllowed: runStatus === 'ok' && qualification === 'verified',
    startedAt,
    finishedAt,
    modelHash: runModelHash,
    provenance: buildAnalysisProvenance(model, analysisCase, result),
    warnings: normalizeWarnings(result),
    failure: runStatus === 'failed' ? normalizeFailure(result) : null,
    result: result == null ? null : clone(result),
  };
  return { ...record, integrityHash: analysisRunRecordIntegrityHash(record) };
}

export function createAnalysisRunStore(input = {}) {
  return {
    version: ANALYSIS_RUN_RECORD_VERSION,
    attempts: Object.fromEntries(Object.entries(input.attempts || {}).map(([id, rows]) => [id, (rows || []).map(clone)])),
    lastSuccessful: Object.fromEntries(Object.entries(input.lastSuccessful || {}).map(([id, row]) => [id, clone(row)])),
  };
}

export function appendAnalysisRun(store, record) {
  const next = createAnalysisRunStore(store);
  const caseId = String(record?.caseId || 'UNSPECIFIED');
  next.attempts[caseId] ||= [];
  next.attempts[caseId].push(clone(record));
  if (record?.runStatus === 'ok') next.lastSuccessful[caseId] = clone(record);
  return next;
}

export function buildAnalysisProvenance(model = {}, analysisCase = {}, result = {}) {
  const comboId = analysisCase.settings?.comboId || result?.combo?.id || result?.comboId || null;
  const combo = (model.loadCombinations || []).find((item) => item.id === comboId) || null;
  return {
    schemaVersion: model.schemaVersion ?? null,
    units: clone(model.units || null),
    unitSystem: clone(model.unitSystem || null),
    projectSetup: clone(model.projectSetup || null),
    designBasis: clone(model.designBasis || null),
    sourceRegistry: clone(model.sourceRegistry || []),
    materials: (model.materials || []).map(librarySnapshot),
    sections: (model.sections || []).map(librarySnapshot),
    analysisCase: clone(analysisCase),
    analysisSettings: clone(model.analysisSettings || {}),
    analysisCriteria: clone(model.analysisCriteria || {}),
    combination: clone(combo),
    solver: clone(result?.solver || result?.summary?.solver || null),
    convergence: clone(result?.convergence || result?.summary?.convergence || null),
  };
}

export function analysisRunCanTransferToDesign(record, current = null) {
  if (record?.runStatus !== 'ok' || record?.qualification !== 'verified' || record?.designTransferAllowed !== true) return false;
  if (record?.integrityHash !== analysisRunRecordIntegrityHash(record)) return false;
  if (resultQualification(record.result, record.modelHash) !== 'verified') return false;
  const currentHash = currentModelHash(current);
  return currentHash == null || currentHash === record.modelHash;
}

export function analysisRunRecordIntegrityHash(record = {}) {
  return stableHash({
    version: record.version ?? null,
    id: record.id ?? null,
    caseId: record.caseId ?? null,
    kind: record.kind ?? null,
    runStatus: record.runStatus ?? null,
    qualification: record.qualification ?? null,
    designTransferAllowed: record.designTransferAllowed === true,
    startedAt: record.startedAt ?? null,
    finishedAt: record.finishedAt ?? null,
    modelHash: record.modelHash ?? null,
    warnings: record.warnings ?? [],
    failure: record.failure ?? null,
    result: record.result ?? null,
  });
}

function resultQualification(result, expectedModelHash) {
  const status = String(result?.status || '').toLowerCase();
  if (isPreliminary(result) || status === 'review-required') return 'preliminary';
  if (!result?.ok) return 'invalid';
  if (hasTrustedVerificationEvidence(result, expectedModelHash)) return 'verified';
  return 'candidate';
}

function isPreliminary(result) {
  return result?.review?.productionReady === false
    || result?.payload?.review?.productionReady === false
    || result?.designBlocked === true
    || result?.payload?.designBlocked === true;
}

function hasTrustedVerificationEvidence(result, expectedModelHash) {
  const evidence = result?.verificationEvidence || result?.resultEvidence?.verification || null;
  if (!evidence || evidence.modelHash !== expectedModelHash) return false;
  return verifiedAudit(evidence.audit, expectedModelHash) || verifiedRecords(evidence.records, expectedModelHash);
}

function verifiedAudit(audit, expectedModelHash) {
  if (!audit || audit.ok !== true || audit.status !== 'PASS' || !String(audit.version || '').startsWith('p7-')) return false;
  return verifiedRecords(audit.rows, expectedModelHash);
}

function verifiedRecords(records, expectedModelHash) {
  if (!Array.isArray(records) || records.length === 0) return false;
  return records.every((record) => {
    const error = Number(record?.relError);
    const tolerance = Number(record?.tolerance);
    return record?.status === 'OK'
      && record?.version === VERIFICATION_MATRIX_RECORD_VERSION
      && Boolean(record?.caseId)
      && Boolean(record?.tier)
      && Boolean(record?.name)
      && record?.modelHash === expectedModelHash
      && typeof record?.referenceSource === 'string'
      && record.referenceSource.trim().length > 0
      && typeof record?.solverVersion === 'string'
      && record.solverVersion.trim().length > 0
      && record.solverVersion !== 'unknown'
      && Number.isFinite(error)
      && error >= 0
      && Number.isFinite(tolerance)
      && tolerance > 0
      && error <= tolerance;
  });
}

function currentModelHash(current) {
  if (current == null) return null;
  if (typeof current === 'string') return current;
  if (typeof current.currentModelHash === 'string') return current.currentModelHash;
  if (typeof current.modelHash === 'string' && Object.keys(current).every((key) => key === 'modelHash')) return current.modelHash;
  return modelHash(current.currentModel || current.model || current);
}

function normalizeWarnings(result) {
  return (result?.warnings || result?.validation?.warnings || []).map((item) => typeof item === 'string' ? { code: item, message: item } : clone(item));
}

function normalizeFailure(result) {
  return {
    code: result?.reason || result?.code || 'ANALYSIS_FAILED',
    message: result?.message || result?.error?.message || null,
  };
}

function librarySnapshot(item = {}) {
  return {
    id: item.id || null,
    version: item.version ?? 1,
    name: item.name || null,
    designation: item.designation || item.grade?.designation || null,
    source: clone(item.source || null),
    elastic: clone(item.elastic || null),
    strength: clone(item.strength || null),
    properties: clone(item.properties || null),
  };
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
