import { DEFAULT_UNITS } from './catalogs.js';
import { SOLVER_UNIT_POLICY } from './units.js';

export const UNIT_SYSTEM_VERSION = 'p2-t01-unit-system';

export function normalizeUnitSystem(input = {}, fallbackDisplay = {}) {
  const source = input || {};
  return {
    version: UNIT_SYSTEM_VERSION,
    internal: { ...SOLVER_UNIT_POLICY, ...(source.internal || {}) },
    display: { ...DEFAULT_UNITS, ...fallbackDisplay, ...(source.display || {}) },
    conversionAudit: Array.isArray(source.conversionAudit)
      ? source.conversionAudit.map((item) => ({ ...item }))
      : [],
  };
}

export function summarizeUnitSystem(unitSystem) {
  const normalized = normalizeUnitSystem(unitSystem);
  return {
    version: normalized.version,
    internal: normalized.internal,
    display: normalized.display,
    conversionAuditCount: normalized.conversionAudit.length,
  };
}
