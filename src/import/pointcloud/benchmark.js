import { buildPointCloudExtractionReview, normalizeRealScanValidation } from './review.js';

export const POINT_CLOUD_BENCHMARK_VERSION = 'p3-m9-pointcloud-benchmark-v1';

export function evaluatePointCloudExtraction(candidate, groundTruth, options = {}) {
  const tol = options.tolerance ?? 0.08;
  const targets = {
    storyErrorMax: options.storyErrorTarget ?? 0.03,
    columnRecall: options.columnRecallTarget ?? 0.9,
    columnPrecision: options.columnPrecisionTarget ?? 0.9,
    beamRecall: options.beamRecallTarget ?? 0.75,
  };
  const detectedColumns = candidate.candidates.members.filter((m) => m.kind === 'column');
  const matched = groundTruth.columns.filter((gt) => detectedColumns.some((m) => columnMatch(m, candidate, gt, tol)));
  const detectedBeams = candidate.candidates.members.filter((m) => m.kind === 'beam');
  const matchedBeams = (groundTruth.beams || []).filter((gt) => detectedBeams.some((m) => beamMatch(m, candidate, gt, tol)));
  const detectedWalls = candidate.audit?.pointcloud?.evidence?.candidates?.walls || [];
  const matchedWalls = (groundTruth.walls || []).filter((gt) => detectedWalls.some((wall) => wallMatch(wall, gt, tol)));
  const metrics = {
    storyErrorMax: storyError(candidate.candidates.stories, groundTruth.stories),
    columnRecall: matched.length / Math.max(1, groundTruth.columns.length),
    columnPrecision: matched.length / Math.max(1, detectedColumns.length),
    beamRecall: matchedBeams.length / Math.max(1, (groundTruth.beams || []).length),
    beamPrecision: matchedBeams.length / Math.max(1, detectedBeams.length),
    wallRecall: matchedWalls.length / Math.max(1, (groundTruth.walls || []).length),
    wallCandidateCount: detectedWalls.length,
  };
  const realScan = normalizeRealScanValidation(options.realScanValidation);
  const review = buildBenchmarkReview(metrics, targets, realScan);
  return {
    version: POINT_CLOUD_BENCHMARK_VERSION,
    ...metrics,
    targets,
    pass: {
      story: metrics.storyErrorMax < targets.storyErrorMax,
      columnRecall: metrics.columnRecall >= targets.columnRecall,
      columnPrecision: metrics.columnPrecision >= targets.columnPrecision,
      beamRecall: metrics.beamRecall >= targets.beamRecall,
    },
    review,
    validationStatus: {
      syntheticBenchmark: 'checked',
      realScan,
    },
  };
}

function buildBenchmarkReview(metrics, targets, realScanValidation) {
  const failed = [];
  if (!(metrics.storyErrorMax < targets.storyErrorMax)) failed.push('story-error-target');
  if (!(metrics.columnRecall >= targets.columnRecall)) failed.push('column-recall-target');
  if (!(metrics.columnPrecision >= targets.columnPrecision)) failed.push('column-precision-target');
  if (!(metrics.beamRecall >= targets.beamRecall)) failed.push('beam-recall-target');
  return buildPointCloudExtractionReview({
    failedTargets: failed,
    realScanValidation,
  });
}

function columnMatch(member, candidate, gt, tol) {
  const a = candidate.candidates.nodes.find((n) => n.id === member.from);
  const b = candidate.candidates.nodes.find((n) => n.id === member.to);
  if (!a || !b) return false;
  return Math.hypot(a.x - gt.x, a.y - gt.y) <= tol && Math.abs(Math.min(a.z, b.z) - gt.z1) <= tol && Math.abs(Math.max(a.z, b.z) - gt.z2) <= tol;
}

function beamMatch(member, candidate, gt, tol) {
  const a = candidate.candidates.nodes.find((n) => n.id === member.from);
  const b = candidate.candidates.nodes.find((n) => n.id === member.to);
  if (!a || !b) return false;
  return endpointPairMatch([a, b], gt, tol) || endpointPairMatch([b, a], gt, tol);
}

function endpointPairMatch(nodes, gt, tol) {
  return pointMatch(nodes[0], gt.from, tol) && pointMatch(nodes[1], gt.to, tol);
}

function pointMatch(node, point, tol) {
  return Math.hypot(node.x - point[0], node.y - point[1], (node.z || 0) - (point[2] || 0)) <= tol;
}

function wallMatch(wall, gt, tol) {
  return (pointArrayMatch(wall.from, gt.from, tol) && pointArrayMatch(wall.to, gt.to, tol)) ||
    (pointArrayMatch(wall.from, gt.to, tol) && pointArrayMatch(wall.to, gt.from, tol));
}

function pointArrayMatch(a = [], b = [], tol) {
  return Math.hypot((a[0] || 0) - (b[0] || 0), (a[1] || 0) - (b[1] || 0), (a[2] || 0) - (b[2] || 0)) <= tol;
}

function storyError(stories, truth = []) {
  return Math.max(0, ...truth.map((z) => Math.min(...stories.map((s) => Math.abs(s.z - z)))));
}
