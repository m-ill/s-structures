export const POINT_CLOUD_BENCHMARK_VERSION = 'p3-m9-pointcloud-benchmark-v1';

export function evaluatePointCloudExtraction(candidate, groundTruth, options = {}) {
  const tol = options.tolerance ?? 0.08;
  const detectedColumns = candidate.candidates.members.filter((m) => m.kind === 'column');
  const matched = groundTruth.columns.filter((gt) => detectedColumns.some((m) => columnMatch(m, candidate, gt, tol)));
  const detectedBeams = candidate.candidates.members.filter((m) => m.kind === 'beam');
  const matchedBeams = (groundTruth.beams || []).filter((gt) => detectedBeams.some((m) => beamMatch(m, candidate, gt, tol)));
  return {
    version: POINT_CLOUD_BENCHMARK_VERSION,
    storyErrorMax: storyError(candidate.candidates.stories, groundTruth.stories),
    columnRecall: matched.length / Math.max(1, groundTruth.columns.length),
    columnPrecision: matched.length / Math.max(1, detectedColumns.length),
    beamRecall: matchedBeams.length / Math.max(1, (groundTruth.beams || []).length),
    beamPrecision: matchedBeams.length / Math.max(1, detectedBeams.length),
    validationStatus: {
      syntheticBenchmark: 'checked',
      realScan: 'pending-owner-file',
    },
  };
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

function storyError(stories, truth = []) {
  return Math.max(0, ...truth.map((z) => Math.min(...stories.map((s) => Math.abs(s.z - z)))));
}
