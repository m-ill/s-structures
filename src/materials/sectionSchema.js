import { computeSectionProperties } from './sectionProperties.js';

export const SECTION_SCHEMA_VERSION = 'p3-m10-section-schema-v1';

export function validateSectionRecord(record = {}) {
  const normalized = normalizeSectionRecord(record);
  const errors = [];
  const warnings = [];
  if (!normalized.id) errors.push('id');
  if (!Number.isInteger(Number(normalized.version)) || Number(normalized.version) < 1) errors.push('version');
  if (!['db', 'parametric', 'direct'].includes(normalized.kind)) errors.push('kind');
  for (const key of ['A', 'Iy', 'Iz']) if (!positive(normalized.properties?.[key])) errors.push(`properties.${key}`);
  warnings.push(...sectionPropertyWarnings(normalized));
  return { ok: errors.length === 0, errors, warnings, normalized };
}

export function normalizeSectionRecord(record = {}) {
  const shape = record.shape || record.type || 'CUSTOM';
  const params = record.params || record.dims || null;
  const properties = record.properties || pickProperties(record) || computeSectionProperties(shape, params);
  return {
    ...record,
    kind: record.kind || (record.source?.db ? 'db' : params ? 'parametric' : 'direct'),
    shape,
    params,
    properties,
  };
}

function pickProperties(record) {
  if (!record.A) return null;
  return {
    A: record.A, Iy: record.Iy, Iz: record.Iz, J: record.J,
    Zy: record.Zy, Zz: record.Zz, Sy: record.Sy, Sz: record.Sz,
    ry: record.ry, rz: record.rz,
  };
}
function sectionPropertyWarnings(record) {
  const props = record.properties || {};
  const warnings = [];
  if (record.kind !== 'direct') return warnings;
  const ryExpected = radius(props.Iy, props.A);
  const rzExpected = radius(props.Iz, props.A);
  if (positive(props.ry) && !close(props.ry, ryExpected)) warnings.push(`properties.ry-inconsistent:${round(ryExpected)}`);
  if (positive(props.rz) && !close(props.rz, rzExpected)) warnings.push(`properties.rz-inconsistent:${round(rzExpected)}`);
  return warnings;
}
function positive(value) { return Number.isFinite(Number(value)) && Number(value) > 0; }
function radius(i, a) { return positive(i) && positive(a) ? Math.sqrt(Number(i) / Number(a)) : null; }
function close(actual, expected) {
  if (!positive(expected)) return true;
  return Math.abs(Number(actual) - expected) <= Math.max(1e-9, Math.abs(expected) * 0.02);
}
function round(value) { return Math.round(Number(value) * 1e9) / 1e9; }
