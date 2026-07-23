import { stableHash } from '../core/stableHash.js';
import { buildShellSoaBatch } from '../solver/shell/shellBatch.js';
import { runShellGpuBatch } from '../compute/backends/webgpu/shellKernels.js';

export const PHASE10_RELEASE_GATE_VERSION = 'p10-m11-release-gate-v2';
export const PHASE10_INTEGRATION_CONTRACT_VERSION = 'p10-m11-product-integration-v1';
export const PHASE10_PERFORMANCE_VERSION = 'p10-m11-large-model-performance-v1';

export const PHASE10_PRODUCT_FEATURES = Object.freeze([
  feature('timoshenko', 'P10-M2', ['model', 'analysis', 'report', 'calculation-package', 'agent']),
  feature('partial-fixity', 'P10-M3', ['model', 'analysis', 'report', 'calculation-package', 'agent'], 'Direct P-Delta uses the documented prismatic geometric-stiffness approximation.'),
  feature('offsets-panel-zones', 'P10-M4', ['model', 'analysis', 'report', 'calculation-package', 'agent'], 'Nonlinear corotational offsets fail closed.'),
  feature('mpc-rigid-links', 'P10-M5', ['model', 'analysis', 'report', 'calculation-package', 'agent']),
  feature('tapered-members', 'P10-M6', ['model', 'analysis', 'report', 'calculation-package', 'agent']),
  feature('prestressed-dynamics', 'P10-M7', ['analysis-center', 'report', 'calculation-package', 'agent'], 'Qualification is limited to the implemented prestressed modal/RSA/direct-integration scope.'),
  feature('warping-ltb', 'P10-M8', ['analysis', 'report', 'calculation-package', 'agent'], 'LTB option B is a verification check; it does not add a seventh frame DOF.'),
  feature('shell-fem', 'P10-M9', ['model', 'analysis-center', 'results', 'report', 'calculation-package', 'agent'], 'Plate design transfer is fail-closed until aspect-ratio, thickness, and mesh-convergence qualification passes; native WebGPU remains opt-in until device qualification passes.'),
  feature('slab-load-generation', 'P10-M10', ['model', 'analysis', 'report', 'calculation-package', 'agent'], 'Missing supporting beams use the traced fallback path.'),
]);

export function buildPhase10ProductIntegrationContract(options = {}) {
  const features = PHASE10_PRODUCT_FEATURES.map((row) => ({
    ...row,
    enabled: options.featureFlags?.[`feature.phase10-${row.id}`] !== false,
  }));
  const core = {
    version: PHASE10_INTEGRATION_CONTRACT_VERSION,
    phase: 'Phase 10',
    milestone: 'P10-M11',
    features,
    surfaces: ['model', 'analysis-center', 'results', 'report', 'calculation-package', 'agent'],
    limitations: [...new Set(features.map((row) => row.limitation).filter(Boolean))],
  };
  return freeze({ ...core, contractHash: stableHash(core).slice(0, 24) });
}

export function measurePhase10LargeModelPerformance(options = {}) {
  const elementCount = positiveInteger(options.elementCount, 120);
  const started = now();
  const { elements, nodeIndex } = shellGrid(elementCount);
  const batch = buildShellSoaBatch(elements, nodeIndex);
  if (!batch.ok) throw new Error(`Large-model shell batch failed: ${batch.reason}`);
  const shadow = runShellGpuBatch(batch, { tolerance: 1e-6, gpuResidualRefine: 1e-10 });
  const elapsedMs = now() - started;
  const memoryBytes = batch.typeCodes.byteLength + batch.nodeIndices.byteLength
    + batch.properties.byteLength + batch.matrixOffsets.byteLength + batch.dofOffsets.byteLength
    + batch.matrices.reduce((sum, row) => sum + row.byteLength, 0);
  const limits = { maxElapsedMs: Number(options.maxElapsedMs || 10_000), maxMemoryBytes: Number(options.maxMemoryBytes || 64 * 1024 * 1024) };
  const core = {
    version: PHASE10_PERFORMANCE_VERSION,
    profile: 'large-shell-feature-combination',
    elementCount,
    conceptualDofCount: (elementCount + 1) * 4 * 6,
    elapsedMs,
    memoryBytes,
    limits,
    cpuF64ReferencePassed: shadow.ok === true && shadow.tangentValues?.length > 0,
    gpuF32ShadowPassed: shadow.qualified === true,
    nativeWebGpuQualified: false,
    wasmRouteAvailable: options.wasmRouteAvailable === true,
    status: elapsedMs <= limits.maxElapsedMs && memoryBytes <= limits.maxMemoryBytes && shadow.qualified ? 'PASS' : 'FAIL',
  };
  return freeze({ ...core, measurementHash: stableHash(core).slice(0, 24) });
}

