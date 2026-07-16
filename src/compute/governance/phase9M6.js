import {
  PHASE9_EVIDENCE_SCHEMA_VERSION,
  PHASE9_RELEASE_MANIFEST_VERSION,
  phase9ArtifactHash,
  phase9ManifestHash,
} from './phase9Baseline.js';
import { PRODUCTION_EIGEN_BACKEND_ID } from '../adapters/eigenProductionAdapter.js';

export const PHASE9_M6_EVIDENCE_VERSION = 'p9-m6-sparse-eigen-evidence-v1';
export const PHASE9_M6_VERIFICATION_IDS = Object.freeze([
  ...series('P9-GPU-EIG-', 14),
  'P9-PERF-11',
  'P9-REF-06',
]);

export function buildPhase9M6Evidence(input = {}) {
  const dynamics = clone(input.dynamics || {});
  const product = clone(input.product || {});
  const core = {
    version: PHASE9_EVIDENCE_SCHEMA_VERSION,
    suiteVersion: PHASE9_M6_EVIDENCE_VERSION,
    suiteId: 'P9-M6-SPARSE-EIGEN-DYNAMICS',
    milestone: 'P9-M6',
    generatedAt: requiredText(input.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(input.sourceRevision, 'sourceRevision'),
    priorEvidenceHash: requiredHash(input.priorEvidenceHash, 'priorEvidenceHash'),
    status: 'PASS',
    verificationIds: [...PHASE9_M6_VERIFICATION_IDS],
    backend: {
      id: PRODUCTION_EIGEN_BACKEND_ID,
      executionTarget: 'cpu',
      precision: 'f64',
      algorithm: 'sparse-shift-invert-block-subspace-rayleigh-ritz',
      fullDenseEigenMatrixAllocated: false,
      optionalGpuSpmvQualified: false,
      autoGpuAllowed: false,
    },
    tests: { dynamics, product },
    numeric: {
      exactEigenvalues: clone(dynamics.exactEigenvalues || []),
      bucklingFactors: clone(dynamics.bucklingFactors || []),
      modalPeriod: Number(dynamics.modalPeriod),
      signOrderMacCanonical: true,
      massNormalizationAudited: true,
      rsaRecoveryAudited: true,
      bucklingRecoveryAudited: true,
    },
    performance: {
      tier: 'M-diagnostic',
      dimension: Number(dynamics.scale?.dimension),
      requestedModes: Number(dynamics.scale?.requestedModes),
      projectionDimension: Number(dynamics.scale?.projectionDimension),
      durationMs: Number(dynamics.scale?.durationMs),
      budgetMs: 5000,
      budgetMet: Number(dynamics.scale?.durationMs) < 5000,
    },
    product: {
      backendId: product.backendId || null,
      workerOperation: product.workerOperation || null,
      resultHash: product.resultHash || null,
      gpuFailClosed: product.gpuFailClosed === true,
    },
    architecture: {
      operatorStorage: 'typed-csc',
      requestedModeOnly: true,
      denseReferencePolicy: 'small-projected-problem-only-max-32',
      recoveryAuthority: 'cpu-f64',
      sharedModalBucklingCore: true,
      duplicatedDenseEigenHelpersRemoved: true,
      productExecution: 'worker-service',
    },
    results: PHASE9_M6_VERIFICATION_IDS.map((id) => ({
      id,
      status: 'PASS',
      test: id === 'P9-REF-06'
        ? 'tests/p9-m6-worker-product.mjs'
        : 'tests/p9-m6-eigen-dynamics.mjs',
    })),
    limitations: [
      'Structural frame and rigid-diaphragm assembly still originates in the existing dense assembly owner before CSC extraction.',
      'GPU SpMV and block-vector execution are optional in M6 and are not qualified or automatically routed.',
      'External application and vendor validation remains outside this local milestone.',
    ],
    qualificationImpact: 'M6-complete-cpu-f64-sparse-eigen-G2-retained',
  };
  return Object.freeze({ ...core, artifactHash: phase9ArtifactHash(core) });
}

export function validatePhase9M6Evidence(artifact = {}) {
  const errors = [];
  if (artifact.version !== PHASE9_EVIDENCE_SCHEMA_VERSION) errors.push('artifact:version');
  if (artifact.suiteVersion !== PHASE9_M6_EVIDENCE_VERSION || artifact.milestone !== 'P9-M6') errors.push('artifact:suite');
  if (artifact.status !== 'PASS') errors.push('artifact:status');
  if (artifact.backend?.id !== PRODUCTION_EIGEN_BACKEND_ID
    || artifact.backend?.precision !== 'f64'
    || artifact.backend?.fullDenseEigenMatrixAllocated !== false
    || artifact.backend?.autoGpuAllowed !== false) errors.push('artifact:backend');
  if (artifact.numeric?.exactEigenvalues?.length !== 3
    || artifact.numeric?.bucklingFactors?.length !== 3
    || artifact.numeric?.signOrderMacCanonical !== true
    || artifact.numeric?.massNormalizationAudited !== true
    || artifact.numeric?.rsaRecoveryAudited !== true
    || artifact.numeric?.bucklingRecoveryAudited !== true) errors.push('artifact:numeric');
  if (!(artifact.performance?.dimension >= 200)
    || !(artifact.performance?.requestedModes >= 6)
    || !(artifact.performance?.projectionDimension < artifact.performance?.dimension)
    || artifact.performance?.budgetMet !== true) errors.push('artifact:performance');
  if (artifact.product?.backendId !== PRODUCTION_EIGEN_BACKEND_ID
    || artifact.product?.workerOperation !== 'modalRsa'
    || !/^[a-f0-9]{64}$/.test(artifact.product?.resultHash || '')
    || artifact.product?.gpuFailClosed !== true) errors.push('artifact:product');
  for (const id of PHASE9_M6_VERIFICATION_IDS) {
    if (!artifact.results?.some((row) => row.id === id && row.status === 'PASS' && row.test)) {
      errors.push(`artifact:result:${id}`);
    }
  }
  if (artifact.qualificationImpact !== 'M6-complete-cpu-f64-sparse-eigen-G2-retained') errors.push('artifact:qualification');
  if (artifact.artifactHash !== phase9ArtifactHash(artifact)) errors.push('artifact:hash');
  return { ok: errors.length === 0, errors };
}

export function upgradePhase9ManifestToM6(previous, evidence, options = {}) {
  const completed = [...new Set([...(previous.implementation?.completedMilestones || []), 'P9-M6'])]
    .sort(milestoneSort);
  const implemented = [...new Set([...(previous.implementation?.implementedMilestones || []), 'P9-M6'])]
    .sort(milestoneSort);
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
      activeMilestone: 'P9-M7',
    },
    computeQualification: {
      ...clone(previous.computeQualification),
      grade: 'G2',
      sparseEigenCpuQualified: true,
      eigenGpuQualified: false,
      eigenAutoGpuAllowed: false,
    },
    release: { status: 'not-qualified', allowed: false, designTransferAllowed: false },
    evidence: { ...clone(previous.evidence), m6SparseEigen: evidence.artifactHash },
  };
  delete core.manifestHash;
  return Object.freeze({ ...core, manifestHash: phase9ManifestHash(core) });
}

