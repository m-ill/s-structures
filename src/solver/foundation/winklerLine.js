import { stableHash } from '../../core/stableHash.js';
import { beamShapes, bendingPhi, integrateGauss } from '../frame/beamInterpolation.js';

export const WINKLER_LINE_VERSION = 'p14-m1-winkler-line-v1';
export const WINKLER_LINE_TYPE = 'winkler-line';
export const WINKLER_LINE_BEHAVIOR = 'linear-bilateral';

const LOCAL_Y_DOFS = Object.freeze([1, 5, 7, 11]);
const LOCAL_Z_DOFS = Object.freeze([2, 4, 8, 10]);

export function validateWinklerFoundationRegistry(model = {}) {
  const errors = [];
  const byId = new Map();
  for (const property of Array.isArray(model.foundationProperties) ? model.foundationProperties : []) {
    const id = clean(property?.id);
    if (!id) {
      errors.push(issue('FOUNDATION_PROPERTY_ID_REQUIRED', null));
      continue;
    }
    if (byId.has(id)) {
      errors.push(issue('FOUNDATION_PROPERTY_ID_DUPLICATE', id));
      continue;
    }
    byId.set(id, property);
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors), byId });
}

export function resolveMemberWinklerFoundation(model = {}, member = {}, options = {}) {
  const foundationId = clean(member.foundationId);
  if (!foundationId) return inactiveFoundation(member.id);
  const registry = options.registry || validateWinklerFoundationRegistry(model);
  if (!registry.ok) return failure(registry.errors[0].code, member, foundationId);
  const property = registry.byId.get(foundationId);
  if (!property) return failure('FOUNDATION_PROPERTY_REFERENCE_MISSING', member, foundationId);
  const behavior = options.memberBehavior || member.behavior || member.type || 'frame';
  if (['truss', 'tensionOnly', 'compressionOnly'].includes(behavior)) {
    return failure('FOUNDATION_MEMBER_BEHAVIOR_UNSUPPORTED', member, foundationId);
  }
  if (member.generated === true || member.source === 'shellFemConnectivity') {
    return failure('FOUNDATION_GENERATED_MEMBER_UNSUPPORTED', member, foundationId);
  }
  if (options.taper || member.taper) return failure('FOUNDATION_TAPER_UNQUALIFIED', member, foundationId);
  if (property.type !== WINKLER_LINE_TYPE) return failure('FOUNDATION_TYPE_UNSUPPORTED', member, foundationId);
  if ((property.behavior || WINKLER_LINE_BEHAVIOR) !== WINKLER_LINE_BEHAVIOR) {
    return failure('FOUNDATION_BEHAVIOR_UNSUPPORTED', member, foundationId);
  }
  if (hasNonzeroGroundDisplacement(property)) return failure('FOUNDATION_GROUND_DISPLACEMENT_UNSUPPORTED', member, foundationId);
  const L = Number(options.length);
  if (!(L > 0) || !Number.isFinite(L)) return failure('FOUNDATION_MEMBER_LENGTH_INVALID', member, foundationId);
  const localY = resolveLineStiffness(property.localY, 'localY', member, foundationId);
  if (!localY.ok) return localY;
  const localZ = resolveLineStiffness(property.localZ, 'localZ', member, foundationId);
  if (!localZ.ok) return localZ;
  const lineStiffness = Object.freeze({ localY: localY.value, localZ: localZ.value });
  const timoshenko = options.timoshenko || {};
  const matrix = buildWinklerLineLocalMatrix({ length: L, lineStiffness, timoshenko });
  const core = {
    version: WINKLER_LINE_VERSION,
    ok: true,
    active: localY.value > 0 || localZ.value > 0,
    memberId: member.id || null,
    propertyId: foundationId,
    propertyVersion: property.version ?? 1,
    type: WINKLER_LINE_TYPE,
    behavior: WINKLER_LINE_BEHAVIOR,
    length: L,
    applicationLength: 'flexible-clear-span',
    lineStiffness,
    derivation: { localY: localY.derivation, localZ: localZ.derivation },
    timoshenko: {
      enabled: timoshenko.enabled === true,
      phiY: Number(timoshenko.phiY) || 0,
      phiZ: Number(timoshenko.phiZ) || 0,
    },
    matrix,
  };
  return Object.freeze({ ...core, propertyHash: stableHash({ property, memberFoundationId: foundationId }) });
}

