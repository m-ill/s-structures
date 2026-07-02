import { createHmac, timingSafeEqual } from 'node:crypto';

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function sign(secret, payloadB64) {
  return base64url(createHmac('sha256', secret).update(payloadB64).digest());
}

export function issueToken(secret, claims, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { ...claims, iat: now, exp: now + ttlSeconds };
  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = sign(secret, payloadB64);
  return { token: `${payloadB64}.${sig}`, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

export function verifyToken(secret, token) {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, reason: 'MALFORMED' };
  }
  const [payloadB64, sig] = token.split('.');
  const expectedSig = sign(secret, payloadB64);
  const sigBuf = Buffer.from(sig || '');
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp < now) {
    return { ok: false, reason: 'EXPIRED', claims };
  }
  return { ok: true, claims };
}

export function shouldRefresh(claims, refreshWindowSeconds = 30 * 60) {
  const now = Math.floor(Date.now() / 1000);
  return Number.isFinite(claims?.exp) && claims.exp - now <= refreshWindowSeconds;
}
