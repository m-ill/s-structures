import {
  PHASE9_EVIDENCE_SCHEMA_VERSION,
  PHASE9_RELEASE_MANIFEST_VERSION,
  phase9ArtifactHash,
  phase9ManifestHash,
} from './phase9Baseline.js';

export const PHASE9_M8_EVIDENCE_VERSION = 'p9-m8-hybrid-nonlinear-evidence-v1';
export const PHASE9_M8_PASS_IDS = Object.freeze([
  ...seriesRange('P9-GPU-NL-', 11, 22),
  ...seriesRange('P9-FAIL-', 5, 10),
]);
export const PHASE9_M8_BLOCKED_IDS = Object.freeze([
  'P9-GPU-NL-23', 'P9-GPU-NL-24',
  'P9-PERF-13', 'P9-PERF-14', 'P9-PERF-15',
]);
export const PHASE9_M8_VERIFICATION_IDS = Object.freeze([...PHASE9_M8_PASS_IDS, ...PHASE9_M8_BLOCKED_IDS]);

export function buildPhase9M8Evidence(input = {}) {
  const resident = clone(input.resident || {});
  const hybrid = clone(input.hybrid || {});
  const core = {
    version: PHASE9_EVIDENCE_SCHEMA_VERSION,
    suiteVersion: PHASE9_M8_EVIDENCE_VERSION,
    suiteId: 'P9-M8-HYBRID-PUSHOVER-NLTH',
    milestone: 'P9-M8',
    generatedAt: requiredText(input.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(input.sourceRevision, 'sourceRevision'),
    priorEvidenceHash: requiredHash(input.priorEvidenceHash, 'priorEvidenceHash'),
    status: 'IMPLEMENTED_WITH_QUALIFICATION_BLOCKERS',
    verificationIds: [...PHASE9_M8_VERIFICATION_IDS],
    backend: {
      productionId: 'cpu-f64-nonlinear-resident-session',
      requestedTarget: 'auto',
      executedTarget: 'cpu',
      precision: 'f64',
      gpuQualification: 'G2-shadow-candidate-no-design-transfer',
      gpuProductionQualified: false,
      autoGpuAllowed: false,
      fallbackUsed: false,
      designTransferAllowed: false,
    },
    contracts: {
      residentSession: 'p9-m8-nonlinear-resident-session-v1',
      batch: 'p9-m7-nonlinear-soa-batch-v1',
      stateArena: 'p9-m7-nonlinear-batch-state-arena-v1',
      canonicalCheckpoint: 'p8-m1-nonlinear-checkpoint-v1',
      engineeringResultSchemaChanged: false,
      additiveComputeProvenance: true,
    },
    numeric: {
      gravityCheckpointParity: resident.ok === true,
      pushoverStateEventResultParity: hybrid.pushover?.residentCommitCount === 7,
      nlthHistoryStateParity: hybrid.nlth?.residentCommitCount === hybrid.nlth?.internalStepCount,
      nlthEnergyRelativeResidual: Number(hybrid.nlth?.finalEnergyRelativeResidual),
      cpuF64AuditPassed: Number(hybrid.nlth?.finalEnergyRelativeResidual) < 1e-3,
      checkpointFailureContainment: resident.ok === true,
      gpuProductionBlocked: true,
    },
    performance: {
      scope: hybrid.performanceScope,
      pushoverDurationMs: Number(hybrid.pushover?.durationMs),
      nlthDurationMs: Number(hybrid.nlth?.durationMs),
      nlthTransferBytes: Number(hybrid.nlth?.residentTransferBytes),
      residentBytes: Number(resident.residentBytes),
      mTierExecuted: false,
      mTierQualified: false,
      reason: hybrid.mTierQualification,
    },
    architecture: {
      sessionOwner: 'src/compute/nonlinear/residentSession.js',
      formulationOwner: 'src/nonlinear',
      committedBoundaryPolicy: 'solver-accepted-step-only',
      rejectedTrialPolicy: 'arena-rollback-and-canonical-state-hash-audit',
      checkpointPolicy: 'existing-state-store-checkpoint-is-canonical',
      transferPolicy: 'bounded-hashed-descriptors-without-session-payload-retention',
      generalSolvePolicy: 'cpu-f64-authoritative',
      deviceFailurePolicy: 'no-silent-fallback-last-committed-checkpoint',
    },
    tests: { resident, hybrid },
    results: PHASE9_M8_VERIFICATION_IDS.map((id) => ({
      id,
      status: PHASE9_M8_BLOCKED_IDS.includes(id) ? 'BLOCKED' : 'PASS',
      test: testFor(id),
      reason: PHASE9_M8_BLOCKED_IDS.includes(id)
        ? 'M-tier nonlinear performance/UI run omitted under the user-requested minimal nonlinear test policy.'
        : null,
    })),
    blockers: [
      'M_TIER_PUSHOVER_END_TO_END_REQUIRED',
      'M_TIER_NLTH_END_TO_END_REQUIRED',
      'BROWSER_UI_LATENCY_EVIDENCE_REQUIRED',
      'NONLINEAR_GPU_PRODUCTION_KERNELS_NOT_QUALIFIED',
    ],
    limitations: [
      'Production Pushover and MDOF NLTH remain CPU f64; WebGPU nonlinear kernels are shadow candidates only.',
      'The resident session owns state/checkpoint/transfer integrity but does not replace Phase 8 formulation kernels.',
      'M-tier performance, memory and browser UI budgets were not run under the requested minimal nonlinear test policy.',
      'External independent validation remains outside this local milestone.',
    ],
    qualificationImpact: 'M8-implemented-cpu-resident-G2-retained',
  };
  return Object.freeze({ ...core, artifactHash: phase9ArtifactHash(core) });
}

export function validatePhase9M8Evidence(artifact = {}) {
  const errors = [];
  if (artifact.version !== PHASE9_EVIDENCE_SCHEMA_VERSION) errors.push('artifact:version');
  if (artifact.suiteVersion !== PHASE9_M8_EVIDENCE_VERSION || artifact.milestone !== 'P9-M8') errors.push('artifact:suite');
  if (artifact.status !== 'IMPLEMENTED_WITH_QUALIFICATION_BLOCKERS') errors.push('artifact:status');
  if (artifact.backend?.executedTarget !== 'cpu'
    || artifact.backend?.precision !== 'f64'
    || artifact.backend?.gpuProductionQualified !== false
    || artifact.backend?.autoGpuAllowed !== false
    || artifact.backend?.fallbackUsed !== false
    || artifact.backend?.designTransferAllowed !== false) errors.push('artifact:backend');
  if (artifact.contracts?.residentSession !== 'p9-m8-nonlinear-resident-session-v1'
    || artifact.contracts?.engineeringResultSchemaChanged !== false
    || artifact.contracts?.additiveComputeProvenance !== true) errors.push('artifact:contracts');
  if (artifact.numeric?.gravityCheckpointParity !== true
    || artifact.numeric?.pushoverStateEventResultParity !== true
    || artifact.numeric?.nlthHistoryStateParity !== true
    || artifact.numeric?.cpuF64AuditPassed !== true
    || artifact.numeric?.checkpointFailureContainment !== true
    || artifact.numeric?.gpuProductionBlocked !== true) errors.push('artifact:numeric');
  if (artifact.performance?.mTierExecuted !== false || artifact.performance?.mTierQualified !== false) errors.push('artifact:performance');
  for (const id of PHASE9_M8_PASS_IDS) {
    if (!artifact.results?.some((row) => row.id === id && row.status === 'PASS' && row.test)) errors.push(`artifact:pass:${id}`);
  }
  for (const id of PHASE9_M8_BLOCKED_IDS) {
    if (!artifact.results?.some((row) => row.id === id && row.status === 'BLOCKED' && row.reason)) errors.push(`artifact:blocked:${id}`);
  }
  if (artifact.qualificationImpact !== 'M8-implemented-cpu-resident-G2-retained') errors.push('artifact:qualification');
  if (artifact.artifactHash !== phase9ArtifactHash(artifact)) errors.push('artifact:hash');
  return { ok: errors.length === 0, errors };
}

export function upgradePhase9ManifestToM8(previous, evidence, options = {}) {
  const implemented = [...new Set([...(previous.implementation?.implementedMilestones || []), 'P9-M8'])].sort(milestoneSort);
  const blockers = [...new Set([
    ...(previous.blockers || []),
    ...evidence.blockers,
  ])].sort();
  const core = {
    ...clone(previous),
    version: PHASE9_RELEASE_MANIFEST_VERSION,
    generatedAt: requiredText(options.generatedAt || evidence.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(options.sourceRevision || evidence.sourceRevision, 'sourceRevision'),
    implementation: {
      ...clone(previous.implementation),
      status: 'in-progress',
      implementedMilestones: implemented,
      activeMilestone: 'P9-M9',
    },
    computeQualification: {
      ...clone(previous.computeQualification),
      grade: 'G2',
      nonlinearResidentCpuQualified: true,
      nonlinearPushoverNlthImplemented: true,
      nonlinearMSizeQualified: false,
      nonlinearGpuProductionQualified: false,
      nonlinearAutoGpuAllowed: false,
    },
    release: { status: 'not-qualified', allowed: false, designTransferAllowed: false },
    evidence: { ...clone(previous.evidence), m8HybridNonlinear: evidence.artifactHash },
    blockers,
  };
  delete core.manifestHash;
  return Object.freeze({ ...core, manifestHash: phase9ManifestHash(core) });
}

export function validatePhase9M8Manifest(manifest = {}) {
  const errors = [];
  if (manifest.version !== PHASE9_RELEASE_MANIFEST_VERSION) errors.push('manifest:version');
  if (!manifest.implementation?.implementedMilestones?.includes('P9-M8')
    || manifest.implementation?.completedMilestones?.includes('P9-M8')
    || manifest.implementation?.activeMilestone !== 'P9-M9') errors.push('manifest:implementation');
  if (!/^[a-f0-9]{64}$/.test(manifest.evidence?.m8HybridNonlinear || '')) errors.push('manifest:evidence');
  if (manifest.computeQualification?.grade !== 'G2'
    || manifest.computeQualification?.nonlinearResidentCpuQualified !== true
    || manifest.computeQualification?.nonlinearPushoverNlthImplemented !== true
    || manifest.computeQualification?.nonlinearMSizeQualified !== false
    || manifest.computeQualification?.nonlinearGpuProductionQualified !== false
    || manifest.computeQualification?.nonlinearAutoGpuAllowed !== false) errors.push('manifest:qualification');
  if (manifest.release?.allowed !== false || manifest.release?.designTransferAllowed !== false) errors.push('manifest:release');
  if (manifest.manifestHash !== phase9ManifestHash(manifest)) errors.push('manifest:hash');
  return { ok: errors.length === 0, errors };
}

function testFor(id) {
  if (/^P9-GPU-NL-(?:1[1-2]|2[1-2])$/.test(id) || /^P9-FAIL-/.test(id)) return 'tests/p9-m8-resident-session.mjs';
  if (/^P9-GPU-NL-(?:1[3-9]|20)$/.test(id)) return 'tests/p9-m8-hybrid-nonlinear.mjs';
  return 'external:M-tier-nonlinear-browser-performance';
}
function seriesRange(prefix, from, to) { return Array.from({ length: to - from + 1 }, (_row, index) => `${prefix}${String(from + index).padStart(2, '0')}`); }
function milestoneSort(left, right) { return Number(left.split('M').at(-1)) - Number(right.split('M').at(-1)); }
function requiredText(value, field) { const text = String(value || '').trim(); if (!text) throw Object.assign(new Error(`${field} is required.`), { code: 'P9_M8_FIELD_REQUIRED' }); return text; }
function requiredHash(value, field) { const text = requiredText(value, field); if (!/^[a-f0-9]{64}$/.test(text)) throw Object.assign(new Error(`${field} must be a SHA-256 hash.`), { code: 'P9_M8_HASH_INVALID' }); return text; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
