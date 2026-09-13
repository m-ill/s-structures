export function stableHash(value) {
  const normalized = canonicalValue(value);
  if (isOmitted(normalized)) throw new TypeError('Stable hash input must be JSON-serializable.');
  return hashByteChunks(canonicalUtf8(canonicalTokens(normalized, new Set())));
}

function canonicalValue(value) {
  let seen;
  while (value !== null && typeof value === 'object' && typeof value.toJSON === 'function') {
    seen ||= new Set();
    if (seen.has(value)) throw new TypeError('Stable hash input must not contain circular toJSON references.');
    seen.add(value);
    value = value.toJSON();
  }
  return value;
}

function isOmitted(value) {
  return ['undefined', 'function', 'symbol'].includes(typeof value);
}

function* quotedTokens(value) {
  yield '"';
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + 4096, value.length);
    const last = value.charCodeAt(end - 1), next = value.charCodeAt(end);
    if (end < value.length && last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--;
    yield JSON.stringify(value.slice(start, end)).slice(1, -1);
    start = end;
  }
  yield '"';
}

function* canonicalTokens(value, stack) {
  if (value === null) { yield 'null'; return; }
  const type = typeof value;
  if (type === 'string') { yield* quotedTokens(value); return; }
  if (type === 'number' || type === 'boolean') { yield JSON.stringify(value); return; }
  if (type === 'bigint') throw new TypeError('Stable hash input must not contain BigInt values.');
  if (stack.has(value)) throw new TypeError('Stable hash input must not contain circular references.');
  stack.add(value);
  if (Array.isArray(value)) {
    yield '[';
    let first = true;
    for (const item of value) {
      if (!first) yield ',';
      first = false;
      const normalized = canonicalValue(item);
      yield* canonicalTokens(isOmitted(normalized) ? null : normalized, stack);
    }
    yield ']';
  } else {
    yield '{';
    let first = true;
    for (const key of Object.keys(value).sort()) {
      const normalized = canonicalValue(value[key]);
      if (isOmitted(normalized)) continue;
      if (!first) yield ',';
      first = false;
      yield* quotedTokens(key); yield ':';
      yield* canonicalTokens(normalized, stack);
    }
    yield '}';
  }
  stack.delete(value);
}

function* canonicalUtf8(tokens) {
  let pending = '';
  for (const token of tokens) {
    pending += token;
    while (pending.length >= 4096) {
      let end = 4096;
      const last = pending.charCodeAt(end - 1), next = pending.charCodeAt(end);
      if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--;
      yield utf8Bytes(pending.slice(0, end));
      pending = pending.slice(end);
    }
  }
  if (pending) yield utf8Bytes(pending);
}

export function stableStringify(value) {
  return canonicalStringify(value, new Set(), false);
}

function canonicalStringify(value, stack, arrayItem) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return JSON.stringify(value);
  if (type === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (type === 'bigint') throw new TypeError('Stable hash input must not contain BigInt values.');
  if (type === 'undefined' || type === 'function' || type === 'symbol') return arrayItem ? 'null' : undefined;

  if (typeof value.toJSON === 'function') return canonicalStringify(value.toJSON(), stack, arrayItem);
  if (stack.has(value)) throw new TypeError('Stable hash input must not contain circular references.');
  stack.add(value);
  let serialized;
  if (Array.isArray(value)) {
    serialized = `[${Array.from(value, (item) => canonicalStringify(item, stack, true)).join(',')}]`;
  } else {
    const entries = Object.keys(value).sort().flatMap((key) => {
      const item = canonicalStringify(value[key], stack, false);
      return item === undefined ? [] : [`${JSON.stringify(key)}:${item}`];
    });
    serialized = `{${entries.join(',')}}`;
  }
  stack.delete(value);
  return serialized;
}

export function sha256(value) {
  return hashByteChunks(utf8Chunks(String(value)));
}

function* utf8Chunks(value) {
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + 4096, value.length);
    const last = value.charCodeAt(end - 1), next = value.charCodeAt(end);
    if (end < value.length && last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--;
    yield utf8Bytes(value.slice(start, end));
    start = end;
  }
}

export function sha256Bytes(value) {
  return hashByteChunks([value instanceof Uint8Array ? value : new Uint8Array(value)]);
}

function hashByteChunks(chunks) {
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);

  function compress(view, blockOffset) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(blockOffset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15];
      const y = words[index - 2];
      const s0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const s1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  const carry = new Uint8Array(64);
  const carryView = new DataView(carry.buffer);
  let used = 0, length = 0;
  for (const bytes of chunks) {
    length += bytes.length;
    let offset = 0;
    if (used) {
      const take = Math.min(64 - used, bytes.length);
      carry.set(bytes.subarray(0, take), used);
      used += take; offset += take;
      if (used === 64) { compress(carryView, 0); used = 0; }
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (; offset + 64 <= bytes.length; offset += 64) compress(view, offset);
    if (offset < bytes.length) {
      carry.set(bytes.subarray(offset), used);
      used += bytes.length - offset;
    }
  }
  // Only carry and final padding are retained, independent of input size.
  const tail = new Uint8Array(used < 56 ? 64 : 128);
  tail.set(carry.subarray(0, used)); tail[used] = 0x80;
  const tailView = new DataView(tail.buffer), bitLength = length * 8;
  tailView.setUint32(tail.length - 8, Math.floor(bitLength / 0x100000000), false);
  tailView.setUint32(tail.length - 4, bitLength >>> 0, false);
  for (let offset = 0; offset < tail.length; offset += 64) compress(tailView, offset);

  return [...state].map((word) => word.toString(16).padStart(8, '0')).join('');
}

function rotateRight(value, count) {
  return (value >>> count) | (value << (32 - count));
}

function utf8Bytes(value) {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(value);
  const bytes = [];
  for (const character of value) {
    const rawPoint = character.codePointAt(0);
    const point = rawPoint >= 0xd800 && rawPoint <= 0xdfff ? 0xfffd : rawPoint;
    if (point <= 0x7f) bytes.push(point);
    else if (point <= 0x7ff) bytes.push(0xc0 | (point >>> 6), 0x80 | (point & 0x3f));
    else if (point <= 0xffff) bytes.push(0xe0 | (point >>> 12), 0x80 | ((point >>> 6) & 0x3f), 0x80 | (point & 0x3f));
    else bytes.push(0xf0 | (point >>> 18), 0x80 | ((point >>> 12) & 0x3f), 0x80 | ((point >>> 6) & 0x3f), 0x80 | (point & 0x3f));
  }
  return Uint8Array.from(bytes);
}

const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
