import { wireframeToImportCandidate } from './wireframe.js';

export const PLAN_ASSEMBLY_VERSION = 'p3-m7-plan-assembly';

export function assemblePlansToImportCandidate(plans = [], options = {}) {
  const ordered = [...plans].sort((a, b) => Number(a.elevation) - Number(b.elevation));
  const segments = [];
  const columnKeys = new Map();
  for (const plan of ordered) {
    for (const beam of plan.beams || []) {
      segments.push({
        from: [beam.from.x, beam.from.y, plan.elevation],
        to: [beam.to.x, beam.to.y, plan.elevation],
        layer: beam.layer,
        kindHint: beam.kind || 'beam',
        sectionHint: beam.sectionHint,
        materialHint: beam.materialHint,
      });
    }
    for (const column of plan.columns || []) {
      const key = pointKey(column, options.columnTolerance || 1e-3);
      columnKeys.set(key, columnKeys.get(key) || []);
      columnKeys.get(key).push(column);
    }
  }
  for (const columns of columnKeys.values()) {
    const sorted = columns.sort((a, b) => a.z - b.z);
    for (let i = 0; i < sorted.length - 1; i += 1) {
      segments.push({
        from: [sorted[i].x, sorted[i].y, sorted[i].z],
        to: [sorted[i + 1].x, sorted[i + 1].y, sorted[i + 1].z],
        layer: sorted[i].layer,
        kindHint: 'column',
        sectionHint: sorted[i].sectionHint || sorted[i + 1].sectionHint,
        materialHint: sorted[i].materialHint || sorted[i + 1].materialHint,
      });
    }
  }
  const candidate = wireframeToImportCandidate(segments, {
    ...options,
    source: options.source || { type: 'dxf-plan-assembly', units: 'm' },
  });
  candidate.import = {
    version: PLAN_ASSEMBLY_VERSION,
    planCount: ordered.length,
  };
  const recognitionQuality = summarizeRecognitionQuality(ordered);
  const columnContinuity = summarizeColumnContinuity(columnKeys, ordered);
  candidate.audit = {
    ...candidate.audit,
    planAssembly: {
      version: PLAN_ASSEMBLY_VERSION,
      planCount: ordered.length,
      columnStackCount: columnKeys.size,
      generatedSegmentCount: segments.length,
      labelEvidence: summarizePlanLabels(ordered),
      recognitionQuality,
      columnContinuity,
      review: buildPlanAssemblyReview({ ordered, recognitionQuality, columnContinuity, segments }),
    },
  };
  return candidate;
}

function summarizePlanLabels(plans) {
  const rows = plans.map((plan) => ({
    storyId: plan.storyId || null,
    elevation: plan.elevation,
    primaryLabel: plan.audit?.labelEvidence?.primaryLabel || null,
    labelCount: plan.audit?.labelEvidence?.labelCount || 0,
    labels: plan.audit?.labelEvidence?.labels || [],
  }));
  return {
    rows,
    missingLabelStories: rows.filter((row) => !row.primaryLabel).map((row) => row.storyId),
    agentDecision: rows.every((row) => row.primaryLabel)
      ? 'story-labels-available-for-review'
      : 'review-missing-story-labels',
  };
}

export function buildPlanAssemblyReview(input = {}) {
  const reasons = [];
  if ((input.ordered || []).length < 2) reasons.push('single-plan-assembly-review-required');
  if (input.recognitionQuality?.ok === false) reasons.push('plan-recognition-quality-review-required');
  if (input.columnContinuity?.ok === false) reasons.push('column-stack-continuity-review-required');
  if (!(input.segments || []).length) reasons.push('no-generated-structural-segments');
  return {
    version: PLAN_ASSEMBLY_VERSION,
    status: reasons.length ? 'review-required' : 'ready-for-human-confirmation',
    confirmable: reasons.length === 0,
    reasons,
    requiresHumanReview: true,
    agentDecision: reasons.length ? 'hold-import-for-plan-review' : 'candidate-ready-for-import-review-ui',
    evidence: {
      planCount: (input.ordered || []).length,
      generatedSegmentCount: (input.segments || []).length,
      minColumnRecall: input.recognitionQuality?.minColumnRecall ?? null,
      minBeamRecall: input.recognitionQuality?.minBeamRecall ?? null,
      incompleteStackCount: input.columnContinuity?.incompleteStackCount ?? null,
    },
  };
}

function pointKey(point, tolerance) {
  const scale = 1 / Math.max(tolerance, 1e-12);
  return `${Math.round(point.x * scale)}:${Math.round(point.y * scale)}`;
}

function summarizeRecognitionQuality(plans) {
  const rows = plans
    .map((plan) => plan.audit?.recognitionQuality)
    .filter(Boolean);
  if (!rows.length) return null;
  const columnRecalls = rows.map((row) => row.recall?.columns).filter(Number.isFinite);
  const beamRecalls = rows.map((row) => row.recall?.beams).filter(Number.isFinite);
  return {
    planCount: rows.length,
    minColumnRecall: columnRecalls.length ? Math.min(...columnRecalls) : null,
    minBeamRecall: beamRecalls.length ? Math.min(...beamRecalls) : null,
    targets: rows[0].targets || { columnRecall: 0.9, beamRecall: 0.8 },
    ok: rows.every((row) => row.ok !== false),
  };
}

function summarizeColumnContinuity(columnKeys, plans) {
  const expectedStoryCount = plans.length;
  const incompleteStacks = [...columnKeys.entries()]
    .filter(([, columns]) => columns.length < expectedStoryCount)
    .map(([key, columns]) => ({
      key,
      observedStoryCount: columns.length,
      expectedStoryCount,
      elevations: columns.map((column) => column.z).sort((a, b) => a - b),
    }));
  return {
    expectedStoryCount,
    stackCount: columnKeys.size,
    incompleteStackCount: incompleteStacks.length,
    incompleteStacks,
    ok: incompleteStacks.length === 0,
  };
}
