export const PDELTA_METHODS = Object.freeze(['off', 'legacy', 'direct']);

export function normalizePDeltaMethod(value, options = {}) {
  if (value === true) return 'legacy';
  if (value === false) return 'off';
  const candidate = String(value ?? '').trim().toLowerCase();
  if (PDELTA_METHODS.includes(candidate)) return candidate;
  if (options.legacyEnabled === true) return 'legacy';
  const fallback = String(options.fallback ?? 'off').trim().toLowerCase();
  return PDELTA_METHODS.includes(fallback) ? fallback : 'off';
}

export function pDeltaMethodTrace(requested, resolved) {
  return {
    requested: requested ?? null,
    resolved,
    enabled: resolved !== 'off',
    legacy: resolved === 'legacy',
    direct: resolved === 'direct',
  };
}
