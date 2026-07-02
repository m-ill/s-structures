export const LAUNCH_READINESS_VERSION = 'p3-m20-launch-readiness';
export const LAUNCH_READINESS_GATE_VERSION = 'p3-m20-launch-readiness-gate-v1';
const REQUIRED_PILOT_REPORT_FILES = Array.from({ length: 10 }, (_, index) => `pilot-${String(index + 1).padStart(2, '0')}.md`);
export const PERFORMANCE_BUDGETS = [
  budget('pointcloud-load-preprocess', 'Point-cloud load and preprocess', 30, 'seconds'),
  budget('pointcloud-viewer', 'Point-cloud viewer frame rate', 60, 'fps-min'),
  budget('elastic-analysis', 'Representative elastic analysis', 10, 'seconds'),
  budget('nonlinear-pushover', 'Representative pushover per direction', 60, 'seconds'),
  budget('nlth-record', 'Representative NLTH record', 20, 'seconds'),
  budget('design-report', 'Representative design report', 30, 'seconds'),
  budget('server-save', '10MB server snapshot save', 2, 'seconds'),
  budget('initial-load', 'Local initial load', 3, 'seconds'),
];

export function buildLaunchReadinessReport(evidence = {}) {
  const performanceBudgetReview = buildPerformanceBudgetReview(evidence.performanceBudgets || evidence.performanceBudgetRows || []);
  const manualReferencesCurrent = manualReferenceContractMatches(evidence.manifest, evidence.agentContract);
  const agentContractCurrent = agentContractMatches(evidence.manifest, evidence.agentContract);
  const securityEvidence = buildEvidenceRecordReview(evidence.securityEvidence || evidence.securityChecklist, evidence.securityChecklistSigned, 'security-checklist');
  const backupRestoreEvidence = buildEvidenceRecordReview(evidence.backupRestoreEvidence || evidence.backupRestore, evidence.backupRestoreRecorded, 'backup-restore');
  const designVerificationEvidence = buildEvidenceRecordReview(evidence.designVerificationEvidence || evidence.designVerification, evidence.designVerificationRecorded, 'design-verification');
  const gates = [
    gate('G1', 'Full test suite', evidence.fullSuiteGreen === true, 'Automated suite completed with failed 0.'),
    gate('G2', 'Solver and nonlinear benchmarks', evidence.benchmarkGreen === true, 'B1-B8 and elastic benchmark gates passed.'),
    gate('G3', 'Point-cloud synthetic benchmark', evidence.pointCloudGreen === true, 'Synthetic extraction recall/precision gate passed.'),
    gate('G4', 'Representative building pilot', evidence.pilot?.summary?.pilotCount === 10 && evidence.pilot?.summary?.analysisOkCount === 10, 'Ten representative projects generated analysis and review data.'),
    gate('G5', 'Platform workflow e2e', evidence.platformGreen === true, 'Login, project, revision, report, and approval tests passed.'),
    gate('G6', 'Import e2e', evidence.importGreen === true, 'DXF and point-cloud import validation reached analyzable models.'),
    gate('G7', 'Performance budget record', performanceBudgetReview.ok, `Performance budgets ${performanceBudgetReview.passedCount}/${performanceBudgetReview.requiredCount} passed.`),
    gate('G8', 'Security checklist', securityEvidence.ok, 'Security checklist recorded for launch review.'),
    gate('G9', 'User manual refresh', evidence.manual?.updated === true && manualReferencesCurrent, 'Manual includes Phase 3 import, nonlinear, design, report, and agent workflow.'),
    gate('G10', 'Agent contract current', agentContractCurrent, 'Manual agent contract mirrors manifest read APIs.'),
    gate('G11', 'Beta pilot reports', pilotReportsComplete(evidence.pilotReports), 'Ten named beta pilot scenario reports are present.'),
    gate('G12', 'Backup restore rehearsal', backupRestoreEvidence.ok, 'Backup and restore rehearsal record exists.'),
    gate('G13', 'Design module verification', designVerificationEvidence.ok, 'RC, steel, connection, and foundation verification record exists.'),
    gate('G14', 'Calculation package completeness', evidence.notCheckedCount === 0 && evidence.calculationTraceConnected === true, 'Default calculation package has no not-checked chapter and includes trace/limitations.'),
  ];
  const releaseGate = buildLaunchReadinessGate(gates, {
    ...evidence,
    performanceBudgetReview,
    securityEvidence,
    backupRestoreEvidence,
    designVerificationEvidence,
  });
  const finalUseReview = buildFinalUseReview(evidence);
  return {
    version: LAUNCH_READINESS_VERSION,
    releaseGate,
    finalUseReview,
    status: gates.every((item) => item.status === 'OK') ? 'OK' : 'REVIEW',
    finalUseBlocked: finalUseReview.blockingReviews.length > 0,
    agentSafeStatus: buildAgentSafeStatus(gates, releaseGate, finalUseReview),
    gates,
    summary: {
      okCount: gates.filter((item) => item.status === 'OK').length,
      reviewCount: gates.filter((item) => item.status !== 'OK').length,
      total: gates.length,
      ownerReviewReady: releaseGate.releaseReview.status === 'owner-review-ready',
      productionDeploymentApproved: releaseGate.releaseReview.productionDeploymentApproved === true,
      productionReadinessStatus: releaseGate.releaseReview.productionDeploymentApproved === true ? 'PRODUCTION_APPROVED' : 'OWNER_REVIEW_REQUIRED',
      finalUseReviewStatus: finalUseReview.status,
      finalUseBlocked: finalUseReview.blockingReviews.length > 0,
      agentSafeStatus: buildAgentSafeStatus(gates, releaseGate, finalUseReview),
      blockingReviewCount: finalUseReview.blockingReviews.length,
    },
    productionReadiness: buildProductionReadinessSummary(releaseGate, finalUseReview),
    packaging: buildPackagingReadiness(evidence),
    license: buildLicenseReadiness(evidence),
    performanceBudgetReview,
  };
}

