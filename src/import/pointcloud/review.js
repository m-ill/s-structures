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
    requiredEvidence: buildRequiredEvidence(syntheticGate, realScan),
    requiresOwnerScan: realScan === 'pending-owner-file' || realScan === 'failed',
    ownerReviewReady: syntheticGate === 'pass' && realScan === 'checked',
    productionReady: false,
    agentDecision: decide(syntheticGate, realScan),
  };
}

function buildRequiredEvidence(syntheticGate, realScan) {
  const evidence = [];
  if (syntheticGate === 'fail') evidence.push('synthetic-extraction-regression-fix');
  if (realScan === 'pending-owner-file') {
    evidence.push('owner-pointcloud-file');
    evidence.push('field-extraction-review');
  }
  if (realScan === 'failed') evidence.push('clean-or-replace-owner-pointcloud-file');
  return evidence;
}

function decide(syntheticGate, realScan) {
  if (syntheticGate === 'fail') return 'fix-extraction-before-review';
  if (realScan === 'checked') return 'pointcloud-import-ready-for-owner-review';
  if (realScan === 'failed') return 'collect-or-clean-real-scan';
  return 'synthetic-benchmark-pass-real-scan-pending';
}
