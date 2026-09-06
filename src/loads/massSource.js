import {
  inferLoadCaseFamily,
  normalizeLoadFamily,
} from './loadCaseMetadata.js';

export const MASS_SOURCE_DEFINITION_VERSION = 'p7-m4-mass-source-definition-v1';
export const MASS_SOURCE_CHANGE_SET_VERSION = 'p7-m4-mass-source-change-set-v1';

export function createMassSourceDefinition(input = {}, options = {}) {
  const sourceId = String(input.sourceId || options.sourceId || 'design-basis').trim();
  const id = String(input.id || options.id || 'MS-DESIGN-BASIS').trim();
  const inputComponents = Array.isArray(input.components) ? input.components : [];
  const componentEntries = inputComponents
    .filter((component) => ['load-case', 'loadCase', 'case'].includes(component?.kind || component?.type))
    .map((component) => ({
      ...component,
      case: component.case || component.caseId,
    }));
  const normalizedEntries = normalizeEntries(input.entries || input.combos || componentEntries, input);
  const origin = String(input.origin || options.origin || 'template');
  const generatedKey = input.generatedKey || massSourceGeneratedKey({ id, sourceId });
  const status = normalizedEntries.errors.length
    ? 'invalid'
    : normalizeEvidenceStatus(input.status || options.status || (origin === 'manual' ? 'preliminary' : 'candidate'));
  const entries = normalizedEntries.entries;
  const includeNodeMass = input.includeNodeMass == null
    ? inputComponents.length
      ? inputComponents.some((component) => (component.kind || component.type) === 'node-mass')
      : true
    : input.includeNodeMass !== false;
  const includeMemberMass = input.includeMemberMass == null
    ? inputComponents.some((component) => (component.kind || component.type) === 'member-mass')
    : input.includeMemberMass === true;
  const includeSelfWeight = input.includeSelfWeight == null
    ? inputComponents.some((component) => (component.kind || component.type) === 'self-weight')
    : input.includeSelfWeight === true;
  const components = buildComponents(entries, { includeNodeMass, includeMemberMass, includeSelfWeight });
  const priorDeduplication = input.version === MASS_SOURCE_DEFINITION_VERSION ? input.deduplication : null;

  return {
    version: MASS_SOURCE_DEFINITION_VERSION,
    id,
    name: String(input.name || options.name || 'Design-basis mass source'),
    entries,
    combos: entries.map((entry) => ({ case: entry.case, factor: entry.factor })),
    components,
    includeNodeMass,
    includeMemberMass,
    includeSelfWeight,
    gravity: positiveFinite(input.gravity, 9.80665),
    origin,
    sourceId,
    generatedKey,
    userModified: input.userModified === true,
    status,
    deduplication: {
      strategy: 'exclusive-physical-source-and-case-id',
      duplicateCount: priorDeduplication?.duplicateCount ?? normalizedEntries.duplicateCount,
      conflictCount: priorDeduplication?.conflictCount ?? normalizedEntries.conflicts.length,
      conflicts: clonePlain(priorDeduplication?.conflicts || normalizedEntries.conflicts),
    },
    warnings: normalizedEntries.warnings,
    errors: normalizedEntries.errors,
  };
}

export const normalizeMassSourceDefinition = createMassSourceDefinition;

export function validateMassSourceDefinition(input = {}) {
  const definition = createMassSourceDefinition(input);
  const errors = deduplicateIssues([...(input.errors || []), ...definition.errors]);
  const warnings = deduplicateIssues([...(input.warnings || []), ...definition.warnings]);
  if (!definition.id) errors.push(issue('mass-source-id-required', 'Mass source id is required.'));
  if (!definition.entries.length) warnings.push(issue('mass-source-empty', 'Mass source has no nonzero case entries.'));
  if (definition.includeNodeMass && definition.includeMemberMass) {
    warnings.push(issue(
      'mass-source-node-member-dedup-review',
      'Node and member mass are both enabled; ownership must prevent duplicate physical mass.',
    ));
  }
  if (definition.includeSelfWeight && definition.entries.some((entry) => (
    entry.case === 'D' || entry.case === 'D-SW' || ['self-weight', 'selfWeight'].includes(entry.variant)
  ))) {
    warnings.push(issue(
      'mass-source-self-weight-dead-load-review',
      'Self-weight and D-family load conversion are both enabled; verify they represent different physical mass.',
    ));
  }
  const normalizedDefinition = {
    ...definition,
    status: errors.length ? 'invalid' : definition.status,
    errors,
    warnings,
  };
  return {
    ok: errors.length === 0,
    status: errors.length ? 'invalid' : warnings.length ? 'review-required' : 'ready',
    definition: normalizedDefinition,
    errors,
    warnings,
  };
}

