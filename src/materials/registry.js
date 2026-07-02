import { computeSectionProperties } from './sectionProperties.js';

export const MATERIAL_REGISTRY_VERSION = 'p3-m10-material-section-registry';

export function parseVersionedId(ref) {
  const [id, versionText] = String(ref || '').split('@');
  return { id, version: versionText ? Number(versionText) : null };
}

export function resolveMaterialRecord(model, ref, builtins = []) {
  const key = parseVersionedId(ref);
  const all = [...asVersioned(model?.materials), ...asVersioned(builtins)];
  return selectVersion(all.filter((item) => item.id === key.id), key.version) || selectVersion(all.filter((item) => item.id === 'steel'), null);
}

export function resolveSectionRecord(model, ref, builtins = []) {
  const key = parseVersionedId(ref);
  const all = [...asVersioned(model?.sections), ...asVersioned(builtins)].map(normalizeSection);
  return selectVersion(all.filter((item) => item.id === key.id), key.version) || selectVersion(all.filter((item) => item.id === 'h300'), null);
}

export function buildLibraryAudit(model = {}) {
  const refs = new Set((model.members || []).flatMap((member) => [member.matId, member.secId]).filter(Boolean));
  return { version: MATERIAL_REGISTRY_VERSION, referenceCount: refs.size, references: [...refs].sort() };
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
  if (!section || section.A) return section;
  const properties = section.properties || computeSectionProperties(section.shape || section.type, section.params || section.dims);
  return { ...section, ...(properties || {}) };
}
