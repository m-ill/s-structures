import { createPublicKey, verify } from 'node:crypto';

export const LICENSE_VERSION = 'p4-license-v1';
export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA9nr0YwLslRoAfn3QzAKcqxp6pvauqn5MBupBFsFF5oE=
-----END PUBLIC KEY-----`;

export function verifyLicense(text, options = {}) {
  const parsed = parseLicense(text);
  if (!parsed.ok) return parsed;
  const { payload, signature } = parsed;
  const publicKey = createPublicKey(options.publicKeyPem || LICENSE_PUBLIC_KEY_PEM);
  const ok = verify(null, Buffer.from(canonicalPayload(payload)), publicKey, Buffer.from(signature, 'base64'));
  if (!ok) return { ok: false, mode: 'evaluation', code: 'BAD_SIGNATURE' };
  if (payload.expiry && new Date(payload.expiry).getTime() < Date.now()) {
    return { ok: false, mode: 'evaluation', code: 'EXPIRED', payload };
  }
  return { ok: true, mode: 'licensed', payload };
}

export function parseLicense(text) {
  try {
    const parsed = JSON.parse(String(text || ''));
    if (parsed.version !== LICENSE_VERSION) return { ok: false, mode: 'evaluation', code: 'VERSION' };
    if (!parsed.payload || !parsed.signature) return { ok: false, mode: 'evaluation', code: 'SHAPE' };
    return { ok: true, payload: parsed.payload, signature: parsed.signature };
  } catch {
    return { ok: false, mode: 'evaluation', code: 'PARSE' };
  }
}

export function canonicalPayload(payload = {}) {
  return JSON.stringify(sortObject(payload));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}