export function buildPhase10ReleaseGate(input = {}) {
  const xval = summarizeXval(input.xval || {});
  const evidence = summarizeEvidence(input.milestoneEvidence || []);
  const performance = input.performance || {};
  const integration = input.integration || buildPhase10ProductIntegrationContract();
  const checks = [
    check('implementation-evidence', evidence.complete, evidence.missing.length ? `Missing green milestone evidence: ${evidence.missing.join(', ')}` : null),
    check('product-integration', integration.features?.length === PHASE10_PRODUCT_FEATURES.length && integration.surfaces?.includes('agent'), 'Phase 10 product surface propagation is incomplete.'),
    check('large-model-performance', performance.status === 'PASS', 'Large-model CPU/GPU-shadow performance budget is not green.'),
    check('full-regression', input.fullRegressionPassed === true, 'Full npm test regression evidence is required.'),
    check('p3-docs', input.p3DocsPassed === true, 'test:p3docs evidence is required.'),
    check('agent-contract', input.agentContractPassed === true, 'Agent contract synchronization is required.'),
    check('documentation', input.documentationComplete === true, 'M11 status, review, and user documentation are required.'),
    check('shell-numerical-qualification', evidence.shellNumericalQualification.status === 'PASS', 'P10-M9 plate aspect-ratio, thickness, and mesh-convergence qualification is not green.'),
    check('external-cross-validation', xval.externallyCrossValidated, `Required external references are not green: ${xval.missingGreenCaseIds.join(', ')}`),
    check('native-webgpu-device', input.nativeWebGpuQualified === true, 'Native WebGPU K1-K3 device qualification is required.'),
  ];
  const implementationComplete = checks.slice(0, 7).every((row) => row.status === 'PASS');
  const releaseAllowed = checks.every((row) => row.status === 'PASS');
  const blockers = checks.filter((row) => row.status !== 'PASS').map((row) => blocker(row.id));
  const core = {
    version: PHASE10_RELEASE_GATE_VERSION,
    phase: 'Phase 10',
    milestone: 'P10-M11',
    generatedAt: input.generatedAt || null,
    sourceRevision: input.sourceRevision || null,
    implementation: { status: implementationComplete ? 'complete' : 'incomplete', completedMilestones: Array.from({ length: 12 }, (_, index) => `P10-M${index}`) },
    release: {
      status: releaseAllowed ? 'externally-cross-validated' : 'blocked',
      allowed: releaseAllowed,
      designTransferAllowed: releaseAllowed,
      externallyCrossValidated: xval.externallyCrossValidated,
    },
    checks,
    blockers,
    xval,
    evidence,
    performance: compactPerformance(performance),
    integrationContractHash: integration.contractHash || null,
  };
  return freeze({ ...core, artifactHash: stableHash(core).slice(0, 24) });
}

export function validatePhase10ReleaseGate(artifact = {}) {
  const errors = [];
  if (artifact.version !== PHASE10_RELEASE_GATE_VERSION || artifact.milestone !== 'P10-M11') errors.push('gate:version-scope');
  if (!Array.isArray(artifact.checks) || artifact.checks.length !== 10) errors.push('gate:checks');
  if (artifact.release?.allowed === true && artifact.checks?.some((row) => row.status !== 'PASS')) errors.push('gate:unsafe-release');
  if (artifact.release?.externallyCrossValidated === true && artifact.xval?.missingGreenCaseIds?.length) errors.push('gate:xval');
  if (artifact.implementation?.status === 'complete' && artifact.checks?.slice(0, 7).some((row) => row.status !== 'PASS')) errors.push('gate:implementation');
  const copy = clone(artifact); delete copy.artifactHash;
  if (artifact.artifactHash !== stableHash(copy).slice(0, 24)) errors.push('gate:hash');
  return { ok: errors.length === 0, errors };
}

