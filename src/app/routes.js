import { compileRoutePattern, matchCompiledRoute } from '../core/routePattern.js';

export const ROUTES_VERSION = 'p3-app-routes-v1';

export const ROUTE_TABLE = [
  { name: 'login', pattern: '/login' },
  { name: 'projects', pattern: '/projects' },
  { name: 'modeler', pattern: '/p/:projectId/modeler' },
  { name: 'importReview', pattern: '/p/:projectId/import/:jobId' },
  { name: 'revisions', pattern: '/p/:projectId/revisions' },
  { name: 'report', pattern: '/p/:projectId/report' },
  { name: 'localModeler', pattern: '/local/modeler' },
];

const COMPILED = ROUTE_TABLE.map((route) => ({
  ...route,
  compiled: compileRoutePattern(route.pattern),
}));

export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function matchRoute(hash) {
  const path = parseHash(hash);
  for (const route of COMPILED) {
    const params = matchCompiledRoute(route.compiled, path, { decode: safeDecode });
    if (!params) continue;
    if (Object.values(params).some((value) => value == null)) return null;
    return { name: route.name, params, path };
  }
  return null;
}

export function buildHash(routeName, params = {}) {
  const route = ROUTE_TABLE.find((item) => item.name === routeName);
  if (!route) throw new Error(`Unknown route: ${routeName}`);
  const path = route.pattern.split('/').map((segment) => (
    segment.startsWith(':') ? encodeURIComponent(params[segment.slice(1)] ?? '') : segment
  )).join('/');
  return `#${path}`;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
