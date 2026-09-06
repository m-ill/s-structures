import { ALL_BUILTIN_MATERIAL_RECORDS } from '../materials/db/builtinMaterials.js';
import { KS_H_SECTIONS } from '../materials/db/ksH.js';
import { ADDITIONAL_PRACTICAL_SECTIONS } from '../materials/db/practicalSections.js';
import { normalizeMaterialRecord, validateMaterialRecord } from '../materials/materialSchema.js';
import {
  buildLibraryAudit,
  parseVersionedId,
  resolveMaterialRecord,
  resolveSectionRecord,
} from '../materials/registry.js';
import { normalizeSectionRecord, validateSectionRecord } from '../materials/sectionSchema.js';
import { applyModelChangeSet } from '../modeling/transaction.js';

export const PHASE7_LIBRARY_WORKFLOW_VERSION = 'p7-m2-library-workflow-v1';
export const PHASE7_LIBRARY_BUNDLE_VERSION = 'p7-m2-library-bundle-v1';

const SCOPE_ORDER = Object.freeze({ project: 0, global: 1, builtin: 2 });

export function listPhase7Library(model = {}, options = {}) {
  const requestedKind = normalizeLibraryKind(options.kind, true);
  const usage = buildUsageIndex(model);
  const query = String(options.query || '').trim().toLowerCase();
  const scopes = stringSet(options.scopes || options.scope);
  const rows = [];
  if (requestedKind !== 'section') rows.push(...libraryRows(model, 'material', usage));
  if (requestedKind !== 'material') rows.push(...libraryRows(model, 'section', usage));

  const filtered = rows.filter((row) => {
    if (!options.includeDeleted && row.deleted) return false;
    if (scopes.size && !scopes.has(row.scope)) return false;
    if (options.usedOnly && row.usageCount === 0) return false;
    if (!query) return true;
    return row.searchText.includes(query);
  }).sort(compareLibraryRows);

  return {
    version: PHASE7_LIBRARY_WORKFLOW_VERSION,
    kind: requestedKind,
    query: String(options.query || ''),
    count: filtered.length,
    items: filtered.map(({ searchText, ...row }) => row),
    usage: usage.summary,
    audit: buildLibraryAudit(model),
  };
}

export function previewPhase7LibraryDefinition(kind, input = {}, options = {}) {
  const normalizedKind = normalizeLibraryKind(kind);
  if (!normalizedKind) return invalidPreview(kind, ['library-kind-invalid']);
  const source = { scope: options.scope || input.source?.scope || 'project', ...(input.source || {}) };
  const base = {
    ...clone(input),
    id: String(input.id || options.id || '').trim(),
    version: positiveInteger(input.version ?? options.version, 1),
    source,
  };
  if (normalizedKind === 'material' && !base.kind) base.kind = 'custom';
  const checked = normalizedKind === 'material'
    ? validateMaterialRecord(base)
    : validateSectionRecord(base);
  const record = checked.normalized || base;
  return {
    version: PHASE7_LIBRARY_WORKFLOW_VERSION,
    ok: checked.ok,
    kind: normalizedKind,
    record: clone(record),
    properties: normalizedKind === 'section' ? clone(record.properties || null) : clone({
      elastic: record.elastic || null,
      strength: record.strength || null,
      nonlinear: record.nonlinear || null,
    }),
    provenance: clone(record.propertyProvenance || record.properties?.provenance || record.source || null),
    errors: [...checked.errors],
    warnings: [...checked.warnings],
  };
}

