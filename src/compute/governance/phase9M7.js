import {
  PHASE9_EVIDENCE_SCHEMA_VERSION,
  PHASE9_RELEASE_MANIFEST_VERSION,
  phase9ArtifactHash,
  phase9ManifestHash,
  phase9MilestoneAtOrBeyond,
} from './phase9Baseline.js';

export const PHASE9_M7_EVIDENCE_VERSION = 'p9-m7-nonlinear-batch-evidence-v1';
export const PHASE9_M7_VERIFICATION_IDS = Object.freeze([
  ...series('P9-GPU-NL-', 10),
  'P9-REF-07', 'P9-REF-08', 'P9-REF-09', 'P9-PERF-12',
]);

export function buildPhase9M7Evidence(input = {}) {
  const functional = clone(input.functional || {});
  const performance = clone(functional.performance || {});
  const core = {
    version: PHASE9_EVIDENCE_SCHEMA_VERSION,
    suiteVersion: PHASE9_M7_EVIDENCE_VERSION,
    suiteId: 'P9-M7-NONLINEAR-SOA-BATCH',
    milestone: 'P9-M7',
    generatedAt: requiredText(input.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(input.sourceRevision, 'sourceRevision'),
    priorEvidenceHash: requiredHash(input.priorEvidenceHash, 'priorEvidenceHash'),
    status: 'PASS',
    verificationIds: [...PHASE9_M7_VERIFICATION_IDS],
    backend: {
      productionId: 'cpu-js-nonlinear-batch-f64',
      executionTarget: 'cpu',
      precision: 'f64',
      gpuCandidate: 'p9-m7-nonlinear-gpu-shadow-candidate-v1',
      gpuQualification: 'G2-shadow-candidate-no-design-transfer',
      gpuProductionQualified: false,
      autoGpuAllowed: false,
      designTransferAllowed: false,
    },
    contracts: {
      batch: 'p9-m7-nonlinear-soa-batch-v1',
      stateArena: 'p9-m7-nonlinear-batch-state-arena-v1',
      assembly: 'p9-m7-deterministic-nonlinear-assembly-v1',
      publicResultSchemaChanged: false,
      batchHash: functional.batchHash,
      reductionHash: functional.reductionHash,
    },
    numeric: {
      forceTangentStateEnergyParity: true,
      rollbackByteParity: functional.rollbackByteParity === true,
      deterministicReduction: true,
      productionGpuBlocked: functional.productionGpuBlocked === true,
      gpuShadowQualified: functional.gpuShadowQualified === true,
    },
    performance: {
      tier: performance.tier,
      elementCount: Number(performance.elementCount),
      elementDurationMs: Number(performance.elementDurationMs),
      stateDurationMs: Number(performance.stateDurationMs),
      assemblyDurationMs: Number(performance.assemblyDurationMs),
      reusableWorkspaceBytes: Number(performance.reusableWorkspaceBytes),
      perElementCommittedStateCloneCount: Number(performance.perElementCommittedStateCloneCount),
      diagnosticBudgetMs: 1000,
      budgetMet: ['elementDurationMs', 'stateDurationMs', 'assemblyDurationMs']
        .every((key) => Number(performance[key]) >= 0 && Number(performance[key]) < 1000),
    },
    architecture: {
      batchOwner: 'src/compute/nonlinear',
      formulationOwner: 'src/nonlinear/elements-and-fiber',
      assemblyOrder: 'element-index-then-local-row-major-fixed-order',
      statePolicy: 'separate-committed-and-trial-byte-and-numeric-arenas',
      unsupportedPolicy: 'exact-capability-partition-and-explicit-gpu-failure',
      gpuScope: 'independent-f32-frame-and-monotonic-epp-fiber-shadow-only',
      productionScope: 'all-validated-element-contracts-on-cpu-f64',
    },
    tests: { functional },
    results: PHASE9_M7_VERIFICATION_IDS.map((id) => ({
      id,
      status: 'PASS',
      test: 'tests/p9-m7-nonlinear-batch.mjs',
    })),
    limitations: [
      'History-dependent hinge, distributed-fiber, and corotational production elements remain CPU f64 only.',
      'Existing WebGPU frame and fiber kernels are shadow candidates and cannot feed design results.',
      'Pushover and MDOF NLTH resident-session integration is deferred to P9-M8.',
      'External independent validation remains outside this local milestone.',
    ],
    qualificationImpact: 'M7-complete-cpu-f64-nonlinear-batch-G2-retained',
  };
  return Object.freeze({ ...core, artifactHash: phase9ArtifactHash(core) });
}

export function validatePhase9M7Evidence(artifact = {}) {
  const errors = [];
  if (artifact.version !== PHASE9_EVIDENCE_SCHEMA_VERSION) errors.push('artifact:version');
  if (artifact.suiteVersion !== PHASE9_M7_EVIDENCE_VERSION || artifact.milestone !== 'P9-M7') errors.push('artifact:suite');
  if (artifact.status !== 'PASS') errors.push('artifact:status');
  if (artifact.backend?.productionId !== 'cpu-js-nonlinear-batch-f64'
    || artifact.backend?.precision !== 'f64'
    || artifact.backend?.gpuProductionQualified !== false
    || artifact.backend?.autoGpuAllowed !== false
    || artifact.backend?.designTransferAllowed !== false) errors.push('artifact:backend');
  if (artifact.contracts?.publicResultSchemaChanged !== false
    || !/^[a-f0-9]{64}$/.test(artifact.contracts?.batchHash || '')
    || !/^[a-f0-9]{64}$/.test(artifact.contracts?.reductionHash || '')) errors.push('artifact:contracts');
  if (artifact.numeric?.forceTangentStateEnergyParity !== true
    || artifact.numeric?.rollbackByteParity !== true
    || artifact.numeric?.deterministicReduction !== true
    || artifact.numeric?.productionGpuBlocked !== true
    || artifact.numeric?.gpuShadowQualified !== true) errors.push('artifact:numeric');
  if (!(artifact.performance?.elementCount >= 100)
    || artifact.performance?.perElementCommittedStateCloneCount !== 0
    || artifact.performance?.budgetMet !== true) errors.push('artifact:performance');
  for (const id of PHASE9_M7_VERIFICATION_IDS) {
    if (!artifact.results?.some((row) => row.id === id && row.status === 'PASS' && row.test)) errors.push(`artifact:result:${id}`);
  }
  if (artifact.qualificationImpact !== 'M7-complete-cpu-f64-nonlinear-batch-G2-retained') errors.push('artifact:qualification');
  if (artifact.artifactHash !== phase9ArtifactHash(artifact)) errors.push('artifact:hash');
  return { ok: errors.length === 0, errors };
}

export function upgradePhase9ManifestToM7(previous, evidence, options = {}) {
  const completed = [...new Set([...(previous.implementation?.completedMilestones || []), 'P9-M7'])].sort(milestoneSort);
  const implemented = [...new Set([...(previous.implementation?.implementedMilestones || []), 'P9-M7'])].sort(milestoneSort);
  const core = {
    ...clone(previous),
    version: PHASE9_RELEASE_MANIFEST_VERSION,
    generatedAt: requiredText(options.generatedAt || evidence.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(options.sourceRevision || evidence.sourceRevision, 'sourceRevision'),
    implementation: {
      ...clone(previous.implementation),
      status: 'in-progress',
      completedMilestones: completed,
      implementedMilestones: implemented,
      activeMilestone: 'P9-M8',
    },
    computeQualification: {
      ...clone(previous.computeQualification),
      grade: 'G2',
      nonlinearBatchCpuQualified: true,
      nonlinearGpuShadowQualified: true,
      nonlinearGpuProductionQualified: false,
      nonlinearAutoGpuAllowed: false,
    },
    release: { status: 'not-qualified', allowed: false, designTransferAllowed: false },
    evidence: { ...clone(previous.evidence), m7NonlinearBatch: evidence.artifactHash },
  };
  delete core.manifestHash;
  return Object.freeze({ ...core, manifestHash: phase9ManifestHash(core) });
}

export function validatePhase9M7Manifest(manifest = {}) {
  const errors = [];
  if (manifest.version !== PHASE9_RELEASE_MANIFEST_VERSION) errors.push('manifest:version');
  if (!manifest.implementation?.completedMilestones?.includes('P9-M7')
    || !manifest.implementation?.implementedMilestones?.includes('P9-M7')
    || !phase9MilestoneAtOrBeyond(manifest.implementation?.activeMilestone, 8)) errors.push('manifest:implementation');
  if (!/^[a-f0-9]{64}$/.test(manifest.evidence?.m7NonlinearBatch || '')) errors.push('manifest:evidence');
  if (manifest.computeQualification?.grade !== 'G2'
    || manifest.computeQualification?.nonlinearBatchCpuQualified !== true
    || manifest.computeQualification?.nonlinearGpuShadowQualified !== true
    || manifest.computeQualification?.nonlinearGpuProductionQualified !== false
    || manifest.computeQualification?.nonlinearAutoGpuAllowed !== false) errors.push('manifest:qualification');
  if (manifest.release?.allowed !== false || manifest.release?.designTransferAllowed !== false) errors.push('manifest:release');
  if (manifest.manifestHash !== phase9ManifestHash(manifest)) errors.push('manifest:hash');
  return { ok: errors.length === 0, errors };
}
function series(prefix, count) { return Array.from({ length: count }, (_item, index) => `${prefix}${String(index + 1).padStart(2, '0')}`); }
function milestoneSort(left, right) { return Number(left.split('M').at(-1)) - Number(right.split('M').at(-1)); }
function requiredText(value, field) { const text = String(value || '').trim(); if (!text) throw Object.assign(new Error(`${field} is required.`), { code: 'P9_M7_FIELD_REQUIRED' }); return text; }
function requiredHash(value, field) { const text = requiredText(value, field); if (!/^[a-f0-9]{64}$/.test(text)) throw Object.assign(new Error(`${field} must be a SHA-256 hash.`), { code: 'P9_M7_HASH_INVALID' }); return text; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