function buildAgentSafeStatus(gates, releaseGate, finalUseReview) {
  if (gates.some((item) => item.status !== 'OK')) return 'LAUNCH_EVIDENCE_REVIEW_REQUIRED';
  if (releaseGate.releaseReview?.status !== 'owner-review-ready') return 'OWNER_RELEASE_REVIEW_REQUIRED';
  if (finalUseReview.blockingReviews.length) return 'LAUNCH_EVIDENCE_OK_FINAL_USE_BLOCKED';
  if (releaseGate.releaseReview?.productionDeploymentApproved === true) return 'PRODUCTION_APPROVED';
  return 'OWNER_DEPLOYMENT_APPROVAL_REQUIRED';
}

export function buildLaunchReadinessGate(gates = [], evidence = {}) {
  const coverage = {
    packaging: !!(evidence.files?.indexHtml && evidence.files?.serverMain),
    license: String(evidence.licenseText || '').trim().length > 0,
    manual: evidence.manual?.updated === true,
    manualReferences: manualReferenceContractMatches(evidence.manifest, evidence.agentContract),
    qa: evidence.fullSuiteGreen === true && evidence.benchmarkGreen === true,
    pilotReports: evidence.pilotReports?.count || 0,
    pilotReportFilesComplete: pilotReportsComplete(evidence.pilotReports),
    securityEvidence: evidence.securityEvidence?.ok === true,
    backupRestore: evidence.backupRestoreEvidence?.ok === true,
    designVerificationEvidence: evidence.designVerificationEvidence?.ok === true,
    ownerSignoffChecklist: evidence.ownerSignoffChecklistRecorded === true,
    performanceBudgets: evidence.performanceBudgetReview?.ok === true,
  };
  const ticketCoverage = buildLaunchTicketCoverage(gates, evidence, coverage);
  const releaseReview = buildReleaseReview({ gates, evidence, coverage, ticketCoverage });
  return {
    version: LAUNCH_READINESS_GATE_VERSION,
    milestone: 'P3-M20',
    tickets: ['P3-T63', 'P3-T64', 'P3-T65', 'P3-T66', 'P3-T67'],
    contract: {
      milestone: 'P3-M20',
      tickets: ['P3-T63', 'P3-T64', 'P3-T65', 'P3-T66', 'P3-T67'],
      scope: 'Launch-readiness gate for packaging, license, manual, QA, security, backup, and pilot evidence.',
      featureTicketMap: {
        packagingSmoke: 'P3-T63',
        licensePolicyRecord: 'P3-T64',
        onboardingManualAgentContract: 'P3-T65',
        performanceSecurityGate: 'P3-T66',
        betaPilotReports: 'P3-T67',
      },
      reviewFields: ['summary.ticketCoverage', 'ticketCoverage', 'coverage', 'manualSignoffRequired', 'requiredGates'],
      agentUse: 'Read-only gate for reports and AI-agent inspection of launch-readiness evidence.',
      maturity: 'owner-review-ready',
    },
    requiredGates: gates.map((item) => item.id),
    ok: gates.length === 14 && gates.every((item) => item.status === 'OK'),
    summary: {
      readyForOwnerReview: releaseReview.status === 'owner-review-ready',
      completeTicketCoverage: ticketCoverage.every((row) => row.covered),
      ticketCount: ticketCoverage.length,
      coveredTicketCount: ticketCoverage.filter((row) => row.covered).length,
      gateCount: gates.length,
      okGateCount: gates.filter((item) => item.status === 'OK').length,
      releaseReview,
      ticketCoverage,
    },
    ticketCoverage,
    coverage,
    releaseReview,
    manualSignoffRequired: [
      'owner license policy',
      'deployment target',
      'real DWG conversion',
      'real point-cloud validation',
      'field pilot feedback',
      'backup restore rehearsal evidence',
      'security sign-off',
    ],
  };
}

