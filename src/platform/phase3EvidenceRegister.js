export const PHASE3_EVIDENCE_REGISTER_VERSION = 'p3-evidence-register-v3';
export const PHASE3_FINAL_APPROVAL_FIELDS = [
  'productionEquilibriumSolver',
  'productionHingeEquilibriumLoop',
  'productionSeismicQualification',
  'finalPermitDesign',
  'finalStructuralSignoff',
  'productionDeploymentApproved',
  'ownerProductionDeploymentApproved',
  'finalOwnerDeploymentApproval',
  'openSourcePolicyFinalized',
  'deploymentTargetFinalized',
  'realDwgConversionAccepted',
  'realPointCloudValidationAccepted',
  'pilotFeedbackOwnerAccepted',
  'backupRestoreOwnerAccepted',
  'securitySignoffAccepted',
  'ownerFinalSignoff',
];

export const PHASE3_REQUIRED_EVIDENCE = [
  req('real-office-dxf-fixtures', 'drawing-import', 'P3-M6', 'real office DXF fixture set'),
  req('external-dwg-converter-log', 'drawing-import', 'P3-M7', 'external DWG converter path and conversion log'),
  req('import-review-overlay', 'drawing-import', 'P3-M7', 'visual overlay evidence for import review'),
  req('real-pointcloud-files', 'point-cloud-import', 'P3-M8', 'owner-provided real point-cloud files'),
  req('large-pointcloud-performance', 'point-cloud-import', 'P3-M8', 'large-file performance record'),
  req('real-scan-extraction-validation', 'point-cloud-import', 'P3-M9', 'beam and wall validation without synthetic ground-truth assistance'),
  req('office-grade-ks-catalog-policy', 'elastic-core', 'P3-M10', 'office-grade KS material and section catalog policy'),
  req('project-kds-load-review', 'elastic-core', 'P3-M13', 'project-specific KDS load exception review'),
  req('shell-wall-slab-production-validation', 'elastic-core', 'P3-M12', 'shell stress recovery, meshing, and production wall/slab validation'),
  req('dynamic-buckling-construction-benchmark', 'elastic-core', 'P3-M13', 'dynamic, buckling, and construction-sequence benchmark expansion'),
  req('nonlinear-solver-certification', 'nonlinear-engine', 'P3-M14', 'production nonlinear solver certification'),
  req('simultaneous-hinge-equilibrium-qualification', 'nonlinear-engine', 'P3-M15', 'simultaneous hinge-controlled equilibrium qualification'),
  req('hinge-fiber-nlth-qualification', 'nonlinear-engine', 'P3-M16', 'hinge equilibrium, PMM, fiber, or NLTH qualification'),
  req('distributed-plasticity-material-validation', 'nonlinear-engine', 'P3-M16', 'distributed plasticity and field-calibrated material validation'),
  req('production-seismic-qualification', 'nonlinear-engine', 'P3-M16', 'production seismic qualification'),
  req('final-code-clause-selection', 'detailed-design', 'P3-M17', 'final KDS code clause selection'),
  req('seismic-detailing-drawing-review', 'detailed-design', 'P3-M18', 'seismic detailing, constructability, and drawing review'),
  req('detailing-constructability-approval', 'detailed-design', 'P3-M18', 'detailing, constructability, fabrication, or geotechnical approval'),
  req('fabrication-geotechnical-permit-approval', 'detailed-design', 'P3-M18', 'fabrication, geotechnical, and permit calculation approval'),
  req('final-structural-signoff', 'productization', 'P3-M19', 'final structural sign-off'),
  req('owner-license-policy', 'productization', 'P3-M20', 'owner license policy'),
  req('deployment-target-selection', 'productization', 'P3-M20', 'deployment target'),
  req('field-pilot-feedback', 'productization', 'P3-M20', 'field pilot feedback'),
  req('backup-restore-rehearsal', 'productization', 'P3-M20', 'backup restore rehearsal evidence'),
  req('security-signoff', 'productization', 'P3-M20', 'security sign-off'),
];

export function validatePhase3EvidenceRecord(record = {}) {
  const normalized = normalizeRow(record);
  const idAllowed = PHASE3_REQUIRED_EVIDENCE.some((item) => item.id === normalized.id);
  const typeAllowed = PHASE3_REQUIRED_EVIDENCE.some((item) => item.label === normalized.type);
  const ok = idAllowed || typeAllowed;
  return {
    ok,
    record: normalized,
    reason: ok ? null : 'unknown-phase3-evidence',
    allowedIds: PHASE3_REQUIRED_EVIDENCE.map((item) => item.id),
  };
}

