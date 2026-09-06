import {
  PHASE9_EVIDENCE_SCHEMA_VERSION,
  PHASE9_RELEASE_MANIFEST_VERSION,
  phase9ArtifactHash,
  phase9ManifestHash,
} from './phase9Baseline.js';
import { PHASE9_M4_EXTERNAL_MATRIX_BLOCKER } from './phase9M4.js';
import {
  PRODUCTION_ELASTIC_BACKEND_ID,
  PRODUCTION_ELASTIC_HYBRID_BACKEND_ID,
} from '../adapters/elasticProductionAdapter.js';

export const PHASE9_M5_EVIDENCE_VERSION = 'p9-m5-hybrid-elastic-evidence-v1';
export const PHASE9_M5_PERFORMANCE_BLOCKER = 'P9_M5_ELASTIC_END_TO_END_SPEED_THRESHOLD_NOT_MET';
export const PHASE9_M5_PROFILE_BLOCKER = 'P9_M5_S_M_PROFILE_MATRIX_REQUIRED';
export const PHASE9_M5_VERIFICATION_IDS = Object.freeze([
  ...series('P9-GPU-ELA-', 16),
  'P9-PERF-08', 'P9-PERF-09', 'P9-PERF-10',
  'P9-FAIL-01', 'P9-FAIL-02', 'P9-FAIL-03', 'P9-FAIL-04',
]);