function summarizeXval(input) {
  const required = Array.from({ length: 10 }, (_, index) => `XV-${String(index + 1).padStart(2, '0')}`);
  const cases = Array.isArray(input.cases) ? input.cases : [];
  const green = new Set(cases.filter((row) => row.status === 'PASS' && row.referenceSource !== 'pending-reference').map((row) => row.caseId));
  const inherited = input.releaseQualification || {};
  const missingGreenCaseIds = required.filter((id) => !green.has(id));
  return {
    requiredCaseIds: required,
    greenCaseIds: required.filter((id) => green.has(id)),
    missingGreenCaseIds,
    pendingReferenceCount: cases.filter((row) => row.status === 'PENDING' || row.referenceSource === 'pending-reference').length + Math.max(0, required.length - cases.length),
    externallyCrossValidated: missingGreenCaseIds.length === 0 && inherited.externallyCrossValidated !== false,
  };
}

function summarizeEvidence(rows) {
  const byMilestone = new Map(rows.map((row) => [row.milestone, row]));
  const required = Array.from({ length: 11 }, (_, index) => `P10-M${index}`);
  const missing = required.filter((id) => {
    const row = byMilestone.get(id);
    return !['OK', 'PASS'].includes(row?.status) && row?.implementationStatus !== 'complete';
  });
  const shell = byMilestone.get('P10-M9');
  const shellPassed = shell?.qualification?.cpuF64Qualified === true
    && shell?.qualification?.plateNumericalQualificationStatus === 'PASS';
  return {
    requiredMilestones: required,
    greenCount: required.length - missing.length,
    missing,
    complete: missing.length === 0,
    shellNumericalQualification: {
      status: shellPassed ? 'PASS' : 'BLOCKED',
      blocker: shellPassed ? null : (shell?.qualification?.plateNumericalQualificationBlocker || 'SHELL_PLATE_NUMERICAL_QUALIFICATION_MISSING'),
    },
  };
}

function compactPerformance(row) { return { version: row.version || null, status: row.status || 'MISSING', elementCount: row.elementCount || 0, elapsedMs: row.elapsedMs ?? null, memoryBytes: row.memoryBytes ?? null, nativeWebGpuQualified: row.nativeWebGpuQualified === true, measurementHash: row.measurementHash || null }; }
function check(id, passed, detail) { return { id, status: passed ? 'PASS' : 'BLOCKED', detail: passed ? null : detail }; }
function blocker(id) { return `P10_M11_${id.replaceAll('-', '_').toUpperCase()}_REQUIRED`; }
function feature(id, milestone, surfaces, limitation = null) { return { id, milestone, surfaces, limitation }; }
function positiveInteger(value, fallback) { const n = Number(value ?? fallback); if (!Number.isInteger(n) || n < 1) throw new RangeError('elementCount must be a positive integer.'); return n; }
function now() { return globalThis.performance?.now?.() ?? Date.now(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }

function shellGrid(count) {
  const elements = [];
  const nodeIndex = new Map();
  for (let index = 0; index < count; index += 1) {
    const x = index % 20; const y = Math.floor(index / 20);
    const nodes = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].map(([nx, ny], local) => ({ id: `N${index}-${local}`, x: nx, y: ny, z: 0 }));
    nodes.forEach((node) => { if (!nodeIndex.has(node.id)) nodeIndex.set(node.id, nodeIndex.size); });
    elements.push({ id: `S${index}`, formulation: 'shell', nodes, nodeIds: nodes.map((node) => node.id), material: { E: 30e9, nu: 0.2 }, t: 0.2 });
  }
  return { elements, nodeIndex };
}
