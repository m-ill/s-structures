import { createModel, clone } from './modelFactory.js';
import {
  SCHEMA_VERSION,
  defaultLoadCases,
  defaultLoadCombinations,
  modernizeLegacyDefaultCombinations,
} from './schema.js';
import { normalizeUnits } from './units.js';
import { normalizeUnitSystem } from './unitSystem.js';
import { normalizeStories } from './storyModel.js';
import { normalizeDiaphragms } from './diaphragmContract.js';
import { normalizeAnalysisCases } from './analysisCase.js';
import { normalizeAnalysisCriteria } from './analysisCriteria.js';
import { normalizeDesignBasis, normalizeProjectSetup } from './projectSetup.js';
import { normalizeSourceRegistry } from './sourceRegistry.js';
import { stableStringify } from './stableHash.js';
import { normalizeNonlinearRegistries } from './nonlinearSchema.js';
import { defaultNonlinearEngineId } from '../nonlinear/capabilities.js';

const LEGACY_NORMALIZATION_CUTOFF = 4;

export function migrateModel(inputModel) {
  if (!inputModel) {
    return {
      model: createModel(),
      migrations: [{ from: null, to: SCHEMA_VERSION, note: 'Created a new default model.' }],
      changed: true,
    };
  }

  if (typeof inputModel !== 'object' || Array.isArray(inputModel)) {
    const error = new TypeError('Model migration input must be an object.');
    error.code = 'MODEL_MIGRATION_INPUT_INVALID';
    throw error;
  }

  const source = clone(inputModel);
  const originalVersion = Number.isFinite(Number(source.schemaVersion)) ? Number(source.schemaVersion) : 1;
  if (originalVersion > SCHEMA_VERSION) {
    const error = new RangeError(`Model schemaVersion ${originalVersion} is newer than supported version ${SCHEMA_VERSION}.`);
    error.code = 'FUTURE_SCHEMA_VERSION';
    error.schemaVersion = originalVersion;
    error.supportedSchemaVersion = SCHEMA_VERSION;
    throw error;
  }
  if (originalVersion === 4) return migrateV4ToV5(source);
  const migrations = [];
  const base = createModel();
  const units = normalizeUnits(source.units);
  if (!source.unitSystem) {
    migrations.push({ from: 'missing', to: 'unitSystem', note: 'Created unit system contract.' });
  }
  if (!Array.isArray(source.stories)) {
    migrations.push({ from: 'missing', to: 'stories', note: 'Created story model from node elevations.' });
  }
  if (!Array.isArray(source.diaphragms)) {
    migrations.push({ from: 'missing', to: 'diaphragms', note: 'Created empty diaphragm collection.' });
  }
  if (!source.analysisCriteria) {
    migrations.push({ from: 'missing', to: 'analysisCriteria', note: 'Created analysis criteria registry settings.' });
  }
  if (!Array.isArray(source.massSources)) migrations.push({ from: 'missing', to: 'massSources', note: 'Created empty mass-source collection.' });
  if (!Array.isArray(source.sourceRegistry)) migrations.push({ from: 'missing', to: 'sourceRegistry', note: 'Created source registry.' });
  if (!source.designBasis) migrations.push({ from: 'missing', to: 'designBasis', note: 'Created unconfigured design-basis contract.' });
  if (!source.projectSetup) migrations.push({ from: 'missing', to: 'projectSetup', note: 'Marked legacy project setup for review.' });

  let model = {
    ...base,
    ...source,
    schemaVersion: SCHEMA_VERSION,
    units,
    unitSystem: normalizeUnitSystem(source.unitSystem, units),
    materials: Array.isArray(source.materials)
      ? source.materials.map((item) => normalizeLegacyLibraryRecord(item, originalVersion))
      : base.materials,
    sections: Array.isArray(source.sections)
      ? source.sections.map((item) => normalizeLegacyLibraryRecord(item, originalVersion))
      : base.sections,
    nodes: Array.isArray(source.nodes) ? source.nodes.map((node) => ({ ...node, z: Number(node.z || 0) })) : [],
    members: Array.isArray(source.members) ? source.members.map(normalizeMember) : [],
    loads: Array.isArray(source.loads) ? source.loads.map((load) => ({ ...load })) : [],
    stories: Array.isArray(source.stories) ? source.stories.map((story) => ({ ...story })) : [],
    diaphragms: normalizeDiaphragms(source.diaphragms),
    loadCases: Array.isArray(source.loadCases) ? source.loadCases.map((loadCase) => ({ ...loadCase })) : [],
    loadCombinations: Array.isArray(source.loadCombinations) ? source.loadCombinations.map((combo) => ({ ...combo })) : [],
    massSources: Array.isArray(source.massSources) ? source.massSources.map((item) => ({ ...item })) : [],
    sourceRegistry: normalizeSourceRegistry(source.sourceRegistry),
    ...normalizeNonlinearRegistries(source),
    designBasis: normalizeDesignBasis(source.designBasis),
    projectSetup: normalizeProjectSetup(source.projectSetup, originalVersion < LEGACY_NORMALIZATION_CUTOFF ? 'legacy-unreviewed' : 'load-setup-required'),
    analysisCases: normalizeAnalysisCases(classifyLegacyAnalysisCases(source.analysisCases, originalVersion)),
    analysisSettings: {
      ...base.analysisSettings,
      ...(source.analysisSettings || {}),
    },
    analysisCriteria: normalizeAnalysisCriteria(source.analysisCriteria || base.analysisCriteria),
    designParams: normalizeDesignParams(base.designParams, source.designParams),
    designSettings: {
      ...base.designSettings,
      ...(source.designSettings || {}),
    },
  };

  if (originalVersion !== SCHEMA_VERSION) {
    migrations.push({ from: originalVersion, to: SCHEMA_VERSION, note: 'Normalized model to the current schema.' });
  }
  if (!Array.isArray(source.analysisCases)) {
    migrations.push({ from: 'missing', to: 'analysisCases', note: 'Created empty analysis case collection.' });
  }

  model = normalizeLoadCasesAndCombinations(model, base, migrations, originalVersion, {
    loadCases: Array.isArray(source.loadCases),
    loadCombinations: Array.isArray(source.loadCombinations),
  });
  model.loads = model.loads.map((load) => normalizeLoad(load, model));
  model = normalizeStories(model);

  return {
    model,
    migrations,
    changed: stableStringify(source) !== stableStringify(model),
  };
}

