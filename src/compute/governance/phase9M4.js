import {
  PHASE9_EVIDENCE_SCHEMA_VERSION,
  PHASE9_RELEASE_MANIFEST_VERSION,
  phase9ArtifactHash,
  phase9ManifestHash,
} from './phase9Baseline.js';
import {
  WEBGPU_KERNEL_BACKEND_ID,
  WEBGPU_KERNEL_OPERATIONS,
  WEBGPU_SHADER_CATALOG_HASH,
} from '../backends/webgpu/index.js';

export const PHASE9_M4_EVIDENCE_VERSION = 'p9-m4-webgpu-foundation-evidence-v1';
export const PHASE9_M4_EXTERNAL_MATRIX_BLOCKER = 'P9_M4_EXTERNAL_BROWSER_VENDOR_MATRIX_REQUIRED';
export const PHASE9_M4_VERIFICATION_IDS = Object.freeze([
  ...series('P9-GPU-PLT-', 12),
  ...series('P9-GPU-NUM-', 14),
  'P9-PERF-05', 'P9-PERF-06', 'P9-PERF-07',
]);

export function buildPhase9M4Evidence(input = {}) {
  const browser = clone(input.browser || {});
  const results = PHASE9_M4_VERIFICATION_IDS.map((id) => ({
    id,
    status: id === 'P9-GPU-PLT-12' ? 'DEFERRED' : 'PASS',
    test: verificationTest(id),
  }));
  const core = {
    version: PHASE9_EVIDENCE_SCHEMA_VERSION,
    suiteVersion: PHASE9_M4_EVIDENCE_VERSION,
    suiteId: 'P9-M4-WEBGPU-FOUNDATION',
    milestone: 'P9-M4',
    generatedAt: requiredText(input.generatedAt || browser.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(input.sourceRevision, 'sourceRevision'),
    verificationIds: [...PHASE9_M4_VERIFICATION_IDS],
    status: 'PASS-WITH-EXTERNAL-MATRIX-DEFERRED',
    backend: {
      id: WEBGPU_KERNEL_BACKEND_ID,
      operations: [...WEBGPU_KERNEL_OPERATIONS],
      shaderCatalogHash: WEBGPU_SHADER_CATALOG_HASH,
      precision: 'f32',
      production: false,
      designTransferAllowed: false,
    },
    browser,
    platformTests: clone(input.platformTests || {}),
    routingTests: clone(input.routingTests || {}),
    numericTests: clone(input.numericTests || {}),
    profileMatrix: {
      qualifiedProfileCount: 1,
      localPrimaryProfile: clone(browser.capability?.adapterInfo || {}),
      primaryBrowserBuild: browser.browser?.userAgent || null,
      fullRequiredMatrixQualified: false,
      deferredVerificationId: 'P9-GPU-PLT-12',
    },
    performance: clone(browser.performance || {}),
    resourceLifecycle: clone(browser.lifecycle || {}),
    regressionPolicy: {
      focused: ['p9-m4-platform', 'p9-m4-numeric', 'p9-m4-routing-architecture', 'p9-m4-evidence-contract'],
      browser: 'tests/browser/p9-m4-webgpu.html',
      nonlinearSolve: 'not-rerun-reuse-phase8-qualified-evidence',
    },
    priorEvidenceHash: requiredHash(input.priorEvidenceHash, 'priorEvidenceHash'),
    results,
    blockers: [PHASE9_M4_EXTERNAL_MATRIX_BLOCKER],
    qualificationImpact: 'G2-kernel-qualified-local-profile-no-design-transfer',
  };
  return Object.freeze({ ...core, artifactHash: phase9ArtifactHash(core) });
}

export function validatePhase9M4Evidence(artifact = {}) {
  const errors = [];
  if (artifact.version !== PHASE9_EVIDENCE_SCHEMA_VERSION) errors.push('artifact:version');
  if (artifact.suiteVersion !== PHASE9_M4_EVIDENCE_VERSION || artifact.milestone !== 'P9-M4') errors.push('artifact:suite');
  if (artifact.status !== 'PASS-WITH-EXTERNAL-MATRIX-DEFERRED') errors.push('artifact:status');
  if (artifact.backend?.id !== WEBGPU_KERNEL_BACKEND_ID) errors.push('artifact:backend');
  const artifactOperations = artifact.backend?.operations || [];
  if (!artifact.backend?.shaderCatalogHash || artifactOperations.some((operation) => !WEBGPU_KERNEL_OPERATIONS.includes(operation))) errors.push('artifact:shaderHash');
  if (artifact.backend?.production !== false || artifact.backend?.designTransferAllowed !== false) errors.push('artifact:designBoundary');
  if (artifact.browser?.status !== 'PASS' || artifact.browser?.available !== true) errors.push('artifact:browser');
  if (artifact.browser?.backend?.buildHash == null || artifact.browser?.backend?.shaderCatalogHash !== artifact.backend?.shaderCatalogHash) errors.push('artifact:browserBuild');
  const operations = new Set(artifact.browser?.checks?.filter((row) => row.status === 'PASS').map((row) => row.operation));
  for (const operation of artifactOperations) if (!operations.has(operation)) errors.push(`artifact:operation:${operation}`);
  if (!operations.has('deterministicReduction-repeat')) errors.push('artifact:determinism');
  if (artifact.resourceLifecycle?.allocationBalanced !== true
    || artifact.resourceLifecycle?.afterDispose?.pool?.createdCount !== artifact.resourceLifecycle?.afterDispose?.pool?.destroyedCount) {
    errors.push('artifact:resources');
  }
  const platform = artifact.resourceLifecycle?.beforeDispose;
  if (!(platform?.submissionCount > 0) || platform.submissionCount !== platform.completedSubmissionCount) errors.push('artifact:queue');
  for (const operation of ['vectorScale', 'csrSpmv']) {
    const row = artifact.performance?.[operation];
    if (row?.gpu?.sampleCount !== 5 || row?.cpu?.sampleCount !== 5
      || !(row.gpu.medianMs > 0) || !(row.cpu.medianMs > 0) || !(row.gpuToCpuMedianRatio > 0)) {
      errors.push(`artifact:performance:${operation}`);
    }
  }
  if (artifact.profileMatrix?.qualifiedProfileCount !== 1 || artifact.profileMatrix?.fullRequiredMatrixQualified !== false) errors.push('artifact:profileMatrix');
  if (!artifact.blockers?.includes(PHASE9_M4_EXTERNAL_MATRIX_BLOCKER)) errors.push('artifact:matrixBlocker');
  for (const id of PHASE9_M4_VERIFICATION_IDS) {
    const expected = id === 'P9-GPU-PLT-12' ? 'DEFERRED' : 'PASS';
    if (!artifact.results?.some((row) => row.id === id && row.status === expected && row.test)) errors.push(`artifact:result:${id}`);
  }
  if (artifact.regressionPolicy?.nonlinearSolve !== 'not-rerun-reuse-phase8-qualified-evidence') errors.push('artifact:regression');
  if (artifact.qualificationImpact !== 'G2-kernel-qualified-local-profile-no-design-transfer') errors.push('artifact:qualification');
  if (artifact.artifactHash !== phase9ArtifactHash(artifact)) errors.push('artifact:hash');
  return { ok: errors.length === 0, errors };
}

export function upgradePhase9ManifestToM4(previous, evidence, options = {}) {
  const blockers = [...new Set([
    ...(options.blockers || previous.blockers || []),
    PHASE9_M4_EXTERNAL_MATRIX_BLOCKER,
    'P9_M5_TO_M8_HYBRID_GPU_QUALIFICATION_REQUIRED',
  ])]
    .filter((value) => value !== 'P9_M4_TO_M8_GPU_QUALIFICATION_REQUIRED')
    .sort();
  const core = {
    ...clone(previous),
    version: PHASE9_RELEASE_MANIFEST_VERSION,
    generatedAt: requiredText(options.generatedAt || evidence.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(options.sourceRevision || evidence.sourceRevision, 'sourceRevision'),
    implementation: {
      ...clone(previous.implementation),
      status: 'in-progress',
      completedMilestones: ['P9-M0', 'P9-M1', 'P9-M2', 'P9-M3', 'P9-M4'],
    },
    computeQualification: {
      grade: 'G2',
      status: 'kernel-qualified-local-primary-profile',
      candidate: true,
      gpuImplemented: true,
      qualifiedProfileCount: 1,
      fullProfileMatrixQualified: false,
    },
    release: { status: 'not-qualified', allowed: false, designTransferAllowed: false },
    evidence: { ...clone(previous.evidence), m4WebGpuFoundation: evidence.artifactHash },
    blockers,
  };
  delete core.manifestHash;
  return Object.freeze({ ...core, manifestHash: phase9ManifestHash(core) });
}

export function validatePhase9M4Manifest(manifest = {}) {
  const errors = [];
  if (manifest.version !== PHASE9_RELEASE_MANIFEST_VERSION) errors.push('manifest:version');
  if (!manifest.implementation?.completedMilestones?.includes('P9-M4')) errors.push('manifest:milestone');
  if (!/^[a-f0-9]{64}$/.test(manifest.evidence?.m4WebGpuFoundation || '')) errors.push('manifest:evidence');
  if (manifest.computeQualification?.grade !== 'G2' || manifest.computeQualification?.gpuImplemented !== true) errors.push('manifest:grade');
  if (manifest.computeQualification?.fullProfileMatrixQualified !== false) errors.push('manifest:profileMatrix');
  if (!manifest.blockers?.includes(PHASE9_M4_EXTERNAL_MATRIX_BLOCKER)) errors.push('manifest:matrixBlocker');
  const hasM4HybridBlocker = manifest.blockers?.includes('P9_M5_TO_M8_HYBRID_GPU_QUALIFICATION_REQUIRED');
  const hasEvolvedHybridBlocker = manifest.implementation?.implementedMilestones?.includes('P9-M5')
    && manifest.blockers?.includes('P9_M6_TO_M8_HYBRID_GPU_QUALIFICATION_REQUIRED');
  if (!hasM4HybridBlocker && !hasEvolvedHybridBlocker) errors.push('manifest:hybridBlocker');
  if (manifest.blockers?.includes('P9_M4_TO_M8_GPU_QUALIFICATION_REQUIRED')) errors.push('manifest:staleBlocker');
  if (manifest.release?.allowed !== false || manifest.release?.designTransferAllowed !== false) errors.push('manifest:release');
  if (manifest.manifestHash !== phase9ManifestHash(manifest)) errors.push('manifest:hash');
  return { ok: errors.length === 0, errors };
}

function verificationTest(id) {
  if (/P9-GPU-PLT-0[1-8]/.test(id)) return 'tests/p9-m4-platform.mjs';
  if (/P9-GPU-PLT-(?:09|10)/.test(id)) return 'tests/p9-m4-routing-architecture.mjs';
  if (id === 'P9-GPU-PLT-12') return 'external-browser-vendor-matrix';
  if (id.startsWith('P9-GPU-PLT-') || id.startsWith('P9-PERF-')) return 'tests/browser/p9-m4-webgpu.html';
  if (id === 'P9-GPU-NUM-13' || id === 'P9-GPU-NUM-14') return 'tests/browser/p9-m4-webgpu.html';
  return 'tests/p9-m4-numeric.mjs + tests/browser/p9-m4-webgpu.html';
}

function series(prefix, count) {
  return Array.from({ length: count }, (_item, index) => `${prefix}${String(index + 1).padStart(2, '0')}`);
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw Object.assign(new Error(`${field} is required.`), { code: 'P9_M4_FIELD_REQUIRED' });
  return text;
}

function requiredHash(value, field) {
  const text = requiredText(value, field);
  if (!/^[a-f0-9]{64}$/.test(text)) throw Object.assign(new Error(`${field} must be a SHA-256 hash.`), { code: 'P9_M4_HASH_INVALID' });
  return text;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