export function buildPhase3FinalApprovals(evidence = []) {
  const approvals = {};
  normalizeEvidence(evidence).forEach((row) => {
    const field = normalizeFinalApprovalField(row.finalApprovalField);
    if (field && finalApprovalAccepted(row)) approvals[field] = true;
  });
  return approvals;
}

export function buildPhase3FinalApprovalReview(input = {}) {
  const approvals = input.finalApprovals || input.approvals || buildPhase3FinalApprovals(input.evidence || input.items || []);
  const rows = PHASE3_FINAL_APPROVAL_FIELDS.map((field) => ({
    field,
    accepted: approvals[field] === true,
    status: approvals[field] === true ? 'ACCEPTED' : 'APPROVAL_REQUIRED',
  }));
  const missing = rows.filter((row) => !row.accepted).map((row) => row.field);
  return {
    requiredFields: [...PHASE3_FINAL_APPROVAL_FIELDS],
    acceptedCount: rows.length - missing.length,
    requiredCount: rows.length,
    complete: missing.length === 0,
    missing,
    rows,
    agentDecision: missing.length ? 'collect-final-approval-fields' : 'final-approval-fields-complete',
  };
}

export function normalizeFinalApprovalField(field) {
  const value = String(field || '').trim();
  return PHASE3_FINAL_APPROVAL_FIELDS.includes(value) ? value : null;
}

export function buildPhase3EvidenceRegister(input = {}) {
  const evidence = normalizeEvidence(input.evidence || input.items || []);
  const rows = PHASE3_REQUIRED_EVIDENCE.map((required) => {
    const matches = evidence.filter((item) => item.id === required.id || item.type === required.label);
    const accepted = matches.some((item) => item.accepted || item.status === 'accepted');
    return {
      ...required,
      status: accepted ? 'ACCEPTED' : 'MISSING',
      accepted,
      evidenceCount: matches.length,
      records: matches.map(copyRecord),
    };
  });
  const missing = rows.filter((row) => !row.accepted).map((row) => row.id);
  const evidenceComplete = missing.length === 0;
  return {
    version: PHASE3_EVIDENCE_REGISTER_VERSION,
    scope: 'Structured Phase 3 field, engineering, and owner evidence register',
    sourceDocs: [
      'docs/phase3/IMPORT_DXF_DWG_PLAN.md',
      'docs/phase3/IMPORT_POINT_CLOUD_PLAN.md',
      'docs/phase3/QA_RELEASE_PLAN.md',
      'docs/verification/P3_M6_M20_COMPLETION_AUDIT.md',
    ],
    rows,
    summary: {
      requiredCount: rows.length,
      acceptedCount: rows.filter((row) => row.accepted).length,
      missing,
      evidenceComplete,
      productionReady: false,
      agentDecision: evidenceComplete ? 'phase3-evidence-ready-for-owner-and-engineer-review' : 'collect-phase3-evidence',
    },
    agentUse: {
      readApi: 'getPhase3EvidenceRegister',
      relatedApis: [
        'getPhase3DrawingImportValidationReview',
        'getPhase3PointCloudValidationReview',
        'getPhase3EngineeringValidationReview',
        'getPhase3OwnerSignoffReview',
        'getPhase3CompletionAuditReview',
      ],
      rule: 'Evidence acceptance records readiness for review; it does not approve production deployment or final structural design.',
    },
  };
}

function req(id, domain, milestone, label) {
  return { id, domain, milestone, label };
}

function normalizeEvidence(evidence) {
  if (Array.isArray(evidence)) return evidence.map(normalizeRow);
  return Object.entries(evidence || {}).map(([id, value]) => normalizeRow({ id, ...(value || {}) }));
}

function normalizeRow(row = {}) {
  return {
    ...row,
    id: String(row.id || '').trim(),
    type: String(row.type || '').trim(),
    status: String(row.status || '').trim().toLowerCase(),
    accepted: row.accepted === true,
  };
}

function finalApprovalAccepted(row = {}) {
  return row.finalApprovalAccepted === true ||
    row.approvalAccepted === true ||
    row.approved === true;
}

function copyRecord(row) {
  return {
    id: row.id,
    type: row.type || null,
    status: row.status || null,
    accepted: row.accepted === true || row.status === 'accepted',
    fileId: row.fileId || null,
    reviewer: row.reviewer || row.owner || null,
    reportPath: row.reportPath || row.reviewReportPath || null,
    recordedAt: row.recordedAt || null,
  };
}