function buildReleaseReview({ gates, evidence, coverage, ticketCoverage }) {
  const missing = [];
  if (gates.length !== 14 || gates.some((item) => item.status !== 'OK')) missing.push('launch-gates');
  if (!ticketCoverage.every((row) => row.covered)) missing.push('ticket-coverage');
  if (!coverage.pilotReportFilesComplete) missing.push('pilot-report-files');
  if (!coverage.ownerSignoffChecklist) missing.push('owner-signoff-checklist');
  if (!coverage.securityEvidence) missing.push('security-checklist-evidence');
  if (!coverage.backupRestore) missing.push('backup-restore-record');
  if (!coverage.designVerificationEvidence) missing.push('design-verification-evidence');
  if (!coverage.performanceBudgets) missing.push('performance-budget-items');
  if (!coverage.manualReferences) missing.push('manual-reference-contract');
  const approvals = evidence.finalApprovals || evidence.approvals || {};
  const deploymentApproved = missing.length === 0 && (
    evidence.productionDeploymentApproved === true ||
    approvals.productionDeploymentApproved === true ||
    approvals.ownerProductionDeploymentApproved === true ||
    approvals.finalOwnerDeploymentApproval === true
  );
  return {
    status: missing.length ? 'review-required' : 'owner-review-ready',
    maturity: 'preliminary',
    productionDeploymentApproved: deploymentApproved,
    ownerFinalSignoff: approvals.finalStructuralSignoff === true || approvals.ownerFinalSignoff === true,
    openSourcePolicyFinalized: approvals.openSourcePolicyFinalized === true,
    deploymentTargetFinalized: approvals.deploymentTargetFinalized === true,
    realDwgConversionAccepted: approvals.realDwgConversionAccepted === true,
    realPointCloudValidationAccepted: approvals.realPointCloudValidationAccepted === true,
    pilotFeedbackOwnerAccepted: approvals.pilotFeedbackOwnerAccepted === true,
    backupRestoreOwnerAccepted: approvals.backupRestoreOwnerAccepted === true,
    securitySignoffAccepted: approvals.securitySignoffAccepted === true,
    manualSignoffItemCount: 7,
    pilotReportCount: evidence.pilotReports?.count || 0,
    missing,
    agentDecision: missing.length
      ? 'hold-before-release'
      : deploymentApproved
        ? 'owner-production-deployment-approved'
        : 'ready-for-owner-release-signoff',
  };
}

