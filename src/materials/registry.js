import { computeSectionProperties } from './sectionProperties.js';
import { normalizeMaterialRecord, validateMaterialRecord } from './materialSchema.js';
import { normalizeSectionRecord, validateSectionRecord } from './sectionSchema.js';
import { KS_H_SECTIONS } from './db/ksH.js';

export const MATERIAL_REGISTRY_VERSION = 'p3-m10-material-section-registry';

export function parseVersionedId(ref) {
  const [id, versionText] = String(ref || '').split('@');
  return { id, version: versionText ? Number(versionText) : null };
}

export function resolveMaterialRecord(model, ref, builtins = []) {
  const key = parseVersionedId(ref);
  const all = [...asVersioned(model?.materials), ...asVersioned(builtins)].map((item) => normalizeMaterialRecord(item));
  return selectVersion(all.filter((item) => item.id === key.id), key.version) || selectVersion(all.filter((item) => item.id === 'steel'), null);
}

export function resolveSectionRecord(model, ref, builtins = []) {
  const key = parseVersionedId(ref);
  const all = [...asVersioned(model?.sections), ...asVersioned(builtins), ...asVersioned(KS_H_SECTIONS)].map(normalizeSection);
  return selectVersion(all.filter((item) => item.id === key.id), key.version) || selectVersion(all.filter((item) => item.id === 'h300'), null);
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
      scopePriority: ['project', 'global', 'builtin'],
      deleteRule: 'soft-delete-new-references-blocked-existing-models-retained',
      legacyMigration: 'unversioned-reference-resolves-latest-with-warning',
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

function asVersioned(items = []) {
  return (items || []).filter(Boolean).map((item, index) => ({ version: 1, ...item, _priority: index }));
}

function selectVersion(items, version) {
  if (version != null) {
    const exact = items
      .filter((item) => Number(item.version) === version)
      .sort(scopePrioritySort);
    const active = exact.find((item) => !item.deleted);
    if (active) return active;
    const deleted = exact[0];
    return deleted ? { ...deleted, _softDeletedReference: true } : null;
  }
  const rows = items.filter((item) => !item.deleted);
  if (!rows.length) return null;
  return rows.sort((a, b) => Number(b.version || 1) - Number(a.version || 1) || scopePrioritySort(a, b))[0];
}

function scopePrioritySort(a, b) {
  const order = { project: 0, global: 1, builtin: 2 };
  return (order[scopeOf(a)] ?? 0) - (order[scopeOf(b)] ?? 0) || Number(a._priority || 0) - Number(b._priority || 0);
}

function normalizeSection(section) {
  if (!section) return section;
  const normalized = normalizeSectionRecord(section);
  const properties = normalized.properties || computeSectionProperties(normalized.shape, normalized.params);
  return { ...normalized, ...(properties || {}) };
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
  if (item.source?.scope) return item.source.scope;
  if (item.source?.db) return 'builtin';
  return 'project';
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
