import { stableHash } from '../../../src/core/stableHash.js';

export function strictCanonicalHash(value, label = 'value') {
  assertStrictJson(value, label);
  return stableHash(value);
}

export function assertStrictJson(value, label = 'value') {
  visit(value, label, new Set());
  return value;
}

export function requiredText(value, label) {
  const normalized = value == null ? '' : String(value).trim();
  if (!normalized) throw new TypeError(`${label} is required.`);
  return normalized;
}

export function optionalText(value) {
  const normalized = value == null ? '' : String(value).trim();
  return normalized || null;
}

export function requiredHash(value, label, lengths = [64]) {
  const normalized = requiredText(value, label).toLowerCase();
  if (!lengths.includes(normalized.length) || !/^[0-9a-f]+$/.test(normalized)) {
    throw new TypeError(`${label} must be a ${lengths.join('-or-')}-character hexadecimal digest.`);
  }
  return normalized;
}

export function requiredFinite(value, label) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) throw new TypeError(`${label} must be finite.`);
  return normalized;
}

export function optionalNonnegativeFinite(value, label) {
  if (value == null || value === '') return null;
  const normalized = requiredFinite(value, label);
  if (normalized < 0) throw new RangeError(`${label} must be nonnegative.`);
  return normalized;
}

export function sortedUniqueText(values, label) {
  const normalized = Array.from(values || [], (value, index) => requiredText(value, `${label}[${index}]`)).sort();
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contains duplicate values.`);
  return normalized;
}

export function cloneStrictJson(value, label = 'value') {
  assertStrictJson(value, label);
  return JSON.parse(JSON.stringify(value));
}

export function immutable(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) immutable(child);
  return value;
}

function visit(value, path, stack) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must not contain NaN or Infinity.`);
    return;
  }
  if (typeof value !== 'object') throw new TypeError(`${path} must contain JSON values only.`);
  if (stack.has(value)) throw new TypeError(`${path} must not contain circular references.`);
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TypeError(`${path} must contain plain JSON objects only.`);
  }
  stack.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError(`${path}[${index}] must not be an array hole.`);
      visit(value[index], `${path}[${index}]`, stack);
    }
  } else {
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`, stack);
  }
  stack.delete(value);
}
