import {
  ANALYSIS_EVIDENCE_TRUSTED_PRODUCER,
  buildAnalysisEvidenceSubject,
  createAnalysisEvidenceAcceptance,
} from '../../src/core/analysisEvidenceAcceptance.js';
import { buildAnalysisDomainHashes } from '../../src/core/analysisDomainHashes.js';
import { modelHash as hashModel } from '../../src/core/modelHash.js';
import { stableHash } from '../../src/core/stableHash.js';
import { VERIFICATION_MATRIX_RECORD_VERSION } from './matrix/record.js';
import {
  PHASE8_EVIDENCE_ARTIFACT_VERSION,
  isTrustedVerificationAuditVersion,
  validatePhase8EvidenceArtifact,
} from './registry.js';

export const ANALYSIS_VERIFICATION_EVIDENCE_ADAPTER_VERSION = ANALYSIS_EVIDENCE_TRUSTED_PRODUCER.contractVersion;

/**
 * Compatibility producer for legacy verification audit/record payloads. The
 * version-specific checks stay in verification; production receives only the
 * generic acceptance contract and generic comparison assertions.
 */
export function adaptVerificationEvidenceForAnalysis(evidence = {}, context = {}) {
  const sourceEvidence = clone(evidence || {});
  delete sourceEvidence.acceptance;
  const subject = subjectFromContext(context, sourceEvidence);
  const validation = validateVerificationSource(sourceEvidence, subject, context);
  const assertions = Array.from(validation.records || [], (record, index) => ({
    id: `${record.caseId}:${index + 1}:${String(record.name || 'comparison')}`,
    status: record.status === 'OK' ? 'PASS' : 'FAIL',
    referenceSource: record.referenceSource,
    solverVersion: record.solverVersion,
    relativeError: record.relError,
    tolerance: record.tolerance,
  }));
  const acceptance = createAnalysisEvidenceAcceptance({
    producer: ANALYSIS_EVIDENCE_TRUSTED_PRODUCER,
    subject,
    assertions,
    sourceEvidence,
    accepted: validation.ok,
    reasonCodes: validation.errors,
  });
  return deepFreeze({ ...sourceEvidence, acceptance });
}

export function validateVerificationEvidenceForAnalysis(evidence = {}, context = {}) {
  const sourceEvidence = clone(evidence || {});
  delete sourceEvidence.acceptance;
  return deepFreeze(validateVerificationSource(sourceEvidence, subjectFromContext(context, sourceEvidence), context));
}

function validateVerificationSource(evidence, subject, context) {
  const errors = [];
  if (!plainRecord(evidence)) return { ok: false, errors: ['VERIFICATION_EVIDENCE_NOT_OBJECT'], records: [] };
  if (evidence.modelHash !== subject.modelHash) errors.push('VERIFICATION_MODEL_BINDING_MISMATCH');
  if (evidence.caseId && evidence.caseId !== subject.caseId) errors.push('VERIFICATION_CASE_BINDING_MISMATCH');

  if (isPhase8AnalysisEvidence(evidence)) {
    if (evidence.qualificationImpact !== 'verified') errors.push('VERIFICATION_QUALIFICATION_IMPACT_INVALID');
    if (evidence.caseId !== subject.caseId) errors.push('VERIFICATION_CASE_BINDING_REQUIRED');
    if (evidence.caseHash !== subject.caseHash) errors.push('VERIFICATION_CASE_HASH_MISMATCH');
    if (evidence.domainHash !== subject.domainHash) errors.push('VERIFICATION_DOMAIN_HASH_MISMATCH');
    if (evidence.engineId !== subject.engineId || evidence.engineVersion !== subject.engineVersion) {
      errors.push('VERIFICATION_ENGINE_BINDING_MISMATCH');
    }
    const artifactAudit = validatePhase8EvidenceArtifact(evidence.artifact || evidence.audit);
    if (!artifactAudit.ok) errors.push(...artifactAudit.errors.map((error) => `VERIFICATION_ARTIFACT_${reason(error)}`));
  }

  const auditValidation = validateAudit(evidence.audit, subject);
  const recordValidation = validateRecords(evidence.records, subject);
  const selected = auditValidation.ok ? auditValidation : recordValidation;
  if (!selected.ok) {
    errors.push(...auditValidation.errors, ...recordValidation.errors);
  }
  const records = selected.ok ? selected.records : bestAvailableRecords(evidence);
  return {
    ok: errors.length === 0 && selected.ok,
    errors: uniqueSorted(errors),
    records,
    adapterVersion: ANALYSIS_VERIFICATION_EVIDENCE_ADAPTER_VERSION,
    sourceEvidenceHash: stableHash(evidence),
    context: {
      modelHash: subject.modelHash,
      caseId: subject.caseId,
      caseHash: subject.caseHash,
      domainHash: subject.domainHash,
      engineId: subject.engineId,
      engineVersion: subject.engineVersion,
      analysisKind: context.analysisCase?.kind || context.kind || null,
    },
  };
}

