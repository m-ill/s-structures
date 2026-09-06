import {
  createDesignBasis,
} from './designBasisInput.js';
import { estimateModelLoads } from './loadEstimation.js';
import {
  getLoadFamilyDefinition,
  normalizeLoadCaseMetadata,
} from '../loads/loadCaseMetadata.js';
import {
  createMassSourceDefinition,
  previewMassSourceChangeSet,
} from '../loads/massSource.js';

export const DESIGN_BASIS_CHANGE_SET_VERSION = 'p7-m4-design-basis-change-set-v1';
export const DESIGN_BASIS_GENERATOR_SOURCE_ID = 'p7-m4-design-basis';

const ACTIVE_FAMILY_STATES = new Set(['candidate', 'confirmed']);

export function previewDesignBasisChangeSet(model = {}, input = {}, options = {}) {
  const source = input.designBasis || input || {};
  const basis = createDesignBasis({
    ...(model.designBasis || {}),
    ...source,
    status: source.status || 'draft',
  });
  const resolvedFamilyStates = Object.values(basis.familyStates || {}).every((state) => (
    state === 'confirmed' || state === 'not-applicable'
  ));
  if (!source.status) basis.status = resolvedFamilyStates ? 'configured' : 'draft';
  const casePreview = buildDesignBasisLoadCases(basis, {
    ...options,
    sourceId: options.sourceId || DESIGN_BASIS_GENERATOR_SOURCE_ID,
  });
  const caseMerge = mergeGeneratedRecords(
    model.loadCases || [],
    casePreview.loadCases,
    options.mode,
    options.sourceId || DESIGN_BASIS_GENERATOR_SOURCE_ID,
    'load-case',
  );
  const massSource = buildDesignBasisMassSource(basis, casePreview.loadCases, {
    ...options,
    ...(source.massSource || input.massSource || {}),
  });
  const massPreview = previewMassSourceChangeSet(model, massSource, {
    mode: options.mode,
    activate: options.activateMassSource !== false,
  });
  const errors = [...casePreview.errors, ...massPreview.errors];
  const warnings = [...casePreview.warnings, ...massPreview.warnings];
  const conflicts = [...caseMerge.conflicts, ...massPreview.conflicts];
  if (conflicts.length) warnings.push(issue(
    'design-basis-user-modified-conflicts',
    `${conflicts.length} user-owned generated record(s) will be preserved.`,
  ));

  const estimation = options.includeLoadPreview === false
    ? null
    : estimateModelLoads(model, basis, { ...options, generateLoads: true });
  const beforeBasis = clonePlain(model.designBasis || null);
  const changedBasisFields = changedTopLevelFields(beforeBasis || {}, basis);

  return {
    version: DESIGN_BASIS_CHANGE_SET_VERSION,
    status: errors.length ? 'blocked' : conflicts.length ? 'review-required' : 'ready',
    mode: normalizeMode(options.mode),
    activateMassSource: options.activateMassSource !== false,
    sourceId: options.sourceId || DESIGN_BASIS_GENERATOR_SOURCE_ID,
    designBasis: {
      before: beforeBasis,
      after: clonePlain(basis),
      changed: changedBasisFields.length > 0,
      changedFields: changedBasisFields,
    },
    loadCases: {
      ...caseMerge.changes,
      proposed: casePreview.loadCases.map(summaryRecord),
      excluded: casePreview.excluded,
    },
    massSources: {
      ...massPreview.changes,
      proposed: summaryRecord(massSource),
    },
    loadCombinations: {
      status: 'deferred-to-rule-pack',
      create: [],
      update: [],
      remove: [],
    },
    conflicts,
    warnings,
    errors,
    preview: estimation ? {
      geometry: estimation.geometry,
      summary: estimation.summary,
      generatedLoadCount: estimation.loads.length,
      limitations: estimation.limitations,
    } : null,
    next: {
      designBasis: clonePlain(basis),
      loadCases: caseMerge.next,
      massSources: massPreview.next.massSources,
      analysisSettings: {
        ...(model.analysisSettings || {}),
        massSource: massPreview.next.activeMassSource,
      },
      projectSetup: {
        ...(model.projectSetup || {}),
        status: options.projectSetupStatus || (resolvedFamilyStates ? 'configured' : 'draft'),
        templateId: options.templateId || model.projectSetup?.templateId || basis.occupancy || null,
        warnings: [...new Set([
          ...(model.projectSetup?.warnings || []),
          ...warnings.map((item) => item.code),
        ])],
      },
    },
    proposals: {
      loadCases: clonePlain(casePreview.loadCases),
      massSource: clonePlain(massSource),
    },
    summary: {
      loadCaseCreated: caseMerge.changes.create.length,
      loadCaseUpdated: caseMerge.changes.update.length,
      loadCaseRemoved: caseMerge.changes.remove.length,
      massSourceCreated: massPreview.changes.create.length,
      massSourceUpdated: massPreview.changes.update.length,
      conflictCount: conflicts.length,
      unconfiguredFamilies: casePreview.excluded
        .filter((item) => item.state === 'unconfigured')
        .map((item) => item.family),
    },
  };
}

