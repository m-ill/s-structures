import { stableHash, stableStringify } from '../../core/stableHash.js';
import { UNIT_SYSTEM_VERSION } from '../../core/unitSystem.js';
import { SOLVER_UNIT_POLICY, SUPPORTED_UNITS } from '../../core/units.js';
import { parseXvalResultPath } from './resultPath.js';

export const XVAL_REFERENCE_ARTIFACT_VERSION = 'p10-m1-xval-reference-artifact-v1';

export const XVAL_REFERENCE_STATUSES = Object.freeze([
  'ready',
  'pending-reference',
]);

export const XVAL_REFERENCE_SOURCES = Object.freeze([
  'hand-calc',
  'opensees',
  'sap2000',
  'etabs',
]);

export const XVAL_REFERENCE_CASE_IDS = Object.freeze(
  Array.from({ length: 8 }, (_value, index) => `XV-${String(index + 1).padStart(2, '0')}`),
);

const ARTIFACT_KEYS = Object.freeze([
  'artifactHash',
  'author',
  'caseId',
  'date',
  'model',
  'provenance',
  'quantities',
  'source',
  'sourceVersion',
  'status',
  'version',
]);
const MODEL_KEYS = Object.freeze(['modelHash', 'unitSystem']);
const UNIT_SYSTEM_KEYS = Object.freeze(['conversionAudit', 'display', 'internal', 'version']);
const PROVENANCE_KEYS = Object.freeze(['inputFiles', 'notes']);
const QUANTITY_KEYS = Object.freeze(['path', 'scale', 'tolerance', 'unit', 'value']);
const MODEL_HASH_PATTERN = /^[0-9a-f]{16}$/;
const ARTIFACT_HASH_PATTERN = /^[0-9a-f]{24}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/;
const SUPPLEMENTARY_QUANTITY_UNITS = new Set([
  '1',
  '%',
  'Hz',
  'kg',
  'kN/m',
  'kN.m/m',
  'm/s2',
  'mm/s2',
  'N',
  'N.mm',
  'rad',
  's',
  'tonne',
]);
const KNOWN_QUANTITY_UNITS = new Set([
  ...Object.values(SOLVER_UNIT_POLICY),
  ...Object.values(SUPPORTED_UNITS).flatMap((units) => [...units]),
  ...SUPPLEMENTARY_QUANTITY_UNITS,
]);

export function buildXvalReferenceArtifact(input = {}) {
  const core = {
    version: XVAL_REFERENCE_ARTIFACT_VERSION,
    status: clean(input.status),
    caseId: clean(input.caseId),
    source: clean(input.source),
    sourceVersion: clean(input.sourceVersion),
    date: clean(input.date),
    author: clean(input.author),
    model: normalizeModel(input.model),
    quantities: normalizeQuantities(input.quantities),
    provenance: normalizeProvenance(input.provenance),
  };
  const artifact = { ...core, artifactHash: xvalReferenceArtifactHash(core) };
  const validation = validateXvalReferenceArtifact(artifact);
  if (!validation.ok) throw artifactError('XVAL_REFERENCE_ARTIFACT_INVALID', validation.errors.join(', '), validation.errors);
  return deepFreeze(artifact);
}