export function createPhase7LibraryDefinition(model = {}, kind, input = {}, options = {}) {
  const normalizedKind = normalizeLibraryKind(kind);
  if (!normalizedKind) return unchanged(model, ['library-kind-invalid']);
  const collection = collectionFor(normalizedKind);
  const id = String(input.id || options.id || '').trim();
  const version = options.nextVersion
    ? nextVersion(model[collection], id)
    : positiveInteger(input.version ?? options.version, 1);
  const preview = previewPhase7LibraryDefinition(normalizedKind, {
    ...clone(input),
    id,
    version,
    source: { ...(input.source || {}), scope: 'project' },
  });
  if (!preview.ok) return { ...unchanged(model, preview.errors), preview, warnings: preview.warnings };
  if (findVersion(model[collection], id, version)) {
    return { ...unchanged(model, [`immutable-version-conflict:${id}@${version}`]), preview };
  }
  return applyModelChangeSet(model, {
    id: `library-create:${normalizedKind}:${id}@${version}`,
    name: `Create ${normalizedKind} ${id}@${version}`,
    changes: [{ op: 'add', collection, id, value: preview.record }],
  });
}

export function clonePhase7LibraryDefinition(model = {}, kind, ref, input = {}, options = {}) {
  const normalizedKind = normalizeLibraryKind(kind);
  const resolved = resolvePhase7LibraryReference(model, normalizedKind, ref, { allowDeleted: false });
  if (!resolved.ok) return unchanged(model, resolved.errors);
  const id = String(input.id || input.newId || options.id || options.newId || '').trim();
  if (!id) return unchanged(model, ['clone-id-required']);
  const sourceRecord = cleanRecord(resolved.record);
  const sourceRef = canonicalRef(sourceRecord);
  const source = {
    ...(sourceRecord.source || {}),
    ...(input.source || {}),
    scope: 'project',
    clonedFrom: sourceRef,
  };
  delete source.db;
  const candidate = {
    ...sourceRecord,
    ...clone(input),
    id,
    version: positiveInteger(input.version ?? options.version, 1),
    deleted: false,
    source,
  };
  delete candidate.newId;
  return createPhase7LibraryDefinition(model, normalizedKind, candidate, options);
}

export function buildPhase7LibraryUsage(model = {}) {
  const index = buildUsageIndex(model);
  return {
    version: PHASE7_LIBRARY_WORKFLOW_VERSION,
    summary: index.summary,
    materials: Object.fromEntries(index.materials),
    sections: Object.fromEntries(index.sections),
    unresolved: clone(index.unresolved),
  };
}

export function resolvePhase7LibraryReference(model = {}, kind, ref, options = {}) {
  const normalizedKind = normalizeLibraryKind(kind);
  const text = String(ref || '').trim();
  if (!normalizedKind) return { ok: false, kind: null, record: null, errors: ['library-kind-invalid'], warnings: [] };
  if (!text) return { ok: false, kind: normalizedKind, record: null, errors: [`${normalizedKind}-reference-required`], warnings: [] };
  const record = normalizedKind === 'material'
    ? resolveMaterialRecord(model, text)
    : resolveSectionRecord(model, text);
  if (!record) {
    return { ok: false, kind: normalizedKind, record: null, errors: [`invalid-${normalizedKind}-reference:${text}`], warnings: [] };
  }
  if ((record.deleted || record._softDeletedReference) && !options.allowDeleted) {
    return { ok: false, kind: normalizedKind, record: null, errors: [`deleted-${normalizedKind}-reference:${text}`], warnings: [] };
  }
  const checked = normalizedKind === 'material'
    ? validateMaterialRecord(record)
    : validateSectionRecord(record);
  const warnings = [...checked.warnings];
  if (parseVersionedId(text).version == null) warnings.push(`unversioned-${normalizedKind}-reference:${text}`);
  return {
    ok: checked.ok,
    kind: normalizedKind,
    record: clone(record),
    canonicalRef: canonicalRef(record),
    errors: checked.errors.map((error) => `${text}:${error}`),
    warnings: unique(warnings),
  };
}

