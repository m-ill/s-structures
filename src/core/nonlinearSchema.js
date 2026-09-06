export const NONLINEAR_SCHEMA_CONTRACT_VERSION = 'p8-m0-model-schema-v5-nonlinear-v1';

export const NONLINEAR_REGISTRY_COLLECTIONS = Object.freeze([
  'nonlinearMaterials',
  'nonlinearSections',
  'hingeProperties',
  'linkProperties',
  'timeHistoryFunctions',
  'analysisStates',
]);

const PROPERTY_COLLECTIONS = new Set([
  'nonlinearMaterials',
  'nonlinearSections',
  'hingeProperties',
  'linkProperties',
]);

const QUALIFICATIONS = new Set([
  'legacy-preliminary',
  'assumed',
  'implemented',
  'candidate',
  'verified',
  'blocked',
  'unsupported',
]);

const ANALYSIS_STATE_STATUSES = new Set(['accepted', 'failed', 'stale']);
const FORBIDDEN_STATE_PAYLOADS = [
  'displacements',
  'velocities',
  'accelerations',
  'elementStates',
  'materialStates',
  'history',
  'state',
];

export function defaultNonlinearRegistries() {
  return Object.fromEntries(NONLINEAR_REGISTRY_COLLECTIONS.map((key) => [key, []]));
}

export function normalizeNonlinearRegistries(source = {}) {
  return Object.fromEntries(NONLINEAR_REGISTRY_COLLECTIONS.map((key) => [
    key,
    Array.isArray(source?.[key]) ? clone(source[key]) : [],
  ]));
}

export function validateNonlinearRegistries(model = {}) {
  const errors = [];
  for (const collection of NONLINEAR_REGISTRY_COLLECTIONS) {
    const rows = model?.[collection];
    if (!Array.isArray(rows)) {
      errors.push(issue('BAD_NONLINEAR_REGISTRY', `${collection} must be an array.`, collection));
      continue;
    }
    const ids = new Set();
    rows.forEach((row, index) => {
      const target = row?.id || `${collection}[${index}]`;
      if (!record(row)) {
        errors.push(issue('BAD_NONLINEAR_RECORD', `${collection} entries must be objects.`, target));
        return;
      }
      const id = clean(row.id);
      if (!id) errors.push(issue('BAD_NONLINEAR_RECORD', `${collection} entry requires id.`, target));
      else if (ids.has(id)) errors.push(issue('DUPLICATE_NONLINEAR_RECORD_ID', `Duplicate ${collection} id: ${id}.`, target));
      ids.add(id);
      if (PROPERTY_COLLECTIONS.has(collection)) validatePropertyRecord(row, collection, target, errors);
      else if (collection === 'timeHistoryFunctions') validateTimeHistoryFunction(row, target, errors);
      else validateAnalysisState(row, target, errors);
    });
  }
  return errors;
}

function validatePropertyRecord(row, collection, target, errors) {
  if (!clean(row.modelId)) errors.push(issue('BAD_NONLINEAR_RECORD', `${collection} entry requires modelId.`, target));
  if (!record(row.parameters)) errors.push(issue('BAD_NONLINEAR_RECORD', `${collection} entry requires parameters object.`, target));
  if (!record(row.units)) errors.push(issue('BAD_NONLINEAR_RECORD', `${collection} entry requires explicit units object.`, target));
  if (!QUALIFICATIONS.has(row.qualification)) errors.push(issue('BAD_NONLINEAR_QUALIFICATION', `${collection} entry has unsupported qualification.`, target));
  if (!clean(row.contentHash)) errors.push(issue('BAD_NONLINEAR_RECORD', `${collection} entry requires contentHash.`, target));
  if (row.source != null && !record(row.source)) errors.push(issue('BAD_NONLINEAR_RECORD', `${collection} source must be an object.`, target));
  if (row.calibration != null && !record(row.calibration)) errors.push(issue('BAD_NONLINEAR_RECORD', `${collection} calibration must be an object.`, target));
}

function validateTimeHistoryFunction(row, target, errors) {
  if (!clean(row.quantity)) errors.push(issue('BAD_TIME_HISTORY_FUNCTION', 'Time-history function requires quantity.', target));
  if (!clean(row.unit)) errors.push(issue('BAD_TIME_HISTORY_FUNCTION', 'Time-history function requires unit.', target));
  if (!record(row.sampling)) errors.push(issue('BAD_TIME_HISTORY_FUNCTION', 'Time-history function requires sampling metadata.', target));
  if (!clean(row.dataRef)) errors.push(issue('BAD_TIME_HISTORY_FUNCTION', 'Time-history function requires immutable dataRef.', target));
  if (!clean(row.contentHash)) errors.push(issue('BAD_TIME_HISTORY_FUNCTION', 'Time-history function requires contentHash.', target));
  if (Array.isArray(row.values) || Array.isArray(row.accelerations)) {
    errors.push(issue('BAD_TIME_HISTORY_FUNCTION', 'Time-history registry stores immutable references, not embedded sample arrays.', target));
  }
}

function validateAnalysisState(row, target, errors) {
  if (!clean(row.caseId)) errors.push(issue('BAD_ANALYSIS_STATE', 'Analysis state requires caseId.', target));
  if (!clean(row.runRecordId)) errors.push(issue('BAD_ANALYSIS_STATE', 'Analysis state requires immutable runRecordId.', target));
  if (!record(row.domainHashes)) errors.push(issue('BAD_ANALYSIS_STATE', 'Analysis state requires domainHashes.', target));
  if (!ANALYSIS_STATE_STATUSES.has(row.status)) errors.push(issue('BAD_ANALYSIS_STATE', 'Analysis state requires accepted, failed, or stale status.', target));
  if (row.immutable !== true) errors.push(issue('BAD_ANALYSIS_STATE', 'Analysis state reference must be immutable.', target));
  for (const key of FORBIDDEN_STATE_PAYLOADS) {
    if (row[key] != null) errors.push(issue('BAD_ANALYSIS_STATE', `Analysis state registry cannot embed ${key}.`, target));
  }
}

function issue(code, message, target) {
  return { code, message, target };
}

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