function buildProductionReadinessSummary(releaseGate, finalUseReview) {
  const review = releaseGate.releaseReview || {};
  return {
    version: LAUNCH_READINESS_VERSION,
    status: review.productionDeploymentApproved === true ? 'PRODUCTION_APPROVED' : 'OWNER_REVIEW_REQUIRED',
    ownerReviewReady: review.status === 'owner-review-ready',
    productionDeploymentApproved: review.productionDeploymentApproved === true,
    ownerFinalSignoff: review.ownerFinalSignoff === true,
    openSourcePolicyFinalized: review.openSourcePolicyFinalized === true,
    deploymentTargetFinalized: review.deploymentTargetFinalized === true,
    realDwgConversionAccepted: review.realDwgConversionAccepted === true,
    realPointCloudValidationAccepted: review.realPointCloudValidationAccepted === true,
    pilotFeedbackOwnerAccepted: review.pilotFeedbackOwnerAccepted === true,
    backupRestoreOwnerAccepted: review.backupRestoreOwnerAccepted === true,
    securitySignoffAccepted: review.securitySignoffAccepted === true,
    finalUseReview,
    blockingReviewCount: finalUseReview.blockingReviews.length,
    agentDecision: review.productionDeploymentApproved === true
      ? 'release-approved'
      : finalUseReview.blockingReviews.length
        ? 'collect-final-use-review-evidence'
        : 'wait-for-owner-release-signoff',
  };
}

function buildFinalUseReview(evidence = {}) {
  const rows = [
    reviewRow('practice-validation', evidence.practiceValidationReview?.summary, 'productionReady'),
    reviewRow('owner-signoff', evidence.ownerSignoffReview?.summary, 'productionDeploymentApproved'),
    reviewRow('evidence-register', evidence.evidenceRegister?.summary, 'evidenceComplete'),
  ];
  const blockingReviews = rows.filter((row) => row.status !== 'ACCEPTED').map((row) => row.id);
  return {
    version: LAUNCH_READINESS_VERSION,
    status: blockingReviews.length ? 'FINAL_USE_REVIEW_REQUIRED' : 'FINAL_USE_REVIEW_ACCEPTED',
    rows,
    requiredReviews: rows.map((row) => ({
      id: row.id,
      acceptedField: row.acceptedField,
      status: row.status,
      accepted: row.accepted,
      missingCount: row.missing.length,
      agentDecision: row.agentDecision,
    })),
    blockingReviews,
    rule: 'Launch gate OK is not final structural-office use approval; clear these reviews before production deployment.',
  };
}

function reviewRow(id, summary, acceptedField) {
  const accepted = summary?.[acceptedField] === true;
  return {
    id,
    status: accepted ? 'ACCEPTED' : 'REVIEW_REQUIRED',
    accepted,
    acceptedField,
    missing: Array.isArray(summary?.missing) ? [...summary.missing] : [],
    agentDecision: summary?.agentDecision || 'review-data-not-provided',
  };
}