function validateAudit(audit, subject) {
  const errors = [];
  if (!plainRecord(audit)) return { ok: false, errors: ['VERIFICATION_AUDIT_MISSING'], records: [] };
  if (audit.ok !== true) errors.push('VERIFICATION_AUDIT_NOT_OK');
  if (audit.status !== 'PASS') errors.push('VERIFICATION_AUDIT_NOT_PASS');
  if (!isTrustedVerificationAuditVersion(audit.version)) errors.push('VERIFICATION_AUDIT_VERSION_UNTRUSTED');
  const records = validateRecords(audit.rows, subject);
  errors.push(...records.errors);
  return { ok: errors.length === 0, errors: uniqueSorted(errors), records: records.records };
}

function validateRecords(records, subject) {
  if (!Array.isArray(records) || records.length === 0) {
    return { ok: false, errors: ['VERIFICATION_RECORDS_REQUIRED'], records: [] };
  }
  const errors = [];
  records.forEach((record, index) => {
    const prefix = `VERIFICATION_RECORD_${index + 1}`;
    const relativeError = Number(record?.relError);
    const tolerance = Number(record?.tolerance);
    if (record?.status !== 'OK') errors.push(`${prefix}_STATUS`);
    if (record?.version !== VERIFICATION_MATRIX_RECORD_VERSION) errors.push(`${prefix}_VERSION`);
    if (record?.caseId !== subject.caseId) errors.push(`${prefix}_CASE_BINDING`);
    if (!clean(record?.tier)) errors.push(`${prefix}_TIER`);
    if (!clean(record?.name)) errors.push(`${prefix}_NAME`);
    if (record?.modelHash !== subject.modelHash) errors.push(`${prefix}_MODEL_BINDING`);
    if (!clean(record?.referenceSource)) errors.push(`${prefix}_REFERENCE_SOURCE`);
    if (!clean(record?.solverVersion) || record.solverVersion === 'unknown') errors.push(`${prefix}_SOLVER_VERSION`);
    if (!Number.isFinite(relativeError) || relativeError < 0) errors.push(`${prefix}_RELATIVE_ERROR`);
    if (!Number.isFinite(tolerance) || tolerance <= 0) errors.push(`${prefix}_TOLERANCE`);
    if (Number.isFinite(relativeError) && Number.isFinite(tolerance) && relativeError > tolerance) {
      errors.push(`${prefix}_TOLERANCE_EXCEEDED`);
    }
  });
  return { ok: errors.length === 0, errors: uniqueSorted(errors), records: clone(records) };
}

function subjectFromContext(context = {}, evidence = {}) {
  const model = context.model || context.currentModel || null;
  const analysisCase = context.analysisCase || {};
  const result = context.result || {};
  const caseId = String(context.caseId || analysisCase.id || result.caseId || 'UNSPECIFIED');
  const caseHash = context.caseHash || stableHash(analysisCase).slice(0, 24);
  const domainHash = context.domainHash || buildAnalysisDomainHashes(model || {}, analysisCase).domainHash;
  const engine = context.engine || result.engine || null;
  return buildAnalysisEvidenceSubject({
    modelHash: context.modelHash || evidence.modelHash || hashModel(model || {}),
    caseId,
    caseHash,
    domainHash,
    engine,
  });
}

function bestAvailableRecords(evidence) {
  if (Array.isArray(evidence?.audit?.rows)) return clone(evidence.audit.rows);
  if (Array.isArray(evidence?.records)) return clone(evidence.records);
  return [];
}

function isPhase8AnalysisEvidence(evidence) {
  return evidence?.artifact?.version === PHASE8_EVIDENCE_ARTIFACT_VERSION;
}

function reason(value) {
  return String(value || 'INVALID').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueSorted(values) {
  return [...new Set(Array.from(values || [], String).filter(Boolean))].sort();
}

function plainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
