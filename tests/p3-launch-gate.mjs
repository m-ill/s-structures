import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  analyzeModel,
  buildAgentManifest,
  buildLaunchReadinessReport,
  buildPhase3EvidenceRegister,
  buildPhase3OwnerSignoffReview,
  buildPhase3PracticeValidationReview,
  buildP3IntegratedResults,
  buildPilotProjectValidation,
  createCalculationPackageHtml,
  createTwoStoryElasticFrameModel,
  PHASE3_FINAL_APPROVAL_GROUPS,
  LAUNCH_READINESS_GATE_VERSION,
  LAUNCH_READINESS_VERSION,
  PERFORMANCE_BUDGETS,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const agentContract = JSON.parse(readFileSync('docs/user-manual/agent-contract.json', 'utf8'));
const launchManual = readFileSync('docs/user-manual/PHASE3_LAUNCH_MANUAL.md', 'utf8');
const completionAudit = readFileSync('docs/phase3/P3_COMPLETION_AUDIT_2026-07-02.md', 'utf8');
const manifest = buildAgentManifest();
const practiceValidationReview = buildPhase3PracticeValidationReview();
const ownerSignoffReview = buildPhase3OwnerSignoffReview();
const evidenceRegister = buildPhase3EvidenceRegister();
const pilot = buildPilotProjectValidation({ limit: 10 });
const model = createTwoStoryElasticFrameModel();
const analysis = analyzeModel(model);
const integrated = buildP3IntegratedResults(model, analysis);
const calculationPackage = createCalculationPackageHtml(model, analysis);
const pilotReports = readdirSync('reports/launch-readiness').filter((name) => /^pilot-\d\d\.md$/.test(name)).sort();
const contractExecuteActions = Object.values(agentContract.executeActions).flat();
const contractReadWorkflows = Object.values(agentContract.readWorkflows || {}).flat();
const performanceBudgets = PERFORMANCE_BUDGETS.map((row) => ({
  id: row.id,
  value: row.unit === 'fps-min' ? row.limit : row.limit * 0.5,
  source: `reports/launch-readiness/performance-security.md#${row.id}`,
}));