function buildLaunchTicketCoverage(gates, evidence, coverage) {
  const byId = Object.fromEntries(gates.map((item) => [item.id, item.status === 'OK']));
  const readApis = evidence.agentContract?.readApis?.length || 0;
  const pilotFileCount = pilotReportNames(evidence.pilotReports).length;
  return [
    {
      ticket: 'P3-T63',
      scope: 'packaging-smoke',
      covered: coverage.packaging === true && !!evidence.packageJson?.scripts?.dev,
      evidence: `index=${!!evidence.files?.indexHtml}, server=${!!evidence.files?.serverMain}, mode=${evidence.packageJson?.scripts?.dev ? 'web-server' : 'manual-static'}`,
    },
    {
      ticket: 'P3-T64',
      scope: 'license-policy-record',
      covered: coverage.license === true,
      evidence: `license=${coverage.license ? 'RECORDED' : 'MISSING'}, private=${evidence.packageJson?.private === true}`,
    },
    {
      ticket: 'P3-T65',
      scope: 'onboarding-manual-agent-contract',
      covered: coverage.manual === true && coverage.manualReferences === true && byId.G10 === true,
      evidence: `manual=${coverage.manual ? 'updated' : 'missing'}, manualRefs=${coverage.manualReferences ? 'current' : 'review'}, readApis=${readApis}`,
    },
    {
      ticket: 'P3-T66',
      scope: 'performance-security-launch-gate',
      covered: ['G1', 'G2', 'G3', 'G5', 'G6', 'G7', 'G8', 'G12', 'G13', 'G14'].every((id) => byId[id] === true)
        && coverage.securityEvidence === true
        && coverage.backupRestore === true
        && coverage.designVerificationEvidence === true,
      evidence: `performance=${byId.G7 ? 'OK' : 'REVIEW'} ${evidence.performanceBudgetReview?.passedCount || 0}/${evidence.performanceBudgetReview?.requiredCount || PERFORMANCE_BUDGETS.length}, security=${coverage.securityEvidence ? 'OK' : 'REVIEW'}, backup=${coverage.backupRestore ? 'OK' : 'REVIEW'}, designVerification=${coverage.designVerificationEvidence ? 'OK' : 'REVIEW'}`,
    },
    {
      ticket: 'P3-T67',
      scope: 'beta-pilot-scenarios',
      covered: coverage.pilotReportFilesComplete === true && byId.G4 === true && byId.G11 === true,
      evidence: `${coverage.pilotReports} pilot reports, namedFiles=${pilotFileCount}/10, analysisOk=${evidence.pilot?.summary?.analysisOkCount || 0}`,
    },
  ];
}

function buildEvidenceRecordReview(record, accepted, id) {
  const source = record && typeof record === 'object' ? record : {};
  const explicitlyAccepted = accepted === true || source.accepted === true || source.recorded === true || source.signed === true;
  const hasPath = [source.reportPath, source.path, source.file].some((value) => typeof value === 'string' && value.trim().length > 0);
  const hasRows = [source.items, source.rows, source.checks].some((value) => Array.isArray(value) && value.length > 0);
  const hasEvidence = hasPath || hasRows || source.evidenceRecorded === true;
  const missing = [];
  if (!explicitlyAccepted) missing.push(`${id}-acceptance`);
  if (!hasEvidence) missing.push(`${id}-record`);
  return {
    id,
    ok: explicitlyAccepted && hasEvidence,
    accepted: explicitlyAccepted,
    hasPath,
    hasRows,
    status: explicitlyAccepted && hasEvidence ? 'available' : 'review-required',
    missing,
  };
}

function pilotReportNames(pilotReports = {}) {
  const rows = pilotReports.files || pilotReports.names || [];
  return [...new Set(rows.map((name) => String(name).split(/[\\/]/).pop()).filter(Boolean))].sort();
}

function pilotReportsComplete(pilotReports = {}) {
  const names = pilotReportNames(pilotReports);
  if (!names.length) return false;
  return REQUIRED_PILOT_REPORT_FILES.every((name) => names.includes(name));
}

