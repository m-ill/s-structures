export const PHASE3_PRACTICE_VALIDATION_REVIEW_VERSION = 'p3-practice-validation-review-v1';

const ROWS = [
  row('drawing-import', ['P3-M6', 'P3-M7'], [
    'real office DXF fixture set',
    'external DWG converter path and conversion log',
    'visual overlay evidence for import review',
  ], ['getPhase3ImportMilestoneReview', 'getPhase3DrawingImportValidationReview'], ['docs/verification/P3_M6_IMPORT_VERIFICATION.md', 'docs/verification/P3_M7_IMPORT_REVIEW_VERIFICATION.md']),
  row('point-cloud-import', ['P3-M8', 'P3-M9'], [
    'owner-provided real point-cloud files',
    'large-file performance record',
    'beam and wall validation without synthetic ground-truth assistance',
  ], ['getPhase3ImportMilestoneReview', 'getPhase3PointCloudValidationReview'], ['docs/verification/P3_M8_POINTCLOUD_LOAD_VERIFICATION.md', 'docs/verification/P3_M9_POINTCLOUD_EXTRACTION_VERIFICATION.md']),
  row('elastic-core', ['P3-M10', 'P3-M11', 'P3-M12', 'P3-M13'], [
    'office-grade KS material and section catalog policy',
    'project-specific KDS load exception review',
    'shell stress recovery, meshing, and production wall/slab validation',
    'dynamic, buckling, and construction-sequence benchmark expansion',
  ], ['getPhase3ElasticMilestoneReview'], ['docs/verification/P3_M10_MATERIAL_LIBRARY_VERIFICATION.md', 'docs/verification/P3_M13_LOADS_DYNAMICS_VERIFICATION.md']),
  row('nonlinear-engine', ['P3-M14', 'P3-M15', 'P3-M16'], [
    'production global nonlinear frame solver certification',
    'simultaneous hinge-controlled equilibrium qualification',
    'distributed plasticity and field-calibrated material validation',
    'production seismic qualification',
  ], ['getPhase3NonlinearMilestoneReview', 'getNonlinearAnalysisTrace'], ['docs/verification/P3_M14_NONLINEAR_GEOMETRY_VERIFICATION.md', 'docs/verification/P3_M16_FIBER_NLTH_VERIFICATION.md']),
  row('detailed-design', ['P3-M17', 'P3-M18'], [
    'final code clause selection',
    'seismic detailing, constructability, and drawing review',
    'fabrication, geotechnical, and permit calculation approval',
  ], ['getPhase3DesignMilestoneReview', 'getP3DetailedDesignReport'], ['docs/verification/DESIGN_MODULE_VERIFICATION.md']),
  row('productization', ['P3-M19', 'P3-M20'], [
    'final structural sign-off',
    'open-source license policy finalization',
    'deployment target selection',
    'field pilot feedback and backup restore owner acceptance',
  ], ['getPhase3ProductizationMilestoneReview', 'getLaunchReadinessReport'], ['docs/phase3/P3_COMPLETION_AUDIT_2026-07-02.md', 'docs/verification/P3_M20_LAUNCH_READINESS_VERIFICATION.md']),
];

export function buildPhase3PracticeValidationReview() {
  const rows = ROWS.map(copyRow);
  return {
    version: PHASE3_PRACTICE_VALIDATION_REVIEW_VERSION,
    scope: 'Phase 3 practical validation items before production structural-office use',
    sourceDocs: [
      'docs/phase3/P3_COMPLETION_AUDIT_2026-07-02.md',
      'docs/phase3/P3_IMPLEMENTATION_AUDIT_2026-07-02.md',
      'docs/phase3/QA_RELEASE_PLAN.md',
      'docs/verification/P3_M6_M20_COMPLETION_AUDIT.md',
    ],
    rows,
    summary: {
      rowCount: rows.length,
      affectedMilestones: [...new Set(rows.flatMap((item) => item.milestones))],
      requiredEvidenceCount: rows.reduce((sum, item) => sum + item.requiredEvidence.length, 0),
      productionReady: false,
      ownerReviewRequired: true,
      agentDecision: 'collect-practice-validation-evidence-before-production-use',
    },
    agentUse: {
      readApi: 'getPhase3PracticeValidationReview',
      rule: 'Treat this as the practical validation checklist after automated Phase 3 gates pass.',
      finalApprovalFields: [
        'productionEquilibriumSolver',
        'productionHingeEquilibriumLoop',
        'productionSeismicQualification',
        'finalPermitDesign',
        'finalStructuralSignoff',
        'productionDeploymentApproved',
      ],
    },
  };
}

function row(id, milestones, requiredEvidence, readApis, sourceDocs) {
  return {
    id,
    milestones,
    status: 'owner-review-required',
    requiredEvidence,
    readApis,
    sourceDocs,
    productionBlocker: true,
  };
}

function copyRow(item) {
  return {
    ...item,
    milestones: [...item.milestones],
    requiredEvidence: [...item.requiredEvidence],
    readApis: [...item.readApis],
    sourceDocs: [...item.sourceDocs],
  };
}