export function migrateToV3(inputModel) {
  return migrateModel(inputModel).model;
}

export function migrateToCurrent(inputModel) {
  return migrateModel(inputModel).model;
}

export function migrateToV5(inputModel) {
  return migrateModel(inputModel).model;
}

function migrateV4ToV5(source) {
  const migrations = [];
  const registries = normalizeNonlinearRegistries(source);
  for (const [key, value] of Object.entries(registries)) {
    if (!Array.isArray(source[key])) {
      migrations.push({ from: 'missing', to: key, note: `Created empty Phase 8 ${key} registry.` });
    }
    registries[key] = value;
  }
  const model = {
    ...source,
    schemaVersion: SCHEMA_VERSION,
    ...registries,
    analysisCases: normalizeAnalysisCases(classifyLegacyAnalysisCases(source.analysisCases, 4)),
  };
  migrations.push({
    from: 4,
    to: SCHEMA_VERSION,
    note: 'Added Phase 8 registries and explicit legacy nonlinear engine identities without re-normalizing v4 model data.',
  });
  return {
    model,
    migrations,
    changed: stableStringify(source) !== stableStringify(model),
  };
}

function classifyLegacyAnalysisCases(cases, sourceSchemaVersion = 4) {
  if (!Array.isArray(cases)) return cases;
  return cases.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    if ((typeof item.engineId === 'string' && item.engineId.trim()) || !['pushover', 'nlth'].includes(item.kind)) return item;
    return {
      ...item,
      engineId: defaultNonlinearEngineId(item.kind),
      migration: {
        ...(item.migration || {}),
        sourceSchemaVersion: Number(item.migration?.sourceSchemaVersion || sourceSchemaVersion),
        nonlinearEngineClassified: true,
        automaticProductionUpgrade: false,
      },
    };
  });
}

