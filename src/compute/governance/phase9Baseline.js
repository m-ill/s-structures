import { stableHash } from '../../core/stableHash.js';

export const PHASE9_BASELINE_CONTRACT_VERSION = 'p9-m0-baseline-contract-v1';
export const PHASE9_EVIDENCE_SCHEMA_VERSION = 'p9-evidence-artifact-v1';
export const PHASE9_DEBT_REGISTRY_VERSION = 'p9-m0-debt-registry-v1';
export const PHASE9_RELEASE_MANIFEST_VERSION = 'p9-release-manifest-v1';

export function phase9MilestoneRank(value) {
  if (value === 'external-qualification') return Number.POSITIVE_INFINITY;
  const match = /^P9-M(\d+)$/.exec(String(value || ''));
  return match ? Number(match[1]) : -1;
}

export function phase9MilestoneAtOrBeyond(value, milestone) {
  return phase9MilestoneRank(value) >= milestone;
}

export const PHASE9_BASELINE_VERIFICATION_IDS = Object.freeze([
  'P9-BASE-01',
  'P9-BASE-02',
  'P9-BASE-03',
  'P9-BASE-04',
  'P9-BASE-05',
  'P9-BASE-06',
  'P9-BASE-07',
  'P9-BASE-08',
  'P9-BASE-09',
  'P9-BASE-10',
  'P9-REF-01',
]);

export const PHASE9_CODE_OWNERS = deepFreeze([
  owner('elastic-orchestration', ['src/solver/linear3d.js'], 'src/solver/elastic', 'P9-M3'),
  owner('shared-sparse', ['src/solver/sparse', 'src/nonlinear/equilibrium/typedSparse.js'], 'src/compute/sparse', 'P9-M2'),
  owner('backend-policy', ['src/nonlinear/equilibrium/referenceBackends.js'], 'src/compute/backends', 'P9-M1'),
  owner('wasm-cpu', ['src/nonlinear/equilibrium/backends/wasmSparseBackend.js'], 'src/compute/backends/wasm-cpu', 'P9-M2'),
  owner('worker-runtime', ['src/nonlinear/runtime'], 'src/compute/runtime', 'P9-M1'),
  owner('modal-eigen', ['src/dynamics/modal.js'], 'src/compute/eigen', 'P9-M6'),
  owner('buckling-eigen', ['src/dynamics/globalBuckling.js'], 'src/compute/eigen', 'P9-M6'),
  owner('nonlinear-batch', ['src/nonlinear/equilibrium/assembler.js'], 'src/nonlinear/batch', 'P9-M7'),
  owner('product-analysis-service', ['src/ui/analysisRunners.js'], 'src/compute/product', 'P9-M9'),
  owner('compute-telemetry', ['src/nonlinear/performanceBaseline.js'], 'src/compute/telemetry', 'P9-M1'),
]);

export const PHASE9_DEBT_ROWS = deepFreeze([
  debt('P9-DEBT-01', ['src/solver/linear3d.js'], 'Monolithic elastic orchestrator', 'elastic-orchestration', 'P9-M3', 'Split validation, planning, solve, recovery and design orchestration.'),
  debt('P9-DEBT-02', ['src/solver/sparse'], 'Linear-only Array-based CSC ownership', 'shared-sparse', 'P9-M2', 'Move canonical sparse schema and operations to src/compute/sparse.'),
  debt('P9-DEBT-03', ['src/nonlinear/equilibrium/typedSparse.js'], 'Duplicate nonlinear typed sparse schema', 'shared-sparse', 'P9-M2', 'Adopt the common sparse schema and delete the duplicate implementation.'),
  debt('P9-DEBT-04', ['src/nonlinear/equilibrium/referenceBackends.js'], 'Nonlinear-only backend policy', 'backend-policy', 'P9-M1', 'Replace with the common capability and execution-plan policy.'),
  debt('P9-DEBT-05', ['src/nonlinear/equilibrium/backends/wasmSparseBackend.js'], 'Single-RHS and repeated-copy WASM ABI', 'wasm-cpu', 'P9-M2', 'Introduce persistent handles and a multi-RHS ABI.'),
  debt('P9-DEBT-06', ['src/nonlinear/equilibrium/assembler.js'], 'Object cloning and sequential element evaluation', 'nonlinear-batch', 'P9-M7', 'Use versioned SoA element batches with parity coverage.'),
  debt('P9-DEBT-07', ['src/dynamics/modal.js'], 'Dense matrix and eigen responsibilities mixed with recovery', 'modal-eigen', 'P9-M6', 'Extract sparse requested-mode operators from solver recovery.'),
  debt('P9-DEBT-08', ['src/dynamics/globalBuckling.js'], 'Assembly, eigen solve and recovery mixed together', 'buckling-eigen', 'P9-M6', 'Share eigen operators and retain buckling-specific recovery.'),
  debt('P9-DEBT-09', ['src/ui', 'src/solver'], 'Synchronous analyzeModel call sites', 'product-analysis-service', 'P9-M9', 'Migrate production callers to the async product analysis service.'),
  debt('P9-DEBT-10', ['src/index.js', 'src/nonlinear'], 'Legacy and preliminary engines remain publicly reachable', 'product-analysis-service', 'P9-M10', 'Move compatibility routes to an explicit expiring legacy registry.'),
  debt('P9-DEBT-11', ['src/nonlinear/runtime'], 'Worker protocols and lifecycle are solver-specific', 'worker-runtime', 'P9-M1', 'Adopt one versioned compute job protocol and lifecycle.'),
  debt('P9-DEBT-12', ['src/nonlinear/performanceBaseline.js', 'src/ui/analysisRunners.js'], 'Backend timing and result fields are inconsistent', 'compute-telemetry', 'P9-M1', 'Adopt a shared bounded stage telemetry schema.'),
]);

