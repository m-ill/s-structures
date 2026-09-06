import { DEFAULT_UNITS } from './catalogs.js';
import { WARNING_CODES } from './schema.js';

export const SOLVER_UNIT_POLICY = {
  length: 'm',
  force: 'kN',
  moment: 'kN.m',
  stress: 'N/mm2',
  displacement: 'mm',
};

export const SUPPORTED_UNITS = {
  length: new Set(['m']),
  force: new Set(['kN']),
  moment: new Set(['kN.m']),
  stress: new Set(['N/mm2']),
  displacement: new Set(['mm', 'm']),
};

export function normalizeUnits(units = {}) {
  return {
    ...DEFAULT_UNITS,
    ...units,
  };
}

export function validateUnits(units) {
  const warnings = [];
  if (!units) {
    warnings.push({
      level: 'WARNING',
      code: WARNING_CODES.NO_UNITS,
      message: 'Model has no units block; solver defaults will be used.',
      target: 'units',
    });
    return warnings;
  }

  const normalized = normalizeUnits(units);
  for (const [key, value] of Object.entries(normalized)) {
    const supported = SUPPORTED_UNITS[key];
    if (supported && !supported.has(value)) {
      warnings.push({
        level: 'WARNING',
        code: WARNING_CODES.UNSUPPORTED_UNIT,
        message: `Unit ${key}=${value} is not supported by the current solver policy.`,
        target: `units.${key}`,
      });
    }
  }
  return warnings;
}

