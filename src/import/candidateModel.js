import { createModel } from '../core/model.js';
import { validateImportCandidate } from './candidate.js';

export const IMPORT_CANDIDATE_MODEL_VERSION = 'p3-m9-import-candidate-model-v1';

export function importCandidateToModel(candidate, options = {}) {
  const validation = validateImportCandidate(candidate);
  const model = createModel();
  const nodes = candidate?.candidates?.nodes || [];
  const members = candidate?.candidates?.members || [];
  const zValues = nodes.map((n) => n.z || 0);
  const minZ = zValues.length ? Math.min(...zValues) : 0;
  model.nodes = nodes.map((n) => ({
    id: n.id, x: n.x, y: n.y, z: n.z || 0,
    support: Math.abs((n.z || 0) - minZ) <= 1e-6 ? 'fixed' : null,
  }));
  const secId = options.secId || model.sections[0]?.id || 'box400h';
  model.members = members.map((m, i) => ({
    id: m.id || `M${i + 1}`, type: 'frame', n1: m.from, n2: m.to,
    matId: options.matId || 'steel', secId,
    releases: { i: 'rigid', j: 'rigid' },
    design: {
      role: m.kind || 'unknown',
      importMemberId: m.id || null,
      confidence: Number.isFinite(m.confidence) ? m.confidence : null,
    },
  }));
  model.meta = {
    ...(model.meta || {}),
    importSource: candidate?.source?.type || 'import',
    importFileId: candidate?.source?.fileId || null,
    importCandidateVersion: candidate?.version || null,
    importValidation: validation,
    importReview: buildImportReviewMeta(candidate, options, validation),
    importAudit: {
      warnings: candidate?.audit?.warnings || [],
      counts: candidate?.audit?.counts || {},
    },
  };
  addMinimalLoads(model, options);
  return model;
}

function buildImportReviewMeta(candidate, options, validation) {
  const candidateReview = candidate?.audit?.pointcloud?.candidateReview || candidate?.audit?.planAssembly?.review || null;
  const validationOk = validation?.ok === true;
  const confirmed = validationOk && (options.confirmed === true || options.reviewStatus === 'confirmed');
  const humanReviewRequired = candidateReview?.humanReviewRequired !== false;
  if (!validationOk) {
    return {
      required: true,
      confirmed: false,
      status: 'invalid-candidate',
      validationOk: false,
      validationErrors: validation?.errors || ['validation-failed'],
      candidateToAnalysisPath: 'blocked-until-candidate-validation',
      sourceAssistance: candidateReview?.sourceAssistance || null,
      blockers: [...new Set([...(candidateReview?.blockers || []), ...(validation?.errors || ['validation-failed'])])],
      agentDecision: 'fix-import-candidate-before-analysis',
      humanReviewRequired: true,
    };
  }
  return {
    required: options.reviewRequired !== false && !confirmed,
    confirmed,
    status: confirmed ? 'confirmed' : 'review-required',
    validationOk: true,
    validationErrors: [],
    candidateToAnalysisPath: candidateReview?.candidateToAnalysisPath || 'available-after-human-review',
    sourceAssistance: candidateReview?.sourceAssistance || null,
    blockers: candidateReview?.blockers || [],
    agentDecision: confirmed ? 'import-candidate-confirmed-for-analysis' : 'review-import-candidate-before-final-use',
    humanReviewRequired,
  };
}

function addMinimalLoads(model, options) {
  if (options.addMinimalLoads === false || model.nodes.length === 0) return;
  const topZ = Math.max(...model.nodes.map((n) => n.z || 0));
  const top = model.nodes.filter((n) => Math.abs((n.z || 0) - topZ) <= 1e-6);
  const source = options.loadSource || `${model.meta?.importSource || 'import'}-candidate-e2e`;
  top.forEach((node, index) => model.loads.push({
    id: `IMP${index + 1}`, type: 'nodal', node: node.id,
    P: options.topDeadLoad ?? 1, dir: '-z', case: 'D',
    source,
  }));
}