export function buildPhase9BaselineCatalog(workloads = []) {
  return deepFreeze({
    version: PHASE9_BASELINE_CONTRACT_VERSION,
    verificationIds: PHASE9_BASELINE_VERIFICATION_IDS,
    workloads: clone(workloads),
    owners: PHASE9_CODE_OWNERS,
    debt: PHASE9_DEBT_ROWS,
    precision: {
      canonical: 'f64',
      backend: 'cpu-wasm',
      gpuQualification: 'G0',
    },
    nonlinearRegressionPolicy: {
      mode: 'reuse-phase8-evidence',
      rerun: false,
      reason: 'P8 production nonlinear suites already passed; M0 freezes their evidence hashes.',
    },
  });
}

export function buildPhase9DebtRegistry({ generatedAt, sourceRevision, inventories = {} } = {}) {
  const rows = PHASE9_DEBT_ROWS.map((row) => ({
    ...clone(row),
    inventory: clone(inventories[row.id] || []),
    status: 'open',
  }));
  const core = {
    version: PHASE9_DEBT_REGISTRY_VERSION,
    generatedAt: requiredText(generatedAt, 'generatedAt'),
    sourceRevision: requiredText(sourceRevision, 'sourceRevision'),
    status: 'frozen',
    owners: clone(PHASE9_CODE_OWNERS),
    rows,
    retention: {
      committed: ['summary evidence', 'fixture descriptors and hashes', 'review and release manifests'],
      generatedOnDemand: ['materialized M/L fixture models', 'raw profiler traces', 'backend binaries'],
      forbidden: ['manually edited generated evidence', 'artifact without source revision', 'unbounded raw history'],
    },
  };
  return deepFreeze({ ...core, artifactHash: phase9ArtifactHash(core) });
}

export function validatePhase9DebtRegistry(registry = {}) {
  const errors = [];
  if (!record(registry)) return invalid('registry:not-object');
  if (registry.version !== PHASE9_DEBT_REGISTRY_VERSION) errors.push('registry:version');
  if (!text(registry.generatedAt)) errors.push('registry:generatedAt');
  if (!text(registry.sourceRevision)) errors.push('registry:sourceRevision');
  if (registry.status !== 'frozen') errors.push('registry:status');
  const ownerIds = new Set((registry.owners || []).map((row) => row.id));
  const rows = Array.isArray(registry.rows) ? registry.rows : [];
  if (rows.length !== PHASE9_DEBT_ROWS.length || new Set(rows.map((row) => row?.id)).size !== rows.length) {
    errors.push('registry:row-set');
  }
  for (const expected of PHASE9_DEBT_ROWS) {
    const row = rows.find((item) => item?.id === expected.id);
    if (!row) {
      errors.push(`registry:missing:${expected.id}`);
      continue;
    }
    if (!ownerIds.has(row.owner)) errors.push(`registry:owner:${row.id}`);
    if (!/^P9-M(?:[1-9]|10)$/.test(row.targetMilestone || '')) errors.push(`registry:milestone:${row.id}`);
    if (!text(row.replacement)) errors.push(`registry:replacement:${row.id}`);
    if (!Array.isArray(row.currentPaths) || !row.currentPaths.length) errors.push(`registry:paths:${row.id}`);
    if (!Array.isArray(row.inventory)) errors.push(`registry:inventory:${row.id}`);
  }
  if (!record(registry.retention)) errors.push('registry:retention');
  if (registry.artifactHash !== phase9ArtifactHash(registry)) errors.push('registry:artifactHash');
  return { ok: errors.length === 0, errors };
}