assert.equal(analysis.ok, true);
assert.deepEqual([...agentContract.readApis].sort(), [...manifest.readApis].sort());
assert.ok(agentContract.modules.every((key) => manifest.modules[key]));
assert.ok(agentContract.dataContracts.every((key) => manifest.dataContracts.includes(key)));
assert.ok(agentContract.modules.includes('phase3LaunchReadiness'));
assert.ok(agentContract.modules.includes('phase3LaunchReadinessGate'));
assert.ok(agentContract.dataContracts.includes('phase3LaunchReadiness'));
assert.ok(agentContract.dataContracts.includes('phase3LaunchReadinessGate'));
assert.ok(agentContract.dataContracts.includes('phase3FinalUseReview'));
assert.deepEqual(agentContract.qaCommands, manifest.qaCommands);
assert.deepEqual(agentContract.reviewGates, manifest.reviewGates);
assert.deepEqual(agentContract.manualReferences, manifest.manualReferences);
assert.ok(Object.values(agentContract.manualReferences).every((path) => existsSync(path)));
assert.equal(agentContract.manualReferences.remainingReview, 'docs/user-manual/PHASE3_REMAINING_REVIEW.md');
assert.equal(agentContract.reviewGates.launchReadiness.path, 'releaseGate.releaseReview');
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('getLaunchReadinessReport().productionReadiness.status')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('getLaunchReadinessReport().agentSafeStatus')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('summary.evidenceComplete')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('submitProjectEvidence accepts only IDs')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('owner sign-off review aliases')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('summary.readyForAgentReview')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('finalApprovalField')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('exitCriteriaSummary')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('remainingValidation')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('finalUseReview.requiredReviews')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('requiredEvidenceIdCount')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('finalApprovalField is allowed')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('listProjectEvidence().finalApprovals')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('listProjectEvidence().finalApprovalReview')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('listProjectEvidence().ownerSignoffReview')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('summary.finalApprovalCoverage uses the same required approval groups')));
assert.ok(agentContract.interpretationRules.some((rule) => rule.includes('getPhase3OwnerSignoffReview().deploymentApprovalGroup')));
assert.ok(manifest.interpretationRules.some((rule) => rule.includes('exitCriteriaSummary')));
assert.ok(manifest.interpretationRules.some((rule) => rule.includes('finalUseReview.requiredReviews')));
assert.ok(manifest.interpretationRules.some((rule) => rule.includes('requiredEvidenceIdCount')));
assert.ok(manifest.interpretationRules.some((rule) => rule.includes('finalApprovalField is allowed')));
assert.ok(manifest.interpretationRules.some((rule) => rule.includes('listProjectEvidence().finalApprovals')));
assert.ok(manifest.interpretationRules.some((rule) => rule.includes('listProjectEvidence().finalApprovalReview')));
assert.ok(manifest.interpretationRules.some((rule) => rule.includes('listProjectEvidence().ownerSignoffReview')));
assert.ok(manifest.interpretationRules.some((rule) => rule.includes('summary.finalApprovalCoverage uses the same required approval groups')));
assert.ok(manifest.interpretationRules.some((rule) => rule.includes('getPhase3OwnerSignoffReview().deploymentApprovalGroup')));
assert.match(launchManual, /getLaunchReadinessReport\(\)\.productionReadiness\.status/);
assert.match(launchManual, /getLaunchReadinessReport\(\)\.agentSafeStatus/);
assert.match(launchManual, /finalUseReview\.requiredReviews/);
assert.match(launchManual, /requiredEvidenceIdCount/);
assert.match(launchManual, /finalApprovalField/);
assert.match(launchManual, /listProjectEvidence\(\)/);
assert.match(launchManual, /finalApprovals/);
assert.match(launchManual, /finalApprovalReview/);
assert.match(launchManual, /ownerSignoffReview/);
assert.match(launchManual, /summary\.finalApprovalCoverage/);
assert.match(launchManual, /deploymentApprovalGroup/);
assert.match(launchManual, /LAUNCH_EVIDENCE_OK_FINAL_USE_BLOCKED/);
assert.match(launchManual, /OWNER_REVIEW_REQUIRED/);
assert.match(launchManual, /exitCriteriaSummary/);
assert.match(launchManual, /automated-exit-criteria-covered/);
assert.match(completionAudit, /npm\.cmd run test:p3/);
assert.match(completionAudit, /node tools\/run-milestone-tests\.mjs --phase3 --from=P3-M6 --to=P3-M20/);
assert.equal(completionAudit.includes('- `npm.cmd test`'), false);
assert.equal(pilotReports.length, 10);
assert.equal(integrated.summary.notCheckedCount, 0);
assert.match(calculationPackage.html, /Phase 3 Integrated Results/);
assert.equal(existsSync('index.html'), true);
assert.equal(existsSync('server/main.mjs'), true);
assert.equal(existsSync('LICENSE.txt'), true);
assert.equal(existsSync('docs/user-manual/PHASE3_LAUNCH_MANUAL.md'), true);
assert.equal(existsSync('reports/launch-readiness/performance-security.md'), true);
assert.equal(existsSync('reports/launch-readiness/backup-restore.md'), true);
assert.equal(existsSync('reports/launch-readiness/owner-signoff-checklist.md'), true);
assert.equal(existsSync('docs/verification/DESIGN_MODULE_VERIFICATION.md'), true);