export function buildWinklerLineLocalMatrix(input = {}) {
  const L = Number(input.length);
  if (!(L > 0) || !Number.isFinite(L)) throw foundationError('FOUNDATION_MEMBER_LENGTH_INVALID');
  const ky = nonnegative(input.lineStiffness?.localY ?? input.localY ?? 0, 'FOUNDATION_LOCAL_Y_STIFFNESS_INVALID');
  const kz = nonnegative(input.lineStiffness?.localZ ?? input.localZ ?? 0, 'FOUNDATION_LOCAL_Z_STIFFNESS_INVALID');
  const matrix = zeros(12);
  addPlane(matrix, LOCAL_Y_DOFS, L, ky, bendingPhi(input.timoshenko, 'z'), [1, 1, 1, 1]);
  addPlane(matrix, LOCAL_Z_DOFS, L, kz, bendingPhi(input.timoshenko, 'y'), [1, -1, 1, -1]);
  return freezeMatrix(matrix);
}

export function addWinklerToStructuralMatrix(structural, foundation) {
  if (!foundation?.active) return structural;
  return structural.map((row, i) => row.map((value, j) => Number(value) + Number(foundation.matrix[i][j])));
}

function resolveLineStiffness(direction, key, member, foundationId) {
  if (direction == null) return { ok: true, value: 0, derivation: null };
  if (typeof direction !== 'object' || Array.isArray(direction)) return failure(`FOUNDATION_${key.toUpperCase()}_INVALID`, member, foundationId);
  const direct = optionalNonnegative(direction.lineStiffness);
  if (direct.error) return failure(`FOUNDATION_${key.toUpperCase()}_STIFFNESS_INVALID`, member, foundationId);
  const derivation = direction.derivation || direction;
  const subgrade = optionalNonnegative(derivation.subgradeModulus);
  const width = optionalNonnegative(derivation.tributaryWidth);
  if (subgrade.error || width.error) return failure(`FOUNDATION_${key.toUpperCase()}_DERIVATION_INVALID`, member, foundationId);
  const hasDerivedInput = subgrade.value != null || width.value != null;
  if (hasDerivedInput && (subgrade.value == null || width.value == null)) {
    return failure(`FOUNDATION_${key.toUpperCase()}_DERIVATION_INCOMPLETE`, member, foundationId);
  }
  const derived = hasDerivedInput ? subgrade.value * width.value : null;
  if (direct.value == null && derived == null) return { ok: true, value: 0, derivation: null };
  if (direct.value != null && derived != null) {
    const scale = Math.max(1, Math.abs(direct.value), Math.abs(derived));
    if (Math.abs(direct.value - derived) / scale > 1e-9) {
      return failure(`FOUNDATION_${key.toUpperCase()}_DERIVATION_MISMATCH`, member, foundationId);
    }
  }
  return {
    ok: true,
    value: direct.value ?? derived,
    derivation: derived == null ? null : {
      mode: 'subgrade-times-width',
      subgradeModulus: subgrade.value,
      tributaryWidth: width.value,
      derivedLineStiffness: derived,
      source: clean(derivation.source),
      units: derivation.units || null,
    },
  };
}

function addPlane(matrix, dofs, L, stiffness, phi, signs) {
  if (!(stiffness > 0)) return;
  integrateGauss(0, 1, (ratio, weight) => {
    const shapes = beamShapes(ratio, L, phi).map((value, index) => value * signs[index]);
    const dx = L * weight;
    for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) {
      matrix[dofs[i]][dofs[j]] += stiffness * shapes[i] * shapes[j] * dx;
    }
  });
}

function inactiveFoundation(memberId) {
  return Object.freeze({ version: WINKLER_LINE_VERSION, ok: true, active: false, memberId: memberId || null, matrix: null });
}

function failure(reason, member, propertyId) {
  return Object.freeze({ ok: false, reason, memberId: member?.id || null, propertyId: propertyId || null });
}

function issue(code, propertyId) { return Object.freeze({ code, propertyId }); }
function clean(value) { return value == null ? null : String(value).trim() || null; }
function zeros(size) { return Array.from({ length: size }, () => new Array(size).fill(0)); }
function freezeMatrix(matrix) { return Object.freeze(matrix.map((row) => Object.freeze(row))); }

function nonnegative(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw foundationError(code);
  return number;
}

function optionalNonnegative(value) {
  if (value == null || value === '') return { value: null, error: false };
  const number = Number(value);
  return { value: number, error: !Number.isFinite(number) || number < 0 };
}

function hasNonzeroGroundDisplacement(property) {
  return ['groundDisplacement', 'wg', 'settlement'].some((key) => {
    const value = property?.[key];
    if (value == null) return false;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'object') return Object.values(value).some((item) => Number(item) !== 0);
    return true;
  });
}

function foundationError(code) { return Object.assign(new Error(code), { code }); }
