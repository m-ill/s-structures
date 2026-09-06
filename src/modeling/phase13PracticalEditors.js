import { stableHash } from '../core/stableHash.js';
import { applyModelChangeSet } from './transaction.js';

export const PHASE13_PRACTICAL_EDITORS_VERSION = 'p13-m5-practical-editors-v2';

const EDITABLE_FIELDS = Object.freeze({
  members: new Set(['matId', 'secId', 'role', 'localAxis', 'releases', 'offsets', 'insertionPoint', 'rigidFactor', 'partialFixity', 'panelZone', 'tapered']),
  nodes: new Set(['support', 'spring', 'settlement', 'prescribedDisplacement', 'storyId']),
  stories: new Set(['name', 'elevation', 'z', 'height', 'locked', 'visible']),
  diaphragms: new Set(['name', 'type', 'masterNodeId', 'nodeIds', 'storyId']),
});

export function previewPhase13TableEdit(model, input = {}) {
  const collection = String(input.collection || '');
  const rows = model[collection];
  const errors = [];
  if (!Array.isArray(rows) || !EDITABLE_FIELDS[collection]) errors.push({ code: 'EDITOR_COLLECTION_UNSUPPORTED', collection });
  const ids = new Set((input.ids || []).map(String));
  const patch = clone(input.patch || {});
  if (!ids.size) errors.push({ code: 'EDITOR_SELECTION_REQUIRED' });
  if (Object.keys(patch).some((key) => ['id', 'version'].includes(key))) errors.push({ code: 'EDITOR_IMMUTABLE_FIELD', fields: Object.keys(patch) });
  const unsupportedFields = Object.keys(patch).filter((key) => !EDITABLE_FIELDS[collection]?.has(key));
  if (unsupportedFields.length) errors.push({ code: 'EDITOR_FIELD_UNSUPPORTED', fields: unsupportedFields });
  if (containsNonFinite(patch)) errors.push({ code: 'EDITOR_NON_FINITE_VALUE' });
  const missing = [...ids].filter((id) => !rows?.some((row) => String(row.id) === id));
  if (missing.length) errors.push({ code: 'EDITOR_OBJECT_NOT_FOUND', ids: missing });
  const changes = errors.length ? [] : [...ids].map((id) => ({ op: 'update', collection, id, patch }));
  return deepFreeze({
    version: PHASE13_PRACTICAL_EDITORS_VERSION,
    status: errors.length ? 'blocked' : 'ready',
    sourceHash: stableHash(model).slice(0, 24),
    selection: { collection, ids: [...ids] },
    patch,
    changes,
    errors,
  });
}

export function applyPhase13TableEdit(model, preview, options = {}) {
  if (preview?.status !== 'ready' || preview.sourceHash !== stableHash(model).slice(0, 24)) {
    return { ok: false, changed: false, model, errors: [{ code: 'EDITOR_PREVIEW_BLOCKED_OR_STALE' }] };
  }
  return applyModelChangeSet(model, { id: 'p13-table-edit', name: `Edit ${preview.selection.collection}`, changes: preview.changes }, { validate: options.validate });
}

export function previewPhase13StoryGeneration(model, levels = []) {
  const sorted = levels.map((row, index) => ({
    id: String(row.id || `S${index + 1}`),
    name: row.name || row.id || `Story ${index + 1}`,
    elevation: Number(row.elevation ?? row.z),
    z: Number(row.elevation ?? row.z),
  })).sort((a, b) => a.elevation - b.elevation);
  const errors = [];
  if (sorted.some((row) => !Number.isFinite(row.elevation))) errors.push({ code: 'STORY_ELEVATION_INVALID' });
  if (new Set(sorted.map((row) => row.id)).size !== sorted.length) errors.push({ code: 'STORY_ID_DUPLICATE' });
  if (sorted.some((row, index) => index && row.elevation <= sorted[index - 1].elevation)) errors.push({ code: 'STORY_ELEVATION_ORDER_INVALID' });
  const stories = sorted.map((row, index) => ({ ...row, height: index ? row.elevation - sorted[index - 1].elevation : row.elevation }));
  return deepFreeze({
    version: 'p13-m5-story-generation-v1',
    status: errors.length ? 'blocked' : 'ready',
    sourceHash: stableHash(model).slice(0, 24),
    errors,
    stories,
    changes: errors.length ? [] : diff(model.stories || [], stories, 'stories'),
  });
}

export function applyPhase13StoryGeneration(model, preview, options = {}) {
  if (preview?.status !== 'ready' || preview.sourceHash !== stableHash(model).slice(0, 24)) {
    return { ok: false, changed: false, model, errors: [{ code: 'STORY_PREVIEW_BLOCKED_OR_STALE' }] };
  }
  return applyModelChangeSet(model, { id: 'p13-story-generation', name: 'Generate stories', changes: preview.changes }, { validate: options.validate });
}

