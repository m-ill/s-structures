import { compileRoutePattern, matchCompiledRoute } from '../src/core/routePattern.js';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const ROUTER_ROLES = ['viewer', 'reviewer', 'engineer', 'owner'];

export function createRouter() {
  const routes = [];

  function add(method, pattern, handler, options = {}) {
    const normalizedOptions = normalizeRouteOptions(options);
    const compiled = compileRoutePattern(pattern);
    routes.push({
      method,
      pattern,
      compiled,
      handler,
      bodyType: normalizedOptions.bodyType,
      auth: normalizedOptions.auth,
    });
  }

  return {
    get: (pattern, handler, options) => add('GET', pattern, handler, options),
    post: (pattern, handler, options) => add('POST', pattern, handler, options),
    put: (pattern, handler, options) => add('PUT', pattern, handler, options),
    patch: (pattern, handler, options) => add('PATCH', pattern, handler, options),
    delete: (pattern, handler, options) => add('DELETE', pattern, handler, options),

    match(method, pathname) {
      for (const route of routes) {
        if (route.method !== method) continue;
        const params = matchCompiledRoute(route.compiled, pathname, { decode: decodePathSegment });
        if (!params) continue;
        return { handler: route.handler, params, bodyType: route.bodyType, auth: route.auth, pattern: route.pattern };
      }
      return null;
    },
    allowedMethods(pathname) {
      const methods = new Set();
      for (const route of routes) {
        const params = matchCompiledRoute(route.compiled, pathname, { decode: decodePathSegment });
        if (params) methods.add(route.method);
      }
      return [...methods].sort();
    },
    listRoutes() {
      return routes.map((route) => ({
        method: route.method,
        path: route.pattern,
        bodyType: route.bodyType,
        auth: route.auth ? { ...route.auth } : null,
      }));
    },
  };
}

function normalizeRouteOptions(options = {}) {
  const normalized = {
    bodyType: options.bodyType || 'json',
    auth: options.auth || null,
  };
  if (!normalized.auth) return normalized;
  if (normalized.auth.role && !ROUTER_ROLES.includes(normalized.auth.role)) {
    throw new Error(`Invalid route auth role: ${normalized.auth.role}`);
  }
  normalized.auth = {
    project: normalized.auth.project === true,
    user: normalized.auth.user === true,
    role: normalized.auth.role || null,
  };
  return normalized;
}

export function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

export function ok(data) {
  return { ok: true, data };
}

export function errorEnvelope(error) {
  if (error instanceof ApiError) {
    return { status: error.status, body: { ok: false, error: { code: error.code, message: error.message, details: error.details } } };
  }
  return { status: 500, body: { ok: false, error: { code: 'INTERNAL', message: 'Internal server error.' } } };
}

export async function readJsonBody(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the size limit.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'VALIDATION', 'Request body is not valid JSON.');
  }
}

export async function readRawBody(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Upload exceeds the size limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ApiError(400, 'BAD_URI', 'Request path contains invalid percent encoding.');
  }
}
