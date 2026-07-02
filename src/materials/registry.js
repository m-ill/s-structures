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
  return {
    version: MATERIAL_REGISTRY_VERSION,
    referenceCount: refs.size,
    references: [...refs].sort(),
    unversionedReferences: [...refs].filter((ref) => parseVersionedId(ref).version == null).sort(),
    resolvedReferences: {
      materials: materialRefs.sort().map((ref) => resolvedRef(ref, resolveMaterialRecord(model, ref))),
      sections: sectionRefs.sort().map((ref) => resolvedRef(ref, resolveSectionRecord(model, ref))),
    },
    migrationWarnings: [...refs]
      .filter((ref) => parseVersionedId(ref).version == null)
      .map((ref) => `legacy-unversioned-reference:${ref}`),
    materialErrors: (model.materials || []).flatMap((item) => validateMaterialRecord(item).errors.map((error) => `${item.id || '?'}:${error}`)),
    sectionErrors: (model.sections || []).flatMap((item) => validateSectionRecord(item).errors.map((error) => `${item.id || '?'}:${error}`)),
    sectionWarnings: (model.sections || []).flatMap((item) => validateSectionRecord(item).warnings.map((warning) => `${item.id || '?'}:${warning}`)),
  };
}

function asVersioned(items = []) {
  return (items || []).filter(Boolean).map((item, index) => ({ version: 1, ...item, _priority: index }));
}

function selectVersion(items, version) {
  const rows = items.filter((item) => !item.deleted);
  if (!rows.length) return null;
  if (version != null) return rows.find((item) => Number(item.version) === version) || null;
  return rows.sort((a, b) => Number(b.version || 1) - Number(a.version || 1) || Number(a._priority || 0) - Number(b._priority || 0))[0];
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
  };
}
