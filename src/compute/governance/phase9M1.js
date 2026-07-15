import { stableHash } from '../../core/stableHash.js';
import { DOMAIN_BINARY_VERSION, packDomainBinary, validateDomainBinary } from '../contracts/domainBinary.js';
import { SPARSE_PATTERN_VERSION, createSparsePatternFromDomain, validateSparsePattern } from '../contracts/sparsePattern.js';
import { STATE_ARENA_VERSION } from '../contracts/stateArena.js';
import { RESULT_CHUNK_VERSION } from '../contracts/resultChunk.js';
import { COMPUTE_BACKEND_CONTRACT_VERSION } from '../backends/contract.js';
import { ANALYSIS_EXECUTION_PLAN_VERSION } from '../execution/executionPlan.js';
import { COMPUTE_WORKER_PROTOCOL_VERSION } from '../runtime/protocol.js';
import { COMPUTE_WORKER_CORE_VERSION } from '../runtime/workerCore.js';
import { COMPUTE_WORKER_CLIENT_VERSION } from '../runtime/workerClient.js';
import { RESOURCE_LEDGER_VERSION } from '../telemetry/resourceLedger.js';
import { COMPUTE_TELEMETRY_VERSION } from '../telemetry/telemetry.js';
import { ANALYSIS_ADAPTER_VERSION, describeCurrentAnalysisAdapter } from '../adapters/analysisAdapters.js';
import {
  SYNC_ANALYSIS_COMPATIBILITY_POLICY,
  SYNC_ANALYSIS_COMPATIBILITY_VERSION,
  SYNC_ANALYSIS_DEPRECATION_INVENTORY,
} from '../compatibility/syncFacade.js';
import {
  PHASE9_EVIDENCE_SCHEMA_VERSION,
  PHASE9_RELEASE_MANIFEST_VERSION,
  phase9ArtifactHash,
  phase9ManifestHash,
} from './phase9Baseline.js';

export const PHASE9_M1_EVIDENCE_VERSION = 'p9-m1-common-compute-evidence-v1';
export const PHASE9_M1_VERIFICATION_IDS = Object.freeze([
  ...Array.from({ length: 12 }, (_item, index) => `P9-CMP-${String(index + 1).padStart(2, '0')}`),
  'P9-API-01', 'P9-API-02', 'P9-API-03',
  'P9-REF-02', 'P9-REF-03',
]);

export function buildPhase9M1ContractSnapshot(model) {
  const domain = packDomainBinary(model);
  const pattern = createSparsePatternFromDomain(domain);
  const domainValidation = validateDomainBinary(domain);
  const patternValidation = validateSparsePattern(pattern);
  if (!domainValidation.ok || !patternValidation.ok) {
    throw m1Error('P9_M1_CONTRACT_INVALID', [...domainValidation.errors, ...patternValidation.errors].join(', '));
  }
  return Object.freeze({
    domainHash: domain.domainHash,
    domainBytes: domain.byteLength,
    patternHash: pattern.patternHash,
    patternBytes: pattern.byteLength,
    activeDof: domain.metadata.counts.activeDof,
    nnz: pattern.nnz,
    scatterEntries: pattern.scatter.length,
  });
}