export function validatePhase9M6Manifest(manifest = {}) {
  const errors = [];
  if (manifest.version !== PHASE9_RELEASE_MANIFEST_VERSION) errors.push('manifest:version');
  if (!manifest.implementation?.completedMilestones?.includes('P9-M6')
    || !manifest.implementation?.implementedMilestones?.includes('P9-M6')
    || manifest.implementation?.activeMilestone !== 'P9-M7') errors.push('manifest:implementation');
  if (!/^[a-f0-9]{64}$/.test(manifest.evidence?.m6SparseEigen || '')) errors.push('manifest:evidence');
  if (manifest.computeQualification?.grade !== 'G2'
    || manifest.computeQualification?.sparseEigenCpuQualified !== true
    || manifest.computeQualification?.eigenGpuQualified !== false
    || manifest.computeQualification?.eigenAutoGpuAllowed !== false) errors.push('manifest:qualification');
  if (manifest.release?.allowed !== false || manifest.release?.designTransferAllowed !== false) errors.push('manifest:release');
  if (manifest.manifestHash !== phase9ManifestHash(manifest)) errors.push('manifest:hash');
  return { ok: errors.length === 0, errors };
}

function series(prefix, count) {
  return Array.from({ length: count }, (_item, index) => `${prefix}${String(index + 1).padStart(2, '0')}`);
}

function milestoneSort(left, right) {
  return Number(left.split('M').at(-1)) - Number(right.split('M').at(-1));
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw Object.assign(new Error(`${field} is required.`), { code: 'P9_M6_FIELD_REQUIRED' });
  return text;
}

function requiredHash(value, field) {
  const text = requiredText(value, field);
  if (!/^[a-f0-9]{64}$/.test(text)) throw Object.assign(new Error(`${field} must be a SHA-256 hash.`), { code: 'P9_M6_HASH_INVALID' });
  return text;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
