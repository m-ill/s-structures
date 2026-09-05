import { stableHash } from '../core/stableHash.js';
import { PHASE13_RELEASE_INVARIANTS } from './phase13ReleaseContract.js';

export const PHASE13_RELEASE_GATE_VERSION = 'p13-m9-release-gate-v2';

export function buildPhase13ReleaseGate(input = {}) {
  const qualified = new Set(input.qualificationCompleteMilestones || []);
  const implementationComplete = new Set(input.completedMilestones || []);
  const required = Array.from({ length: 8 }, (_, index) => `P13-M${index}`);
  const milestonePass = required.every((id) => qualified.has(id));
  const checks = [
    check('P13-REL-01', milestonePass && input.evidenceHashesComplete === true && input.reviewHashesComplete === true, 'M0~M7 qualification/evidence/review hash'),
    check('P13-REL-02', input.fullRegressionPassed === true && input.regressionTimeoutCount === 0 && input.flakyCount === 0 && input.unapprovedSkipCount === 0, 'Phase 7~12 mandatory regression'),
    check('P13-REL-03', input.coreE2ESourceRunsPassed === 3 && input.coreE2EReleaseRunsPassed === 3 && input.officePilotPassed === true, 'Core E2E source/release 3회와 office pilot'),
    check('P13-REL-04', input.runStatusValueReportParity === true, 'run/status/value/report parity'),
    check('P13-REL-05', Number(input.openCriticalHighCount ?? Infinity) === 0, 'open Critical/High'),
    check('P13-REL-06', input.performancePassed === true && input.accessibilityPassed === true && input.securityPassed === true, 'performance/accessibility/security budget'),
    check('P13-REL-07', input.cleanInstallPassed === true && input.restartPassed === true && input.backupRestorePassed === true && input.rollbackNMinus1Passed === true, 'install/restart/backup/rollback'),
    check('P13-REL-08', input.openSeesRuntimeUsed === false && input.externalSolverRuntimeDependency === false && input.externalSolverProcessCount === 0 && input.unapprovedNetworkRequestCount === 0, 'in-house loopback-only runtime'),
    check('P13-REL-09', input.shellContainmentPassed === true && input.shellDesignTransferAllowed === false, 'shell containment and design-transfer guard'),
    check('P13-REL-10', input.releaseManifestHashVerified === true && input.sourceBuildEvidenceArtifactHashesVerified === true, 'release manifest integrity'),
  ];
  const workflowReleaseQualified = checks.every((row) => row.pass);
  const engineeringCrossValidationQualified = input.engineeringCrossValidationQualified === true;
  const finalDesignTransferAllowed = workflowReleaseQualified && engineeringCrossValidationQualified;
  const core = {
    version: PHASE13_RELEASE_GATE_VERSION,
    phase: 'Phase 13',
    milestone: 'P13-M9',
    claimProfile: 'LOCAL_LOOPBACK_FRAME_ELASTIC_OFFICE_PILOT',
    implementationCompleteMilestones: [...implementationComplete].sort(),
    qualificationCompleteMilestones: [...qualified].sort(),
    checks: checks.map((row) => ({ ...row, status: row.pass ? 'PASS' : 'BLOCKED' })),
    workflowReleaseQualified,
    frameElasticOfficePilotAllowed: workflowReleaseQualified,
    engineeringCrossValidationQualified,
    finalDesignTransferAllowed,
    shellExperimentalViewAllowed: input.shellContainmentPassed === true,
    shellDesignTransferAllowed: false,
    releaseQualified: workflowReleaseQualified,
    releaseInvariants: { ...PHASE13_RELEASE_INVARIANTS },
    blockers: checks.filter((row) => !row.pass).map((row) => row.id),
    externalInputsRequired: [
      !input.officePilotPassed && 'OFFICE_PILOT_REQUIRED',
      !engineeringCrossValidationQualified && 'ENGINEERING_CROSS_VALIDATION_REQUIRED',
    ].filter(Boolean),
  };
  return Object.freeze({ ...core, manifestHash: stableHash(core).slice(0, 24) });
}

function check(id, pass, label) { return { id, pass: pass === true, label }; }
