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
import { normalizeUnitSystem } from './unitSystem.js';
import { normalizeStories } from './storyModel.js';

export function createModel(overrides = {}) {
  const units = normalizeUnits(overrides.units);
  const model = {
    schemaVersion: SCHEMA_VERSION,
    units,
    unitSystem: normalizeUnitSystem(overrides.unitSystem, units),
    storyModel: null,
    stories: [],
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
    units,
    unitSystem: normalizeUnitSystem(overrides.unitSystem, units),
  };
  return normalizeStories(model);
}

export function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
