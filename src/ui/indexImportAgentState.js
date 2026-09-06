import {
  canConfirmImport,
  resolveImportCandidate,
  summarizeImportEntry,
} from '../app/importReviewModel.js';
import { importCandidateToModel } from '../import/candidateModel.js';

export const INDEX_IMPORT_AGENT_STATE_VERSION = 'p3-m7-index-import-agent-state-v1';

export function listIndexImportCandidates(target) {
  const state = ensureImportState(target);
  return {
    version: INDEX_IMPORT_AGENT_STATE_VERSION,
    count: state.imports.length,
    imports: state.imports.map(toAgentImportRow),
  };
}

export function resolveIndexImportCandidate(target, payload = {}) {
  const state = ensureImportState(target);
  const entry = getOrCreateEntry(state, payload);
  const summary = summarizeImportEntry(entry);
  const candidate = resolveImportCandidate(summary, payload.candidate || payload.resolvedCandidate, payload.note);
  if (!candidate) throw new Error('resolveImportCandidate requires an import candidate.');
  Object.assign(entry, {
    candidate,
    resolvedCandidate: candidate,
    updatedAt: now(payload),
  });
  return toAgentImportRow(entry);
}

export function confirmIndexImport(target, payload = {}) {
  const state = ensureImportState(target);
  const entry = findEntry(state, payload.importId || payload.id);
  const summary = summarizeImportEntry(entry);
  if (!canConfirmImport(summary)) {
    throw new Error(`Import candidate cannot be confirmed: ${summary.review?.reasons?.join(', ') || 'validation failed'}`);
  }
  entry.status = 'confirmed';
  entry.resolvedCandidate = payload.resolvedCandidate || summary.candidate;
  entry.resolvedBy = payload.resolvedBy || 'agent';
  entry.updatedAt = now(payload);
  entry.resolvedAt = entry.updatedAt;
  const row = toAgentImportRow(entry);
  if (payload.applyToModel === true) row.appliedModel = applyConfirmedImportToModel(target, entry, payload);
  return row;
}

export function rejectIndexImport(target, payload = {}) {
  const state = ensureImportState(target);
  const entry = findEntry(state, payload.importId || payload.id);
  entry.status = 'rejected';
  entry.resolvedBy = payload.resolvedBy || 'agent';
  entry.updatedAt = now(payload);
  entry.resolvedAt = entry.updatedAt;
  entry.rejectReason = payload.reason || payload.note || null;
  return toAgentImportRow(entry);
}

function ensureImportState(target) {
  target.__SStructuresImportCandidates ||= { imports: [] };
  target.__SStructuresImportCandidates.imports ||= [];
  return target.__SStructuresImportCandidates;
}

function getOrCreateEntry(state, payload) {
  const id = payload.importId || payload.id;
  const existing = id ? state.imports.find((item) => item.id === id) : null;
  if (existing) return existing;
  const source = payload.import || payload.entry || payload;
  const entry = {
    id: id || source.id || `local-import-${state.imports.length + 1}`,
    fileId: source.fileId || source.candidate?.source?.fileId || null,
    candidate: source.candidate || source.resolvedCandidate,
    audit: source.audit || {},
    status: source.status || 'pending',
    createdAt: source.createdAt || now(source),
    resolvedAt: source.resolvedAt || null,
    resolvedBy: source.resolvedBy || null,
  };
  state.imports.push(entry);
  return entry;
}

function findEntry(state, id) {
  const entry = state.imports.find((item) => item.id === id);
  if (!entry) throw new Error(`Import candidate not found: ${id || 'blank'}`);
  return entry;
}

function toAgentImportRow(entry) {
  return { ...entry, review: summarizeImportEntry(entry) };
}

function applyConfirmedImportToModel(target, entry, payload) {
  const model = target.model?.();
  if (!model) throw new Error('Current UI model is not available.');
  const next = importCandidateToModel(entry.resolvedCandidate || entry.candidate, {
    confirmed: true,
    ...payload.modelOptions,
  });
  for (const key of Object.keys(model)) delete model[key];
  Object.assign(model, next);
  target.reanalyze?.(true);
  return { nodeCount: next.nodes.length, memberCount: next.members.length };
}

function now(payload = {}) {
  return payload.at || new Date().toISOString();
}
