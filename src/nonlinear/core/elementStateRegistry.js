import { stableHash } from '../../core/stableHash.js';

export const ELEMENT_STATE_REGISTRY_VERSION = 'p8-m1-element-state-registry-v1';
export const GENERIC_ELEMENT_STATE_TYPE = 'generic';

export function createElementStateRegistry(serializers = []) {
  const rows = [genericSerializer(), ...serializers].map(normalizeSerializer);
  const byType = new Map();
  for (const row of rows) {
    if (byType.has(row.type)) {
      const error = new Error(`Duplicate element-state serializer: ${row.type}`);
      error.code = 'ELEMENT_STATE_SERIALIZER_DUPLICATE';
      throw error;
    }
    byType.set(row.type, row);
  }
  const serializerRecord = Object.freeze(Object.fromEntries([...byType.entries()]));
  return Object.freeze({
    version: ELEMENT_STATE_REGISTRY_VERSION,
    types: Object.freeze([...byType.keys()].sort()),
    serializers: serializerRecord,
  });
}

export function serializeElementStates(registry, states = {}) {
  requireRegistry(registry);
  return stateEntries(states).map(([elementId, state]) => {
    const type = clean(state?.type) || GENERIC_ELEMENT_STATE_TYPE;
    const serializer = registry.serializers[type];
    if (!serializer) throw serializerError(type);
    const data = canonical(serializer.serialize(clone(state?.data ?? state ?? {})));
    const row = { elementId, type, version: serializer.version, data };
    return { ...row, contentHash: stableHash(row).slice(0, 24) };
  });
}

export function deserializeElementStates(registry, rows = []) {
  requireRegistry(registry);
  const out = {};
  for (const row of [...rows].sort((a, b) => String(a.elementId).localeCompare(String(b.elementId)))) {
    const serializer = registry.serializers[row.type];
    if (!serializer) throw serializerError(row.type);
    if (row.version !== serializer.version) {
      const error = new Error(`Element-state version mismatch for ${row.elementId}: ${row.version} != ${serializer.version}`);
      error.code = 'ELEMENT_STATE_VERSION_MISMATCH';
      throw error;
    }
    const hashInput = { elementId: row.elementId, type: row.type, version: row.version, data: canonical(row.data) };
    if (row.contentHash !== stableHash(hashInput).slice(0, 24)) {
      const error = new Error(`Element-state hash mismatch: ${row.elementId}`);
      error.code = 'ELEMENT_STATE_HASH_MISMATCH';
      throw error;
    }
    out[row.elementId] = {
      type: row.type,
      version: row.version,
      data: canonical(serializer.deserialize(clone(row.data))),
    };
  }
  return out;
}

function normalizeSerializer(serializer = {}) {
  const type = clean(serializer.type);
  if (!type || typeof serializer.serialize !== 'function' || typeof serializer.deserialize !== 'function') {
    const error = new TypeError('Element-state serializer requires type, serialize, and deserialize.');
    error.code = 'ELEMENT_STATE_SERIALIZER_INVALID';
    throw error;
  }
  return Object.freeze({
    type,
    version: clean(serializer.version) || `${type}-v1`,
    serialize: serializer.serialize,
    deserialize: serializer.deserialize,
  });
}

function genericSerializer() {
  return {
    type: GENERIC_ELEMENT_STATE_TYPE,
    version: 'p8-m1-generic-element-state-v1',
    serialize: canonical,
    deserialize: canonical,
  };
}

function stateEntries(states) {
  const entries = states instanceof Map
    ? [...states.entries()]
    : Array.isArray(states)
      ? states.map((row) => [row.elementId || row.id, row])
      : Object.entries(states || {});
  return entries
    .filter(([id]) => clean(id))
    .sort(([a], [b]) => String(a).localeCompare(String(b)));
}

function requireRegistry(registry) {
  if (registry?.version !== ELEMENT_STATE_REGISTRY_VERSION || !registry.serializers || typeof registry.serializers !== 'object') {
    const error = new TypeError('Valid element-state registry is required.');
    error.code = 'ELEMENT_STATE_REGISTRY_INVALID';
    throw error;
  }
}

function serializerError(type) {
  const error = new Error(`Element-state serializer not registered: ${type}`);
  error.code = 'ELEMENT_STATE_SERIALIZER_NOT_FOUND';
  return error;
}

function canonical(value) {
  if (value == null || typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value)) return Array.from(value, canonical);
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Map) return Object.fromEntries([...value.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([key, item]) => [key, canonical(item)]));
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}
