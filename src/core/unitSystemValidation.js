import { WARNING_CODES } from './schema.js';
import { normalizeUnitSystem } from './unitSystem.js';
import { SOLVER_UNIT_POLICY } from './units.js';

export function validateUnitSystem(unitSystem) {
  if (!unitSystem) {
    return [warn(WARNING_CODES.NO_UNIT_SYSTEM, 'Model has no unitSystem contract.', 'unitSystem')];
  }
  const normalized = normalizeUnitSystem(unitSystem);
  return Object.entries(SOLVER_UNIT_POLICY)
    .filter(([key, value]) => normalized.internal[key] !== value)
    .map(([key, value]) => warn(
      WARNING_CODES.UNSUPPORTED_UNIT,
      `Internal unit ${key} must remain ${value}.`,
      `unitSystem.internal.${key}`,
    ));
}

function warn(code, message, target) {
  return { level: 'WARNING', code, message, target };
}