export function validatePhase13Diaphragms(model = {}) {
  const nodeIds = new Set((model.nodes || []).map((row) => String(row.id)));
  const assignments = new Map();
  const graph = new Map();
  const issues = [];
  for (const row of model.diaphragms || []) {
    const ids = [...new Set((row.nodeIds || row.slaveNodeIds || []).map(String))];
    if (!row.id) issues.push({ code: 'DIAPHRAGM_ID_REQUIRED', diaphragmId: null });
    if (!row.masterNodeId || !nodeIds.has(String(row.masterNodeId))) issues.push({ code: 'DIAPHRAGM_MASTER_MISSING', diaphragmId: row.id, nodeId: row.masterNodeId || null });
    for (const id of ids) {
      if (!nodeIds.has(id)) issues.push({ code: 'DIAPHRAGM_NODE_MISSING', diaphragmId: row.id, nodeId: id });
      if (assignments.has(id) && assignments.get(id) !== row.id) issues.push({ code: 'DIAPHRAGM_NODE_OVERLAP', diaphragmId: row.id, nodeId: id, otherId: assignments.get(id) });
      assignments.set(id, row.id);
      graph.set(id, String(row.masterNodeId || ''));
      if (id === String(row.masterNodeId)) issues.push({ code: 'DIAPHRAGM_MASTER_IS_SLAVE', diaphragmId: row.id, nodeId: id });
    }
  }
  for (const start of graph.keys()) {
    const seen = new Set();
    let current = start;
    while (graph.has(current)) {
      if (seen.has(current)) { issues.push({ code: 'DIAPHRAGM_ASSIGNMENT_CYCLE', nodeId: current }); break; }
      seen.add(current);
      current = graph.get(current);
    }
  }
  return deepFreeze({ version: 'p13-m5-diaphragm-validation-v1', ok: issues.length === 0, status: issues.length ? 'blocked' : 'ready', issues, assignedNodeCount: assignments.size });
}

export function previewPhase13DiaphragmAssignment(model = {}, input = {}) {
  const id = String(input.id || '').trim();
  const value = {
    id,
    name: String(input.name || id),
    type: input.type === 'semi-rigid' ? 'semi-rigid' : 'rigid',
    masterNodeId: String(input.masterNodeId || ''),
    nodeIds: [...new Set((input.nodeIds || []).map(String))],
    storyId: input.storyId ? String(input.storyId) : null,
  };
  const existing = (model.diaphragms || []).find((row) => String(row.id) === id);
  const changes = id ? [{ op: existing ? 'replace' : 'add', collection: 'diaphragms', id, value }] : [];
  const candidate = clone(model);
  candidate.diaphragms = (model.diaphragms || []).filter((row) => String(row.id) !== id).concat(id ? [value] : []);
  const validation = validatePhase13Diaphragms(candidate);
  return deepFreeze({
    version: 'p13-m5-diaphragm-preview-v1',
    status: validation.ok ? 'ready' : 'blocked',
    sourceHash: stableHash(model).slice(0, 24),
    value,
    changes: validation.ok ? changes : [],
    validation,
  });
}

export function applyPhase13DiaphragmAssignment(model, preview) {
  if (preview?.status !== 'ready' || preview.sourceHash !== stableHash(model).slice(0, 24)) {
    return { ok: false, changed: false, model, errors: [{ code: 'DIAPHRAGM_PREVIEW_BLOCKED_OR_STALE' }] };
  }
  return applyModelChangeSet(model, { id: 'p13-diaphragm-assignment', name: 'Assign diaphragm', changes: preview.changes }, {
    validate(next) {
      const validation = validatePhase13Diaphragms(next);
      return validation.ok ? { ok: true, errors: [] } : { ok: false, errors: validation.issues };
    },
  });
}

export function buildPhase13EditorSelection(type, ids = [], source = 'table') {
  return Object.freeze({ version: 'p13-m5-editor-selection-v1', type: String(type), ids: [...new Set(ids.map(String))], source });
}

function diff(before, after, collection) {
  const a = new Map(before.map((row) => [row.id, row]));
  const b = new Map(after.map((row) => [row.id, row]));
  const changes = [];
  for (const [id] of a) if (!b.has(id)) changes.push({ op: 'remove', collection, id });
  for (const [id, row] of b) changes.push(a.has(id) ? { op: 'replace', collection, id, value: row } : { op: 'add', collection, id, value: row });
  return changes;
}

function containsNonFinite(value) {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(containsNonFinite);
  if (value && typeof value === 'object') return Object.values(value).some(containsNonFinite);
  return false;
}

function clone(value) {
  return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
