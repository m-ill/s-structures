import { ALL_BUILTIN_MATERIAL_RECORDS } from './db/builtinMaterials.js';
import { KS_H_SECTIONS } from './db/ksH.js';
import { ADDITIONAL_PRACTICAL_SECTIONS } from './db/practicalSections.js';
import { normalizeMaterialRecord, validateMaterialRecord } from './materialSchema.js';
import { normalizeSectionRecord, validateSectionRecord } from './sectionSchema.js';

export const MATERIAL_REGISTRY_VERSION = 'p3-m10-material-section-registry';
export const REGISTRY_SCOPE_PRIORITY = Object.freeze(['project', 'global', 'builtin']);

export function parseVersionedId(ref) {
  const text = String(ref || '').trim();
  const match = /^(.*)@([1-9]\d*)$/u.exec(text);
  if (!match) return { id: text, version: null };
  return { id: match[1], version: Number(match[2]) };
}

export function resolveMaterialRecord(model, ref, builtins = []) {
  const key = parseVersionedId(ref);
  if (!key.id) return null;
  const all = [
    ...modelScopeRows(model, 'materials'),
    ...asVersioned(builtins, 'builtin'),
    ...asVersioned(ALL_BUILTIN_MATERIAL_RECORDS, 'builtin'),
  ].map((item) => normalizeMaterialRecord(item));
  return selectVersion(all.filter((item) => item.id === key.id), key.version);
}

export function resolveSectionRecord(model, ref, builtins = []) {
  const key = parseVersionedId(ref);
  if (!key.id) return null;
  const all = [
    ...modelScopeRows(model, 'sections'),
    ...asVersioned(builtins, 'builtin'),
    ...asVersioned(KS_H_SECTIONS, 'builtin'),
    ...asVersioned(ADDITIONAL_PRACTICAL_SECTIONS, 'builtin'),
  ].map(normalizeSection);
  return selectVersion(all.filter((item) => item.id === key.id), key.version);
}

export function buildLibraryAudit(model = {}) {
  const refs = new Set((model.members || []).flatMap((member) => [member.matId, member.secId]).filter(Boolean));
  const materialRefs = [...new Set((model.members || []).map((member) => member.matId).filter(Boolean))];
  const sectionRefs = [...new Set((model.members || []).map((member) => member.secId).filter(Boolean))];
  const materials = model.materials || [];
  const sections = model.sections || [];
  const resolvedMaterials = materialRefs.sort().map((ref) => resolvedRef(ref, resolveMaterialRecord(model, ref)));
  const resolvedSections = sectionRefs.sort().map((ref) => resolvedRef(ref, resolveSectionRecord(model, ref)));
  return {
    version: MATERIAL_REGISTRY_VERSION,
    registryPolicy: {
      referenceFormat: 'id@version',
      editRule: 'append-only-new-version',
      scopePriority: [...REGISTRY_SCOPE_PRIORITY],
      deleteRule: 'soft-delete-new-references-blocked-existing-models-retained',
      legacyMigration: 'unversioned-reference-resolves-latest-with-warning',
      unresolvedPolicy: 'resolver-null-catalog-helper-throws',
    },
    referenceCount: refs.size,
    references: [...refs].sort(),
    unversionedReferences: [...refs].filter((ref) => parseVersionedId(ref).version == null).sort(),
    scopeSummary: buildScopeSummary(materials, sections),
    softDeletedItems: [...deletedRows(materials, 'material'), ...deletedRows(sections, 'section')],
    appendOnlyWarnings: [...duplicateVersionWarnings(materials, 'material'), ...duplicateVersionWarnings(sections, 'section')],
    resolvedReferences: {
      materials: resolvedMaterials,
      sections: resolvedSections,
    },
    unresolvedReferences: [
      ...resolvedMaterials.filter((row) => row.referenceStatus === 'unresolved'),
      ...resolvedSections.filter((row) => row.referenceStatus === 'unresolved'),
    ],
    softDeletedReferences: [
      ...resolvedMaterials.filter((row) => row.deleted),
      ...resolvedSections.filter((row) => row.deleted),
    ],
    migrationWarnings: [...refs]
      .filter((ref) => parseVersionedId(ref).version == null)
      .map((ref) => `legacy-unversioned-reference:${ref}`),
    materialErrors: materials.flatMap((item) => validateMaterialRecord(item).errors.map((error) => `${item.id || '?'}:${error}`)),
    materialWarnings: materials.flatMap((item) => validateMaterialRecord(item).warnings.map((warning) => `${item.id || '?'}:${warning}`)),
    sectionErrors: sections.flatMap((item) => validateSectionRecord(item).errors.map((error) => `${item.id || '?'}:${error}`)),
    sectionWarnings: sections.flatMap((item) => validateSectionRecord(item).warnings.map((warning) => `${item.id || '?'}:${warning}`)),
  };
}