export function buildPackagingReadiness(evidence = {}) {
  const files = evidence.files || {};
  return {
    version: LAUNCH_READINESS_VERSION,
    mode: evidence.packageJson?.scripts?.dev ? 'web-server' : 'manual-static',
    smoke: !!(files.indexHtml && files.serverMain && evidence.packageJson?.scripts?.dev),
    installCommand: evidence.packageJson?.scripts?.dev ? 'npm run dev' : 'open index.html',
  };
}

export function buildLicenseReadiness(evidence = {}) {
  const licenseText = String(evidence.licenseText || '');
  const hasLicense = licenseText.trim().length > 0;
  return {
    version: LAUNCH_READINESS_VERSION,
    status: hasLicense ? 'RECORDED' : 'MISSING',
    packagePrivate: evidence.packageJson?.private === true,
    licenseFile: hasLicense ? 'LICENSE.txt' : null,
    note: hasLicense ? 'License text is recorded; open-source license selection remains owner policy.' : 'License file is missing.',
  };
}

export function buildPerformanceBudgetReview(rows = []) {
  const byId = new Map((rows || []).map((row) => [row.id, row]));
  const items = PERFORMANCE_BUDGETS.map((required) => {
    const row = byId.get(required.id);
    const value = Number(row?.value ?? row?.actual);
    const hasValue = Number.isFinite(value);
    const passed = hasValue && passesBudget(value, required);
    return {
      ...required,
      value: hasValue ? value : null,
      source: row?.source || row?.reportPath || null,
      status: passed ? 'OK' : row ? 'REVIEW' : 'MISSING',
    };
  });
  const missing = items.filter((item) => item.status !== 'OK').map((item) => item.id);
  return {
    version: LAUNCH_READINESS_VERSION,
    requiredCount: PERFORMANCE_BUDGETS.length,
    passedCount: items.filter((item) => item.status === 'OK').length,
    ok: missing.length === 0,
    missing,
    items,
    agentDecision: missing.length ? 'collect-performance-budget-evidence' : 'performance-budget-ready-for-launch-review',
  };
}

function passesBudget(value, required) {
  if (required.unit === 'fps-min') return value >= required.limit;
  return value <= required.limit;
}

function budget(id, label, limit, unit) {
  return { id, label, limit, unit };
}

function agentContractMatches(manifest, contract) {
  if (!manifest || !contract) return false;
  const requiredModules = ['phase3LaunchReadiness', 'phase3LaunchReadinessGate'];
  const requiredContracts = ['phase3LaunchReadiness', 'phase3LaunchReadinessGate', 'phase3FinalUseReview'];
  return sameSet(manifest.readApis, contract.readApis)
    && isSubset(contract.modules, Object.keys(manifest.modules || {}))
    && isSubset(contract.dataContracts, manifest.dataContracts)
    && requiredModules.every((key) => (contract.modules || []).includes(key))
    && requiredContracts.every((key) => (contract.dataContracts || []).includes(key))
    && JSON.stringify(manifest.qaCommands || {}) === JSON.stringify(contract.qaCommands || {})
    && JSON.stringify(manifest.reviewGates || {}) === JSON.stringify(contract.reviewGates || {})
    && manualReferenceContractMatches(manifest, contract);
}

function manualReferenceContractMatches(manifest, contract) {
  const expected = manifest?.manualReferences || {};
  const actual = contract?.manualReferences || {};
  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(actual).sort();
  if (!expectedKeys.length) return false;
  if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) return false;
  return expectedKeys.every((key) => (
    typeof expected[key] === 'string'
    && expected[key].length > 0
    && actual[key] === expected[key]
  ));
}

function sameSet(a = [], b = []) {
  return JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
}

function isSubset(subset = [], superset = []) {
  const supersetValues = new Set(superset || []);
  return (subset || []).every((item) => supersetValues.has(item));
}

function gate(id, name, ok, evidence) {
  return { id, name, status: ok ? 'OK' : 'REVIEW', evidence };
}
