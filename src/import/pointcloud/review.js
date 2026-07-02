export const POINT_CLOUD_REVIEW_VERSION = 'p3-m9-pointcloud-review-v1';

export function normalizeRealScanValidation(value) {
  const known = new Set(['pending-owner-file', 'checked', 'failed', 'not-required']);
  return known.has(value) ? value : 'pending-owner-file';
}

export function buildPointCloudExtractionReview(input = {}) {
  const realScan = normalizeRealScanValidation(input.realScanValidation);
  const failedTargets = input.failedTargets || [];
  const syntheticGate = failedTargets.length ? 'fail' : 'pass';
  const realScanGate = realScan === 'checked' ? 'pass' : realScan;
  return {
    version: POINT_CLOUD_REVIEW_VERSION,
    syntheticGate,
    failedTargets,
    realScanGate,
    requiresOwnerScan: realScan === 'pending-owner-file' || realScan === 'failed',
    productionReady: syntheticGate === 'pass' && realScan === 'checked',
    agentDecision: decide(syntheticGate, realScan),
  };
}

function decide(syntheticGate, realScan) {
  if (syntheticGate === 'fail') return 'fix-extraction-before-review';
  if (realScan === 'checked') return 'pointcloud-import-ready-for-owner-review';
  if (realScan === 'failed') return 'collect-or-clean-real-scan';
  return 'synthetic-benchmark-pass-real-scan-pending';
}