export function validatePhase7LibraryReferences(model = {}, options = {}) {
  const memberIds = stringSet(options.memberIds);
  const members = (model.members || []).filter((member) => !memberIds.size || memberIds.has(String(member.id)));
  const errors = [];
  const warnings = [];
  const resolved = [];
  for (const member of members) {
    const material = resolvePhase7LibraryReference(model, 'material', member.matId);
    const section = resolvePhase7LibraryReference(model, 'section', member.secId);
    for (const error of material.errors) errors.push({ code: 'INVALID_MATERIAL_REFERENCE', memberId: member.id, reference: member.matId || null, message: error });
    for (const error of section.errors) errors.push({ code: 'INVALID_SECTION_REFERENCE', memberId: member.id, reference: member.secId || null, message: error });
    for (const warning of material.warnings) warnings.push({ code: 'MATERIAL_REFERENCE_WARNING', memberId: member.id, reference: member.matId, message: warning });
    for (const warning of section.warnings) warnings.push({ code: 'SECTION_REFERENCE_WARNING', memberId: member.id, reference: member.secId, message: warning });
    resolved.push({
      memberId: member.id,
      materialRef: material.canonicalRef || null,
      sectionRef: section.canonicalRef || null,
      ok: material.ok && section.ok,
    });
  }
  const missingMembers = [...memberIds].filter((id) => !members.some((member) => String(member.id) === id));
  for (const id of missingMembers) errors.push({ code: 'MEMBER_NOT_FOUND', memberId: id, message: `member-not-found:${id}` });
  return {
    version: PHASE7_LIBRARY_WORKFLOW_VERSION,
    ok: errors.length === 0,
    memberCount: members.length,
    errors,
    warnings,
    resolved,
  };
}

export function assignPhase7LibraryToMembers(model = {}, options = {}) {
  const memberIds = [...stringSet(options.memberIds || options.ids)];
  if (!memberIds.length) return unchanged(model, ['member-selection-required']);
  const material = options.materialRef ?? options.matId;
  const section = options.sectionRef ?? options.secId;
  if (material == null && section == null) return unchanged(model, ['material-or-section-reference-required']);

  const references = {};
  const errors = [];
  const warnings = [];
  if (material != null) {
    references.material = resolvePhase7LibraryReference(model, 'material', material);
    errors.push(...references.material.errors);
    warnings.push(...references.material.warnings);
  }
  if (section != null) {
    references.section = resolvePhase7LibraryReference(model, 'section', section);
    errors.push(...references.section.errors);
    warnings.push(...references.section.warnings);
  }
  if (errors.length) return { ...unchanged(model, errors), warnings: unique(warnings), references };

  const memberMap = new Map((model.members || []).map((memberRow) => [String(memberRow.id), memberRow]));
  const missing = memberIds.filter((id) => !memberMap.has(id));
  if (missing.length) return unchanged(model, missing.map((id) => `member-not-found:${id}`));
  const changes = memberIds.map((id) => ({
    op: 'update',
    collection: 'members',
    id,
    patch: {
      ...(references.material ? { matId: references.material.canonicalRef } : {}),
      ...(references.section ? { secId: references.section.canonicalRef } : {}),
    },
  }));
  const result = applyModelChangeSet(model, {
    id: options.transactionId || 'library-bulk-assignment',
    name: options.name || 'Assign material and section',
    changes,
  });
  return { ...result, warnings: unique(warnings), references, assignedMemberIds: memberIds };
}

export function exportPhase7Library(model = {}, options = {}) {
  const includeGlobal = options.includeGlobal === true;
  const materials = exportRows(model, 'materials', includeGlobal);
  const sections = exportRows(model, 'sections', includeGlobal);
  const audit = buildLibraryAudit(model);
  const bundle = {
    version: PHASE7_LIBRARY_BUNDLE_VERSION,
    generatedAt: options.generatedAt || new Date().toISOString(),
    materials,
    sections,
    migrationWarnings: [...audit.migrationWarnings],
  };
  return {
    version: PHASE7_LIBRARY_WORKFLOW_VERSION,
    bundle,
    json: JSON.stringify(bundle, null, 2),
    csv: bundleToCsv(bundle),
    summary: { materialCount: materials.length, sectionCount: sections.length },
    migrationWarnings: [...bundle.migrationWarnings],
  };
}

