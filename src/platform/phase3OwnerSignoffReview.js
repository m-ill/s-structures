export const PHASE3_OWNER_SIGNOFF_REVIEW_VERSION = 'p3-owner-signoff-review-v1';

export const PHASE3_OWNER_SIGNOFF_REQUIRED_EVIDENCE = [
  item('license-policy', 'License policy', 'owner license policy', 'openSourcePolicyFinalized', ['owner-license-policy']),
  item('deployment-target', 'Deployment target', 'deployment target', 'deploymentTargetFinalized', ['deployment-target-selection']),
  item('real-dwg-conversion', 'Real DWG conversion', 'real DWG conversion', 'realDwgConversionAccepted', ['external-dwg-converter-log']),
  item('real-pointcloud-validation', 'Real point-cloud validation', 'real point-cloud validation', 'realPointCloudValidationAccepted', ['real-scan-extraction-validation']),
  item('field-pilot-feedback', 'Field pilot feedback', 'field pilot feedback', 'pilotFeedbackOwnerAccepted', ['field-pilot-feedback']),
  item('backup-restore', 'Backup restore rehearsal', 'backup restore rehearsal evidence', 'backupRestoreOwnerAccepted', ['backup-restore-rehearsal']),
  item('security-signoff', 'Security sign-off', 'security sign-off', 'securitySignoffAccepted', ['security-signoff']),
];

export function buildPhase3OwnerSignoffReview(input = {}) {
  const evidence = normalizeEvidence(input.evidence || input.signoffEvidence || input.items || []);
  const rows = PHASE3_OWNER_SIGNOFF_REQUIRED_EVIDENCE.map((required) => {
    const aliases = new Set([required.id, ...(required.aliases || [])]);
    const match = evidence.find((row) => aliases.has(row.id) || row.type === required.type || row.type === required.label);
    const accepted = match?.accepted === true || match?.status === 'accepted';
    return {
      ...required,
      accepted,
      status: accepted ? 'ACCEPTED' : 'OWNER_REVIEW_REQUIRED',
      owner: match?.owner || null,
      recordedAt: match?.recordedAt || null,
      note: match?.note || null,
      acceptedFrom: match?.id || null,
    };
  });
  const missing = rows.filter((row) => !row.accepted).map((row) => row.id);
  return {
    version: PHASE3_OWNER_SIGNOFF_REVIEW_VERSION,
    milestone: 'P3-M20',
    tickets: ['P3-T63', 'P3-T64', 'P3-T65', 'P3-T66', 'P3-T67'],
    scope: 'Owner sign-off evidence required after automated P3-M20 launch gates pass.',
    sourceDocs: [
      'reports/launch-readiness/owner-signoff-checklist.md',
      'docs/phase3/QA_RELEASE_PLAN.md',
      'docs/verification/P3_M20_LAUNCH_READINESS_VERIFICATION.md',
      'docs/verification/P3_M6_M20_COMPLETION_AUDIT.md',
    ],
    summary: {
      requiredCount: rows.length,
      acceptedCount: rows.filter((row) => row.accepted).length,
      missing,
      ownerReviewRequired: true,
      productionReady: false,
      productionDeploymentApproved: false,
      agentDecision: missing.length
        ? 'collect-owner-signoff-evidence'
        : 'owner-signoff-ready-for-final-deployment-decision',
    },
    rows,
    requiredEvidence: PHASE3_OWNER_SIGNOFF_REQUIRED_EVIDENCE.map((row) => ({ ...row })),
    finalApprovalFields: PHASE3_OWNER_SIGNOFF_REQUIRED_EVIDENCE.map((row) => row.finalApprovalField),
    agentUse: {
      readApi: 'getPhase3OwnerSignoffReview',
      relatedApis: [
        'getLaunchReadinessReport',
        'getPhase3ProductizationMilestoneReview',
        'getPhase3PracticeValidationReview',
      ],
      rule: 'Do not mark production deployment approved from this review alone; final owner deployment approval remains manual.',
    },
  };
}

function item(id, label, type, finalApprovalField, aliases = []) {
  return { id, label, type, finalApprovalField, aliases };
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
