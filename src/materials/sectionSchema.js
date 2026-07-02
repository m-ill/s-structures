import { computeSectionProperties } from './sectionProperties.js';

export const SECTION_SCHEMA_VERSION = 'p3-m10-section-schema-v1';

export function validateSectionRecord(record = {}) {
  const normalized = normalizeSectionRecord(record);
  const errors = [];
  if (!normalized.id) errors.push('id');
  if (!Number.isInteger(Number(normalized.version)) || Number(normalized.version) < 1) errors.push('version');
  if (!['db', 'parametric', 'direct'].includes(normalized.kind)) errors.push('kind');
  for (const key of ['A', 'Iy', 'Iz']) if (!positive(normalized.properties?.[key])) errors.push(`properties.${key}`);
  return { ok: errors.length === 0, errors, normalized };
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
function positive(value) { return Number.isFinite(Number(value)) && Number(value) > 0; }