export function previewPhase7LibraryImport(model = {}, input, options = {}) {
  let parsed;
  try {
    parsed = parseLibraryImport(input, options);
  } catch (error) {
    return importPreview(model, [], [], [], [`import-parse-failed:${error?.message || String(error)}`]);
  }
  const warnings = [...parsed.warnings];
  const errors = [];
  const records = [];
  const changes = [];
  for (const kind of ['material', 'section']) {
    const collection = collectionFor(kind);
    for (const raw of parsed[collection]) {
      const candidate = clone(raw);
      candidate.id = String(candidate.id || '').trim();
      if (candidate.version == null) {
        candidate.version = 1;
        warnings.push(`missing-version-migrated:${kind}:${candidate.id || '?'}`);
      }
      candidate.version = positiveInteger(candidate.version, 1);
      if (candidate.source?.scope && candidate.source.scope !== 'project') {
        warnings.push(`scope-migrated-to-project:${kind}:${candidate.id || '?'}`);
      }
      candidate.source = { ...(candidate.source || {}), scope: 'project' };
      const preview = previewPhase7LibraryDefinition(kind, candidate);
      records.push({ kind, preview });
      if (!preview.ok) {
        errors.push(...preview.errors.map((error) => `${kind}:${candidate.id || '?'}:${error}`));
        continue;
      }
      const existing = findVersion(model[collection], preview.record.id, preview.record.version);
      if (existing) {
        if (sameRecord(existing, preview.record, kind)) warnings.push(`duplicate-identical-skipped:${kind}:${canonicalRef(preview.record)}`);
        else errors.push(`immutable-version-conflict:${kind}:${canonicalRef(preview.record)}`);
        continue;
      }
      changes.push({ op: 'add', collection, id: preview.record.id, value: preview.record });
    }
  }
  return importPreview(model, records, changes, unique(warnings), unique(errors), parsed.version);
}

export function applyPhase7LibraryImport(model = {}, inputOrPreview, options = {}) {
  const preview = inputOrPreview?.changeSet && inputOrPreview?.version === PHASE7_LIBRARY_WORKFLOW_VERSION
    ? inputOrPreview
    : previewPhase7LibraryImport(model, inputOrPreview, options);
  if (!preview.ok) return { ...unchanged(model, preview.errors), preview, warnings: preview.warnings };
  const result = applyModelChangeSet(model, preview.changeSet);
  return { ...result, preview, warnings: preview.warnings, imported: preview.summary };
}

function libraryRows(model, kind, usage) {
  const collection = collectionFor(kind);
  const capitalized = collection[0].toUpperCase() + collection.slice(1);
  const rows = [
    ...(model[collection] || []).map((record) => ({ record, fallbackScope: 'project' })),
    ...(model[`global${capitalized}`] || []).map((record) => ({ record, fallbackScope: 'global' })),
    ...(model[`office${capitalized}`] || []).map((record) => ({ record, fallbackScope: 'global' })),
    ...(kind === 'material' ? ALL_BUILTIN_MATERIAL_RECORDS : [...KS_H_SECTIONS, ...ADDITIONAL_PRACTICAL_SECTIONS])
      .map((record) => ({ record, fallbackScope: 'builtin' })),
  ];
  return rows.map(({ record, fallbackScope }) => {
    const normalized = kind === 'material' ? normalizeMaterialRecord(record) : normalizeSectionRecord(record);
    const checked = kind === 'material' ? validateMaterialRecord(normalized) : validateSectionRecord(normalized);
    const scope = normalizeScope(normalized.source?.scope || (normalized.source?.db ? 'builtin' : fallbackScope));
    const ref = canonicalRef(normalized);
    const usageCount = (kind === 'material' ? usage.materials : usage.sections).get(ref) || 0;
    const displayName = normalized.name || normalized.designation || ref;
    return {
      kind,
      id: normalized.id,
      version: Number(normalized.version || 1),
      ref,
      name: displayName,
      scope,
      source: clone(normalized.source || null),
      status: normalized.status || (normalized.legacy ? 'legacy' : 'active'),
      legacy: Boolean(normalized.legacy),
      deleted: Boolean(normalized.deleted),
      usageCount,
      valid: checked.ok,
      errors: [...checked.errors],
      warnings: [...checked.warnings],
      propertyPreview: kind === 'material'
        ? clone({ elastic: normalized.elastic || null, strength: normalized.strength || null })
        : clone(normalized.properties || null),
      record: clone(normalized),
      searchText: `${ref} ${displayName} ${scope} ${normalized.kind || ''} ${normalized.shape || ''} ${normalized.designation || ''}`.toLowerCase(),
    };
  });
}

