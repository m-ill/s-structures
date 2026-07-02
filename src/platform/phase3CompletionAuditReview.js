export const PHASE3_COMPLETION_AUDIT_REVIEW_VERSION = 'p3-m6-m20-completion-audit-review-v1';

const ROWS = [
  row('P3-M6', 'proven', ['tests/p3-m6-dxf-import.mjs'], [], ['getPhase3ImportMilestoneReview']),
  row('P3-M7', 'preliminary', ['tests/p3-m7-dwg-plan.mjs', 'tests/p3-m7-import-review-ui.mjs'], ['real DWG conversion remains external-tool dependent'], ['getPhase3DrawingImportValidationReview']),
  row('P3-M8', 'preliminary', ['tests/p3-pointcloud-load.mjs'], ['large point-cloud performance and binary-file validation'], ['getPhase3PointCloudValidationReview']),
  row('P3-M9', 'preliminary', ['tests/p3-pointcloud-extraction.mjs', 'tests/p3-pointcloud-e2e.mjs'], ['real field scan validation'], ['getPhase3PointCloudValidationReview']),
  row('P3-M10', 'preliminary', ['tests/p3-m10-materials.mjs', 'tests/p3-section-properties.mjs'], ['office-grade KS catalog policy'], ['getPhase3ElasticMilestoneReview']),
  row('P3-M11', 'preliminary', ['tests/p3-m11-elastic-expansion.mjs'], ['solver hardening for combination-specific active states'], ['getPhase3ElasticMilestoneReview']),
  row('P3-M12', 'preliminary', ['tests/p3-m12-wall-slab.mjs'], ['full shell finite-element stress recovery and meshing'], ['getPhase3ElasticMilestoneReview']),
  row('P3-M13', 'preliminary', ['tests/p3-m13-loads-dynamics.mjs'], ['project-specific KDS code exception review'], ['getPhase3ElasticMilestoneReview']),
  row('P3-M14', 'preliminary', ['tests/p3-m14-nonlinear-geometry.mjs'], ['production nonlinear frame solver certification'], ['getPhase3NonlinearMilestoneReview', 'getPhase3EngineeringValidationReview']),
  row('P3-M15', 'preliminary', ['tests/p3-m15-nonlinear-hinge-control.mjs'], ['simultaneous hinge-controlled equilibrium qualification'], ['getPhase3NonlinearMilestoneReview', 'getPhase3EngineeringValidationReview']),
  row('P3-M16', 'preliminary', ['tests/p3-m16-nonlinear-fiber-nlth.mjs'], ['production seismic qualification and owner record review'], ['getPhase3NonlinearMilestoneReview', 'getPhase3EngineeringValidationReview']),
  row('P3-M17', 'preliminary', ['tests/p3-design-rc.mjs'], ['final code clause selection and drawing production'], ['getPhase3DesignMilestoneReview', 'getPhase3EngineeringValidationReview']),
  row('P3-M18', 'preliminary', ['tests/p3-design-steel-foundation.mjs'], ['fabrication, geotechnical, and permit calculation approval'], ['getPhase3DesignMilestoneReview', 'getPhase3EngineeringValidationReview']),
  row('P3-M19', 'preliminary', ['tests/p3-m19-integrated-report.mjs'], ['final structural sign-off'], ['getPhase3ProductizationMilestoneReview']),
  row('P3-M20', 'manual', ['tests/p3-launch-gate.mjs', 'tests/p3-owner-signoff-review.mjs'], ['owner deployment approval and sign-off evidence'], ['getLaunchReadinessReport', 'getPhase3OwnerSignoffReview']),
];

export function buildPhase3CompletionAuditReview() {
  const rows = ROWS.map(copyRow);
  const byStatus = rows.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  return {
    version: PHASE3_COMPLETION_AUDIT_REVIEW_VERSION,
    scope: 'P3-M6 to P3-M20 completion audit from existing Phase 3 audit documents',
    sourceDocs: [
      'docs/verification/P3_M6_M20_COMPLETION_AUDIT.md',
      'docs/phase3/P3_COMPLETION_AUDIT_2026-07-02.md',
      'docs/phase3/P3_IMPLEMENTATION_AUDIT_2026-07-02.md',
      'docs/phase3/ROADMAP.md',
      'docs/phase3/IMPLEMENTATION_BACKLOG.md',
    ],
    rows,
    summary: {
      milestoneCount: rows.length,
      provenCount: byStatus.proven || 0,
      preliminaryCount: byStatus.preliminary || 0,
      manualCount: byStatus.manual || 0,
      productionReady: false,
      completionClaim: 'repository-traceability-green-owner-and-engineer-review-required',
      agentDecision: 'continue-practical-validation-before-production-use',
    },
    agentUse: {
      readApi: 'getPhase3CompletionAuditReview',
      relatedApis: [
        'getPhase3PlanAlignment',
        'getPhase3PracticeValidationReview',
        'getPhase3OwnerSignoffReview',
      ],
      rule: 'Use this audit as the Phase 3 completion status map; preliminary or manual rows block production-ready claims.',
    },
  };
}

function row(milestone, status, evidence, blockers, readApis) {
  return {
    milestone,
    status,
    evidence,
    productionBlockers: blockers,
    readApis,
    productionReady: status === 'proven',
  };
}

function copyRow(item) {
  return {
    ...item,
    evidence: [...item.evidence],
    productionBlockers: [...item.productionBlockers],
    readApis: [...item.readApis],
  };
}
