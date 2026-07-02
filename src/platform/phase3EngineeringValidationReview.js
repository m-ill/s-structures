export const PHASE3_ENGINEERING_VALIDATION_REVIEW_VERSION = 'p3-engineering-validation-review-v2';

const PROJECT_EVIDENCE_MAP = {
  'nonlinear-solver-certification': {
    target: 'nonlinearEvidence',
    category: 'nonlinear',
    evidenceType: 'production nonlinear benchmark or solver certification',
    milestone: 'P3-M14',
  },
  'hinge-fiber-nlth-qualification': {
    target: 'nonlinearEvidence',
    category: 'nonlinear',
    evidenceType: 'hinge equilibrium, PMM, fiber, or NLTH qualification',
    milestone: 'P3-M16',
  },
  'final-code-clause-selection': {
    target: 'designEvidence',
    category: 'design',
    evidenceType: 'final code clause selection',
    milestone: 'P3-M17',
  },
  'detailing-constructability-approval': {
    target: 'designEvidence',
    category: 'design',
    evidenceType: 'detailing, constructability, fabrication, or geotechnical approval',
    milestone: 'P3-M18',
  },
};

export function buildPhase3EngineeringValidationReview(input = {}) {
  const projectEvidence = projectEvidenceToRows(input.evidence || input.projectEvidence || []);
  const nonlinearRows = buildRows([...(input.nonlinearEvidence || []), ...projectEvidence.nonlinearEvidence], 'nonlinear');
  const designRows = buildRows([...(input.designEvidence || []), ...projectEvidence.designEvidence], 'design');
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
      projectEvidenceAcceptedCount: projectEvidence.acceptedCount,
      agentDecision: missing.length ? 'collect-engineering-validation-evidence' : 'engineering-package-ready-for-signoff-review',
    },
    groups,
    nonlinearRows,
    designRows,
    projectEvidenceCoverage: projectEvidence.coverage,
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

function projectEvidenceToRows(evidence) {
  const rows = { nonlinearEvidence: [], designEvidence: [] };
  const normalized = normalizeEvidence(evidence);
  const coverageRows = Object.entries(PROJECT_EVIDENCE_MAP).map(([id, spec]) => {
    const matches = normalized.filter((item) => item.id === id);
    const acceptedMatches = matches.filter((item) => item.accepted === true || item.status === 'accepted');
    for (const item of acceptedMatches) {
      rows[spec.target].push({
        id: item.id,
        category: spec.category,
        milestone: spec.milestone,
        evidenceType: spec.evidenceType,
        status: 'accepted',
        accepted: true,
        reviewer: item.reviewer || item.owner || null,
        reportPath: item.reportPath || item.reviewReportPath || null,
        fileId: item.fileId || null,
        notes: item.notes || [],
      });
    }
    return {
      id,
      accepted: acceptedMatches.length > 0,
      evidenceCount: matches.length,
      fileIds: matches.map((item) => item.fileId).filter(Boolean),
      reportPaths: matches.map((item) => item.reportPath || item.reviewReportPath).filter(Boolean),
    };
  });
  return {
    ...rows,
    acceptedCount: coverageRows.filter((row) => row.accepted).length,
    coverage: {
      requiredIds: Object.keys(PROJECT_EVIDENCE_MAP),
      missing: coverageRows.filter((row) => !row.accepted).map((row) => row.id),
      rows: coverageRows,
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
    fileId: item.fileId || null,
    accepted: item.accepted === true || item.status === 'accepted',
    notes: item.notes || [],
  }));
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
