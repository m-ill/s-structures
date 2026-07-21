import { MATERIALS_CATALOG, SECTIONS_CATALOG } from './catalogs.js';
import {
  SCHEMA_VERSION,
  defaultAnalysisSettings,
  defaultDesignParams,
  defaultDesignSettings,
  defaultLoadCases,
  defaultLoadCombinations,
  defaultPracticeLoadCases,
  defaultPracticeLoadCombinations,
} from './schema.js';
import { normalizeUnits } from './units.js';
import { normalizeUnitSystem } from './unitSystem.js';
import { normalizeStories } from './storyModel.js';
import { normalizeDiaphragms } from './diaphragmContract.js';
import { defaultAnalysisCases, normalizeAnalysisCases } from './analysisCase.js';
import { defaultAnalysisCriteria, normalizeAnalysisCriteria } from './analysisCriteria.js';
import {
  defaultDesignBasis,
  defaultProjectSetup,
  normalizeDesignBasis,
  normalizeProjectSetup,
} from './projectSetup.js';
import { normalizeSourceRegistry } from './sourceRegistry.js';
import { defaultNonlinearRegistries, normalizeNonlinearRegistries } from './nonlinearSchema.js';

export function createModel(overrides = {}) {
  const units = normalizeUnits(overrides.units);
  const model = {
    schemaVersion: SCHEMA_VERSION,
    units,
    unitSystem: normalizeUnitSystem(overrides.unitSystem, units),
    storyModel: null,
    stories: [],
    diaphragms: [],
    materials: clone(MATERIALS_CATALOG),
    sections: clone(SECTIONS_CATALOG),
    nodes: [],
    members: [],
    loads: [],
    loadCases: defaultLoadCases(),
    loadCombinations: defaultLoadCombinations(),
    massSources: [],
    sourceRegistry: [],
    designBasis: defaultDesignBasis(),
    projectSetup: defaultProjectSetup('legacy-unreviewed'),
    analysisCases: defaultAnalysisCases(),
    analysisSettings: defaultAnalysisSettings(),
    analysisCriteria: defaultAnalysisCriteria(),
    ...defaultNonlinearRegistries(),
    designParams: defaultDesignParams(),
    designSettings: defaultDesignSettings(),
    ...overrides,
    units,
    unitSystem: normalizeUnitSystem(overrides.unitSystem, units),
    diaphragms: normalizeDiaphragms(overrides.diaphragms),
    analysisCases: normalizeAnalysisCases(overrides.analysisCases || []),
    analysisSettings: createAnalysisSettings(overrides.analysisSettings),
    analysisCriteria: normalizeAnalysisCriteria(overrides.analysisCriteria || defaultAnalysisCriteria()),
    massSources: Array.isArray(overrides.massSources) ? clone(overrides.massSources) : [],
    sourceRegistry: normalizeSourceRegistry(overrides.sourceRegistry),
    ...normalizeNonlinearRegistries(overrides),
    designBasis: normalizeDesignBasis(overrides.designBasis),
    projectSetup: normalizeProjectSetup(overrides.projectSetup, 'legacy-unreviewed'),
  };
  return normalizeStories(model);
}

function createAnalysisSettings(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const settings = { ...defaultAnalysisSettings(), ...source };
  if (Object.prototype.hasOwnProperty.call(source, 'shearDeformation')) {
    settings.shearDeformation = source.shearDeformation;
  } else if (typeof source.includeShearDeformation === 'boolean') {
    settings.shearDeformation = source.includeShearDeformation;
  } else if (Object.prototype.hasOwnProperty.call(source, 'includeShearDeformation')) {
    settings.shearDeformation = false;
  }
  return settings;
}

export function createPracticeModel(overrides = {}) {
  return createModel({
    loadCases: defaultPracticeLoadCases(),
    loadCombinations: defaultPracticeLoadCombinations(),
    massSources: [],
    sourceRegistry: [],
    designBasis: defaultDesignBasis(),
    projectSetup: defaultProjectSetup('load-setup-required'),
    ...overrides,
  });
}

export function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
