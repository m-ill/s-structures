import { computeSectionProperties, validateSectionGeometry } from './sectionProperties.js';

export const SECTION_SCHEMA_VERSION = 'p3-m10-section-schema-v1';

export const OPTIONAL_SECTION_PROPERTIES = Object.freeze([
  'J', 'Ay', 'Az', 'Cw', 'Iyz', 'I1', 'I2', 'principalAngle', 'shearCenterY', 'shearCenterZ',
]);

export function validateSectionRecord(record = {}) {
  const normalized = normalizeSectionRecord(record);
  const errors = [];
  const warnings = [];
  if (!normalized.id) errors.push('id');
  if (!Number.isInteger(Number(normalized.version)) || Number(normalized.version) < 1) errors.push('version');
  if (!['db', 'parametric', 'direct'].includes(normalized.kind)) errors.push('kind');
  for (const key of ['A', 'Iy', 'Iz']) if (!positive(normalized.properties?.[key])) errors.push(`properties.${key}`);
  for (const key of ['J', 'Ay', 'Az', 'I1', 'I2']) {
    if (normalized.properties?.[key] != null && !positive(normalized.properties[key])) errors.push(`properties.${key}`);
  }
  if (normalized.properties?.Cw != null && !nonNegative(normalized.properties.Cw)) errors.push('properties.Cw');
  for (const key of ['Iyz', 'principalAngle', 'shearCenterY', 'shearCenterZ']) {
    if (normalized.properties?.[key] != null && !finite(normalized.properties[key])) errors.push(`properties.${key}`);
  }
  if (normalized.kind !== 'direct' && normalized.params) {
    errors.push(...validateSectionGeometry(normalized.shape, normalized.params).errors);
  }
  warnings.push(...sectionPropertyWarnings(normalized));
  return { ok: errors.length === 0, errors: unique(errors), warnings: unique(warnings), normalized };
}

export function normalizeSectionRecord(record = {}) {
  const shape = String(record.shape || record.type || (record.kind === 'direct' ? 'GENERAL' : 'CUSTOM')).toUpperCase();
  const rawParams = record.params || record.dims || null;
  const geometry = rawParams ? validateSectionGeometry(shape, rawParams) : null;
  const params = geometry?.ok ? geometry.params : rawParams;
  const kind = record.kind || (record.source?.db ? 'db' : rawParams ? 'parametric' : 'direct');
  const supplied = record.properties || pickProperties(record);
  const computed = supplied ? null : computeSectionProperties(shape, params);
  const properties = normalizeProperties(supplied || computed, record, Boolean(computed));
  return {
    ...record,
    kind,
    shape,
    params,
    properties,
    propertyProvenance: properties?.provenance || record.propertyProvenance || null,
  };
}

function pickProperties(record) {
  if (record.A == null) return null;
  return {
    A: record.A,
    Iy: record.Iy,
    Iz: record.Iz,
    J: record.J,
    Ay: record.Ay,
    Az: record.Az,
    Cw: record.Cw,
    Zy: record.Zy,
    Zz: record.Zz,
    Sy: record.Sy,
    Sz: record.Sz,
    ry: record.ry,
    rz: record.rz,
    Iyz: record.Iyz,
    I1: record.I1,
    I2: record.I2,
    principalAngle: record.principalAngle,
    shearCenterY: record.shearCenterY,
    shearCenterZ: record.shearCenterZ,
    provenance: record.propertyProvenance || record.provenance?.properties || null,
  };
}

function normalizeProperties(value, record, computed) {
  if (!value) return null;
  const properties = { ...value };
  if (properties.ry == null) properties.ry = radius(properties.Iy, properties.A);
  if (properties.rz == null) properties.rz = radius(properties.Iz, properties.A);
  const provenance = properties.provenance
    || record.propertyProvenance
    || record.provenance?.properties
    || { source: computed ? 'computed-parametric' : 'direct-input' };
  properties.provenance = record.source?.db
    ? { ...provenance, database: record.source.db }
    : { ...provenance };
  return properties;
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

function positive(value) {
  return finite(value) && Number(value) > 0;
}

function nonNegative(value) {
  return finite(value) && Number(value) >= 0;
}

function finite(value) {
  return value !== '' && Number.isFinite(Number(value));
}

function radius(i, a) {
  return positive(i) && positive(a) ? Math.sqrt(Number(i) / Number(a)) : null;
}

function close(actual, expected) {
  if (!positive(expected)) return true;
  return Math.abs(Number(actual) - expected) <= Math.max(1e-9, Math.abs(expected) * 0.02);
}

function round(value) {
  return Math.round(Number(value) * 1e9) / 1e9;
}

function unique(values) {
  return [...new Set(values)];
}
