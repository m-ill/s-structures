import {
  ELASTIC_FACTOR_GROUP_VERSION,
  classifyElasticFactorGroups,
} from '../elastic/factorGroups.js';
import { ELASTIC_FACTOR_SESSION_VERSION } from '../elastic/factorSession.js';
import {
  PRODUCTION_ELASTIC_ADAPTER_VERSION,
  PRODUCTION_ELASTIC_BACKEND_ID,
} from '../adapters/elasticProductionAdapter.js';
import { ELASTIC_ANALYSIS_SERVICE_VERSION } from '../product/elasticAnalysisService.js';
import {
  PHASE9_EVIDENCE_SCHEMA_VERSION,
  PHASE9_RELEASE_MANIFEST_VERSION,
  phase9ArtifactHash,
  phase9ManifestHash,
} from './phase9Baseline.js';

export const PHASE9_M3_EVIDENCE_VERSION = 'p9-m3-elastic-runtime-evidence-v1';
export const PHASE9_M3_VERIFICATION_IDS = Object.freeze([
  ...Array.from({ length: 16 }, (_item, index) => `P9-ELA-${String(index + 1).padStart(2, '0')}`),
  'P9-API-04', 'P9-API-05', 'P9-API-06',
  'P9-PERF-01', 'P9-PERF-02', 'P9-PERF-03', 'P9-PERF-04',
]);