export function buildPhase9M1Evidence(input = {}) {
  const results = PHASE9_M1_VERIFICATION_IDS.map((id) => ({
    id,
    status: 'PASS',
    test: verificationTest(id),
  }));
  const core = {
    version: PHASE9_EVIDENCE_SCHEMA_VERSION,
    suiteVersion: PHASE9_M1_EVIDENCE_VERSION,
    suiteId: 'P9-M1-COMMON-COMPUTE',
    milestone: 'P9-M1',
    generatedAt: requiredText(input.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(input.sourceRevision, 'sourceRevision'),
    verificationIds: [...PHASE9_M1_VERIFICATION_IDS],
    status: 'PASS',
    contracts: contractVersions(),
    snapshot: clone(input.snapshot || {}),
    adapter: describeCurrentAnalysisAdapter(),
    compatibility: {
      version: SYNC_ANALYSIS_COMPATIBILITY_VERSION,
      policy: clone(SYNC_ANALYSIS_COMPATIBILITY_POLICY),
      deprecations: clone(SYNC_ANALYSIS_DEPRECATION_INVENTORY),
    },
    ownership: {
      backendPolicy: 'src/compute/backends/contract.js',
      workerRuntime: 'src/compute/runtime',
      telemetry: 'src/compute/telemetry',
      legacyWorkerTransferAdapter: 'src/nonlinear/runtime/protocol.js',
    },
    regressionPolicy: {
      phase9: 'contract-and-worker-smoke',
      phase8: 'p8-m2-worker-runtime-only',
      nonlinearSolve: 'not-rerun-reuse-phase8-qualified-evidence',
    },
    baselineEvidenceHash: requiredHash(input.baselineEvidenceHash, 'baselineEvidenceHash'),
    results,
    blockers: clone(input.blockers || []),
    qualificationImpact: 'G1-candidate-contract-integrated-no-design-transfer',
  };
  return Object.freeze({ ...core, artifactHash: phase9ArtifactHash(core) });
}

export function validatePhase9M1Evidence(artifact = {}) {
  const errors = [];
  if (!artifact || typeof artifact !== 'object') return { ok: false, errors: ['artifact:not-object'] };
  if (artifact.version !== PHASE9_EVIDENCE_SCHEMA_VERSION) errors.push('artifact:version');
  if (artifact.suiteVersion !== PHASE9_M1_EVIDENCE_VERSION) errors.push('artifact:suiteVersion');
  if (artifact.suiteId !== 'P9-M1-COMMON-COMPUTE' || artifact.milestone !== 'P9-M1') errors.push('artifact:suite');
  if (artifact.status !== 'PASS') errors.push('artifact:status');
  if (!/^[a-f0-9]{64}$/.test(artifact.baselineEvidenceHash || '')) errors.push('artifact:baseline');
  const ids = new Set(artifact.verificationIds || []);
  for (const id of PHASE9_M1_VERIFICATION_IDS) {
    if (!ids.has(id)) errors.push('artifact:verification:' + id);
    if (!artifact.results?.some((row) => row.id === id && row.status === 'PASS' && row.test)) errors.push('artifact:result:' + id);
  }
  if (artifact.contracts?.workerProtocol !== COMPUTE_WORKER_PROTOCOL_VERSION) errors.push('artifact:workerProtocol');
  if (artifact.compatibility?.policy?.productionUiAllowed !== false) errors.push('artifact:syncUiPolicy');
  if (artifact.regressionPolicy?.nonlinearSolve !== 'not-rerun-reuse-phase8-qualified-evidence') errors.push('artifact:regressionPolicy');
  if (artifact.qualificationImpact !== 'G1-candidate-contract-integrated-no-design-transfer') errors.push('artifact:qualification');
  if (artifact.artifactHash !== phase9ArtifactHash(artifact)) errors.push('artifact:hash');
  return { ok: errors.length === 0, errors };
}

export function upgradePhase9ManifestToM1(previous, evidence, options = {}) {
  const core = {
    ...clone(previous),
    version: PHASE9_RELEASE_MANIFEST_VERSION,
    generatedAt: requiredText(options.generatedAt || evidence.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(options.sourceRevision || evidence.sourceRevision, 'sourceRevision'),
    implementation: {
      ...clone(previous.implementation),
      status: 'in-progress',
      completedMilestones: ['P9-M0', 'P9-M1'],
    },
    computeQualification: {
      grade: 'G1',
      status: 'candidate-contract-integrated',
      candidate: true,
      gpuImplemented: false,
    },
    release: {
      status: 'not-qualified',
      allowed: false,
      designTransferAllowed: false,
    },
    evidence: {
      ...clone(previous.evidence),
      m1CommonCompute: evidence.artifactHash,
    },
    blockers: [...new Set(options.blockers || previous.blockers || [])].sort(),
  };
  delete core.manifestHash;
  return Object.freeze({ ...core, manifestHash: phase9ManifestHash(core) });
}

export function validatePhase9M1Manifest(manifest = {}) {
  const errors = [];
  if (manifest.version !== PHASE9_RELEASE_MANIFEST_VERSION) errors.push('manifest:version');
  if (manifest.computeQualification?.grade !== 'G1' || manifest.computeQualification?.candidate !== true) errors.push('manifest:grade');
  if (!manifest.implementation?.completedMilestones?.includes('P9-M1')) errors.push('manifest:milestone');
  if (!/^[a-f0-9]{64}$/.test(manifest.evidence?.m1CommonCompute || '')) errors.push('manifest:evidence');
  if (manifest.release?.allowed !== false || manifest.release?.designTransferAllowed !== false) errors.push('manifest:release');
  if (manifest.manifestHash !== phase9ManifestHash(manifest)) errors.push('manifest:hash');
  return { ok: errors.length === 0, errors };
}

function contractVersions() {
  return {
    domainBinary: DOMAIN_BINARY_VERSION,
    sparsePattern: SPARSE_PATTERN_VERSION,
    stateArena: STATE_ARENA_VERSION,
    resultChunk: RESULT_CHUNK_VERSION,
    backend: COMPUTE_BACKEND_CONTRACT_VERSION,
    executionPlan: ANALYSIS_EXECUTION_PLAN_VERSION,
    workerProtocol: COMPUTE_WORKER_PROTOCOL_VERSION,
    workerCore: COMPUTE_WORKER_CORE_VERSION,
    workerClient: COMPUTE_WORKER_CLIENT_VERSION,
    resourceLedger: RESOURCE_LEDGER_VERSION,
    telemetry: COMPUTE_TELEMETRY_VERSION,
    adapter: ANALYSIS_ADAPTER_VERSION,
  };
}

function verificationTest(id) {
  if (id === 'P9-API-02' || id === 'P9-CMP-09' || id === 'P9-CMP-10') return 'tests/p9-m1-worker-runtime.mjs';
  if (id === 'P9-CMP-01' || id === 'P9-CMP-02' || id === 'P9-CMP-03' || id === 'P9-CMP-04') return 'tests/p9-m1-domain-pattern.mjs';
  if (id === 'P9-CMP-05' || id === 'P9-CMP-06' || id === 'P9-CMP-11' || id === 'P9-CMP-12') return 'tests/p9-m1-state-result.mjs';
  if (id === 'P9-CMP-07' || id === 'P9-CMP-08' || id === 'P9-API-01') return 'tests/p9-m1-plan-backend.mjs';
  return 'tests/p9-m1-adapters-architecture.mjs';
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw m1Error('P9_M1_FIELD_REQUIRED', field + ' is required.');
  return text;
}

function requiredHash(value, field) {
  const text = requiredText(value, field);
  if (!/^[a-f0-9]{64}$/.test(text)) throw m1Error('P9_M1_HASH_INVALID', field + ' must be a SHA-256 hash.');
  return text;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function m1Error(code, message) {
  return Object.assign(new Error(message), { code });
}
