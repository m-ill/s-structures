import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildPhase13ReleaseGate } from '../../src/platform/phase13ReleaseReadiness.js';

execFileSync(process.execPath, ['tests/p13-m9-release-gate.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/p13-m4-m9-index-milestones-ui.mjs'], { stdio: 'inherit' });
const gate = buildPhase13ReleaseGate({
  completedMilestones: Array.from({ length: 9 }, (_, index) => `P13-M${index}`), qualificationCompleteMilestones: ['P13-M0', 'P13-M8'],
  evidenceHashesComplete: false, reviewHashesComplete: false, fullRegressionPassed: false, regressionTimeoutCount: 0, flakyCount: 0, unapprovedSkipCount: 0,
  coreE2ESourceRunsPassed: 0, coreE2EReleaseRunsPassed: 0, officePilotPassed: false, runStatusValueReportParity: false, openCriticalHighCount: 0,
  performancePassed: false, accessibilityPassed: false, securityPassed: false, cleanInstallPassed: false, restartPassed: false, backupRestorePassed: false, rollbackNMinus1Passed: false,
  openSeesRuntimeUsed: false, externalSolverRuntimeDependency: false, externalSolverProcessCount: 0, unapprovedNetworkRequestCount: 0,
  shellContainmentPassed: true, shellDesignTransferAllowed: false, releaseManifestHashVerified: false, sourceBuildEvidenceArtifactHashesVerified: false, engineeringCrossValidationQualified: false,
});
const safe = process.cwd().replaceAll('\\', '/');
const sourceRevision = execFileSync('git', ['-c', `safe.directory=${safe}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const evidence = { ...gate, status: 'BLOCKED', implementationStatus: 'complete', sourceRevision, generatedAt: new Date().toISOString() };
await mkdir('verification/evidence/validation/phase13', { recursive: true });
await writeFile('verification/evidence/validation/phase13/p13-release-manifest.json', `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, releaseQualified: gate.releaseQualified, blockers: gate.blockers }, null, 2));
