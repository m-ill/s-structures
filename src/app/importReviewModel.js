import { validateImportCandidate } from '../import/candidate.js';

export const IMPORT_REVIEW_MODEL_VERSION = 'p3-import-review-model-v1';

export function summarizeImportEntry(entry = {}) {
  const candidate = entry.resolvedCandidate || entry.candidate || null;
  const validation = validateImportCandidate(candidate);
  const counts = candidate?.audit?.counts || entry.audit?.counts || {};
  const warnings = uniqueStrings([...(validation.warnings || []), ...(entry.audit?.warnings || [])]);
  const review = buildReviewState(entry, candidate, validation, warnings);
  const decision = buildDecisionState(entry, candidate, validation, review);
  return {
    version: IMPORT_REVIEW_MODEL_VERSION,
    id: entry.id || null,
    status: entry.status || 'pending',
    candidate,
    validation,
    source: candidate?.source || null,
    counts: {
      stories: counts.stories ?? candidate?.candidates?.stories?.length ?? 0,
      grids: counts.grids ?? candidate?.candidates?.grids?.length ?? 0,
      nodes: counts.nodes ?? candidate?.candidates?.nodes?.length ?? 0,
      members: counts.members ?? candidate?.candidates?.members?.length ?? 0,
    },
    layers: candidate?.audit?.layers || entry.audit?.layers || null,
    planAssembly: candidate?.audit?.planAssembly || entry.audit?.planAssembly || null,
    review,
    decision,
    warnings,
  };
}

export function canConfirmImport(summary) {
  return !!summary?.candidate && summary.validation?.ok === true && summary.status !== 'rejected' && summary.review?.confirmable !== false;
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

function buildReviewState(entry, candidate, validation, warnings) {
  const status = entry.status || 'pending';
  const reasons = [];
  if (!candidate) reasons.push('candidate-missing');
  if (validation?.ok !== true) reasons.push(...(validation?.errors || ['validation-failed']));
  if (status === 'rejected') reasons.push('already-rejected');
  const layers = candidate?.audit?.layers || entry.audit?.layers || null;
  if (layers?.unmappedEntityCount > 0) reasons.push('unmapped-layer-review-required');
  const planAssembly = candidate?.audit?.planAssembly || entry.audit?.planAssembly || null;
  if (planAssembly && planAssembly.planCount < 2) reasons.push('single-plan-assembly-review-required');
  if (planAssembly?.recognitionQuality?.ok === false) reasons.push('plan-recognition-quality-review-required');
  if (planAssembly?.columnContinuity?.ok === false) reasons.push('column-stack-continuity-review-required');
  reasons.push(...(planAssembly?.review?.reasons || []));
  return {
    confirmable: reasons.length === 0,
    requiresHumanReview: warnings.length > 0 || reasons.length > 0 || status === 'pending',
    reasons: uniqueStrings(reasons),
    sourceType: candidate?.source?.type || entry.source?.type || null,
    fileId: candidate?.source?.fileId || entry.fileId || null,
    layerAudit: layers ? {
      layers: layers.layers || [],
      mappedLayers: layers.mappedLayers || [],
      unmappedEntityCount: layers.unmappedEntityCount || 0,
    } : null,
    planAssembly: planAssembly ? {
      version: planAssembly.version || null,
      planCount: planAssembly.planCount || 0,
      columnStackCount: planAssembly.columnStackCount || 0,
      generatedSegmentCount: planAssembly.generatedSegmentCount || 0,
      recognitionQuality: planAssembly.recognitionQuality || null,
      columnContinuity: planAssembly.columnContinuity || null,
      overlayEvidence: planAssembly.overlayEvidence || null,
      review: planAssembly.review || null,
    } : null,
  };
}

function buildDecisionState(entry, candidate, validation, review) {
  const status = entry.status || 'pending';
  return {
    status,
    accepted: status === 'confirmed',
    rejected: status === 'rejected',
    pending: status === 'pending',
    confirmable: !!candidate && validation?.ok === true && review?.confirmable !== false && status !== 'rejected',
    resolvedCandidatePresent: !!entry.resolvedCandidate,
    resolvedBy: entry.resolvedBy || null,
    decidedAt: entry.updatedAt || entry.createdAt || null,
    reasons: review?.reasons || [],
  };
}

function uniqueStrings(values) {
  return [...new Set((values || []).filter((value) => typeof value === 'string' && value.length > 0))];
}
