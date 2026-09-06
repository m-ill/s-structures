import { stableHash } from './stableHash.js';

export const FOUNDATION_SCHEMA_VERSION = 'p14-m1-foundation-schema-v1';

export function normalizeFoundationProperties(values = []) {
  if (!Array.isArray(values)) return [];
  return values.map((property) => ({
    ...clone(property || {}),
    type: property?.type || 'winkler-line',
    behavior: property?.behavior || 'linear-bilateral',
    version: property?.version ?? 1,
    ...(property?.localY ? { localY: normalizeDirection(property.localY) } : {}),
    ...(property?.localZ ? { localZ: normalizeDirection(property.localZ) } : {}),
  }));
}

export function createWinklerLineFoundationProperty(input = {}) {
  const id = requiredText(input.id, 'foundation property id');
  const property = {
    id,
    name: clean(input.name) || id,
    version: Number.isInteger(Number(input.version)) && Number(input.version) > 0 ? Number(input.version) : 1,
    type: 'winkler-line',
    behavior: 'linear-bilateral',
    localY: canonicalDirection(input.localY, 'localY'),
    localZ: canonicalDirection(input.localZ, 'localZ'),
    notes: clean(input.notes),
  };
  if (!(property.localY.lineStiffness > 0) && !(property.localZ.lineStiffness > 0)) {
    throw foundationSchemaError('FOUNDATION_POSITIVE_STIFFNESS_REQUIRED');
  }
  return Object.freeze({ ...property, propertyHash: stableHash(property) });
}

export function previewFoundationDerivation(input = {}) {
  const subgradeModulus = finiteNonnegative(input.subgradeModulus, 'FOUNDATION_SUBGRADE_MODULUS_INVALID');
  const tributaryWidth = finiteNonnegative(input.tributaryWidth, 'FOUNDATION_TRIBUTARY_WIDTH_INVALID');
  const lineStiffness = subgradeModulus * tributaryWidth;
  return Object.freeze({
    version: FOUNDATION_SCHEMA_VERSION,
    mode: 'subgrade-times-width',
    subgradeModulus,
    tributaryWidth,
    lineStiffness,
    dimensions: {
      subgradeModulus: 'F/L^3',
      tributaryWidth: 'L',
      lineStiffness: 'F/L^2',
    },
    source: clean(input.source),
    units: clone(input.units || null),
  });
}

export function assignMemberFoundation(model = {}, memberIds = [], foundationId = null) {
  const ids = new Set(Array.from(memberIds || []).map(String));
  if (!ids.size) throw foundationSchemaError('FOUNDATION_MEMBER_SELECTION_REQUIRED');
  const propertyId = requiredText(foundationId, 'foundation property id');
  if (!(model.foundationProperties || []).some((row) => row.id === propertyId)) {
    throw foundationSchemaError('FOUNDATION_PROPERTY_REFERENCE_MISSING');
  }
  const missing = [...ids].filter((id) => !(model.members || []).some((member) => String(member.id) === id));
  if (missing.length) throw foundationSchemaError('FOUNDATION_MEMBER_REFERENCE_MISSING', { memberIds: missing });
  const beforeHash = stableHash(model);
  const members = (model.members || []).map((member) => ids.has(String(member.id)) ? { ...member, foundationId: propertyId } : member);
  const next = { ...model, members };
  return Object.freeze({
    version: FOUNDATION_SCHEMA_VERSION,
    model: next,
    changeSet: Object.freeze({
      type: 'assign-member-foundation',
      memberIds: [...ids].sort(),
      foundationId: propertyId,
      beforeHash,
      afterHash: stableHash(next),
    }),
  });
}

export function validateFoundationModel(model = {}) {
  const errors = [];
  const properties = Array.isArray(model.foundationProperties) ? model.foundationProperties : [];
  const byId = new Map();
  for (const property of properties) {
    const id = clean(property?.id);
    if (!id) {
      errors.push({ code: 'FOUNDATION_PROPERTY_ID_REQUIRED', target: 'foundationProperties' });
      continue;
    }
    if (byId.has(id)) {
      errors.push({ code: 'FOUNDATION_PROPERTY_ID_DUPLICATE', target: id });
      continue;
    }
    byId.set(id, property);
    try {
      createWinklerLineFoundationProperty(property);
    } catch (error) {
      errors.push({ code: error.code || 'FOUNDATION_PROPERTY_INVALID', target: id });
    }
  }
  for (const member of model.members || []) {
    if (!member.foundationId) continue;
    if (!byId.has(member.foundationId)) errors.push({ code: 'FOUNDATION_PROPERTY_REFERENCE_MISSING', target: member.id });
    const behavior = member.behavior || member.type || 'frame';
    if (['truss', 'tensionOnly', 'compressionOnly'].includes(behavior)) errors.push({ code: 'FOUNDATION_MEMBER_BEHAVIOR_UNSUPPORTED', target: member.id });
    if (member.generated === true) errors.push({ code: 'FOUNDATION_GENERATED_MEMBER_UNSUPPORTED', target: member.id });
    if (member.taper) errors.push({ code: 'FOUNDATION_TAPER_UNQUALIFIED', target: member.id });
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function canonicalDirection(input, key) {
  if (input == null) return Object.freeze({ lineStiffness: 0 });
  if (typeof input !== 'object' || Array.isArray(input)) throw foundationSchemaError(`FOUNDATION_${key.toUpperCase()}_INVALID`);
  const derivationInput = input.derivation || input;
  const hasDerivation = derivationInput.subgradeModulus != null || derivationInput.tributaryWidth != null;
  const derivation = hasDerivation ? previewFoundationDerivation(derivationInput) : null;
  const direct = input.lineStiffness == null ? null : finiteNonnegative(input.lineStiffness, `FOUNDATION_${key.toUpperCase()}_STIFFNESS_INVALID`);
  if (direct != null && derivation) {
    const scale = Math.max(1, Math.abs(direct), Math.abs(derivation.lineStiffness));
    if (Math.abs(direct - derivation.lineStiffness) / scale > 1e-9) {
      throw foundationSchemaError(`FOUNDATION_${key.toUpperCase()}_DERIVATION_MISMATCH`);
    }
  }
  return Object.freeze({ lineStiffness: direct ?? derivation?.lineStiffness ?? 0, ...(derivation ? { derivation } : {}) });
}

function normalizeDirection(input) {
  return {
    ...clone(input || {}),
    ...(input?.derivation ? { derivation: clone(input.derivation) } : {}),
  };
}

function finiteNonnegative(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw foundationSchemaError(code);
  return number;
}

function requiredText(value, label) {
  const result = clean(value);
  if (!result) throw foundationSchemaError('FOUNDATION_REQUIRED_FIELD_MISSING', { label });
  return result;
}

function foundationSchemaError(code, details = {}) { return Object.assign(new Error(code), { code, ...details }); }
function clean(value) { return value == null ? null : String(value).trim() || null; }
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
