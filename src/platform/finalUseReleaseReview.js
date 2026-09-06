import { buildLaunchReadinessReport } from './launchReadiness.js';
import { buildPhase3EvidenceRegister } from './phase3EvidenceRegister.js';
import { buildPhase3OwnerSignoffReview } from './phase3OwnerSignoffReview.js';
import { buildPhase3PracticeValidationReview } from './phase3PracticeValidationReview.js';

export const FINAL_USE_RELEASE_REVIEW_VERSION = 'post-p5-final-use-review-v1';

export function buildFinalUseReleaseReview(input = {}) {
  const evidence = input.evidence || input.items || [];
  const finalApprovals = input.finalApprovals || input.approvals || {};
  const practiceValidationReview = input.practiceValidationReview || buildPhase3PracticeValidationReview({
    evidence,
    finalApprovals,
  });
  const ownerSignoffReview = input.ownerSignoffReview || buildPhase3OwnerSignoffReview({
    evidence,
    finalApprovals,
  });
  const evidenceRegister = input.evidenceRegister || buildPhase3EvidenceRegister({ evidence });
  const launchReadinessReport = input.launchReadinessReport || buildLaunchReadinessReport({
    ...(input.launchEvidence || input),
    practiceValidationReview,
    ownerSignoffReview,
    evidenceRegister,
    finalApprovals,
  });
  const rows = [
    reviewRow('practice-validation', 'getPhase3PracticeValidationReview', practiceValidationReview.summary, 'productionReady'),
    reviewRow('owner-signoff', 'getPhase3OwnerSignoffReview', ownerSignoffReview.summary, 'productionDeploymentApproved'),
    reviewRow('evidence-register', 'getPhase3EvidenceRegister', evidenceRegister.summary, 'evidenceComplete'),
    reviewRow('launch-readiness', 'getLaunchReadinessReport', launchReadinessReport.productionReadiness, 'productionDeploymentApproved'),
  ];
  const blockingRows = rows.filter((row) => !row.accepted);
  const productionReady = blockingRows.length === 0 &&
    launchReadinessReport.agentSafeStatus === 'PRODUCTION_APPROVED';

  return {
    version: FINAL_USE_RELEASE_REVIEW_VERSION,
    scope: 'Post-Phase 5 final-use release review across practical validation, evidence register, owner sign-off, and launch readiness.',
    sourceDocs: [
      'docs/user-manual/PHASE3_REMAINING_REVIEW.md',
      'docs/user-manual/PHASE3_LAUNCH_MANUAL.md',
      'docs/user-manual/STATUS_AND_LIMITS.md',
      'docs/phase5/MILESTONE_STATUS.md',
    ],
    rows,
    summary: {
      status: productionReady ? 'FINAL_USE_APPROVED' : 'FINAL_USE_BLOCKED',
      productionReady,
      automatedLaunchStatus: launchReadinessReport.status,
      agentSafeStatus: launchReadinessReport.agentSafeStatus,
      finalUseReviewStatus: launchReadinessReport.finalUseReview?.status || null,
      acceptedCount: rows.filter((row) => row.accepted).length,
      requiredCount: rows.length,
      blockingReviews: blockingRows.map((row) => row.id),
      missing: unique(blockingRows.flatMap((row) => row.missing)),
      agentDecision: productionReady
        ? 'final-use-approved'
        : 'collect-final-use-review-evidence',
    },
    reviews: {
      practiceValidationReview,
      ownerSignoffReview,
      evidenceRegister,
      launchReadinessReport,
    },
    agentUse: {
      readApi: 'getFinalUseReleaseReview',
      relatedApis: [
        'getLaunchReadinessReport',
        'getPhase3PracticeValidationReview',
        'getPhase3OwnerSignoffReview',
        'getPhase3EvidenceRegister',
      ],
      rule: 'Do not treat Phase 5 completion as final-use approval; this review is accepted only when all composed reviews and owner deployment approval are accepted.',
    },
  };
}

function reviewRow(id, readApi, summary = {}, acceptedField) {
  const accepted = summary?.[acceptedField] === true;
  return {
    id,
    readApi,
    acceptedField,
    accepted,
    status: accepted ? 'ACCEPTED' : 'REVIEW_REQUIRED',
    missing: Array.isArray(summary?.missing) ? [...summary.missing] : [],
    agentDecision: summary?.agentDecision || 'review-data-not-provided',
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