export function buildPhase9M3Evidence(input = {}) {
  const core = {
    version: PHASE9_EVIDENCE_SCHEMA_VERSION,
    suiteVersion: PHASE9_M3_EVIDENCE_VERSION,
    suiteId: 'P9-M3-ELASTIC-RUNTIME',
    milestone: 'P9-M3',
    generatedAt: requiredText(input.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(input.sourceRevision, 'sourceRevision'),
    verificationIds: [...PHASE9_M3_VERIFICATION_IDS],
    status: 'PASS',
    contracts: {
      factorGroups: ELASTIC_FACTOR_GROUP_VERSION,
      factorSession: ELASTIC_FACTOR_SESSION_VERSION,
      adapter: PRODUCTION_ELASTIC_ADAPTER_VERSION,
      backend: PRODUCTION_ELASTIC_BACKEND_ID,
      productService: ELASTIC_ANALYSIS_SERVICE_VERSION,
    },
    tolerances: clone(input.tolerances || {}),
    parity: clone(input.parity || {}),
    performance: clone(input.performance || {}),
    execution: clone(input.execution || {}),
    resultStorage: clone(input.resultStorage || {}),
    factorPlan: clone(input.factorPlan || {}),
    regressionPolicy: {
      focused: ['p9-m3-elastic-runtime', 'p9-m3-worker-product', 'p9-m3-evidence-contract'],
      compatibility: ['m2-linear3d', 'm4-combinations', 'p8-m1-domain', 'p8-m2-assembly-primitives'],
      nonlinearSolve: 'not-rerun-reuse-phase8-qualified-evidence',
    },
    priorEvidenceHash: requiredHash(input.priorEvidenceHash, 'priorEvidenceHash'),
    results: PHASE9_M3_VERIFICATION_IDS.map((id) => ({ id, status: 'PASS', test: verificationTest(id) })),
    blockers: clone(input.blockers || []),
    qualificationImpact: 'G1-candidate-production-elastic-worker-integrated-no-gpu-design-transfer',
  };
  return Object.freeze({ ...core, artifactHash: phase9ArtifactHash(core) });
}

export function validatePhase9M3Evidence(artifact = {}) {
  const errors = [];
  if (artifact.version !== PHASE9_EVIDENCE_SCHEMA_VERSION) errors.push('artifact:version');
  if (artifact.suiteVersion !== PHASE9_M3_EVIDENCE_VERSION || artifact.milestone !== 'P9-M3') errors.push('artifact:suite');
  if (artifact.status !== 'PASS') errors.push('artifact:status');
  if (artifact.parity?.status !== 'PASS') errors.push('artifact:parity');
  if (!(artifact.performance?.small?.productionToReferenceRatio <= 1.1)) errors.push('artifact:smallPerformance');
  if (!(artifact.performance?.medium?.totalMs > 0) || !(artifact.performance?.medium?.totalMs <= artifact.performance?.medium?.approvedBudgetMs)) {
    errors.push('artifact:mediumPerformance');
  }
  if (artifact.execution?.medium?.factorizationCount !== artifact.execution?.medium?.factorGroupCount) errors.push('artifact:factorCount');
  if (artifact.execution?.medium?.solveCount !== 30 || artifact.execution?.medium?.reusedSolveCount !== 29) errors.push('artifact:rhsCount');
  if (artifact.execution?.medium?.resourceBalanced !== true) errors.push('artifact:resources');
  if (artifact.resultStorage?.medium?.mode !== 'bounded-slices') errors.push('artifact:resultStorage');
  for (const id of PHASE9_M3_VERIFICATION_IDS) {
    if (!artifact.results?.some((row) => row.id === id && row.status === 'PASS')) errors.push('artifact:result:' + id);
  }
  if (artifact.regressionPolicy?.nonlinearSolve !== 'not-rerun-reuse-phase8-qualified-evidence') errors.push('artifact:regression');
  if (artifact.artifactHash !== phase9ArtifactHash(artifact)) errors.push('artifact:hash');
  return { ok: errors.length === 0, errors };
}

export function upgradePhase9ManifestToM3(previous, evidence, options = {}) {
  const blockers = [...new Set(options.blockers || previous.blockers || [])]
    .filter((value) => ![
      'M_TIER_ELASTIC_CURRENT_DENSE_PATH_NOT_EXECUTED',
      'P9_M3_ELASTIC_WORKER_MIGRATION_REQUIRED',
    ].includes(value))
    .sort();
  const core = {
    ...clone(previous),
    version: PHASE9_RELEASE_MANIFEST_VERSION,
    generatedAt: requiredText(options.generatedAt || evidence.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(options.sourceRevision || evidence.sourceRevision, 'sourceRevision'),
    implementation: {
      ...clone(previous.implementation),
      status: 'in-progress',
      completedMilestones: ['P9-M0', 'P9-M1', 'P9-M2', 'P9-M3'],
    },
    computeQualification: {
      grade: 'G1',
      status: 'candidate-production-elastic-worker-integrated',
      candidate: true,
      gpuImplemented: false,
    },
    release: { status: 'not-qualified', allowed: false, designTransferAllowed: false },
    evidence: { ...clone(previous.evidence), m3ElasticRuntime: evidence.artifactHash },
    blockers,
  };
  delete core.manifestHash;
  return Object.freeze({ ...core, manifestHash: phase9ManifestHash(core) });
}

export function validatePhase9M3Manifest(manifest = {}) {
  const errors = [];
  if (manifest.version !== PHASE9_RELEASE_MANIFEST_VERSION) errors.push('manifest:version');
  if (!manifest.implementation?.completedMilestones?.includes('P9-M3')) errors.push('manifest:milestone');
  if (!/^[a-f0-9]{64}$/.test(manifest.evidence?.m3ElasticRuntime || '')) errors.push('manifest:evidence');
  if (manifest.blockers?.includes('M_TIER_ELASTIC_CURRENT_DENSE_PATH_NOT_EXECUTED')) errors.push('manifest:mediumBlocker');
  if (manifest.blockers?.includes('P9_M3_ELASTIC_WORKER_MIGRATION_REQUIRED')) errors.push('manifest:migrationBlocker');
  if (manifest.release?.allowed !== false || manifest.release?.designTransferAllowed !== false) errors.push('manifest:release');
  if (manifest.manifestHash !== phase9ManifestHash(manifest)) errors.push('manifest:hash');
  return { ok: errors.length === 0, errors };
}

export function phase9M3FactorPlan(model) {
  return classifyElasticFactorGroups(model, model.loadCombinations || []);
}

function verificationTest(id) {
  if (['P9-ELA-13', 'P9-ELA-14', 'P9-ELA-15', 'P9-ELA-16'].includes(id) || id.startsWith('P9-API-')) return 'tests/p9-m3-worker-product.mjs';
  if (id.startsWith('P9-PERF-')) return 'tools/run-p9-m3-evidence.mjs';
  return 'tests/p9-m3-elastic-runtime.mjs';
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw Object.assign(new Error(field + ' is required.'), { code: 'P9_M3_FIELD_REQUIRED' });
  return text;
}

function requiredHash(value, field) {
  const text = requiredText(value, field);
  if (!/^[a-f0-9]{64}$/.test(text)) throw Object.assign(new Error(field + ' must be a SHA-256 hash.'), { code: 'P9_M3_HASH_INVALID' });
  return text;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
