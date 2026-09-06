import {
  NONLINEAR_CASE_KINDS,
  NONLINEAR_QUALIFICATIONS,
  getNonlinearCapability,
} from '../nonlinear/capabilities.js';

export const NONLINEAR_RUN_RECORD_VERSION = 'p8-m0-nonlinear-run-record-v1';

export function buildNonlinearRunRecordContract(record = {}) {
  if (!NONLINEAR_CASE_KINDS.has(record.kind)) return null;
  return {
    version: NONLINEAR_RUN_RECORD_VERSION,
    runRecordId: record.id || null,
    caseId: record.caseId || null,
    engine: clone(record.engine || record.result?.engine || null),
    qualification: record.qualification || record.result?.qualification || 'invalid',
    modelBound: record.modelBound ?? record.result?.modelBound ?? null,
    designBlocked: record.designBlocked === true || record.result?.designBlocked === true,
    fallbackUsed: record.result?.routing?.fallbackUsed === true,
    modelHash: record.modelHash || null,
    integrityHash: record.integrityHash || null,
  };
}

export function validateNonlinearRunRecord(record = {}) {
  const view = buildNonlinearRunRecordContract(record);
  const errors = [];
  if (!view) return { ok: false, errors: ['kind:not-nonlinear'], normalized: null };
  const capability = getNonlinearCapability(view.engine?.id);
  if (!capability) errors.push('engine:unknown');
  if (!NONLINEAR_QUALIFICATIONS.includes(view.qualification)) errors.push('qualification:invalid');
  if (view.fallbackUsed) errors.push('routing:fallback-forbidden');
  if (capability?.qualificationCeiling === 'legacy-preliminary') {
    if (view.qualification !== 'legacy-preliminary') errors.push('qualification:legacy-ceiling');
    if (!view.designBlocked) errors.push('designBlocked:legacy-required');
    if (view.modelBound !== capability.modelBound) errors.push('modelBound:engine-mismatch');
  }
  if (!view.modelHash) errors.push('modelHash:missing');
  return { ok: errors.length === 0, errors, normalized: view };
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