function buildUsageIndex(model) {
  const materials = new Map();
  const sections = new Map();
  const unresolved = [];
  for (const member of model.members || []) {
    const material = resolveMaterialRecord(model, member.matId);
    const section = resolveSectionRecord(model, member.secId);
    if (material) increment(materials, canonicalRef(material));
    else unresolved.push({ memberId: member.id, kind: 'material', reference: member.matId || null });
    if (section) increment(sections, canonicalRef(section));
    else unresolved.push({ memberId: member.id, kind: 'section', reference: member.secId || null });
  }
  return {
    materials,
    sections,
    unresolved,
    summary: {
      memberCount: (model.members || []).length,
      usedMaterialCount: materials.size,
      usedSectionCount: sections.size,
      unresolvedReferenceCount: unresolved.length,
    },
  };
}

function parseLibraryImport(input, options) {
  if (typeof input !== 'string') return normalizeImportedBundle(input || {}, []);
  const text = input.trim();
  if (!text) throw new Error('empty-import');
  if (text.startsWith('{') || text.startsWith('[')) return normalizeImportedBundle(JSON.parse(text), []);
  return csvToBundle(text, options);
}

function normalizeImportedBundle(value, warnings) {
  if (Array.isArray(value)) {
    warnings.push('legacy-array-bundle-migrated');
    return {
      version: null,
      materials: value.filter((item) => importedKind(item) === 'material'),
      sections: value.filter((item) => importedKind(item) === 'section'),
      warnings,
    };
  }
  const bundle = value.bundle || value;
  if (!bundle.version) warnings.push('missing-bundle-version');
  else if (bundle.version !== PHASE7_LIBRARY_BUNDLE_VERSION) warnings.push(`bundle-version-migration:${bundle.version}`);
  return {
    version: bundle.version || null,
    materials: Array.isArray(bundle.materials) ? bundle.materials : [],
    sections: Array.isArray(bundle.sections) ? bundle.sections : [],
    warnings: unique([...warnings, ...(bundle.migrationWarnings || [])]),
  };
}