const evidence = {
  fullSuiteGreen: true,
  benchmarkGreen: true,
  pointCloudGreen: true,
  platformGreen: true,
  importGreen: true,
  performanceRecorded: true,
  performanceBudgets,
  securityChecklistSigned: true,
  securityEvidence: {
    signed: true,
    reportPath: 'reports/launch-readiness/performance-security.md',
    items: ['upload-policy', 'evidence-route', 'launch-gate'],
  },
  backupRestoreRecorded: true,
  backupRestoreEvidence: {
    recorded: true,
    reportPath: 'reports/launch-readiness/backup-restore.md',
    items: ['backup', 'restore', 'owner-review'],
  },
  ownerSignoffChecklistRecorded: true,
  designVerificationRecorded: true,
  designVerificationEvidence: {
    recorded: true,
    reportPath: 'docs/verification/DESIGN_MODULE_VERIFICATION.md',
    items: ['rc', 'steel', 'connection', 'foundation'],
  },
  calculationTraceConnected: true,
  notCheckedCount: integrated.summary.notCheckedCount,
  manifest,
  agentContract,
  practiceValidationReview,
  ownerSignoffReview,
  evidenceRegister,
  pilot,
  pilotReports: { count: pilotReports.length, files: pilotReports },
  manual: { updated: true },
  packageJson,
  files: { indexHtml: true, serverMain: true },
  licenseText: readFileSync('LICENSE.txt', 'utf8'),
};
const launch = buildLaunchReadinessReport(evidence);
assert.equal(launch.version, LAUNCH_READINESS_VERSION);
assert.equal(launch.releaseGate.version, LAUNCH_READINESS_GATE_VERSION);
assert.deepEqual(launch.releaseGate.tickets, ['P3-T63', 'P3-T64', 'P3-T65', 'P3-T66', 'P3-T67']);
assert.equal(launch.releaseGate.contract.milestone, 'P3-M20');
assert.deepEqual(launch.releaseGate.contract.tickets, ['P3-T63', 'P3-T64', 'P3-T65', 'P3-T66', 'P3-T67']);
assert.equal(launch.releaseGate.contract.featureTicketMap.packagingSmoke, 'P3-T63');
assert.ok(launch.releaseGate.contract.reviewFields.includes('summary.ticketCoverage'));
assert.equal(launch.releaseGate.contract.maturity, 'owner-review-ready');
assert.deepEqual(launch.releaseGate.requiredGates, ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14']);
assert.equal(launch.releaseGate.ok, true);
assert.equal(launch.releaseGate.summary.readyForOwnerReview, true);
assert.equal(launch.releaseGate.summary.completeTicketCoverage, true);
assert.equal(launch.releaseGate.releaseReview.status, 'owner-review-ready');
assert.equal(launch.releaseGate.releaseReview.productionDeploymentApproved, false);
assert.equal(launch.releaseGate.releaseReview.ownerFinalSignoff, false);
assert.equal(launch.releaseGate.releaseReview.agentDecision, 'ready-for-owner-release-signoff');
assert.deepEqual(launch.releaseGate.releaseReview.missing, []);
assert.equal(launch.releaseGate.summary.coveredTicketCount, 5);
assert.equal(launch.releaseGate.coverage.ownerSignoffChecklist, true);
assert.equal(launch.releaseGate.coverage.securityEvidence, true);
assert.equal(launch.releaseGate.coverage.backupRestore, true);
assert.equal(launch.releaseGate.coverage.designVerificationEvidence, true);
assert.equal(launch.releaseGate.coverage.pilotReportFilesComplete, true);
assert.equal(launch.releaseGate.coverage.manualReferences, true);
assert.deepEqual(launch.releaseGate.ticketCoverage.map((row) => row.ticket), ['P3-T63', 'P3-T64', 'P3-T65', 'P3-T66', 'P3-T67']);
assert.deepEqual(launch.releaseGate.summary.ticketCoverage.map((row) => row.ticket), ['P3-T63', 'P3-T64', 'P3-T65', 'P3-T66', 'P3-T67']);
assert.ok(launch.releaseGate.ticketCoverage.every((row) => row.covered));
assert.ok(launch.releaseGate.ticketCoverage.find((row) => row.ticket === 'P3-T67').evidence.includes('10 pilot reports'));
assert.ok(launch.releaseGate.ticketCoverage.find((row) => row.ticket === 'P3-T67').evidence.includes('namedFiles=10/10'));
assert.equal(launch.status, 'OK');
assert.equal(launch.finalUseBlocked, true);
assert.equal(launch.agentSafeStatus, 'LAUNCH_EVIDENCE_OK_FINAL_USE_BLOCKED');
assert.equal(launch.finalUseReview.status, 'FINAL_USE_REVIEW_REQUIRED');
assert.deepEqual(launch.finalUseReview.blockingReviews, ['practice-validation', 'owner-signoff', 'evidence-register']);
assert.deepEqual(launch.finalUseReview.requiredReviews.map((row) => row.acceptedField), ['productionReady', 'productionDeploymentApproved', 'evidenceComplete']);
assert.equal(launch.finalUseReview.requiredReviews.find((row) => row.id === 'owner-signoff').missingCount, 7);
assert.ok(launch.finalUseReview.rows.find((row) => row.id === 'practice-validation').missing.includes('drawing-import'));
assert.equal(launch.finalUseReview.rows.find((row) => row.id === 'owner-signoff').missing.length, 7);
assert.equal(launch.summary.finalUseReviewStatus, 'FINAL_USE_REVIEW_REQUIRED');
assert.equal(launch.summary.finalUseBlocked, true);
assert.equal(launch.summary.agentSafeStatus, 'LAUNCH_EVIDENCE_OK_FINAL_USE_BLOCKED');
assert.equal(launch.summary.blockingReviewCount, 3);
assert.equal(launch.summary.total, 14);
assert.equal(launch.summary.reviewCount, 0);
assert.equal(launch.summary.ownerReviewReady, true);
assert.equal(launch.summary.productionDeploymentApproved, false);
assert.equal(launch.summary.productionReadinessStatus, 'OWNER_REVIEW_REQUIRED');
assert.equal(launch.productionReadiness.status, 'OWNER_REVIEW_REQUIRED');
assert.equal(launch.productionReadiness.ownerReviewReady, true);
assert.equal(launch.productionReadiness.productionDeploymentApproved, false);
assert.equal(launch.productionReadiness.blockingReviewCount, 3);
assert.equal(launch.productionReadiness.finalUseReview.status, 'FINAL_USE_REVIEW_REQUIRED');
assert.equal(launch.productionReadiness.agentDecision, 'collect-final-use-review-evidence');
assert.equal(launch.performanceBudgetReview.ok, true);
assert.equal(launch.performanceBudgetReview.requiredCount, 8);
assert.equal(launch.performanceBudgetReview.passedCount, 8);
assert.equal(launch.performanceBudgetReview.agentDecision, 'performance-budget-ready-for-launch-review');
assert.equal(launch.releaseGate.coverage.performanceBudgets, true);
assert.match(launch.releaseGate.ticketCoverage.find((row) => row.ticket === 'P3-T66').evidence, /performance=OK 8\/8/);
assert.match(launch.releaseGate.ticketCoverage.find((row) => row.ticket === 'P3-T66').evidence, /security=OK/);
assert.match(launch.releaseGate.ticketCoverage.find((row) => row.ticket === 'P3-T66').evidence, /designVerification=OK/);
assert.equal(launch.packaging.smoke, true);
assert.equal(launch.license.status, 'RECORDED');

const evidenceCompleteLaunch = buildLaunchReadinessReport({
  ...evidence,
  evidenceRegister: buildPhase3EvidenceRegister({
    evidence: buildPhase3EvidenceRegister().rows.map((row) => ({ id: row.id, accepted: true })),
  }),
});
assert.deepEqual(evidenceCompleteLaunch.finalUseReview.blockingReviews, ['practice-validation', 'owner-signoff']);
assert.equal(evidenceCompleteLaunch.finalUseReview.rows.find((row) => row.id === 'evidence-register').acceptedField, 'evidenceComplete');
assert.equal(evidenceCompleteLaunch.finalUseReview.rows.find((row) => row.id === 'evidence-register').status, 'ACCEPTED');
assert.equal(evidenceCompleteLaunch.finalUseReview.requiredReviews.find((row) => row.id === 'evidence-register').accepted, true);

const finalApprovalFields = PHASE3_FINAL_APPROVAL_GROUPS.map((group) => group.fields[0]);
const finalApprovals = Object.fromEntries(finalApprovalFields.map((field) => [field, true]));
const fullEvidenceRows = buildPhase3EvidenceRegister().rows.map((row) => ({ id: row.id, accepted: true }));
const productionApprovedLaunch = buildLaunchReadinessReport({
  ...evidence,
  finalApprovals,
  practiceValidationReview: buildPhase3PracticeValidationReview({
    evidence: fullEvidenceRows,
    finalApprovals,
  }),
  ownerSignoffReview: buildPhase3OwnerSignoffReview({
    evidence: fullEvidenceRows,
    finalApprovals,
  }),
  evidenceRegister: buildPhase3EvidenceRegister({ evidence: fullEvidenceRows }),
});
assert.equal(productionApprovedLaunch.finalUseBlocked, false);
assert.equal(productionApprovedLaunch.finalUseReview.status, 'FINAL_USE_REVIEW_ACCEPTED');
assert.deepEqual(productionApprovedLaunch.finalUseReview.blockingReviews, []);
assert.equal(productionApprovedLaunch.releaseGate.releaseReview.productionDeploymentApproved, true);
assert.equal(productionApprovedLaunch.productionReadiness.status, 'PRODUCTION_APPROVED');
assert.equal(productionApprovedLaunch.agentSafeStatus, 'PRODUCTION_APPROVED');

const missingPilotReportLaunch = buildLaunchReadinessReport({
  ...evidence,
  pilotReports: { count: 10, files: pilotReports.slice(0, 9) },
});
assert.equal(missingPilotReportLaunch.gates.find((row) => row.id === 'G11').status, 'REVIEW');
assert.equal(missingPilotReportLaunch.releaseGate.coverage.pilotReportFilesComplete, false);
assert.equal(missingPilotReportLaunch.releaseGate.ticketCoverage.find((row) => row.ticket === 'P3-T67').covered, false);
assert.ok(missingPilotReportLaunch.releaseGate.releaseReview.missing.includes('pilot-report-files'));
assert.ok(missingPilotReportLaunch.releaseGate.releaseReview.missing.includes('ticket-coverage'));

const missingPerformanceLaunch = buildLaunchReadinessReport({
  ...evidence,
  performanceBudgets: performanceBudgets.filter((row) => row.id !== 'nlth-record'),
});
assert.equal(missingPerformanceLaunch.gates.find((row) => row.id === 'G7').status, 'REVIEW');
assert.equal(missingPerformanceLaunch.performanceBudgetReview.ok, false);
assert.ok(missingPerformanceLaunch.performanceBudgetReview.missing.includes('nlth-record'));
assert.equal(missingPerformanceLaunch.releaseGate.ticketCoverage.find((row) => row.ticket === 'P3-T66').covered, false);
assert.ok(missingPerformanceLaunch.releaseGate.releaseReview.missing.includes('performance-budget-items'));

const booleanOnlyEvidenceLaunch = buildLaunchReadinessReport({
  ...evidence,
  securityEvidence: null,
  backupRestoreEvidence: null,
  designVerificationEvidence: null,
});
assert.equal(booleanOnlyEvidenceLaunch.gates.find((row) => row.id === 'G8').status, 'REVIEW');
assert.equal(booleanOnlyEvidenceLaunch.gates.find((row) => row.id === 'G12').status, 'REVIEW');
assert.equal(booleanOnlyEvidenceLaunch.gates.find((row) => row.id === 'G13').status, 'REVIEW');
assert.equal(booleanOnlyEvidenceLaunch.releaseGate.coverage.securityEvidence, false);
assert.equal(booleanOnlyEvidenceLaunch.releaseGate.coverage.backupRestore, false);
assert.equal(booleanOnlyEvidenceLaunch.releaseGate.coverage.designVerificationEvidence, false);
assert.equal(booleanOnlyEvidenceLaunch.releaseGate.ticketCoverage.find((row) => row.ticket === 'P3-T66').covered, false);
assert.ok(booleanOnlyEvidenceLaunch.releaseGate.releaseReview.missing.includes('security-checklist-evidence'));
assert.ok(booleanOnlyEvidenceLaunch.releaseGate.releaseReview.missing.includes('backup-restore-record'));
assert.ok(booleanOnlyEvidenceLaunch.releaseGate.releaseReview.missing.includes('design-verification-evidence'));

const overBudgetLaunch = buildLaunchReadinessReport({
  ...evidence,
  performanceBudgets: performanceBudgets.map((row) => (
    row.id === 'server-save' ? { ...row, value: 20 } : row
  )),
});
assert.equal(overBudgetLaunch.gates.find((row) => row.id === 'G7').status, 'REVIEW');
assert.ok(overBudgetLaunch.performanceBudgetReview.missing.includes('server-save'));

const staleAgentContractLaunch = buildLaunchReadinessReport({
  ...evidence,
  agentContract: {
    ...agentContract,
    modules: agentContract.modules.filter((key) => key !== 'phase3LaunchReadinessGate'),
  },
});
assert.equal(staleAgentContractLaunch.gates.find((row) => row.id === 'G10').status, 'REVIEW');
assert.equal(staleAgentContractLaunch.releaseGate.ticketCoverage.find((row) => row.ticket === 'P3-T65').covered, false);
assert.ok(staleAgentContractLaunch.releaseGate.releaseReview.missing.includes('ticket-coverage'));

const staleManualReferenceLaunch = buildLaunchReadinessReport({
  ...evidence,
  agentContract: {
    ...agentContract,
    manualReferences: {
      ...agentContract.manualReferences,
      launchManual: 'docs/user-manual/STALE_PHASE3_LAUNCH_MANUAL.md',
    },
  },
});
assert.equal(staleManualReferenceLaunch.gates.find((row) => row.id === 'G9').status, 'REVIEW');
assert.equal(staleManualReferenceLaunch.gates.find((row) => row.id === 'G10').status, 'REVIEW');
assert.equal(staleManualReferenceLaunch.releaseGate.coverage.manualReferences, false);
assert.equal(staleManualReferenceLaunch.releaseGate.ticketCoverage.find((row) => row.ticket === 'P3-T65').covered, false);
assert.ok(staleManualReferenceLaunch.releaseGate.ticketCoverage.find((row) => row.ticket === 'P3-T65').evidence.includes('manualRefs=review'));
assert.ok(staleManualReferenceLaunch.releaseGate.releaseReview.missing.includes('manual-reference-contract'));
assert.ok(staleManualReferenceLaunch.releaseGate.releaseReview.missing.includes('ticket-coverage'));

const missingOwnerChecklistLaunch = buildLaunchReadinessReport({
  ...evidence,
  ownerSignoffChecklistRecorded: false,
});
assert.equal(missingOwnerChecklistLaunch.releaseGate.ok, true);
assert.equal(missingOwnerChecklistLaunch.releaseGate.releaseReview.status, 'review-required');
assert.equal(missingOwnerChecklistLaunch.releaseGate.summary.readyForOwnerReview, false);
assert.ok(missingOwnerChecklistLaunch.releaseGate.releaseReview.missing.includes('owner-signoff-checklist'));

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, { getLastResult: () => analysis });
const runtimeCapabilities = agent.getCapabilities();
const defaultAgentLaunch = agent.getLaunchReadinessReport();
const agentLaunch = agent.getLaunchReadinessReport(evidence);
assert.equal(defaultAgentLaunch.finalUseReview.status, 'FINAL_USE_REVIEW_REQUIRED');
assert.equal(defaultAgentLaunch.finalUseReview.rows.find((row) => row.id === 'owner-signoff').missing.length, 7);
assert.ok(defaultAgentLaunch.finalUseReview.rows.find((row) => row.id === 'evidence-register').missing.includes('real-office-dxf-fixtures'));
assert.equal(defaultAgentLaunch.productionReadiness.agentDecision, 'collect-final-use-review-evidence');
assert.equal(defaultAgentLaunch.agentSafeStatus, 'LAUNCH_EVIDENCE_REVIEW_REQUIRED');
assert.equal(agentLaunch.version, LAUNCH_READINESS_VERSION);
assert.equal(agentLaunch.status, 'OK');
assert.equal(agentLaunch.finalUseBlocked, true);
assert.equal(agentLaunch.agentSafeStatus, 'LAUNCH_EVIDENCE_OK_FINAL_USE_BLOCKED');
assert.equal(agentLaunch.productionReadiness.status, 'OWNER_REVIEW_REQUIRED');
assert.equal(agentLaunch.productionReadiness.agentDecision, 'collect-final-use-review-evidence');
assert.equal(runtimeCapabilities.modules.phase3LaunchReadiness, LAUNCH_READINESS_VERSION);
assert.equal(runtimeCapabilities.modules.phase3LaunchReadinessGate, LAUNCH_READINESS_GATE_VERSION);
assert.deepEqual(runtimeCapabilities.reviewGates, manifest.reviewGates);
assert.ok(runtimeCapabilities.readApis.includes('getLaunchReadinessReport'));
assert.ok(runtimeCapabilities.dataContracts.includes('phase3LaunchReadinessGate'));
assert.ok(runtimeCapabilities.dataContracts.includes('phase3FinalUseReview'));
assert.deepEqual(
  contractExecuteActions.filter((action) => !runtimeCapabilities.executeActions.includes(action)),
  [],
);
assert.deepEqual(
  contractReadWorkflows.filter((apiName) => !runtimeCapabilities.readApis.includes(apiName)),
  [],
);

console.log(JSON.stringify({
  ok: true,
  version: LAUNCH_READINESS_VERSION,
  gates: launch.summary.total,
  pilotReports: pilotReports.length,
  packageSections: calculationPackage.data.sections.length,
  executeActionContractCount: contractExecuteActions.length,
}, null, 2));
