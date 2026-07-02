export const PHASE3_ENGINEERING_VALIDATION_REVIEW_VERSION = 'p3-engineering-validation-review-v1';

export function buildPhase3EngineeringValidationReview(input = {}) {
  const nonlinearRows = buildRows(input.nonlinearEvidence || [], 'nonlinear');
  const designRows = buildRows(input.designEvidence || [], 'design');
  const groups = [
    group('nonlinear-benchmark-certification', nonlinearRows, 'production nonlinear benchmark or solver certification'),
    group('hinge-and-fiber-qualification', nonlinearRows, 'hinge equilibrium, PMM, fiber, or NLTH qualification'),
    group('design-code-clause-review', designRows, 'final code clause selection'),
    group('detailing-and-constructability-review', designRows, 'detailing, constructability, fabrication, or geotechnical approval'),
  ];
  const missing = groups.filter((item) => !item.ok).map((item) => item.id);
  return {
    version: PHASE3_ENGINEERING_VALIDATION_REVIEW_VERSION,
    milestone: 'P3-M14/P3-M18',
    tickets: ['P3-T50', 'P3-T55', 'P3-T83', 'P3-T87', 'P3-T91', 'P3-T93', 'P3-T95'],
    sourceDocs: [
      'docs/phase3/NONLINEAR_ENGINE_PLAN.md',
      'docs/phase3/DESIGN_MODULES_PLAN.md',
      'docs/verification/DESIGN_MODULE_VERIFICATION.md',
    ],
    summary: {
      ok: missing.length === 0,
      productionReady: false,
      engineerReviewRequired: true,
      missing,
      nonlinearEvidenceCount: nonlinearRows.length,
      designEvidenceCount: designRows.length,
      agentDecision: missing.length ? 'collect-engineering-validation-evidence' : 'engineering-package-ready-for-signoff-review',
    },
    groups,
    nonlinearRows,
    designRows,
    requiredEvidence: [
      'production nonlinear solver certification',
      'hinge equilibrium, PMM/fiber, and NLTH qualification',
      'final KDS code clause selection',
      'detailing, constructability, fabrication, and geotechnical approval',
    ],
    agentUse: {
      readApi: 'getPhase3EngineeringValidationReview',
      relatedApis: [
        'getPhase3NonlinearMilestoneReview',
        'getPhase3DesignMilestoneReview',
        'getP3DetailedDesignReport',
        'getNonlinearAnalysisTrace',
      ],
      rule: 'Trace readiness is not engineering sign-off; this review records the remaining professional validation evidence.',
    },
  };
}

function buildRows(rows, defaultCategory) {
  return rows.map((item) => ({
    id: item.id || null,
    category: item.category || defaultCategory,
    status: item.status || (item.accepted === true ? 'accepted' : 'pending-review'),
    milestone: item.milestone || null,
    evidenceType: item.evidenceType || null,
    reviewer: item.reviewer || null,
    reportPath: item.reportPath || null,
    accepted: item.accepted === true || item.status === 'accepted',
    notes: item.notes || [],
  }));
}

function group(id, rows, requiredEvidenceType) {
  const okRows = rows.filter((row) => row.accepted && row.evidenceType === requiredEvidenceType);
  return {
    id,
    requiredEvidenceType,
    actualCount: rows.length,
    okCount: okRows.length,
    ok: okRows.length > 0,
  };
}
