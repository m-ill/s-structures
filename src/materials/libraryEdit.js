import { buildLibraryAudit } from './registry.js';
import { normalizeMaterialRecord, validateMaterialRecord } from './materialSchema.js';
import { normalizeSectionRecord, validateSectionRecord } from './sectionSchema.js';

export const MATERIAL_LIBRARY_EDIT_VERSION = 'p3-m10-library-edit-v1';
export const MATERIAL_LIBRARY_ACTIONS = ['listLibrary', 'getLibraryItem', 'upsertMaterial', 'upsertSection'];

export function listLibrary(model = {}, options = {}) {
  const kind = normalizeKind(options.kind || 'all');
  const query = String(options.query || '').toLowerCase();
  const rows = [
    ...(kind !== 'sections' ? items(model.materials, 'material') : []),
    ...(kind !== 'materials' ? items(model.sections, 'section') : []),
  ].filter((row) => !query || row.id.toLowerCase().includes(query) || row.label.toLowerCase().includes(query));
  return { version: MATERIAL_LIBRARY_EDIT_VERSION, kind, count: rows.length, items: rows, audit: buildLibraryAudit(model) };
}

export function getLibraryItem(model = {}, options = {}) {
  const kind = normalizeKind(options.kind || options.type);
  const rows = collection(model, kind);
  const item = rows.find((row) => row.id === options.id && (options.version == null || Number(row.version || 1) === Number(options.version)));
  return { version: MATERIAL_LIBRARY_EDIT_VERSION, kind, item: item ? clone(item) : null };
}

export function upsertMaterial(model = {}, record = {}, options = {}) {
  const checked = validateMaterialRecord(record);
  if (!checked.ok) return fail('material', checked.errors);
  return upsert(model, 'materials', normalizeMaterialRecord(checked.normalized), options);
}

export function upsertSection(model = {}, record = {}, options = {}) {
  const checked = validateSectionRecord(record);
  if (!checked.ok) return fail('section', checked.errors);
  return upsert(model, 'sections', normalizeSectionRecord(checked.normalized), options);
}

function upsert(model, key, record, options) {
  model[key] ||= [];
  const item = { ...record, source: { scope: options.scope || 'project', ...(record.source || {}) } };
  item.version = Number(item.version || nextVersion(model[key], item.id));
  const existing = model[key].find((row) => row.id === item.id && Number(row.version || 1) === item.version);
  if (existing && JSON.stringify(existing) !== JSON.stringify(item) && options.replace !== true) {
    return fail(key.slice(0, -1), ['immutable-version']);
  }
  if (existing) Object.assign(existing, item);
  else model[key].push(item);
  return { version: MATERIAL_LIBRARY_EDIT_VERSION, changed: true, kind: key, item: clone(item), audit: buildLibraryAudit(model) };
}

function items(rows = [], kind) {
  return rows.map((row) => ({ kind, id: row.id, version: Number(row.version || 1), label: `${row.id}@${row.version || 1}`, source: row.source || null }));
}
function collection(model, kind) { return kind === 'sections' ? model.sections || [] : model.materials || []; }
function normalizeKind(kind) { return ['section', 'sections'].includes(kind) ? 'sections' : ['material', 'materials'].includes(kind) ? 'materials' : 'all'; }
function nextVersion(rows, id) { return Math.max(0, ...rows.filter((row) => row.id === id).map((row) => Number(row.version || 1))) + 1; }
function fail(kind, errors) { return { version: MATERIAL_LIBRARY_EDIT_VERSION, changed: false, kind, ok: false, errors }; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
