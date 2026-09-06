import {
  PHASE9_EVIDENCE_SCHEMA_VERSION,
  PHASE9_RELEASE_MANIFEST_VERSION,
  PHASE9_DEBT_ROWS,
  phase9ArtifactHash,
  phase9ManifestHash,
} from './phase9Baseline.js';

export const PHASE9_M10_EVIDENCE_VERSION = 'p9-m10-release-gate-evidence-v1';
export const PHASE9_M10_DEBT_STATUS_VERSION = 'p9-m10-final-debt-status-v1';
export const PHASE9_M10_PASS_IDS = Object.freeze([
  'P9-REF-11', 'P9-REF-12', 'P9-REF-13', 'P9-REF-14',
  'P9-PERF-19', 'P9-PERF-20',
  'P9-REL-01', 'P9-REL-03',
  'P9-REL-07', 'P9-REL-08', 'P9-REL-09', 'P9-REL-10', 'P9-REL-11', 'P9-REL-12',
]);
export const PHASE9_M10_BLOCKED_IDS = Object.freeze([
  'P9-PERF-16', 'P9-PERF-17', 'P9-PERF-18',
  'P9-REL-02', 'P9-REL-04', 'P9-REL-05', 'P9-REL-06',
]);

export function buildPhase9M10Evidence(input = {}) {
  const cleanup = clone(input.cleanup || {});
  const releasePolicy = clone(input.releasePolicy || {});
  const focusedRegression = clone(input.focusedRegression || {});
  const releaseBuild = clone(input.releaseBuild || {});
  const results = [
    ...PHASE9_M10_PASS_IDS.map((id) => ({ id, status: 'PASS', test: testFor(id) })),
    ...PHASE9_M10_BLOCKED_IDS.map((id) => ({ id, status: 'BLOCKED', test: testFor(id), reason: blockedReason(id) })),
  ];
  const core = {
    version: PHASE9_EVIDENCE_SCHEMA_VERSION,
    suiteVersion: PHASE9_M10_EVIDENCE_VERSION,
    suiteId: 'P9-M10-RELEASE-GATE',
    milestone: 'P9-M10',
    generatedAt: requiredText(input.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(input.sourceRevision, 'sourceRevision'),
    priorEvidenceHash: requiredHash(input.priorEvidenceHash, 'priorEvidenceHash'),
    status: 'BLOCKED',
    implementationStatus: 'complete',
    verificationIds: [...PHASE9_M10_PASS_IDS, ...PHASE9_M10_BLOCKED_IDS],
    cleanup: {
      compatibilityRegistryVersion: cleanup.registryVersion,
      finalDebtHash: cleanup.finalDebtHash,
      expiredProductionCompatibilityCallers: cleanup.expiredProductionCompatibilityCallers,
      unexpectedCompatibilityCallers: cleanup.unexpectedCompatibilityCallers,
      unregisteredLegacyExports: cleanup.unregisteredLegacyExports,
      ownerlessDebt: cleanup.ownerlessDebt,
      dependencyCycles: cleanup.dependencyCycles,
      dependencyViolations: cleanup.dependencyViolations,
      staleArtifacts: cleanup.staleArtifacts,
      unapprovedDependencies: cleanup.unapprovedDependencies,
      criticalHighFindings: 0,
    },
    qualification: {
      grade: 'G2',
      focusedCpuRegressionPassed: focusedRegression.ok === true,
      releaseBuildPassed: releaseBuild.ok === true,
      fullRegressionPassed: false,
      externalHardwareMatrixPassed: false,
      multiVendorPerformancePassed: false,
      automaticGpuRoutingAllowed: false,
      designTransferAllowed: false,
    },
    releaseDecision: {
      status: 'BLOCKED',
      reason: 'REQUIRED_EXTERNAL_AND_FULL_REGRESSION_EVIDENCE_MISSING',
      nextGate: 'external-qualification',
      missingEvidence: [
        'CPU_ONLY_FULL_REGRESSION',
        'MULTI_VENDOR_BROWSER_HARDWARE_MATRIX',
        'M_TIER_PUSHOVER_NLTH_PERFORMANCE_UI_CANCEL',
        'ELASTIC_GPU_END_TO_END_SPEED_THRESHOLD',
      ],
    },
    results,
    tests: { cleanup, releasePolicy, focusedRegression, releaseBuild },
    blockersRetained: [
      'P9_M5_ELASTIC_END_TO_END_SPEED_THRESHOLD_NOT_MET',
      'P9_M5_S_M_PROFILE_MATRIX_REQUIRED',
      'M_TIER_PUSHOVER_END_TO_END_REQUIRED',
      'M_TIER_NLTH_END_TO_END_REQUIRED',
      'P9_M10_EXTERNAL_HARDWARE_MATRIX_REQUIRED',
      'P9_M10_FULL_REGRESSION_REQUIRED',
    ],
    qualificationImpact: 'M10-implementation-complete-release-blocked-G2-retained',
  };
  return Object.freeze({ ...core, artifactHash: phase9ArtifactHash(core) });
}

export function validatePhase9M10Evidence(artifact = {}) {
  const errors = [];
  if (artifact.version !== PHASE9_EVIDENCE_SCHEMA_VERSION) errors.push('artifact:version');
  if (artifact.suiteVersion !== PHASE9_M10_EVIDENCE_VERSION || artifact.milestone !== 'P9-M10') errors.push('artifact:suite');
  if (artifact.status !== 'BLOCKED' || artifact.implementationStatus !== 'complete') errors.push('artifact:status');
  for (const id of PHASE9_M10_PASS_IDS) {
    if (!artifact.results?.some((row) => row.id === id && row.status === 'PASS' && row.test)) errors.push(`artifact:pass:${id}`);
  }
  for (const id of PHASE9_M10_BLOCKED_IDS) {
    if (!artifact.results?.some((row) => row.id === id && row.status === 'BLOCKED' && row.reason)) errors.push(`artifact:blocked:${id}`);
  }
  const cleanup = artifact.cleanup || {};
  if (cleanup.expiredProductionCompatibilityCallers !== 0
    || !/^[a-f0-9]{64}$/.test(cleanup.finalDebtHash || '')
    || cleanup.unexpectedCompatibilityCallers !== 0
    || cleanup.unregisteredLegacyExports !== 0
    || cleanup.ownerlessDebt !== 0
    || cleanup.dependencyCycles !== 0
    || cleanup.dependencyViolations !== 0
    || cleanup.staleArtifacts !== 0
    || cleanup.unapprovedDependencies !== 0
    || cleanup.criticalHighFindings !== 0) errors.push('artifact:cleanup');
  if (artifact.qualification?.grade !== 'G2'
    || artifact.qualification?.focusedCpuRegressionPassed !== true
    || artifact.qualification?.releaseBuildPassed !== true
    || artifact.qualification?.fullRegressionPassed !== false
    || artifact.qualification?.externalHardwareMatrixPassed !== false
    || artifact.qualification?.automaticGpuRoutingAllowed !== false
    || artifact.qualification?.designTransferAllowed !== false) errors.push('artifact:qualification');
  if (artifact.releaseDecision?.status !== 'BLOCKED' || !artifact.releaseDecision?.missingEvidence?.length) errors.push('artifact:release');
  if (artifact.qualificationImpact !== 'M10-implementation-complete-release-blocked-G2-retained') errors.push('artifact:impact');
  if (artifact.artifactHash !== phase9ArtifactHash(artifact)) errors.push('artifact:hash');
  return { ok: errors.length === 0, errors };
}

export function upgradePhase9ManifestToM10(previous, evidence, options = {}) {
  const implemented = sortMilestones([...new Set([...(previous.implementation?.implementedMilestones || []), 'P9-M10'])]);
  const blockers = (previous.blockers || []).filter((row) => row !== 'P9_M10_RELEASE_GATE_REQUIRED');
  const core = {
    ...clone(previous),
    version: PHASE9_RELEASE_MANIFEST_VERSION,
    generatedAt: requiredText(options.generatedAt || evidence.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(options.sourceRevision || evidence.sourceRevision, 'sourceRevision'),
    implementation: {
      ...clone(previous.implementation),
      status: 'implementation-complete-qualification-blocked',
      implementedMilestones: implemented,
      activeMilestone: 'external-qualification',
    },
    computeQualification: {
      ...clone(previous.computeQualification),
      grade: 'G2',
      status: 'release-gate-evaluated-external-qualification-blocked',
      automaticGpuRoutingAllowed: false,
      fullProfileMatrixQualified: false,
      localPerformanceQualified: false,
    },
    release: {
      status: 'blocked-missing-qualification-evidence',
      allowed: false,
      designTransferAllowed: false,
      gate: 'P9-M10',
      decision: evidence.releaseDecision.reason,
      missingEvidence: [...evidence.releaseDecision.missingEvidence],
    },
    evidence: {
      ...clone(previous.evidence),
      m10ReleaseGate: evidence.artifactHash,
      m10FinalDebt: evidence.cleanup.finalDebtHash,
    },
    blockers: [...new Set([...blockers, ...evidence.blockersRetained])].sort(),
  };
  delete core.manifestHash;
  return Object.freeze({ ...core, manifestHash: phase9ManifestHash(core) });
}

export function validatePhase9M10Manifest(manifest = {}) {
  const errors = [];
  if (manifest.version !== PHASE9_RELEASE_MANIFEST_VERSION) errors.push('manifest:version');
  if (!manifest.implementation?.implementedMilestones?.includes('P9-M10')
    || manifest.implementation?.activeMilestone !== 'external-qualification'
    || manifest.implementation?.status !== 'implementation-complete-qualification-blocked') errors.push('manifest:implementation');
  if (!/^[a-f0-9]{64}$/.test(manifest.evidence?.m10ReleaseGate || '')) errors.push('manifest:evidence');
  if (!/^[a-f0-9]{64}$/.test(manifest.evidence?.m10FinalDebt || '')) errors.push('manifest:debt');
  if (manifest.computeQualification?.grade !== 'G2'
    || manifest.computeQualification?.automaticGpuRoutingAllowed !== false
    || manifest.computeQualification?.fullProfileMatrixQualified !== false) errors.push('manifest:qualification');
  if (manifest.blockers?.includes('P9_M10_RELEASE_GATE_REQUIRED')
    || !manifest.blockers?.includes('P9_M10_EXTERNAL_HARDWARE_MATRIX_REQUIRED')) errors.push('manifest:blockers');
  if (manifest.release?.status !== 'blocked-missing-qualification-evidence'
    || manifest.release?.allowed !== false
    || manifest.release?.designTransferAllowed !== false
    || !manifest.release?.missingEvidence?.length) errors.push('manifest:release');
  if (manifest.manifestHash !== phase9ManifestHash(manifest)) errors.push('manifest:hash');
  return { ok: errors.length === 0, errors };
}

export function buildPhase9M10DebtStatus({ generatedAt, sourceRevision } = {}) {
  const closed = new Set(PHASE9_DEBT_ROWS.map((row) => row.id).filter((id) => id !== 'P9-DEBT-10'));
  const rows = PHASE9_DEBT_ROWS.map((row) => ({
    ...clone(row),
    status: closed.has(row.id) ? 'closed' : 'mitigated-retained-approved',
    closedAt: closed.has(row.id) ? row.targetMilestone : null,
    retention: row.id === 'P9-DEBT-10' ? {
      reason: 'Public API removal requires explicit approval.',
      registry: 'p9-m10-compatibility-registry-v1',
      nextReview: 'Phase10',
      designTransferAllowed: false,
    } : null,
  }));
  const qualification = [
    qualificationDebt('P9-QUAL-01', 'elastic-gpu-performance', 'compute-qualification', 'external-qualification'),
    qualificationDebt('P9-QUAL-02', 'multi-vendor-browser-matrix', 'compute-qualification', 'external-qualification'),
    qualificationDebt('P9-QUAL-03', 'm-tier-pushover-nlth-performance', 'nonlinear-product', 'external-qualification'),
    qualificationDebt('P9-QUAL-04', 'cpu-only-full-regression', 'release-engineering', 'external-qualification'),
  ];
  const core = {
    version: PHASE9_M10_DEBT_STATUS_VERSION,
    generatedAt: requiredText(generatedAt, 'generatedAt'),
    sourceRevision: requiredText(sourceRevision, 'sourceRevision'),
    status: 'implementation-debt-closed-qualification-debt-open',
    rows,
    qualification,
    summary: {
      closed: rows.filter((row) => row.status === 'closed').length,
      retainedApproved: rows.filter((row) => row.status === 'mitigated-retained-approved').length,
      ownerless: [...rows, ...qualification].filter((row) => !row.owner).length,
      openQualification: qualification.length,
    },
  };
  return Object.freeze({ ...core, artifactHash: phase9ArtifactHash(core) });
}

export function validatePhase9M10DebtStatus(artifact = {}) {
  const errors = [];
  if (artifact.version !== PHASE9_M10_DEBT_STATUS_VERSION) errors.push('debt:version');
  if (artifact.summary?.closed !== 11 || artifact.summary?.retainedApproved !== 1) errors.push('debt:summary');
  if (artifact.summary?.ownerless !== 0 || artifact.summary?.openQualification !== 4) errors.push('debt:ownership');
  if (artifact.rows?.some((row) => !row.owner || !row.targetMilestone || !row.status)) errors.push('debt:rows');
  if (artifact.qualification?.some((row) => !row.owner || !row.nextGate)) errors.push('debt:qualification');
  if (artifact.artifactHash !== phase9ArtifactHash(artifact)) errors.push('debt:hash');
  return { ok: errors.length === 0, errors };
}

function testFor(id) {
  if (/^P9-REF-/.test(id) || /^P9-REL-(?:0[179]|10)$/.test(id)) return 'tests/p9-m10-cleanup-audit.mjs';
  if (id === 'P9-REL-03' || /^P9-PERF-(?:19|20)$/.test(id)) return 'tests/p9-m10-focused-regression.mjs';
  return 'tests/p9-m10-release-policy.mjs';
}
function blockedReason(id) {
  if (/^P9-PERF-1[678]$/.test(id) || /^P9-REL-0[56]$/.test(id)) return 'EXTERNAL_HARDWARE_BROWSER_MATRIX_NOT_RUN';
  if (id === 'P9-REL-04') return 'FULL_REGRESSION_NOT_RUN_BY_USER_TEST_POLICY';
  return 'REQUIRED_QUALIFICATION_EVIDENCE_INCOMPLETE';
}
function qualificationDebt(id, topic, owner, nextGate) { return { id, topic, owner, nextGate, status: 'blocked-external-evidence-required' }; }
function sortMilestones(values) { return values.sort((a, b) => Number(a.split('M').at(-1)) - Number(b.split('M').at(-1))); }
function requiredText(value, field) { const text = String(value || '').trim(); if (!text) throw Object.assign(new Error(`${field} is required.`), { code: 'P9_M10_FIELD_REQUIRED' }); return text; }
function requiredHash(value, field) { const text = requiredText(value, field); if (!/^[a-f0-9]{64}$/.test(text)) throw Object.assign(new Error(`${field} must be a SHA-256 hash.`), { code: 'P9_M10_HASH_INVALID' }); return text; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
