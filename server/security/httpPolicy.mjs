import { createHash } from 'node:crypto';

const COMMON_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};

export function applySecurityHeaders(res, { api = false, modelerFrame = false } = {}) {
  for (const [name, value] of Object.entries(COMMON_HEADERS)) res.setHeader(name, value);
  if(modelerFrame&&!api){res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Content-Security-Policy',COMMON_HEADERS['Content-Security-Policy'].replace("frame-ancestors 'none'","frame-ancestors 'self'"));}
  if (api) res.setHeader('Cache-Control', 'no-store');
}

export function createRateLimiter({ now = () => Date.now() } = {}) {
  const windows = new Map();
  return {
    consume(key, limit, windowSeconds) {
      const current = now();
      const windowMs = Math.max(1, windowSeconds) * 1000;
      let entry = windows.get(key);
      if (!entry || entry.resetAt <= current) entry = { count: 0, resetAt: current + windowMs };
      entry.count += 1;
      windows.set(key, entry);
      if (windows.size > 10_000) prune(windows, current);
      return {
        allowed: entry.count <= limit,
        limit,
        remaining: Math.max(0, limit - entry.count),
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - current) / 1000)),
      };
    },
    reset(key) {
      windows.delete(key);
    },
  };
}

export function requestClientKey(req) {
  return req.socket?.remoteAddress || 'unknown';
}

export function isOriginAllowed(req, config) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  if (!host) return false;
  const sameOrigin = `http://${host}`;
  if (origin === sameOrigin) return true;
  return Array.isArray(config.allowedOrigins) && config.allowedOrigins.includes(origin);
}

export function isHostAllowed(req, config) {
  const raw = String(req.headers.host || '');
  if (!raw) return false;
  const hostname = raw.startsWith('[')
    ? raw.slice(1, raw.indexOf(']'))
    : raw.split(':')[0];
  const allowed = new Set(['127.0.0.1', 'localhost', '::1', String(config.host || '').toLowerCase()]);
  return allowed.has(hostname.toLowerCase());
}

export function redactedIdentifier(value) {
  return createHash('sha256').update(String(value || '').trim().toLowerCase()).digest('hex').slice(0, 16);
}

function prune(map, current) {
  for (const [key, entry] of map) if (entry.resetAt <= current) map.delete(key);
}