function modelScopeRows(model, key) {
  const capitalized = `${key[0].toUpperCase()}${key.slice(1)}`;
  return [
    ...asVersioned(model?.[key], 'project'),
    ...asVersioned(model?.[`global${capitalized}`], 'global'),
    ...asVersioned(model?.[`office${capitalized}`], 'global'),
  ];
}

function asVersioned(items = [], fallbackScope = 'project') {
  return (items || []).filter(Boolean).map((item, index) => {
    const source = item.source || {};
    const scope = source.scope || (source.db ? 'builtin' : fallbackScope);
    return {
      version: 1,
      ...item,
      source: { ...source, scope },
      _registryScope: scope,
      _priority: index,
    };
  });
}

function selectVersion(items, version) {
  for (const scope of REGISTRY_SCOPE_PRIORITY) {
    const scoped = items.filter((item) => scopeOf(item) === scope);
    if (version != null) {
      const exact = scoped
        .filter((item) => Number(item.version) === version)
        .sort(prioritySort);
      if (!exact.length) continue;
      const active = exact.find((item) => !item.deleted);
      if (active) return publicRecord(active);
      return publicRecord({ ...exact[0], _softDeletedReference: true });
    }
    const active = scoped
      .filter((item) => !item.deleted)
      .sort((a, b) => Number(b.version || 1) - Number(a.version || 1) || prioritySort(a, b));
    if (active.length) return publicRecord(active[0]);
  }
  return null;
}

function prioritySort(a, b) {
  return Number(a._priority || 0) - Number(b._priority || 0);
}

function publicRecord(item) {
  if (!item) return null;
  const { _registryScope, _priority, ...record } = item;
  return record;
}

function normalizeSection(section) {
  if (!section) return section;
  const normalized = normalizeSectionRecord(section);
  return { ...normalized, ...(normalized.properties || {}) };
}

function resolvedRef(ref, record) {
  return {
    ref,
    resolved: record ? `${record.id}@${record.version || 1}` : null,
    id: record?.id || null,
    version: record?.version || null,
    source: record?.source || null,
    deleted: Boolean(record?.deleted),
    referenceStatus: record?._softDeletedReference ? 'soft-deleted-traceable-reference' : record ? 'active' : 'unresolved',
  };
}

function buildScopeSummary(materials, sections) {
  const rows = [...materials.map((item) => ({ ...item, kind: 'material' })), ...sections.map((item) => ({ ...item, kind: 'section' }))];
  return rows.reduce((out, item) => {
    const scope = scopeOf(item);
    out[scope] = (out[scope] || 0) + 1;
    return out;
  }, { project: 0, global: 0, builtin: 0 });
}

function scopeOf(item) {
  const scope = item?._registryScope || item?.source?.scope || (item?.source?.db ? 'builtin' : 'project');
  return REGISTRY_SCOPE_PRIORITY.includes(scope) ? scope : 'project';
}

function deletedRows(rows, kind) {
  return (rows || [])
    .filter((item) => item.deleted)
    .map((item) => ({ kind, id: item.id, version: Number(item.version || 1), label: `${item.id}@${item.version || 1}` }));
}

function duplicateVersionWarnings(rows, kind) {
  const seen = new Map();
  const warnings = [];
  for (const item of rows || []) {
    const key = `${item.id}@${item.version || 1}`;
    const prior = seen.get(key);
    if (prior && JSON.stringify(prior) !== JSON.stringify(item)) warnings.push(`${kind}:duplicate-version:${key}`);
    if (!prior) seen.set(key, item);
  }
  return warnings;
}