export function previewMassSourceChangeSet(model = {}, input = {}, options = {}) {
  const validation = validateMassSourceDefinition(input);
  const definition = validation.definition;
  const mode = normalizeMode(options.mode);
  const current = clonePlain(Array.isArray(model.massSources) ? model.massSources : []);
  const matchIndex = current.findIndex((item) => sameGeneratedRecord(item, definition));
  const changes = { create: [], update: [], unchanged: [], preserve: [], remove: [] };
  const conflicts = [];
  let next = current.slice();

  if (matchIndex < 0) {
    changes.create.push(summary(definition));
    next.push(clonePlain(definition));
  } else {
    const existing = current[matchIndex];
    if (sameDefinition(existing, definition)) {
      changes.unchanged.push(summary(existing));
    } else if (existing.userModified === true || existing.origin === 'manual' || (!existing.generatedKey && existing.origin !== 'template' && existing.origin !== 'rule-pack')) {
      const conflict = buildConflict(existing, definition);
      conflicts.push(conflict);
      changes.preserve.push(summary(existing));
    } else {
      changes.update.push({ before: summary(existing), after: summary(definition) });
      next[matchIndex] = clonePlain(definition);
    }
  }

  if (mode === 'replace-generated') {
    const keepKey = definition.generatedKey;
    next = next.filter((item) => {
      const owned = item?.sourceId === definition.sourceId && item?.origin !== 'manual';
      const removable = owned && item.generatedKey !== keepKey && item.userModified !== true;
      if (removable) changes.remove.push(summary(item));
      return !removable;
    });
  }

  next = deduplicateDefinitions(next);
  const appliedDefinition = next.find((item) => sameGeneratedRecord(item, definition)) || definition;
  const activeMassSource = options.activate === false
    ? clonePlain(model.analysisSettings?.massSource || null)
    : clonePlain(appliedDefinition);
  const errors = validation.errors.slice();
  const warnings = validation.warnings.slice();
  if (conflicts.length) warnings.push(issue(
    'mass-source-user-modified-conflict',
    'A user-modified mass source is preserved; review the proposed difference.',
  ));

  return {
    version: MASS_SOURCE_CHANGE_SET_VERSION,
    status: errors.length ? 'blocked' : conflicts.length ? 'review-required' : 'ready',
    mode,
    activate: options.activate !== false,
    sourceId: definition.sourceId,
    definition,
    changes,
    conflicts,
    warnings,
    errors,
    next: {
      massSources: next,
      activeMassSource,
    },
    summary: {
      created: changes.create.length,
      updated: changes.update.length,
      unchanged: changes.unchanged.length,
      preserved: changes.preserve.length,
      removed: changes.remove.length,
      conflictCount: conflicts.length,
      entryCount: definition.entries.length,
    },
  };
}

export function applyMassSourceChangeSet(model, changeSetOrInput = {}, options = {}) {
  if (!model || typeof model !== 'object') throw new Error('applyMassSourceChangeSet requires a model.');
  const supplied = changeSetOrInput?.version === MASS_SOURCE_CHANGE_SET_VERSION
    ? clonePlain(changeSetOrInput)
    : null;
  if (supplied && (supplied.status === 'blocked' || supplied.errors?.length)) {
    const error = new Error('Mass-source change set is blocked.');
    error.code = 'MASS_SOURCE_CHANGE_SET_BLOCKED';
    error.changeSet = supplied;
    throw error;
  }
  const changeSet = supplied
    ? previewMassSourceChangeSet(model, supplied.definition, {
      mode: supplied.mode,
      activate: supplied.activate,
    })
    : previewMassSourceChangeSet(model, changeSetOrInput, options);
  if (changeSet.status === 'blocked' || changeSet.errors?.length) {
    const error = new Error('Mass-source change set is blocked.');
    error.code = 'MASS_SOURCE_CHANGE_SET_BLOCKED';
    error.changeSet = changeSet;
    throw error;
  }

  const previousMassSources = model.massSources;
  const previousSettings = model.analysisSettings;
  const nextSettings = {
    ...(model.analysisSettings || {}),
    massSource: clonePlain(changeSet.next.activeMassSource),
  };
  try {
    model.massSources = clonePlain(changeSet.next.massSources);
    model.analysisSettings = nextSettings;
  } catch (error) {
    try {
      model.massSources = previousMassSources;
      model.analysisSettings = previousSettings;
    } catch {
      // Preserve the original commit error; callers still receive the failed transaction.
    }
    throw error;
  }
  return { ...changeSet, applied: true };
}

export function massSourceGeneratedKey(input = {}) {
  return `mass-source:${stableToken(input.sourceId || 'manual')}:${stableToken(input.id || 'default')}`;
}