export function buildPhase9BaselineEvidence(input = {}) {
  const core = {
    version: PHASE9_EVIDENCE_SCHEMA_VERSION,
    suiteId: 'P9-M0-BASELINE',
    milestone: 'P9-M0',
    verificationIds: [...PHASE9_BASELINE_VERIFICATION_IDS],
    generatedAt: requiredText(input.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(input.sourceRevision, 'sourceRevision'),
    environment: clone(input.environment || {}),
    backendBuilds: clone(input.backendBuilds || {}),
    executionPlan: clone(input.executionPlan || {}),
    fixtureHash: requiredText(input.fixtureHash, 'fixtureHash'),
    actual: clone(input.actual || {}),
    reference: clone(input.reference || {}),
    tolerances: clone(input.tolerances || {}),
    recomputedErrors: clone(input.recomputedErrors || {}),
    results: clone(input.results || []),
    status: input.status || 'PASS',
    blockers: clone(input.blockers || []),
    qualificationImpact: input.qualificationImpact || 'G0-baseline-only',
  };
  return deepFreeze({ ...core, artifactHash: phase9ArtifactHash(core) });
}

export function validatePhase9BaselineEvidence(artifact = {}) {
  const errors = [];
  if (!record(artifact)) return invalid('artifact:not-object');
  if (artifact.version !== PHASE9_EVIDENCE_SCHEMA_VERSION) errors.push('artifact:version');
  if (artifact.suiteId !== 'P9-M0-BASELINE') errors.push('artifact:suiteId');
  if (artifact.milestone !== 'P9-M0') errors.push('artifact:milestone');
  if (artifact.status !== 'PASS') errors.push('artifact:status');
  for (const field of ['generatedAt', 'sourceRevision', 'fixtureHash', 'qualificationImpact']) {
    if (!text(artifact[field])) errors.push(`artifact:${field}`);
  }
  for (const field of ['environment', 'backendBuilds', 'executionPlan', 'actual', 'reference', 'tolerances', 'recomputedErrors']) {
    if (!record(artifact[field])) errors.push(`artifact:${field}`);
  }
  if (artifact.backendBuilds?.gpu?.implemented !== false || artifact.backendBuilds?.gpu?.qualification !== 'G0') {
    errors.push('artifact:gpu-qualification');
  }
  if (artifact.executionPlan?.mediumLargePolicy !== 'materialize-hash-preflight-only'
    || artifact.executionPlan?.nonlinearPolicy !== 'reuse-phase8-evidence-no-rerun') {
    errors.push('artifact:execution-policy');
  }
  const ids = new Set(Array.isArray(artifact.verificationIds) ? artifact.verificationIds : []);
  const results = Array.isArray(artifact.results) ? artifact.results : [];
  for (const id of PHASE9_BASELINE_VERIFICATION_IDS) {
    if (!ids.has(id)) errors.push(`artifact:verification:${id}`);
    const row = results.find((item) => item?.id === id);
    if (!row || row.status !== 'PASS' || !text(row.test)) errors.push(`artifact:result:${id}`);
  }
  const fixtureRows = artifact.actual?.fixtures || [];
  const tiers = new Set(fixtureRows.map((row) => row.tier));
  for (const tier of ['S', 'M', 'L']) if (!tiers.has(tier)) errors.push(`artifact:fixture-tier:${tier}`);
  const small = fixtureRows.find((row) => row.tier === 'S');
  if (!small
    || artifact.actual?.operationCounts?.elasticMembers !== small.memberCount
    || artifact.actual?.operationCounts?.elasticCombinations !== small.combinationCount
    || artifact.actual?.golden?.elastic?.complete !== true) {
    errors.push('artifact:elastic-s-tier');
  }
  const timings = Array.isArray(artifact.actual?.timings) ? artifact.actual.timings : [];
  if (!timings.length || timings.some((row) => !Array.isArray(row.rawSamplesMs) || !row.rawSamplesMs.length)) {
    errors.push('artifact:timings');
  }
  if (!record(artifact.actual?.memory) || !Number.isFinite(artifact.actual.memory.peakRssBytes)) errors.push('artifact:memory');
  if (!record(artifact.actual?.mainThreadLatency)) errors.push('artifact:mainThreadLatency');
  if (!Array.isArray(artifact.reference?.nonlinearEvidence) || artifact.reference.nonlinearEvidence.length < 2) {
    errors.push('artifact:nonlinearEvidence');
  } else if (artifact.reference.nonlinearEvidence.some((row) => row?.status !== 'PASS'
    || row?.rerun !== false
    || !/^[a-f0-9]{64}$/.test(row?.evidenceHash || '')
    || !text(row?.sourceRevision))) {
    errors.push('artifact:nonlinearEvidence-policy');
  }
  if (!Number.isFinite(artifact.recomputedErrors?.stageAccountingMs)) errors.push('artifact:stageAccounting');
  for (const [name, tolerance] of Object.entries(artifact.tolerances || {})) {
    const errorName = name === 'stageAccountingAbsoluteMs' ? 'stageAccountingMs' : name;
    if (!Number.isFinite(tolerance)
      || !Number.isFinite(artifact.recomputedErrors?.[errorName])
      || artifact.recomputedErrors[errorName] > tolerance) {
      errors.push(`artifact:tolerance:${name}`);
    }
  }
  const stageSumMs = timings.flatMap((row) => row.rawSamplesMs || []).reduce((sum, value) => sum + value, 0);
  const accounting = artifact.actual?.timerAccounting;
  if (!record(accounting)
    || Math.abs(stageSumMs - Number(accounting.stageSumMs)) > 0.001
    || Math.abs(Number(accounting.totalMs) - Number(accounting.stageSumMs) - Number(accounting.overheadMs)) > 0.001) {
    errors.push('artifact:timer-accounting');
  }
  if (artifact.qualificationImpact !== 'G0-baseline-only-no-design-transfer') errors.push('artifact:qualificationImpact');
  if (artifact.artifactHash !== phase9ArtifactHash(artifact)) errors.push('artifact:artifactHash');
  return { ok: errors.length === 0, errors };
}

export function buildPhase9ReleaseManifestSkeleton({ generatedAt, sourceRevision, evidence = {}, blockers = [] } = {}) {
  const core = {
    version: PHASE9_RELEASE_MANIFEST_VERSION,
    generatedAt: requiredText(generatedAt, 'generatedAt'),
    sourceRevision: requiredText(sourceRevision, 'sourceRevision'),
    phase: 'Phase 9',
    implementation: {
      status: 'in-progress',
      completedMilestones: ['P9-M0'],
      requiredMilestones: Array.from({ length: 11 }, (_item, index) => `P9-M${index}`),
    },
    computeQualification: {
      grade: 'G0',
      status: 'baseline-only',
      gpuImplemented: false,
    },
    release: {
      status: 'not-qualified',
      allowed: false,
      designTransferAllowed: false,
    },
    evidence: clone(evidence),
    blockers: [...new Set(blockers)].sort(),
  };
  return deepFreeze({ ...core, manifestHash: phase9ManifestHash(core) });
}

export function validatePhase9ReleaseManifestSkeleton(manifest = {}) {
  const errors = [];
  if (!record(manifest)) return invalid('manifest:not-object');
  if (manifest.version !== PHASE9_RELEASE_MANIFEST_VERSION) errors.push('manifest:version');
  if (!text(manifest.generatedAt)) errors.push('manifest:generatedAt');
  if (!text(manifest.sourceRevision)) errors.push('manifest:sourceRevision');
  if (!/^G[0-3]$/.test(manifest.computeQualification?.grade || '')) errors.push('manifest:grade');
  if (typeof manifest.computeQualification?.gpuImplemented !== 'boolean') errors.push('manifest:gpu');
  if (!['in-progress', 'implementation-complete-qualification-blocked'].includes(manifest.implementation?.status)
    || !Array.isArray(manifest.implementation?.completedMilestones)
    || !manifest.implementation.completedMilestones.includes('P9-M0')) {
    errors.push('manifest:implementation');
  }
  if (manifest.release?.allowed !== false || manifest.release?.designTransferAllowed !== false) errors.push('manifest:release');
  const required = manifest.implementation?.requiredMilestones || [];
  if (required.length !== 11 || !required.includes('P9-M0') || !required.includes('P9-M10')) errors.push('manifest:milestones');
  if (!/^[a-f0-9]{64}$/.test(manifest.evidence?.baseline || '')
    || !/^[a-f0-9]{64}$/.test(manifest.evidence?.debtRegistry || '')) {
    errors.push('manifest:evidence');
  }
  if (!Array.isArray(manifest.blockers) || manifest.blockers.length === 0) errors.push('manifest:blockers');
  if (manifest.manifestHash !== phase9ManifestHash(manifest)) errors.push('manifest:manifestHash');
  return { ok: errors.length === 0, errors };
}

export function phase9ArtifactHash(value) {
  const copy = clone(value);
  delete copy.artifactHash;
  return stableHash(copy);
}

export function phase9ManifestHash(value) {
  const copy = clone(value);
  delete copy.manifestHash;
  return stableHash(copy);
}

function owner(id, currentPaths, targetOwner, targetMilestone) {
  return { id, currentPaths, targetOwner, targetMilestone };
}

function debt(id, currentPaths, problem, ownerId, targetMilestone, replacement) {
  return { id, currentPaths, problem, owner: ownerId, targetMilestone, replacement };
}

function requiredText(value, field) {
  if (!text(value)) throw new TypeError(`${field} is required.`);
  return String(value).trim();
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function invalid(error) {
  return { ok: false, errors: [error] };
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}