export function applyDesignBasisChangeSet(model, changeSetOrInput = {}, options = {}) {
  if (!model || typeof model !== 'object') throw new Error('applyDesignBasisChangeSet requires a model.');
  const supplied = changeSetOrInput?.version === DESIGN_BASIS_CHANGE_SET_VERSION
    ? clonePlain(changeSetOrInput)
    : null;
  if (supplied && (supplied.status === 'blocked' || supplied.errors?.length)) {
    const error = new Error('Design-basis change set is blocked.');
    error.code = 'DESIGN_BASIS_CHANGE_SET_BLOCKED';
    error.changeSet = supplied;
    throw error;
  }
  const changeSet = supplied
    ? previewDesignBasisChangeSet(model, {
      designBasis: supplied.designBasis.after,
      massSource: supplied.proposals?.massSource || supplied.next.massSources?.[0],
    }, {
      mode: supplied.mode,
      sourceId: supplied.sourceId,
      includeLoadPreview: false,
      activateMassSource: supplied.activateMassSource,
    })
    : previewDesignBasisChangeSet(model, changeSetOrInput, options);
  if (changeSet.status === 'blocked' || changeSet.errors?.length) {
    const error = new Error('Design-basis change set is blocked.');
    error.code = 'DESIGN_BASIS_CHANGE_SET_BLOCKED';
    error.changeSet = changeSet;
    throw error;
  }

  const previous = {
    designBasis: model.designBasis,
    loadCases: model.loadCases,
    massSources: model.massSources,
    analysisSettings: model.analysisSettings,
    projectSetup: model.projectSetup,
  };
  try {
    model.designBasis = clonePlain(changeSet.next.designBasis);
    model.loadCases = clonePlain(changeSet.next.loadCases);
    model.massSources = clonePlain(changeSet.next.massSources);
    model.analysisSettings = clonePlain(changeSet.next.analysisSettings);
    model.projectSetup = clonePlain(changeSet.next.projectSetup);
  } catch (error) {
    try {
      model.designBasis = previous.designBasis;
      model.loadCases = previous.loadCases;
      model.massSources = previous.massSources;
      model.analysisSettings = previous.analysisSettings;
      model.projectSetup = previous.projectSetup;
    } catch {
      // Keep the original transaction error.
    }
    throw error;
  }
  return { ...changeSet, applied: true };
}

export function buildDesignBasisLoadCases(basisInput = {}, options = {}) {
  const basis = basisInput?.inputVersion ? basisInput : createDesignBasis(basisInput);
  const sourceId = options.sourceId || DESIGN_BASIS_GENERATOR_SOURCE_ID;
  const loadCases = [];
  const excluded = [];
  const warnings = [];
  const errors = [];

  for (const [family, state] of Object.entries(basis.familyStates || {})) {
    if (!ACTIVE_FAMILY_STATES.has(state)) {
      excluded.push({
        family,
        state,
        reason: state === 'not-applicable' ? 'family-not-applicable' : 'family-not-configured',
      });
      if (state === 'invalid') errors.push(issue('design-basis-family-invalid', `${family} family input is invalid.`, { family }));
      if (state === 'unsupported') warnings.push(issue('design-basis-family-unsupported', `${family} family is not supported by this generator.`, { family }));
      continue;
    }
    for (const specification of caseSpecifications(family, basis, options)) {
      loadCases.push(normalizeLoadCaseMetadata({
        ...specification,
        origin: 'template',
        sourceId,
        status: 'candidate',
        inputState: state,
        userModified: false,
        valueMetadata: caseValueMetadata(family, specification, basis),
      }, { sourceId, origin: 'template', status: 'candidate', inputState: state }));
    }
  }

  return {
    version: DESIGN_BASIS_CHANGE_SET_VERSION,
    loadCases: deduplicateBy(loadCases, (item) => item.generatedKey || item.id),
    excluded,
    warnings,
    errors,
  };
}