function normalizeEntries(items, input) {
  const map = new Map();
  const warnings = [];
  const errors = [];
  const conflicts = [];
  let duplicateCount = 0;
  for (const [index, raw] of (Array.isArray(items) ? items : []).entries()) {
    const caseId = String(raw?.case || raw?.caseId || '').trim();
    const factor = Number(raw?.factor);
    if (!caseId) {
      errors.push(issue('mass-source-case-required', `Mass-source entry ${index + 1} is missing a case id.`, { index }));
      continue;
    }
    if (!Number.isFinite(factor)) {
      errors.push(issue('mass-source-factor-invalid', `Mass-source factor for ${caseId} must be finite.`, { case: caseId }));
      continue;
    }
    if (factor === 0) {
      warnings.push(issue('mass-source-zero-factor-excluded', `Zero factor for ${caseId} was excluded.`, { case: caseId }));
      continue;
    }
    const entry = {
      case: caseId,
      family: normalizeLoadFamily(raw.family || inferLoadCaseFamily({ id: caseId, type: raw.type })),
      factor,
      sourceId: raw.sourceId || input.sourceId || null,
      status: normalizeEvidenceStatus(raw.status || input.status || 'candidate'),
      variant: raw.variant || null,
    };
    if (!map.has(caseId)) {
      map.set(caseId, entry);
      continue;
    }
    duplicateCount += 1;
    const existing = map.get(caseId);
    if (existing.factor !== entry.factor) {
      const conflict = {
        code: 'mass-source-duplicate-factor-conflict',
        case: caseId,
        keptFactor: existing.factor,
        rejectedFactor: entry.factor,
      };
      conflicts.push(conflict);
      errors.push(issue(
        conflict.code,
        `Mass-source case ${caseId} has conflicting factors ${existing.factor} and ${entry.factor}.`,
        conflict,
      ));
    }
  }
  const entries = [...map.values()].sort((a, b) => a.case.localeCompare(b.case));
  return { entries, duplicateCount, conflicts, warnings, errors };
}

function buildComponents(entries, options) {
  const components = [];
  if (options.includeNodeMass) components.push({ kind: 'node-mass', factor: 1 });
  if (options.includeMemberMass) components.push({ kind: 'member-mass', factor: 1 });
  if (options.includeSelfWeight) components.push({ kind: 'self-weight', family: 'D', caseId: 'D-SW', factor: 1 });
  for (const entry of entries) {
    components.push({
      kind: 'load-case',
      caseId: entry.case,
      case: entry.case,
      family: entry.family,
      factor: entry.factor,
      status: entry.status,
    });
  }
  return components;
}

function deduplicateDefinitions(items) {
  const out = [];
  const seenIds = new Set();
  const seenKeys = new Set();
  for (const item of items) {
    if (!item?.id) continue;
    const key = item.generatedKey || null;
    if (key && seenKeys.has(key)) continue;
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    if (key) seenKeys.add(key);
    out.push(clonePlain(item));
  }
  return out;
}

function sameGeneratedRecord(a, b) {
  if (a?.generatedKey && b?.generatedKey && a.generatedKey === b.generatedKey) return true;
  return a?.id === b?.id;
}

function sameDefinition(a, b) {
  return stableJson(comparableDefinition(a)) === stableJson(comparableDefinition(b));
}

function comparableDefinition(value = {}) {
  return {
    id: value.id,
    name: value.name,
    entries: (value.entries || value.combos || []).map((entry) => ({
      case: entry.case || entry.caseId,
      factor: Number(entry.factor),
    })).sort((a, b) => String(a.case).localeCompare(String(b.case))),
    includeNodeMass: value.includeNodeMass !== false,
    includeMemberMass: value.includeMemberMass === true,
    includeSelfWeight: value.includeSelfWeight === true,
    gravity: positiveFinite(value.gravity, 9.80665),
    sourceId: value.sourceId || null,
    generatedKey: value.generatedKey || null,
    status: value.status || null,
  };
}

function buildConflict(existing, proposed) {
  return {
    code: 'mass-source-user-modified-conflict',
    id: existing.id || proposed.id,
    generatedKey: existing.generatedKey || proposed.generatedKey || null,
    existing: comparableDefinition(existing),
    proposed: comparableDefinition(proposed),
  };
}

function summary(value = {}) {
  return {
    id: value.id || null,
    name: value.name || value.id || null,
    generatedKey: value.generatedKey || null,
    userModified: value.userModified === true,
    entryCount: (value.entries || value.combos || []).length,
  };
}

function issue(code, message, detail = null) {
  return { code, message, detail };
}

function deduplicateIssues(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item?.code || ''}:${stableJson(item?.detail || null)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeMode(value) {
  return value === 'replace-generated' ? value : 'merge';
}

function normalizeEvidenceStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['verified', 'candidate', 'preliminary', 'unsupported', 'invalid'].includes(normalized)
    ? normalized
    : 'candidate';
}

function positiveFinite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function stableToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'none';
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
