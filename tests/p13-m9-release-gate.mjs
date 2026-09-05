import assert from 'node:assert/strict';
import { buildPhase13ReleaseGate } from '../src/platform/phase13ReleaseReadiness.js';

const base = {
  completedMilestones: Array.from({ length: 9 }, (_, index) => `P13-M${index}`),
  qualificationCompleteMilestones: Array.from({ length: 8 }, (_, index) => `P13-M${index}`),
  evidenceHashesComplete: true, reviewHashesComplete: true,
  fullRegressionPassed: true, regressionTimeoutCount: 0, flakyCount: 0, unapprovedSkipCount: 0,
  coreE2ESourceRunsPassed: 3, coreE2EReleaseRunsPassed: 3, officePilotPassed: true,
  runStatusValueReportParity: true, openCriticalHighCount: 0,
  performancePassed: true, accessibilityPassed: true, securityPassed: true,
  cleanInstallPassed: true, restartPassed: true, backupRestorePassed: true, rollbackNMinus1Passed: true,
  openSeesRuntimeUsed: false, externalSolverRuntimeDependency: false, externalSolverProcessCount: 0, unapprovedNetworkRequestCount: 0,
  shellContainmentPassed: true, shellDesignTransferAllowed: false,
  releaseManifestHashVerified: true, sourceBuildEvidenceArtifactHashesVerified: true,
  engineeringCrossValidationQualified: false,
};
const gate = buildPhase13ReleaseGate(base);
assert.equal(gate.workflowReleaseQualified, true); assert.equal(gate.frameElasticOfficePilotAllowed, true); assert.equal(gate.finalDesignTransferAllowed, false); assert.equal(gate.shellDesignTransferAllowed, false); assert.equal(gate.checks.length, 10);
const blocked = buildPhase13ReleaseGate({ ...base, openSeesRuntimeUsed: true }); assert.equal(blocked.releaseQualified, false); assert.ok(blocked.blockers.includes('P13-REL-08'));
console.log(JSON.stringify({ ok: true, milestone: 'P13-M9', workflow: gate.workflowReleaseQualified, final: gate.finalDesignTransferAllowed }, null, 2));