export function buildDesignBasisMassSource(basisInput = {}, loadCases = [], options = {}) {
  const basis = basisInput?.inputVersion ? basisInput : createDesignBasis(basisInput);
  if (options.entries || options.combos) {
    return createMassSourceDefinition({
      ...options,
      entries: options.entries || options.combos,
      sourceId: options.sourceId || DESIGN_BASIS_GENERATOR_SOURCE_ID,
      status: options.status || 'candidate',
    });
  }

  const caseIds = new Set(loadCases.map((item) => item.id));
  const entries = [];
  if (caseIds.has('D-SDL')) entries.push({ case: 'D-SDL', family: 'D', factor: 1, status: 'candidate' });
  const liveFactor = Number(basis.seismicLiveLoadFactor);
  if (caseIds.has('L') && Number.isFinite(liveFactor) && liveFactor !== 0) {
    entries.push({ case: 'L', family: 'L', factor: liveFactor, status: 'candidate' });
  }
  return createMassSourceDefinition({
    id: options.massSourceId || 'MS-DESIGN-BASIS',
    name: options.massSourceName || 'Design-basis mass source',
    entries,
    includeNodeMass: options.includeNodeMass !== false,
    includeMemberMass: options.includeMemberMass === true,
    includeSelfWeight: caseIds.has('D-SW') && options.includeSelfWeight !== false,
    origin: 'template',
    sourceId: options.sourceId || DESIGN_BASIS_GENERATOR_SOURCE_ID,
    status: 'candidate',
  });
}

function caseSpecifications(family, basis, options) {
  if (family === 'D') {
    const cases = [{ id: 'D-SDL', name: 'Superimposed dead load', type: 'dead', family: 'D', variant: 'superimposed' }];
    if (options.includeSelfWeight !== false) {
      cases.unshift({ id: 'D-SW', name: 'Program self-weight', type: 'dead', family: 'D', variant: 'selfWeight', direction: 'z', sign: -1 });
    }
    return cases;
  }
  if (family === 'W') return directionalCases('W', 'Wind', 'wind');
  if (family === 'E') return directionalCases('E', 'Seismic', 'seismic');
  const definition = getLoadFamilyDefinition(family);
  const id = family;
  return [{
    id,
    name: definition.label,
    type: definition.legacyType,
    family,
    variant: family === 'L' ? 'occupancy' : family === 'Lr' ? 'roof' : 'default',
  }];
}

function directionalCases(family, label, type) {
  return ['x', 'y'].map((direction) => ({
    id: `${family}${direction.toUpperCase()}`,
    name: `${label} ${direction.toUpperCase()}`,
    type,
    family,
    direction,
    sign: null,
    variant: 'base',
  }));
}

function caseValueMetadata(family, specification, basis) {
  const fields = {
    D: specification.variant === 'selfWeight' ? null : 'deadLoad',
    L: 'liveLoad',
    Lr: 'roofLiveLoad',
    W: specification.direction === 'y' ? 'windPressureY' : 'windPressureX',
    E: specification.direction === 'y' ? 'seismicCoefficientY' : 'seismicCoefficientX',
    S: Object.prototype.hasOwnProperty.call(basis, 'snowLoad') ? 'snowLoad' : 'snowPressure',
    R: Object.prototype.hasOwnProperty.call(basis, 'rainLoad') ? 'rainLoad' : 'rainPressure',
    H: Object.prototype.hasOwnProperty.call(basis, 'earthPressure') ? 'earthPressure' : 'soilPressure',
    T: Object.prototype.hasOwnProperty.call(basis, 'temperatureLoad') ? 'temperatureLoad' : 'temperatureRange',
    F: Object.prototype.hasOwnProperty.call(basis, 'fluidLoad') ? 'fluidLoad' : 'waterPressure',
    EQUIPMENT: Object.prototype.hasOwnProperty.call(basis, 'equipmentLoad') ? 'equipmentLoad' : 'equipmentWeight',
    CONSTRUCTION: 'constructionLoad',
    OTHER: 'otherLoad',
  };
  const field = fields[family] || null;
  if (!field) {
    return specification.variant === 'selfWeight'
      ? {
        value: 1,
        unit: '-',
        source: 'member material density and section area',
        condition: 'analysis self-weight enabled',
        inputState: basis.familyStates?.D || 'candidate',
        userConfirmed: basis.familyStates?.D === 'confirmed',
      }
      : {
        value: null,
        unit: null,
        source: 'project-input-required',
        condition: `${family} family applicable`,
        inputState: basis.familyStates?.[family] || 'unconfigured',
        userConfirmed: basis.familyStates?.[family] === 'confirmed',
      };
  }
  if (!Object.prototype.hasOwnProperty.call(basis, field)) {
    return {
      value: null,
      unit: null,
      source: 'project-input-required',
      condition: `${family} family applicable`,
      inputState: basis.familyStates?.[family] || 'unconfigured',
      userConfirmed: false,
    };
  }
  return clonePlain(basis.valueMetadata?.[field] || {
    value: basis[field],
    unit: null,
    source: 'design-basis',
    condition: field,
    inputState: basis.inputStates?.[field] || 'candidate',
    userConfirmed: basis.inputStates?.[field] === 'confirmed',
  });
}