export function validateXvalReferenceArtifact(artifact = {}) {
  const errors = [];
  if (!isPlainObject(artifact)) return { ok: false, errors: ['artifact:schema'] };

  exactKeys(artifact, ARTIFACT_KEYS, 'artifact', errors);
  if (artifact.version !== XVAL_REFERENCE_ARTIFACT_VERSION) errors.push('artifact:version');
  if (!XVAL_REFERENCE_STATUSES.includes(artifact.status)) errors.push('artifact:status');
  if (!XVAL_REFERENCE_CASE_IDS.includes(artifact.caseId)) errors.push('artifact:case-id');
  if (!XVAL_REFERENCE_SOURCES.includes(artifact.source)) errors.push('artifact:source');
  if (!clean(artifact.sourceVersion)) errors.push('artifact:source-version');
  if (!validDate(artifact.date)) errors.push('artifact:date');
  if (!clean(artifact.author)) errors.push('artifact:author');

  validateModelBlock(artifact.model, errors);
  validateQuantities(artifact.quantities, artifact.status, errors);
  validateProvenance(artifact.provenance, errors);

  if (!ARTIFACT_HASH_PATTERN.test(String(artifact.artifactHash || ''))) {
    errors.push('artifact:artifact-hash');
  } else if (isJsonValue(artifact)) {
    try {
      if (artifact.artifactHash !== xvalReferenceArtifactHash(artifact)) errors.push('artifact:integrity-hash');
    } catch {
      errors.push('artifact:integrity-hash');
    }
  } else {
    errors.push('artifact:json-value');
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function serializeXvalReferenceArtifact(artifact) {
  const validation = validateXvalReferenceArtifact(artifact);
  if (!validation.ok) throw artifactError('XVAL_REFERENCE_ARTIFACT_INVALID', validation.errors.join(', '), validation.errors);
  return `${stableStringify(artifact)}\n`;
}

export function parseXvalReferenceArtifact(serialized) {
  if (typeof serialized !== 'string') {
    throw artifactError('XVAL_REFERENCE_ARTIFACT_PARSE_FAILED', 'Serialized artifact must be a JSON string.');
  }
  let artifact;
  try {
    artifact = JSON.parse(serialized);
  } catch (error) {
    throw artifactError('XVAL_REFERENCE_ARTIFACT_PARSE_FAILED', error?.message || 'Invalid JSON.');
  }
  const validation = validateXvalReferenceArtifact(artifact);
  if (!validation.ok) throw artifactError('XVAL_REFERENCE_ARTIFACT_INVALID', validation.errors.join(', '), validation.errors);
  return deepFreeze(clone(artifact));
}

export function xvalReferenceArtifactHash(artifact = {}) {
  const core = clone(artifact);
  if (isPlainObject(core)) delete core.artifactHash;
  return stableHash(core).slice(0, 24);
}

function normalizeModel(input = {}) {
  return {
    modelHash: clean(input?.modelHash),
    unitSystem: clone(input?.unitSystem),
  };
}

function normalizeQuantities(input) {
  if (!Array.isArray(input)) return input;
  return input.map((quantity) => {
    if (!isPlainObject(quantity)) return clone(quantity);
    const normalized = {
      path: clean(quantity.path),
      value: quantity.value,
      unit: clean(quantity.unit),
      tolerance: quantity.tolerance,
    };
    if (Object.prototype.hasOwnProperty.call(quantity, 'scale')) normalized.scale = quantity.scale;
    return normalized;
  });
}

function normalizeProvenance(input = {}) {
  return {
    inputFiles: Array.isArray(input?.inputFiles) ? input.inputFiles.map(clean) : input?.inputFiles,
    notes: typeof input?.notes === 'string' ? input.notes.trim() : input?.notes,
  };
}

function validateModelBlock(model, errors) {
  if (!isPlainObject(model)) {
    errors.push('artifact:model');
    return;
  }
  exactKeys(model, MODEL_KEYS, 'artifact:model', errors);
  if (!MODEL_HASH_PATTERN.test(String(model.modelHash || ''))) errors.push('artifact:model-hash');
  validateArtifactUnitSystem(model.unitSystem, errors);
}

function validateArtifactUnitSystem(unitSystem, errors) {
  if (!isPlainObject(unitSystem)) {
    errors.push('artifact:unit-system');
    return;
  }
  exactKeys(unitSystem, UNIT_SYSTEM_KEYS, 'artifact:unit-system', errors);
  if (unitSystem.version !== UNIT_SYSTEM_VERSION) errors.push('artifact:unit-system-version');

  if (!isPlainObject(unitSystem.internal)) {
    errors.push('artifact:unit-system-internal');
  } else {
    exactKeys(unitSystem.internal, Object.keys(SOLVER_UNIT_POLICY), 'artifact:unit-system-internal', errors);
    for (const [dimension, unit] of Object.entries(SOLVER_UNIT_POLICY)) {
      if (unitSystem.internal[dimension] !== unit) errors.push(`artifact:unit-system-internal:${dimension}`);
    }
  }

  if (!isPlainObject(unitSystem.display)) {
    errors.push('artifact:unit-system-display');
  } else {
    exactKeys(unitSystem.display, Object.keys(SOLVER_UNIT_POLICY), 'artifact:unit-system-display', errors);
    for (const [dimension, supported] of Object.entries(SUPPORTED_UNITS)) {
      if (!supported.has(unitSystem.display[dimension])) errors.push(`artifact:unit-system-display:${dimension}`);
    }
  }

  if (!Array.isArray(unitSystem.conversionAudit)
    || !unitSystem.conversionAudit.every((row) => isPlainObject(row) && isJsonValue(row))) {
    errors.push('artifact:unit-system-conversion-audit');
  }
}

function validateQuantities(quantities, status, errors) {
  if (!Array.isArray(quantities)) {
    errors.push('artifact:quantities');
    return;
  }
  if (status === 'ready' && quantities.length === 0) errors.push('artifact:quantities-required');
  const paths = new Set();
  quantities.forEach((quantity, index) => {
    const prefix = `artifact:quantity:${index}`;
    if (!isPlainObject(quantity)) {
      errors.push(`${prefix}:schema`);
      return;
    }
    const expectedKeys = Object.prototype.hasOwnProperty.call(quantity, 'scale')
      ? QUANTITY_KEYS
      : QUANTITY_KEYS.filter((key) => key !== 'scale');
    exactKeys(quantity, expectedKeys, prefix, errors);
    if (!validArtifactPath(quantity.path)) errors.push(`${prefix}:path`);
    else if (paths.has(quantity.path)) errors.push(`${prefix}:duplicate-path`);
    else paths.add(quantity.path);
    if (!finiteNumber(quantity.value)) errors.push(`${prefix}:value`);
    if (!KNOWN_QUANTITY_UNITS.has(quantity.unit)) errors.push(`${prefix}:unit`);
    if (!positiveFiniteNumber(quantity.tolerance)) errors.push(`${prefix}:tolerance`);
    if (Object.prototype.hasOwnProperty.call(quantity, 'scale') && !positiveFiniteNumber(quantity.scale)) {
      errors.push(`${prefix}:scale`);
    }
  });
}

function validateProvenance(provenance, errors) {
  if (!isPlainObject(provenance)) {
    errors.push('artifact:provenance');
    return;
  }
  exactKeys(provenance, PROVENANCE_KEYS, 'artifact:provenance', errors);
  if (!Array.isArray(provenance.inputFiles)
    || !provenance.inputFiles.every((value) => clean(value) === value && value.length > 0)) {
    errors.push('artifact:provenance-input-files');
  } else if (new Set(provenance.inputFiles).size !== provenance.inputFiles.length) {
    errors.push('artifact:provenance-input-files-duplicate');
  }
  if (typeof provenance.notes !== 'string') errors.push('artifact:provenance-notes');
}

function validArtifactPath(value) {
  return parseXvalResultPath(value).ok;
}

function validDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return calendarDate.getUTCFullYear() === year
    && calendarDate.getUTCMonth() === month - 1
    && calendarDate.getUTCDate() === day;
}

function exactKeys(value, expected, prefix, errors) {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    errors.push(`${prefix}:schema`);
  }
}

function artifactError(code, message, errors = []) {
  const error = new Error(message);
  error.name = 'XvalReferenceArtifactError';
  error.code = code;
  error.errors = [...errors];
  return error;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function positiveFiniteNumber(value) {
  return finiteNumber(value) && value > 0;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value, stack = new Set()) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || stack.has(value)) return false;
  stack.add(value);
  const ok = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, stack))
    : isPlainObject(value) && Object.entries(value).every(([key, item]) => (
      typeof key === 'string' && isJsonValue(item, stack)
    ));
  stack.delete(value);
  return ok;
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
