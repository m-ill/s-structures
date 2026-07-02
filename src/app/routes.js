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
  keys: route.pattern.split('/').filter((segment) => segment.startsWith(':')).map((segment) => segment.slice(1)),
  regex: new RegExp(`^${route.pattern
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '([^/]+)' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/')}$`),
}));

export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function matchRoute(hash) {
  const path = parseHash(hash);
  for (const route of COMPILED) {
    const match = route.regex.exec(path);
    if (!match) continue;
    const params = {};
    route.keys.forEach((key, index) => { params[key] = decodeURIComponent(match[index + 1]); });
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
