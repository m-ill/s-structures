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
  LAUNCH_READINESS_GATE_VERSION,
  LAUNCH_READINESS_VERSION,
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
const pilotReports = readdirSync('reports/launch-readiness').filter((name) => /^pilot-\d\d\.md$/.test(name));
const contractExecuteActions = Object.values(agentContract.executeActions).flat();
const contractReadWorkflows = Object.values(agentContract.readWorkflows || {}).flat();

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
assert.match(launchManual, /getLaunchReadinessReport\(\)\.productionReadiness\.status/);
assert.match(launchManual, /OWNER_REVIEW_REQUIRED/);
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
  securityChecklistSigned: true,
  backupRestoreRecorded: true,
  ownerSignoffChecklistRecorded: true,
  designVerificationRecorded: true,
  calculationTraceConnected: true,
  notCheckedCount: integrated.summary.notCheckedCount,
  manifest,
  agentContract,
  practiceValidationReview,
  ownerSignoffReview,
  evidenceRegister,
  pilot,
  pilotReports: { count: pilotReports.length },
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
assert.deepEqual(launch.releaseGate.ticketCoverage.map((row) => row.ticket), ['P3-T63', 'P3-T64', 'P3-T65', 'P3-T66', 'P3-T67']);
assert.deepEqual(launch.releaseGate.summary.ticketCoverage.map((row) => row.ticket), ['P3-T63', 'P3-T64', 'P3-T65', 'P3-T66', 'P3-T67']);
assert.ok(launch.releaseGate.ticketCoverage.every((row) => row.covered));
assert.ok(launch.releaseGate.ticketCoverage.find((row) => row.ticket === 'P3-T67').evidence.includes('10 pilot reports'));
assert.equal(launch.status, 'OK');
assert.equal(launch.finalUseReview.status, 'FINAL_USE_REVIEW_REQUIRED');
assert.deepEqual(launch.finalUseReview.blockingReviews, ['practice-validation', 'owner-signoff', 'evidence-register']);
assert.equal(launch.finalUseReview.rows.find((row) => row.id === 'owner-signoff').missing.length, 7);
assert.equal(launch.summary.finalUseReviewStatus, 'FINAL_USE_REVIEW_REQUIRED');
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
assert.equal(launch.packaging.smoke, true);
assert.equal(launch.license.status, 'RECORDED');

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, { getLastResult: () => analysis });
const runtimeCapabilities = agent.getCapabilities();
const defaultAgentLaunch = agent.getLaunchReadinessReport();
const agentLaunch = agent.getLaunchReadinessReport(evidence);
assert.equal(defaultAgentLaunch.finalUseReview.status, 'FINAL_USE_REVIEW_REQUIRED');
assert.equal(defaultAgentLaunch.finalUseReview.rows.find((row) => row.id === 'owner-signoff').missing.length, 7);
assert.ok(defaultAgentLaunch.finalUseReview.rows.find((row) => row.id === 'evidence-register').missing.includes('real-office-dxf-fixtures'));
assert.equal(defaultAgentLaunch.productionReadiness.agentDecision, 'collect-final-use-review-evidence');
assert.equal(agentLaunch.version, LAUNCH_READINESS_VERSION);
assert.equal(agentLaunch.status, 'OK');
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
