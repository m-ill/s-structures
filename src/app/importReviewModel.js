import { validateImportCandidate } from '../import/candidate.js';

export const IMPORT_REVIEW_MODEL_VERSION = 'p3-import-review-model-v1';

export function summarizeImportEntry(entry = {}) {
  const candidate = entry.resolvedCandidate || entry.candidate || null;
  const validation = validateImportCandidate(candidate);
  const counts = candidate?.audit?.counts || entry.audit?.counts || {};
  return {
    id: entry.id || null,
    status: entry.status || 'pending',
    candidate,
    validation,
    counts: {
      stories: counts.stories || 0,
      grids: counts.grids || 0,
      nodes: counts.nodes || 0,
      members: counts.members || 0,
    },
    warnings: [...(validation.warnings || []), ...(entry.audit?.warnings || [])],
  };
}

export function canConfirmImport(summary) {
  return !!summary?.candidate && summary.validation?.ok === true && summary.status !== 'rejected';
}

export function resolveImportCandidate(summary, nextCandidate, note = 'manual review') {
  const base = nextCandidate || summary?.candidate;
  if (!base) return null;
  return {
    ...base,
    audit: {
      ...(base.audit || {}),
      reviewHistory: [
        ...((base.audit || {}).reviewHistory || []),
        { note, at: new Date().toISOString() },
      ],
    },
  };
}