export function buildPhase9M5Evidence(input = {}) {
  const browser = clone(input.browser || {});
  const results = PHASE9_M5_VERIFICATION_IDS.map((id) => ({
    id,
    status: verificationStatus(id),
    test: verificationTest(id),
  }));
  const core = {
    version: PHASE9_EVIDENCE_SCHEMA_VERSION,
    suiteVersion: PHASE9_M5_EVIDENCE_VERSION,
    suiteId: 'P9-M5-HYBRID-ELASTIC',
    milestone: 'P9-M5',
    generatedAt: requiredText(input.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(input.sourceRevision, 'sourceRevision'),
    verificationIds: [...PHASE9_M5_VERIFICATION_IDS],
    status: 'IMPLEMENTED-WITH-QUALIFICATION-BLOCKED',
    backend: {
      cpuId: PRODUCTION_ELASTIC_BACKEND_ID,
      hybridId: PRODUCTION_ELASTIC_HYBRID_BACKEND_ID,
      precision: 'gpu-f32-solve-cpu-f64-residual-correction',
      productionExplicitRoute: true,
      autoGpuAllowed: false,
      silentFallbackAllowed: false,
      perRunDesignTransfer: 'only-after-original-system-f64-audit',
    },
    browser,
    tests: {
      spdMixed: clone(input.spdMixed || {}),
      elasticHybrid: clone(input.elasticHybrid || {}),
      pDeltaHybrid: clone(input.pDeltaHybrid || {}),
    },
    numeric: clone(browser.numeric || {}),
    product: clone(browser.product || {}),
    performance: clone(browser.performance || {}),
    resources: clone(browser.resource || {}),
    profileMatrix: {
      localProfile: clone(browser.capability?.adapterInfo || {}),
      localNumericQualified: browser.numeric?.qualified === true,
      localPerformanceQualified: browser.performance?.endToEnd?.thresholdMet === true,
      elasticQualifiedProfileCount: 0,
      fullRequiredMatrixQualified: false,
      autoGpuAllowed: false,
    },
    operationPlan: {
      assembly: 'cpu-f64-canonical',
      supportedSolve: 'resident-webgpu-f32-spd-pcg',
      correction: 'cpu-f64-original-system-residual',
      recoveryEnvelopeDesign: 'existing-cpu-f64-production-path',
      directPDelta: 'fresh-gpu-session-per-changing-tangent',
      frameMatrixBatch: 'qualified-shadow-kernel-not-production-design-input',
    },
    regressionPolicy: {
      focused: ['p9-m5-spd-mixed', 'p9-m5-elastic-hybrid', 'p9-m5-pdelta-hybrid', 'p9-m5-evidence-contract'],
      browser: 'tests/browser/p9-m5-webgpu.html',
      nonlinearSolve: 'not-rerun-reuse-phase8-qualified-evidence',
    },
    priorEvidenceHash: requiredHash(input.priorEvidenceHash, 'priorEvidenceHash'),
    results,
    blockers: [
      PHASE9_M4_EXTERNAL_MATRIX_BLOCKER,
      PHASE9_M5_PERFORMANCE_BLOCKER,
      PHASE9_M5_PROFILE_BLOCKER,
    ],
    qualificationImpact: 'G2-retained-hybrid-elastic-implemented-auto-gpu-blocked',
  };
  return Object.freeze({ ...core, artifactHash: phase9ArtifactHash(core) });
}

export function validatePhase9M5Evidence(artifact = {}) {
  const errors = [];
  if (artifact.version !== PHASE9_EVIDENCE_SCHEMA_VERSION) errors.push('artifact:version');
  if (artifact.suiteVersion !== PHASE9_M5_EVIDENCE_VERSION || artifact.milestone !== 'P9-M5') errors.push('artifact:suite');
  if (artifact.status !== 'IMPLEMENTED-WITH-QUALIFICATION-BLOCKED') errors.push('artifact:status');
  if (artifact.backend?.hybridId !== PRODUCTION_ELASTIC_HYBRID_BACKEND_ID) errors.push('artifact:backend');
  if (artifact.backend?.autoGpuAllowed !== false || artifact.backend?.silentFallbackAllowed !== false) errors.push('artifact:routing');
  if (artifact.browser?.status !== 'PASS' || artifact.browser?.available !== true) errors.push('artifact:browser');
  if (artifact.numeric?.qualified !== true || artifact.numeric?.designTransferAllowed !== true) errors.push('artifact:numeric');
  if (!(artifact.numeric?.maxBackwardError <= 1e-10) || !(artifact.numeric?.maxLoadRelativeResidual <= 1e-9)) errors.push('artifact:residual');
  if (artifact.product?.elastic?.target !== 'gpu'
    || artifact.product?.elastic?.fallbackUsed !== false
    || artifact.product?.elastic?.designStatus !== 'qualified') errors.push('artifact:elasticProduct');
  if (artifact.product?.directPDelta?.designStatus !== 'qualified'
    || artifact.product?.directPDelta?.reusedMatrixSessionCount !== 0) errors.push('artifact:pDeltaProduct');
  if (artifact.resources?.allocationBalanced !== true
    || artifact.resources?.afterPlatformDispose?.createdCount !== artifact.resources?.afterPlatformDispose?.destroyedCount) {
    errors.push('artifact:resources');
  }
  const performance = artifact.performance?.endToEnd;
  if (performance?.cpu?.sampleCount !== 3 || performance?.gpu?.sampleCount !== 3) errors.push('artifact:diagnosticSamples');
  if (!(performance?.speedup > 0) || performance?.threshold !== 1.2 || performance?.thresholdMet !== false) errors.push('artifact:performanceTruth');
  if (artifact.profileMatrix?.localNumericQualified !== true
    || artifact.profileMatrix?.localPerformanceQualified !== false
    || artifact.profileMatrix?.elasticQualifiedProfileCount !== 0
    || artifact.profileMatrix?.autoGpuAllowed !== false) errors.push('artifact:qualification');
  for (const id of PHASE9_M5_VERIFICATION_IDS) {
    const expected = verificationStatus(id);
    if (!artifact.results?.some((row) => row.id === id && row.status === expected && row.test)) errors.push(`artifact:result:${id}`);
  }
  for (const blocker of [PHASE9_M4_EXTERNAL_MATRIX_BLOCKER, PHASE9_M5_PERFORMANCE_BLOCKER, PHASE9_M5_PROFILE_BLOCKER]) {
    if (!artifact.blockers?.includes(blocker)) errors.push(`artifact:blocker:${blocker}`);
  }
  if (artifact.regressionPolicy?.nonlinearSolve !== 'not-rerun-reuse-phase8-qualified-evidence') errors.push('artifact:regression');
  if (artifact.qualificationImpact !== 'G2-retained-hybrid-elastic-implemented-auto-gpu-blocked') errors.push('artifact:qualificationImpact');
  if (artifact.artifactHash !== phase9ArtifactHash(artifact)) errors.push('artifact:hash');
  return { ok: errors.length === 0, errors };
}

export function upgradePhase9ManifestToM5(previous, evidence, options = {}) {
  const blockers = [...new Set([
    ...(options.blockers || previous.blockers || []),
    PHASE9_M4_EXTERNAL_MATRIX_BLOCKER,
    PHASE9_M5_PERFORMANCE_BLOCKER,
    PHASE9_M5_PROFILE_BLOCKER,
    'P9_M6_TO_M8_HYBRID_GPU_QUALIFICATION_REQUIRED',
  ])]
    .filter((value) => value !== 'P9_M5_TO_M8_HYBRID_GPU_QUALIFICATION_REQUIRED')
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
      implementedMilestones: ['P9-M0', 'P9-M1', 'P9-M2', 'P9-M3', 'P9-M4', 'P9-M5'],
      activeMilestone: 'P9-M5-qualification-blocked',
    },
    computeQualification: {
      ...clone(previous.computeQualification),
      grade: 'G2',
      status: 'hybrid-elastic-implemented-performance-not-qualified',
      candidate: true,
      gpuImplemented: true,
      hybridElasticImplemented: true,
      elasticCandidateQualified: false,
      autoGpuAllowed: false,
      localNumericQualified: true,
      localPerformanceQualified: false,
      elasticQualifiedProfileCount: 0,
      fullProfileMatrixQualified: false,
    },
    release: { status: 'not-qualified', allowed: false, designTransferAllowed: false },
    evidence: { ...clone(previous.evidence), m5HybridElastic: evidence.artifactHash },
    blockers,
  };
  delete core.manifestHash;
  return Object.freeze({ ...core, manifestHash: phase9ManifestHash(core) });
}

