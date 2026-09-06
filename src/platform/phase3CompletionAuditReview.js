export const PHASE3_COMPLETION_AUDIT_REVIEW_VERSION = 'p3-m0-m20-completion-audit-review-v2';

const ROWS = [
  row('P3-M0', 'proven', ['tests/m0-smoke.mjs', 'tests/p3-plan-alignment.mjs'], [], ['getPhase3PlanAlignment']),
  row('P3-M1', 'proven', ['tests/p3-server-api.mjs', 'tests/p3-server-route-contract.mjs'], [], ['server API contract']),
  row('P3-M2', 'proven', ['tests/p3-auth.mjs'], [], ['server auth contract']),
  row('P3-M3', 'proven', ['tests/p3-persistence.mjs'], [], ['persistence client contract']),
  row('P3-M4', 'proven', ['tests/p3-app-shell.mjs', 'tests/p3-viewer-core.mjs'], [], ['getCapabilities']),
  row('P3-M5', 'proven', ['tests/p3-import-geometry.mjs'], [], ['listImportCandidates']),
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

const EXIT_CRITERIA = {
  'P3-M0': [
    criterion('M0-E1', 'Phase 3 document set, file map, version marker, and zero-dependency policy are traceable.', 'tests/m0-smoke.mjs', 'docs/phase3/DEVELOPMENT_FILE_MAP.md'),
    criterion('M0-E2', 'Plan-alignment report maps source documents, stages, milestones, requirements, and architecture decisions.', 'tests/p3-plan-alignment.mjs', 'docs/phase3/ROADMAP.md'),
  ],
  'P3-M1': [
    criterion('M1-E1', 'Node HTTP server, static serving, REST envelope, and project CRUD API are contract-tested.', 'tests/p3-server-api.mjs', 'docs/phase3/SERVER_API_PLAN.md'),
    criterion('M1-E2', 'Revision snapshot and 10MB-style persistence path remain covered by server API tests.', 'tests/p3-server-api.mjs', 'docs/phase3/SERVER_API_PLAN.md'),
    criterion('M1-E3', 'Route table and permissions stay aligned with the server API plan.', 'tests/p3-server-route-contract.mjs', 'docs/phase3/SERVER_API_PLAN.md'),
  ],
  'P3-M2': [
    criterion('M2-E1', 'scrypt password hashing, timing-safe comparison, HMAC token expiry, and role guard behavior are tested.', 'tests/p3-auth.mjs', 'docs/phase3/AUTH_ACCOUNT_PLAN.md'),
    criterion('M2-E2', 'Rate limit, lockout, and security checklist evidence remain visible for launch review.', 'tests/p3-auth.mjs', 'docs/phase3/AUTH_ACCOUNT_PLAN.md'),
  ],
  'P3-M3': [
    criterion('M3-E1', 'Local, file, and server persistence round trips use the Phase 3 snapshot envelope.', 'tests/p3-persistence.mjs', 'docs/phase3/PERSISTENCE_PLAN.md'),
    criterion('M3-E2', 'Autosave recovery, revision restore, migration, and lineage warning behavior are regression-tested.', 'tests/p3-persistence.mjs', 'docs/phase3/PERSISTENCE_PLAN.md'),
  ],
  'P3-M4': [
    criterion('M4-E1', 'App shell routes, login-to-modeler flow, project browser, and agent capability manifest are covered.', 'tests/p3-app-shell.mjs', 'docs/phase3/FRONTEND_PLAN.md'),
    criterion('M4-E2', 'Viewer camera, point-cloud/model layer contracts, slice control, and picking data remain testable without mutating the model.', 'tests/p3-viewer-core.mjs', 'docs/phase3/FRONTEND_PLAN.md'),
  ],
  'P3-M5': [
    criterion('M5-E1', 'Tolerance merge, duplicate cleanup, story/grid extraction, and member classification geometry helpers are tested.', 'tests/p3-import-geometry.mjs', 'docs/phase3/IMPORT_DXF_DWG_PLAN.md'),
    criterion('M5-E2', 'ImportCandidate contract validates nodes, members, sources, and review-required candidate flow.', 'tests/p3-import-geometry.mjs', 'docs/phase3/ARCHITECTURE.md'),
    criterion('M5-E3', 'Agent-facing import APIs expose list, resolve, and confirm workflow for later DXF/DWG/point-cloud imports.', 'tests/p3-import-geometry.mjs', 'docs/phase3/FRONTEND_PLAN.md'),
  ],
};

export function buildPhase3CompletionAuditReview() {
  const rows = ROWS.map(copyRow);
  const byStatus = rows.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  return {
    version: PHASE3_COMPLETION_AUDIT_REVIEW_VERSION,
    scope: 'P3-M0 to P3-M20 completion audit from existing Phase 3 audit documents',
    sourceDocs: [
      'verification/specs/P3_M6_M20_COMPLETION_AUDIT.md',
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
      exitCriteriaCount: rows.reduce((sum, item) => sum + item.exitCriteria.length, 0),
      exitCriteriaAutomatedCount: rows.reduce((sum, item) => sum + item.exitCriteria.filter((criteria) => criteria.status === 'automated').length, 0),
      productionReady: false,
      completionClaim: 'phase3-m0-m20-repository-traceability-green-owner-and-engineer-review-required',
      agentDecision: 'continue-practical-validation-before-production-use',
    },
    agentUse: {
      readApi: 'getPhase3CompletionAuditReview',
      relatedApis: [
        'getPhase3PlanAlignment',
        'getPhase3PracticeValidationReview',
        'getPhase3OwnerSignoffReview',
      ],
      rule: 'Use this audit as the P3-M0 to P3-M20 completion status map; preliminary or manual rows block production-ready claims.',
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
  const criteria = EXIT_CRITERIA[item.milestone] || [];
  return {
    ...item,
    evidence: [...item.evidence],
    productionBlockers: [...item.productionBlockers],
    readApis: [...item.readApis],
    exitCriteria: criteria.map((criteriaRow) => ({ ...criteriaRow })),
    exitCriteriaSummary: summarizeExitCriteria(criteria),
  };
}

function criterion(id, requirement, evidence, source) {
  return {
    id,
    requirement,
    evidence,
    source,
    status: 'automated',
  };
}

function summarizeExitCriteria(criteria = []) {
  const automated = criteria.filter((item) => item.status === 'automated').length;
  if (criteria.length === 0) {
    return {
      total: 0,
      automated: 0,
      reviewRequired: 0,
      status: 'delegated-to-milestone-review',
    };
  }
  return {
    total: criteria.length,
    automated,
    reviewRequired: criteria.length - automated,
    status: criteria.length === automated ? 'automated-exit-criteria-covered' : 'exit-criteria-review-required',
  };
}
