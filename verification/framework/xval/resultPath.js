const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const IDENTIFIER_START = /[A-Za-z_]/;
const IDENTIFIER_PART = /[A-Za-z0-9_:-]/;

export function parseXvalResultPath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 512) {
    return { ok: false, code: 'XVAL_PATH_INVALID', path };
  }
  let cursor = path.startsWith('$.') ? 2 : 0;
  const segments = [];
  const first = readIdentifier(path, cursor);
  if (!first) return { ok: false, code: 'XVAL_PATH_INVALID', path };
  segments.push(first.value);
  cursor = first.next;

  while (cursor < path.length) {
    if (path[cursor] === '.') {
      const item = readIdentifier(path, cursor + 1);
      if (!item) return { ok: false, code: 'XVAL_PATH_INVALID', path };
      segments.push(item.value);
      cursor = item.next;
      continue;
    }
    if (path[cursor] !== '[') return { ok: false, code: 'XVAL_PATH_INVALID', path };
    const item = path[cursor + 1] === '"'
      ? readQuotedProperty(path, cursor + 1)
      : readArrayIndex(path, cursor + 1);
    if (!item || path[item.next] !== ']') return { ok: false, code: 'XVAL_PATH_INVALID', path };
    segments.push(item.value);
    cursor = item.next + 1;
  }

  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) {
    return { ok: false, code: 'XVAL_PATH_FORBIDDEN', path };
  }
  return { ok: true, segments };
}

function readIdentifier(path, start) {
  if (!IDENTIFIER_START.test(path[start] || '')) return null;
  let cursor = start + 1;
  while (cursor < path.length && IDENTIFIER_PART.test(path[cursor])) cursor += 1;
  return { value: path.slice(start, cursor), next: cursor };
}

function readArrayIndex(path, start) {
  let cursor = start;
  while (/\d/.test(path[cursor] || '')) cursor += 1;
  const token = path.slice(start, cursor);
  if (!token || (token.length > 1 && token[0] === '0')) return null;
  return { value: token, next: cursor };
}

function readQuotedProperty(path, start) {
  let cursor = start + 1;
  let escaped = false;
  while (cursor < path.length) {
    const character = path[cursor];
    if (!escaped && character === '"') break;
    if (!escaped && character === '\\') escaped = true;
    else escaped = false;
    cursor += 1;
  }
  if (path[cursor] !== '"') return null;
  let value;
  try {
    value = JSON.parse(path.slice(start, cursor + 1));
  } catch {
    return null;
  }
  if (typeof value !== 'string') return null;
  return { value, next: cursor + 1 };
}
