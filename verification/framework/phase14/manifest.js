import { stableHash } from '../../../src/core/stableHash.js';
import { PHASE14_CAPABILITIES } from './capabilities.js';
import { PHASE14_RELEASE_INVARIANTS } from './baseline.js';
import { auditPhase14QualificationSet } from './qualification.js';

export const PHASE14_RELEASE_MANIFEST_VERSION = 'p14-m0-release-manifest-v1';

export function buildPhase14ReleaseManifest(input = {}) {
  const qualifications = Array.from(input.qualifications || []);
  const audit = auditPhase14QualificationSet(qualifications);
  const byId = new Map(qualifications.map((record) => [record.capabilityId, record]));
  const capabilities = PHASE14_CAPABILITIES.map((capability) => {
    const record = byId.get(capability.id) || null;
    return {
      id: capability.id,
      milestone: capability.milestone,
      state: record?.state || 'missing',
      implemented: record?.implemented === true,
      internallyVerified: record?.internallyVerified === true,
      independentlyQualified: record?.independentlyQualified === true,
      crossSolverCompared: record?.crossSolverCompared === true,
      crossSolverStatus: record?.crossSolverStatus || (capability.crossSolverEligible ? 'NOT_RUN' : 'NOT_APPLICABLE-CUSTOM-CRITERION'),
      releaseAllowed: record?.releaseAllowed === true && record?.invalidated !== true,
      designTransferAllowed: record?.designTransferAllowed === true && record?.invalidated !== true,
      qualificationRecordHash: record?.recordHash || null,
      limitations: [...(record?.limitations || [])],
    };
  });
  const checks = [
    gate('P14-REL-01', audit.ok && qualifications.length === PHASE14_CAPABILITIES.length, 'qualification registry complete and unique'),
    gate('P14-REL-02', input.requirementTraceComplete === true, 'requirement-test-evidence-review trace complete'),
    gate('P14-REL-03', input.fullRegressionPassed === true && Number(input.mandatoryFailureCount || 0) === 0 && Number(input.unapprovedSkipCount || 0) === 0, 'mandatory regression has no failure or skip'),
    gate('P14-REL-04', input.openCriticalHighCount === 0, 'no open Critical/High finding'),
    gate('P14-REL-05', input.externalSolverRuntimeDependency === false && Number(input.externalSolverProcessCount || 0) === 0, 'no external solver runtime dependency'),
    gate('P14-REL-06', input.migrationRollbackPassed === true, 'migration and rollback qualified'),
    gate('P14-REL-07', input.surfaceParityPassed === true, 'CLI/Agent/UI/report parity'),
    gate('P14-REL-08', input.performanceSecurityAccessibilityPassed === true, 'NFR budget qualified'),
  ];
  const allCapabilitiesReleased = capabilities.every((row) => row.releaseAllowed);
  const phaseReleaseAllowed = allCapabilitiesReleased && checks.every((row) => row.status === 'PASS');
  const core = {
    version: PHASE14_RELEASE_MANIFEST_VERSION,
    phase: 'Phase 14',
    generatedAt: input.generatedAt || null,
    sourceRevision: input.sourceRevision || null,
    baselineHash: input.baselineHash || null,
    releaseInvariants: { ...PHASE14_RELEASE_INVARIANTS },
    capabilities,
    checks,
    phaseReleaseAllowed,
    finalDesignTransferAllowed: phaseReleaseAllowed && input.finalDesignTransferApproved === true,
    blockers: [
      ...checks.filter((row) => row.status !== 'PASS').map((row) => row.id),
      ...capabilities.filter((row) => !row.releaseAllowed).map((row) => `CAPABILITY:${row.id}`),
    ],
  };
  return deepFreeze({ ...core, manifestHash: stableHash(core) });
}

export function validatePhase14ReleaseManifest(manifest = {}) {
  const errors = [];
  if (manifest.version !== PHASE14_RELEASE_MANIFEST_VERSION) errors.push('manifest:version');
  if (manifest.phase !== 'Phase 14') errors.push('manifest:phase');
  if (stableHash(manifest.releaseInvariants || {}) !== stableHash(PHASE14_RELEASE_INVARIANTS)) errors.push('manifest:invariants');
  const ids = (manifest.capabilities || []).map((row) => row.id);
  if (stableHash(ids) !== stableHash(PHASE14_CAPABILITIES.map((row) => row.id))) errors.push('manifest:capabilities');
  if (manifest.finalDesignTransferAllowed && !manifest.phaseReleaseAllowed) errors.push('manifest:design-transfer');
  const copy = clone(manifest);
  delete copy.manifestHash;
  if (manifest.manifestHash !== stableHash(copy)) errors.push('manifest:hash');
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function gate(id, pass, label) { return Object.freeze({ id, status: pass === true ? 'PASS' : 'BLOCKED', label }); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