function normalizeMember(member) {
  const releases = member.releases || {
    i: member.rel1 === 'pin' ? 'pin' : 'rigid',
    j: member.rel2 === 'pin' ? 'pin' : 'rigid',
  };
  const normalized = {
    type: 'frame',
    ...member,
    localAxis: member.localAxis || { roll: 0, strongAxis: 'z' },
    releases,
  };
  if (normalized.releases.i === 'pin') normalized.rel1 = 'pin';
  if (normalized.releases.j === 'pin') normalized.rel2 = 'pin';
  return normalized;
}

function normalizeLegacyLibraryRecord(record, originalVersion) {
  const normalized = { ...record };
  if (originalVersion < LEGACY_NORMALIZATION_CUTOFF && normalized.version == null) normalized.version = 1;
  return normalized;
}

function normalizeLoad(load, model) {
  const firstCaseId = model.loadCases[0]?.id || 'LC1';
  const normalized = {
    ...load,
    case: load.case || firstCaseId,
  };
  if (Array.isArray(load.direction)) normalized.direction = load.direction.slice(0, 3);
  return normalized;
}

function normalizeDesignParams(defaults, designParams) {
  if (!designParams) return clone(defaults);
  return {
    global: {
      ...defaults.global,
      ...(designParams.global || {}),
    },
    rc: {
      ...defaults.rc,
      ...(designParams.rc || {}),
    },
    members: designParams.members || {},
  };
}

function normalizeLoadCasesAndCombinations(model, base, migrations, originalVersion, explicit = {}) {
  const isLegacy = !explicit.loadCases;
  model.loadCases = explicit.loadCases
    ? model.loadCases.map((loadCase) => ({ ...loadCase }))
    : model.loads.length
      ? [{ id: 'LC1', name: 'Default load', type: 'other' }]
      : defaultLoadCases();

  if (isLegacy) {
    migrations.push({ from: 'legacy-loads', to: 'loadCases', note: 'Created load cases for legacy loads.' });
  }

  const caseIds = new Set(model.loadCases.map((loadCase) => loadCase.id));
  for (const load of model.loads) {
    const caseId = load.case || model.loadCases[0]?.id || 'LC1';
    if (!caseIds.has(caseId)) {
      model.loadCases.push({ id: caseId, name: caseId, type: 'other' });
      caseIds.add(caseId);
      migrations.push({ from: 'load.case', to: 'loadCases', note: `Created missing load case ${caseId}.` });
    }
  }

  if (model.loadCombinations.length) {
    model.loadCombinations = model.loadCombinations.map((combo) => normalizeLegacyCombination(combo, originalVersion));
    const modernization = modernizeLegacyDefaultCombinations(model.loadCombinations, model.loadCases, {
      assumeUnmarkedLegacy: originalVersion < LEGACY_NORMALIZATION_CUTOFF,
    });
    if (modernization.changed) {
      model.loadCombinations = modernization.combinations;
      migrations.push({
        from: modernization.removedIds.join(',') || 'legacy-default-combinations',
        to: modernization.addedIds.join(',') || 'service-baseline',
        note: 'Replaced obsolete default strength combinations with current KDS project-review candidates.',
      });
    }
  } else if (!explicit.loadCombinations && originalVersion < LEGACY_NORMALIZATION_CUTOFF) {
    model.loadCombinations = defaultLoadCombinations().filter((combo) => Object.keys(combo.factors || {}).every((id) => caseIds.has(id)));
    if (base.loadCombinations !== model.loadCombinations) {
      migrations.push({ from: 'missing', to: 'loadCombinations', note: 'Created compatible KDS review candidates; incompatible legacy unity combinations were not synthesized.' });
    }
  }

  return model;
}

function normalizeLegacyCombination(combo, originalVersion) {
  const normalized = { ...combo, factors: { ...(combo.factors || {}) } };
  const knownLegacyDefault = ['CO1', 'SLS1'].includes(normalized.id)
    && Number(normalized.factors.D) === 1
    && Number(normalized.factors.L) === 1;
  if (originalVersion < LEGACY_NORMALIZATION_CUTOFF && (knownLegacyDefault || !normalized.origin)) {
    normalized.origin ||= 'legacy';
    normalized.reviewStatus ||= 'legacy-unreviewed';
    normalized.purpose ||= 'legacy-review';
  }
  return normalized;
}
