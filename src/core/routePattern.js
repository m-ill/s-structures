export const ROUTE_PATTERN_VERSION = 'p4-route-pattern-v1';

export function compileRoutePattern(pattern) {
  const keys = [];
  const regexSource = String(pattern || '')
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return escapeRegex(segment);
    })
    .join('/');
  return {
    version: ROUTE_PATTERN_VERSION,
    pattern,
    keys,
    regex: new RegExp(`^${regexSource}$`),
  };
}

export function matchCompiledRoute(compiled, pathname, options = {}) {
  const match = compiled?.regex?.exec?.(pathname);
  if (!match) return null;
  const decode = options.decode || decodeURIComponent;
  const params = {};
  for (let index = 0; index < compiled.keys.length; index += 1) {
    params[compiled.keys[index]] = decode(match[index + 1]);
  }
  return params;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
