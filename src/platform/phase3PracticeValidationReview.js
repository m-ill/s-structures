export const PHASE3_PRACTICE_VALIDATION_REVIEW_VERSION = 'p3-practice-validation-review-v3';

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
  ], ['getPhase3NonlinearMilestoneReview', 'getPhase3EngineeringValidationReview', 'getNonlinearAnalysisTrace'], ['docs/verification/P3_M14_NONLINEAR_GEOMETRY_VERIFICATION.md', 'docs/verification/P3_M16_FIBER_NLTH_VERIFICATION.md']),
  row('detailed-design', ['P3-M17', 'P3-M18'], [
    'final code clause selection',
    'seismic detailing, constructability, and drawing review',
    'fabrication, geotechnical, and permit calculation approval',
  ], ['getPhase3DesignMilestoneReview', 'getPhase3EngineeringValidationReview', 'getP3DetailedDesignReport'], ['docs/verification/DESIGN_MODULE_VERIFICATION.md']),
  row('productization', ['P3-M19', 'P3-M20'], [
    'final structural sign-off',
    'open-source license policy finalization',
    'deployment target selection',
    'field pilot feedback and backup restore owner acceptance',
  ], ['getPhase3ProductizationMilestoneReview', 'getLaunchReadinessReport'], ['docs/phase3/P3_COMPLETION_AUDIT_2026-07-02.md', 'docs/verification/P3_M20_LAUNCH_READINESS_VERIFICATION.md']),
];

const EVIDENCE_IDS_BY_DOMAIN = {
  'drawing-import': ['real-office-dxf-fixtures', 'external-dwg-converter-log', 'import-review-overlay'],
  'point-cloud-import': ['real-pointcloud-files', 'large-pointcloud-performance', 'real-scan-extraction-validation'],
  'elastic-core': [
    'office-grade-ks-catalog-policy',
    'project-kds-load-review',
    'shell-wall-slab-production-validation',
    'dynamic-buckling-construction-benchmark',
  ],
  'nonlinear-engine': [
    'nonlinear-solver-certification',
    'simultaneous-hinge-equilibrium-qualification',
    'hinge-fiber-nlth-qualification',
    'distributed-plasticity-material-validation',
    'production-seismic-qualification',
  ],
  'detailed-design': [
    'final-code-clause-selection',
    'seismic-detailing-drawing-review',
    'detailing-constructability-approval',
    'fabrication-geotechnical-permit-approval',
  ],
  productization: [
    'final-structural-signoff',
    'owner-license-policy',
    'deployment-target-selection',
    'field-pilot-feedback',
    'backup-restore-rehearsal',
    'security-signoff',
  ],
};

export function buildPhase3PracticeValidationReview(input = {}) {
  const evidence = normalizeEvidence(input.evidence || input.projectEvidence || []);
  const rows = ROWS.map((item) => copyRow(item, evidence));
  const missing = rows.filter((item) => item.evidenceCoverage.missing.length).map((item) => item.id);
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
      requiredEvidenceIdCount: rows.reduce((sum, item) => sum + item.evidenceCoverage.requiredIds.length, 0),
      evidenceAcceptedCount: rows.reduce((sum, item) => sum + item.evidenceCoverage.acceptedCount, 0),
      missing,
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

function copyRow(item, evidence) {
  const evidenceCoverage = buildEvidenceCoverage(item.id, evidence);
  return {
    ...item,
    milestones: [...item.milestones],
    requiredEvidence: [...item.requiredEvidence],
    readApis: [...item.readApis],
    sourceDocs: [...item.sourceDocs],
    evidenceCoverage,
  };
}

function buildEvidenceCoverage(domain, evidence) {
  const requiredIds = EVIDENCE_IDS_BY_DOMAIN[domain] || [];
  const rows = requiredIds.map((id) => {
    const matches = evidence.filter((item) => item.id === id);
    const accepted = matches.some((item) => item.accepted === true || item.status === 'accepted');
    return {
      id,
      accepted,
      evidenceCount: matches.length,
      fileIds: matches.map((item) => item.fileId).filter(Boolean),
      reportPaths: matches.map((item) => item.reportPath || item.reviewReportPath).filter(Boolean),
    };
  });
  return {
    requiredIds,
    acceptedCount: rows.filter((row) => row.accepted).length,
    missing: rows.filter((row) => !row.accepted).map((row) => row.id),
    rows,
  };
}

function normalizeEvidence(evidence) {
  if (Array.isArray(evidence)) return evidence.map(normalizeRow);
  return Object.entries(evidence || {}).map(([id, value]) => normalizeRow({ id, ...(value || {}) }));
}

function normalizeRow(row = {}) {
  return {
    ...row,
    id: String(row.id || '').trim(),
    status: String(row.status || '').trim().toLowerCase(),
    accepted: row.accepted === true,
  };
}
