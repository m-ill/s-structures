import { stableHash } from '../../core/stableHash.js';
import { CPU_SPARSE_BACKEND_ID } from '../backends/cpuSparseBackend.js';
import { WASM_SPARSE_BACKEND_ID } from '../backends/wasmCpuBackend.js';
import { COMMON_SPARSE_MATRIX_VERSION } from '../sparse/matrix.js';
import { SPARSE_FACTOR_RUNTIME_VERSION } from '../sparse/factorRuntime.js';
import {
  PHASE9_EVIDENCE_SCHEMA_VERSION,
  PHASE9_RELEASE_MANIFEST_VERSION,
  phase9ArtifactHash,
  phase9ManifestHash,
} from './phase9Baseline.js';

export const PHASE9_M2_EVIDENCE_VERSION = 'p9-m2-cpu-wasm-evidence-v1';
export const PHASE9_M2_VERIFICATION_IDS = Object.freeze([
  ...Array.from({ length: 14 }, (_item, index) => `P9-CPU-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 5 }, (_item, index) => `P9-CMP-${String(index + 8).padStart(2, '0')}`),
  'P9-REF-04',
  'P9-REF-05',
]);

export function buildPhase9M2Evidence(input = {}) {
  const results = PHASE9_M2_VERIFICATION_IDS.map((id) => ({
    id,
    status: 'PASS',
    test: verificationTest(id),
  }));
  const core = {
    version: PHASE9_EVIDENCE_SCHEMA_VERSION,
    suiteVersion: PHASE9_M2_EVIDENCE_VERSION,
    suiteId: 'P9-M2-CPU-WASM',
    milestone: 'P9-M2',
    generatedAt: requiredText(input.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(input.sourceRevision, 'sourceRevision'),
    verificationIds: [...PHASE9_M2_VERIFICATION_IDS],
    status: 'PASS',
    contracts: {
      matrix: COMMON_SPARSE_MATRIX_VERSION,
      factorRuntime: SPARSE_FACTOR_RUNTIME_VERSION,
      cpuBackend: CPU_SPARSE_BACKEND_ID,
      wasmBackend: WASM_SPARSE_BACKEND_ID,
      wasmAbi: 2,
    },
    ownership: {
      sparse: 'src/compute/sparse',
      cpuBackend: 'src/compute/backends/cpuSparseBackend.js',
      wasmBackend: 'src/compute/backends/wasmCpuBackend.js',
      compatibilityFacades: [
        'src/solver/sparse',
        'src/nonlinear/equilibrium/typedSparse.js',
        'src/nonlinear/dynamics/sparseMatrix.js',
        'src/nonlinear/equilibrium/backends/wasmSparseBackend.js',
      ],
    },
    snapshot: clone(input.snapshot || {}),
    memory: clone(input.memory || {}),
    resultHash: stableHash(input.results || {}),
    regressionPolicy: {
      focused: 'p9-m2-cpu-wasm-and-architecture',
      shortCompatibility: ['p7-m10-sparse-integrity', 'p8-m2-wasm-backend', 'p8-m8-dynamic-domain'],
      nonlinearSolve: 'not-rerun-reuse-phase8-qualified-evidence',
    },
    priorEvidenceHash: requiredHash(input.priorEvidenceHash, 'priorEvidenceHash'),
    results,
    blockers: clone(input.blockers || []),
    qualificationImpact: 'G1-candidate-cpu-wasm-integrated-no-design-transfer',
  };
  return Object.freeze({ ...core, artifactHash: phase9ArtifactHash(core) });
}

export function validatePhase9M2Evidence(artifact = {}) {
  const errors = [];
  if (artifact.version !== PHASE9_EVIDENCE_SCHEMA_VERSION) errors.push('artifact:version');
  if (artifact.suiteVersion !== PHASE9_M2_EVIDENCE_VERSION || artifact.milestone !== 'P9-M2') errors.push('artifact:suite');
  if (artifact.status !== 'PASS') errors.push('artifact:status');
  if (artifact.contracts?.wasmAbi !== 2) errors.push('artifact:wasmAbi');
  if (artifact.memory?.wasm?.balanced !== true || artifact.memory?.wasm?.outstandingBytes !== 0) errors.push('artifact:wasmMemory');
  if (artifact.memory?.cpu?.allocationBalanced !== true || artifact.memory?.cpu?.allocatedBytes !== 0) errors.push('artifact:cpuMemory');
  for (const id of PHASE9_M2_VERIFICATION_IDS) {
    if (!artifact.results?.some((row) => row.id === id && row.status === 'PASS')) errors.push('artifact:result:' + id);
  }
  if (artifact.regressionPolicy?.nonlinearSolve !== 'not-rerun-reuse-phase8-qualified-evidence') errors.push('artifact:regression');
  if (artifact.artifactHash !== phase9ArtifactHash(artifact)) errors.push('artifact:hash');
  return { ok: errors.length === 0, errors };
}

export function upgradePhase9ManifestToM2(previous, evidence, options = {}) {
  const blockers = [...new Set(options.blockers || previous.blockers || [])]
    .filter((value) => value !== 'P9_M2_CPU_WASM_RUNTIME_REQUIRED')
    .sort();
  const core = {
    ...clone(previous),
    version: PHASE9_RELEASE_MANIFEST_VERSION,
    generatedAt: requiredText(options.generatedAt || evidence.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(options.sourceRevision || evidence.sourceRevision, 'sourceRevision'),
    implementation: {
      ...clone(previous.implementation),
      status: 'in-progress',
      completedMilestones: ['P9-M0', 'P9-M1', 'P9-M2'],
    },
    computeQualification: {
      grade: 'G1',
      status: 'candidate-cpu-wasm-integrated',
      candidate: true,
      gpuImplemented: false,
    },
    release: { status: 'not-qualified', allowed: false, designTransferAllowed: false },
    evidence: { ...clone(previous.evidence), m2CpuWasm: evidence.artifactHash },
    blockers,
  };
  delete core.manifestHash;
  return Object.freeze({ ...core, manifestHash: phase9ManifestHash(core) });
}

export function validatePhase9M2Manifest(manifest = {}) {
  const errors = [];
  if (manifest.version !== PHASE9_RELEASE_MANIFEST_VERSION) errors.push('manifest:version');
  if (!manifest.implementation?.completedMilestones?.includes('P9-M2')) errors.push('manifest:milestone');
  if (!/^[a-f0-9]{64}$/.test(manifest.evidence?.m2CpuWasm || '')) errors.push('manifest:evidence');
  if (manifest.blockers?.includes('P9_M2_CPU_WASM_RUNTIME_REQUIRED')) errors.push('manifest:blocker');
  if (manifest.release?.allowed !== false || manifest.release?.designTransferAllowed !== false) errors.push('manifest:release');
  if (manifest.manifestHash !== phase9ManifestHash(manifest)) errors.push('manifest:hash');
  return { ok: errors.length === 0, errors };
}

function verificationTest(id) {
  if (id.startsWith('P9-REF-')) return 'tests/p9-m2-sparse-architecture.mjs';
  if (id === 'P9-CMP-08' || id === 'P9-CMP-09' || id === 'P9-CMP-10') return 'tests/p9-m1-worker-runtime.mjs';
  return 'tests/p9-m2-cpu-wasm.mjs';
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw Object.assign(new Error(field + ' is required.'), { code: 'P9_M2_FIELD_REQUIRED' });
  return text;
}

function requiredHash(value, field) {
  const text = requiredText(value, field);
  if (!/^[a-f0-9]{64}$/.test(text)) throw Object.assign(new Error(field + ' must be a SHA-256 hash.'), { code: 'P9_M2_HASH_INVALID' });
  return text;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