function mergeGeneratedRecords(currentInput, proposedInput, modeInput, sourceId, kind) {
  const current = clonePlain(Array.isArray(currentInput) ? currentInput : []);
  const proposed = clonePlain(Array.isArray(proposedInput) ? proposedInput : []);
  const mode = normalizeMode(modeInput);
  const changes = { create: [], update: [], unchanged: [], preserve: [], remove: [] };
  const conflicts = [];
  const next = current.slice();
  const proposedKeys = new Set();

  for (const candidate of proposed) {
    const index = next.findIndex((item) => sameRecord(item, candidate));
    proposedKeys.add(candidate.generatedKey || candidate.id);
    if (index < 0) {
      changes.create.push(summaryRecord(candidate));
      next.push(candidate);
      continue;
    }
    const existing = next[index];
    if (sameContent(existing, candidate)) {
      changes.unchanged.push(summaryRecord(existing));
      continue;
    }
    const userOwned = existing.userModified === true || !existing.generatedKey || existing.origin === 'manual';
    if (userOwned) {
      const conflict = {
        code: `${kind}-user-modified-conflict`,
        id: existing.id || candidate.id,
        generatedKey: existing.generatedKey || candidate.generatedKey || null,
        existing: clonePlain(existing),
        proposed: clonePlain(candidate),
      };
      conflicts.push(conflict);
      changes.preserve.push(summaryRecord(existing));
      continue;
    }
    changes.update.push({ before: summaryRecord(existing), after: summaryRecord(candidate) });
    next[index] = candidate;
  }

  const filtered = mode === 'replace-generated'
    ? next.filter((item) => {
      const owned = item?.sourceId === sourceId && item?.origin !== 'manual';
      const key = item?.generatedKey || item?.id;
      const remove = owned && !proposedKeys.has(key) && item.userModified !== true;
      if (remove) changes.remove.push(summaryRecord(item));
      return !remove;
    })
    : next;
  return {
    next: deduplicateBy(filtered, (item) => item.id),
    changes,
    conflicts,
  };
}

function sameRecord(a, b) {
  if (a?.generatedKey && b?.generatedKey && a.generatedKey === b.generatedKey) return true;
  return a?.id === b?.id;
}

function sameContent(a, b) {
  return stableJson(comparableRecord(a)) === stableJson(comparableRecord(b));
}

function comparableRecord(value = {}) {
  const copy = clonePlain(value);
  delete copy.userModified;
  delete copy.generatedAt;
  return copy;
}

function summaryRecord(value = {}) {
  return {
    id: value.id || null,
    name: value.name || value.id || null,
    family: value.family || null,
    variant: value.variant || null,
    generatedKey: value.generatedKey || null,
    userModified: value.userModified === true,
  };
}

function changedTopLevelFields(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((key) => stableJson(before?.[key]) !== stableJson(after?.[key])).sort();
}

function deduplicateBy(items, keyOf) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function normalizeMode(value) {
  return value === 'replace-generated' ? value : 'merge';
}

function issue(code, message, detail = null) {
  return { code, message, detail };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function clonePlain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}
