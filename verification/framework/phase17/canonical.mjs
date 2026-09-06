import { createHash } from 'node:crypto';

export function assertStrictJson(value, label = 'value') {
  visitStrictJson(value, label, new Set());
  return value;
}

export function canonicalJson(value) {
  assertStrictJson(value);
  return JSON.stringify(sortJson(value));
}

export function prettyJson(value) {
  assertStrictJson(value);
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256Text(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function sha256Canonical(value) {
  return sha256Text(canonicalJson(value));
}

export function assertSha256(value, label = 'sha256') {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new TypeError(`${label} must be a lowercase 64-character SHA-256 digest.`);
  }
  return value;
}

export function assertRepoRelativePath(value, label = 'path') {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) {
    throw new TypeError(`${label} must be a non-empty repository-relative POSIX path.`);
  }
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new TypeError(`${label} must not contain empty, dot or parent segments.`);
  }
  return value;
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  }
  return value;
}

function visitStrictJson(value, path, stack) {
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
      visitStrictJson(value[index], `${path}[${index}]`, stack);
    }
  } else {
    for (const [key, child] of Object.entries(value)) visitStrictJson(child, `${path}.${key}`, stack);
  }
  stack.delete(value);
}
