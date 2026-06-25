import { createModel, clone } from './modelFactory.js';
import {
  SCHEMA_VERSION,
  defaultLoadCases,
  defaultLoadCombinations,
} from './schema.js';
import { normalizeUnits } from './units.js';

export function migrateModel(inputModel) {
  if (!inputModel) {
    return {
      model: createModel(),
      migrations: [{ from: null, to: SCHEMA_VERSION, note: 'Created a new default model.' }],
      changed: true,
    };
  }

  const source = clone(inputModel);
  const originalVersion = Number.isFinite(Number(source.schemaVersion)) ? Number(source.schemaVersion) : 1;
  const migrations = [];
  const base = createModel();

  let model = {
    ...base,
    ...source,
    schemaVersion: SCHEMA_VERSION,
    units: normalizeUnits(source.units),
    materials: Array.isArray(source.materials) && source.materials.length ? source.materials.map((item) => ({ ...item })) : base.materials,
    sections: Array.isArray(source.sections) && source.sections.length ? source.sections.map((item) => ({ ...item })) : base.sections,
    nodes: Array.isArray(source.nodes) ? source.nodes.map((node) => ({ ...node, z: Number(node.z || 0) })) : [],
    members: Array.isArray(source.members) ? source.members.map(normalizeMember) : [],
    loads: Array.isArray(source.loads) ? source.loads.map((load) => ({ ...load })) : [],
    loadCases: Array.isArray(source.loadCases) ? source.loadCases.map((loadCase) => ({ ...loadCase })) : [],
    loadCombinations: Array.isArray(source.loadCombinations) ? source.loadCombinations.map((combo) => ({ ...combo })) : [],
    analysisSettings: {
      ...base.analysisSettings,
      ...(source.analysisSettings || {}),
    },
    designParams: normalizeDesignParams(base.designParams, source.designParams),
    designSettings: {
      ...base.designSettings,
      ...(source.designSettings || {}),
    },
  };

  if (originalVersion !== SCHEMA_VERSION) {
    migrations.push({ from: originalVersion, to: SCHEMA_VERSION, note: 'Normalized model to the current schema.' });
  }

  model = normalizeLoadCasesAndCombinations(model, base, migrations);
  model.loads = model.loads.map((load) => normalizeLoad(load, model));

  return {
    model,
    migrations,
    changed: migrations.length > 0 || originalVersion !== SCHEMA_VERSION,
  };
}

export function migrateToV3(inputModel) {
  return migrateModel(inputModel).model;
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

function normalizeLoadCasesAndCombinations(model, base, migrations) {
  const isLegacy = !Array.isArray(model.loadCases) || model.loadCases.length === 0;
  model.loadCases = Array.isArray(model.loadCases) && model.loadCases.length
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

  if (Array.isArray(model.loadCombinations) && model.loadCombinations.length) {
    model.loadCombinations = model.loadCombinations.map((combo) => ({ ...combo, factors: { ...(combo.factors || {}) } }));
  } else {
    const factors = {};
    model.loadCases.forEach((loadCase) => {
      factors[loadCase.id] = 1;
    });
    model.loadCombinations = defaultLoadCombinations().map((combo, index) => ({
      ...combo,
      id: index === 0 ? 'CO1' : 'SLS1',
      factors: { ...factors },
    }));
    if (base.loadCombinations !== model.loadCombinations) {
      migrations.push({ from: 'missing', to: 'loadCombinations', note: 'Created default load combinations.' });
    }
  }

  return model;
}