function csvToBundle(text, options) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('csv-has-no-records');
  const headers = rows[0].map((item) => item.trim());
  const materials = [];
  const sections = [];
  for (const values of rows.slice(1)) {
    if (values.every((item) => !String(item).trim())) continue;
    const row = Object.fromEntries(headers.map((key, index) => [key, values[index] ?? '']));
    const kind = normalizeLibraryKind(row.libraryKind || row.collection || row.recordType || options.kind);
    if (!kind) throw new Error('csv-libraryKind-required');
    let record;
    if (row.record || row.data) record = JSON.parse(row.record || row.data);
    else {
      record = {};
      for (const [key, value] of Object.entries(row)) {
        if (['libraryKind', 'collection', 'recordType'].includes(key) || value === '') continue;
        setPath(record, key, parseCsvValue(value));
      }
    }
    (kind === 'material' ? materials : sections).push(record);
  }
  return { version: null, materials, sections, warnings: ['csv-import-migrated-to-library-bundle'] };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function bundleToCsv(bundle) {
  const header = ['libraryKind', 'id', 'version', 'record'];
  const rows = [header];
  for (const [kind, records] of [['material', bundle.materials], ['section', bundle.sections]]) {
    for (const record of records) rows.push([kind, record.id, record.version || 1, JSON.stringify(record)]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function importPreview(model, records, changes, warnings, errors, sourceVersion = null) {
  return {
    version: PHASE7_LIBRARY_WORKFLOW_VERSION,
    sourceVersion,
    ok: errors.length === 0,
    records,
    warnings,
    errors,
    summary: {
      candidateCount: records.length,
      importCount: changes.length,
      skippedCount: Math.max(0, records.length - changes.length),
      materialCount: changes.filter((change) => change.collection === 'materials').length,
      sectionCount: changes.filter((change) => change.collection === 'sections').length,
    },
    changeSet: {
      id: 'library-import',
      name: 'Import material and section library',
      changes,
    },
    model,
  };
}

function exportRows(model, collection, includeGlobal) {
  const rows = [...(model[collection] || [])];
  if (includeGlobal) {
    const key = collection[0].toUpperCase() + collection.slice(1);
    rows.push(...(model[`global${key}`] || []), ...(model[`office${key}`] || []));
  }
  return rows.map(cleanRecord);
}

function importedKind(item = {}) {
  const explicit = normalizeLibraryKind(item.libraryKind || item.collection || item.recordType);
  if (explicit) return explicit;
  return item.shape || item.properties || item.params || item.A != null ? 'section' : 'material';
}

function normalizeLibraryKind(kind, allowAll = false) {
  const value = String(kind || (allowAll ? 'all' : '')).trim().toLowerCase();
  if (['material', 'materials', 'mat'].includes(value)) return 'material';
  if (['section', 'sections', 'sec'].includes(value)) return 'section';
  if (allowAll && (!value || value === 'all')) return 'all';
  return null;
}

function collectionFor(kind) {
  return kind === 'material' ? 'materials' : 'sections';
}

function normalizeScope(scope) {
  return ['project', 'global', 'builtin'].includes(scope) ? scope : 'project';
}

function compareLibraryRows(a, b) {
  return a.kind.localeCompare(b.kind)
    || (SCOPE_ORDER[a.scope] ?? 9) - (SCOPE_ORDER[b.scope] ?? 9)
    || String(a.id).localeCompare(String(b.id))
    || b.version - a.version;
}

function cleanRecord(value) {
  const record = clone(value);
  delete record._registryScope;
  delete record._priority;
  delete record._softDeletedReference;
  return record;
}

function canonicalRef(record) {
  return `${record?.id || ''}@${positiveInteger(record?.version, 1)}`;
}

function findVersion(rows = [], id, version) {
  return (rows || []).find((row) => row.id === id && Number(row.version || 1) === Number(version));
}

function nextVersion(rows = [], id) {
  return Math.max(0, ...(rows || []).filter((row) => row.id === id).map((row) => positiveInteger(row.version, 1))) + 1;
}

function invalidPreview(kind, errors) {
  return { version: PHASE7_LIBRARY_WORKFLOW_VERSION, ok: false, kind: normalizeLibraryKind(kind), record: null, properties: null, provenance: null, errors, warnings: [] };
}

function unchanged(model, errors) {
  return { ok: false, changed: false, model, errors: (errors || []).map(normalizeError) };
}

function normalizeError(error) {
  return typeof error === 'string' ? error : error?.message || JSON.stringify(error);
}

function sameRecord(a, b, kind) {
  const normalize = kind === 'material' ? normalizeMaterialRecord : normalizeSectionRecord;
  const left = normalize({ ...cleanRecord(a), source: { ...(a.source || {}), scope: 'project' } });
  const right = normalize({ ...cleanRecord(b), source: { ...(b.source || {}), scope: 'project' } });
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function stringSet(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return new Set(values.map((item) => String(item)).filter(Boolean));
}

function unique(values) {
  return [...new Set(values)];
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsvValue(value) {
  const text = String(value).trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null') return null;
  const number = Number(text);
  return text !== '' && Number.isFinite(number) ? number : text;
}

function setPath(target, path, value) {
  const parts = String(path).split('.').filter(Boolean);
  let cursor = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) cursor[part] = value;
    else cursor = cursor[part] ||= {};
  });
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
