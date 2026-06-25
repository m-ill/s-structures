import { MATERIALS_CATALOG, SECTIONS_CATALOG } from './catalogs.js';
import {
  SCHEMA_VERSION,
  defaultAnalysisSettings,
  defaultDesignParams,
  defaultDesignSettings,
  defaultLoadCases,
  defaultLoadCombinations,
} from './schema.js';
import { normalizeUnits } from './units.js';

export function createModel(overrides = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    units: normalizeUnits(overrides.units),
    materials: clone(MATERIALS_CATALOG),
    sections: clone(SECTIONS_CATALOG),
    nodes: [],
    members: [],
    loads: [],
    loadCases: defaultLoadCases(),
    loadCombinations: defaultLoadCombinations(),
    analysisSettings: defaultAnalysisSettings(),
    designParams: defaultDesignParams(),
    designSettings: defaultDesignSettings(),
    ...overrides,
  };
}

export function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