export function validatePhase9M5Manifest(manifest = {}) {
  const errors = [];
  if (manifest.version !== PHASE9_RELEASE_MANIFEST_VERSION) errors.push('manifest:version');
  if (!manifest.implementation?.implementedMilestones?.includes('P9-M5')) errors.push('manifest:implementation');
  if (manifest.implementation?.completedMilestones?.includes('P9-M5')) errors.push('manifest:falseCompletion');
  if (!/^[a-f0-9]{64}$/.test(manifest.evidence?.m5HybridElastic || '')) errors.push('manifest:evidence');
  if (manifest.computeQualification?.grade !== 'G2'
    || manifest.computeQualification?.hybridElasticImplemented !== true
    || manifest.computeQualification?.elasticCandidateQualified !== false
    || manifest.computeQualification?.autoGpuAllowed !== false) errors.push('manifest:qualification');
  for (const blocker of [PHASE9_M5_PERFORMANCE_BLOCKER, PHASE9_M5_PROFILE_BLOCKER]) {
    if (!manifest.blockers?.includes(blocker)) errors.push(`manifest:blocker:${blocker}`);
  }
  if (manifest.blockers?.includes('P9_M5_TO_M8_HYBRID_GPU_QUALIFICATION_REQUIRED')) errors.push('manifest:staleBlocker');
  if (manifest.release?.allowed !== false || manifest.release?.designTransferAllowed !== false) errors.push('manifest:release');
  if (manifest.manifestHash !== phase9ManifestHash(manifest)) errors.push('manifest:hash');
  return { ok: errors.length === 0, errors };
}

function verificationStatus(id) {
  if (id === 'P9-GPU-ELA-15' || id === 'P9-PERF-08' || id === 'P9-PERF-10') return 'FAIL';
  if (id === 'P9-GPU-ELA-16') return 'BLOCKED';
  return 'PASS';
}

function verificationTest(id) {
  if (/P9-GPU-ELA-0[1-6]/.test(id) || id === 'P9-FAIL-03' || id === 'P9-FAIL-04') return 'tests/p9-m5-spd-mixed.mjs';
  if (id === 'P9-GPU-ELA-11' || id === 'P9-GPU-ELA-12') return 'tests/p9-m5-pdelta-hybrid.mjs + tests/browser/p9-m5-webgpu.html';
  if (id === 'P9-GPU-ELA-15' || id === 'P9-GPU-ELA-16' || id.startsWith('P9-PERF-')) return 'tests/browser/p9-m5-webgpu.html';
  return 'tests/p9-m5-elastic-hybrid.mjs + tests/browser/p9-m5-webgpu.html';
}

function series(prefix, count) {
  return Array.from({ length: count }, (_item, index) => `${prefix}${String(index + 1).padStart(2, '0')}`);
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw Object.assign(new Error(`${field} is required.`), { code: 'P9_M5_FIELD_REQUIRED' });
  return text;
}

function requiredHash(value, field) {
  const text = requiredText(value, field);
  if (!/^[a-f0-9]{64}$/.test(text)) throw Object.assign(new Error(`${field} must be a SHA-256 hash.`), { code: 'P9_M5_HASH_INVALID' });
  return text;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
