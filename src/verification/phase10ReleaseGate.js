import { stableHash } from '../core/stableHash.js';
import { buildShellSoaBatch } from '../solver/shell/shellBatch.js';
import { runShellGpuBatch } from '../compute/backends/webgpu/shellKernels.js';

export const PHASE10_RELEASE_GATE_VERSION = 'p10-m11-release-gate-v5-evidence-integrity';
export const PHASE10_INTEGRATION_CONTRACT_VERSION = 'p10-m11-product-integration-v1';
export const PHASE10_PERFORMANCE_VERSION = 'p10-m11-large-model-performance-v1';
export const PHASE10_M9_EVIDENCE_VERSION = 'p10-evidence-artifact-v6';
export const PHASE10_XVAL_EVIDENCE_VERSION = 'p10-m1-xval-runner-v1';
export const PHASE10_XVAL_SOLVER_VERSION = 's-structures-0.1.0-p10-m1';
export const PHASE10_MILESTONE_EVIDENCE_VERSION = 'p10-evidence-artifact-v1';
export const PHASE10_XVAL_REQUIRED_CASE_IDS = Object.freeze(
  Array.from({ length: 10 }, (_, index) => `XV-${String(index + 1).padStart(2, '0')}`),
);
const HASH16_PATTERN = /^[0-9a-f]{16}$/;
const HASH24_PATTERN = /^[0-9a-f]{24}$/;
const MODEL_HASH_PATTERN = /^(?:[0-9a-f]{16}|[0-9a-f]{24})$/;
export const PHASE10_M9_REQUIRED_CASE_IDS = Object.freeze([
  'SH-A01-MEMBRANE-PATCH',
  'SH-A02-WALL-CANTILEVER',
  'SH-B01-SQUARE-PLATE',
  'SH-C01-RIGID-BODY-ENERGY',
  'SH-C02-DRILLING-STIFFNESS-RATIO',
  'SH-C03-GLOBAL-EQUILIBRIUM',
  'SH-G01-F32-BATCH-PARITY',
  'SH-G02-K1-TRANSPORT-RESIDUAL',
  'SH-G03-DETERMINISTIC-GATHER',
  'SH-AQ-REGULAR-CENTER-DISPLACEMENT',
  'SH-AQ-REGULAR-FREE-RESIDUAL',
  'SH-AQ-DISTORTED-2P2-0P9-CENTER-DISPLACEMENT',
  'SH-AQ-DISTORTED-2P2-0P9-FREE-RESIDUAL',
  'SH-AQ-DISTORTED-2P4-0P7-CENTER-DISPLACEMENT',
  'SH-AQ-DISTORTED-2P4-0P7-FREE-RESIDUAL',
  'SH-AQ-DISTORTED-1P3-1P4-CENTER-DISPLACEMENT',
  'SH-AQ-DISTORTED-1P3-1P4-FREE-RESIDUAL',
  'SH-BQ-01-SQUARE-R20',
  'SH-BQ-02-RECT-2TO1-R15',
  'SH-BQ-03-RECT-4TO1-R20',
  'SH-BQ-04-RECT-4TO1-R40',
  'SH-BQ-05-RECT-4TO1-R100',
  'SH-BQ-06-SQUARE-MESH-CONVERGENCE',
  'SH-BQ-07-RECT-4TO1-MESH-CONVERGENCE',
  'SH-BI-RIGID-NORMAL-TRANSLATION',
  'SH-BI-RIGID-ROTATION-RX',
  'SH-BI-RIGID-ROTATION-RY',
  'SH-BI-CONSTANT-CURVATURE-KAPPA-X',
  'SH-BD-01-MODAL-FREQUENCY',
  'SH-CQ-DR-01-PLANAR-RAW-RIGID-MODES',
  'SH-CQ-DR-02-WARPED-RAW-RIGID-MODES',
  'SH-CQ-DR-03-AFFINE-COMPATIBLE-DRILLING',
  'SH-CQ-DR-04-INDEPENDENT-THETA-POSITIVE',
  'SH-CQ-PL-01-RECTANGULAR-CONSISTENT-PRESSURE',
  'SH-CQ-PL-02-DISTORTED-CONSISTENT-PRESSURE',
]);

const PHASE10_MILESTONE_SPECS = Object.freeze({
  'P10-M0': milestoneSpec('P10-M0-QUICK-CORRECTIONS', 'tests/p10-m0-quick-corrections.mjs', [
    'P10-M0-THETA-BOUNDARY',
    'P10-M0-LEGACY-STATUS',
    'P10-M0-DESIGN-ELIGIBILITY',
    'P10-M0-RSA-ALL-RESPONSES',
    'P10-M0-PDELTA-INTEGRATION',
    'P10-M0-PDELTA-BOUNDED-PARITY',
    'P10-M0-RSA-ANALYTIC-BASELINE',
    'P10-M0-RSA-NO-MINIMUM',
    'P10-M0-RSA-TOGGLE-OFF',
  ], { artifactHashRequired: false }),
  'P10-M2': milestoneSpec('P10-M2-TIMOSHENKO', 'tests/p10-m2-timoshenko.mjs', [
    'EL-T01',
    'Q0-POINT-TIMOSHENKO',
    'Q0-PARTIAL-UDL-TIMOSHENKO',
    'EL-T02',
    'EL-T03',
    'EL-T03-FORCE',
    'EL-T04',
    'EL-T04-RELEASE',
  ]),
  'P10-M3': milestoneSpec('P10-M3-PARTIAL-FIXITY', 'tests/p10-m3-partial-fixity.mjs', [
    'CN-F01-DISPLACEMENT',
    'CN-F02-DISPLACEMENT',
    'CN-F02-RELEASE-MOMENT',
    'CN-F03-EB-DISPLACEMENT',
    'CN-F03-TIMOSHENKO-DISPLACEMENT',
    'CN-F03-END-ROTATION',
    'Q0-PARTIAL-FIXITY',
  ]),
  'P10-M4': milestoneSpec('P10-M4-OFFSETS-PANELZONE', 'tests/p10-m4-offsets-panelzone.mjs', [
    'EL-O01-ZERO-REGRESSION',
    'EL-O02-AXIAL-ECCENTRICITY',
    'EL-O03-PANEL-ZONE-EQUIVALENCE',
    'EL-O04-OFFSET-EQUILIBRIUM',
  ]),
  'P10-M5': milestoneSpec('P10-M5-MPC-RIGIDLINK', 'tests/p10-m5-mpc-rigidlink.mjs', [
    'CN-M01-RIGID-LINK-EQUIVALENCE',
    'CN-M02-MPC-EQUILIBRIUM',
    'CN-M03-DIAPHRAGM-REGRESSION',
    'CN-M05-MODAL-KM-TRANSFORM',
    'CN-M06-PDELTA-KG-TRANSFORM',
  ]),
  'P10-M6': milestoneSpec('P10-M6-TAPERED-MEMBER', 'tests/p10-m6-tapered.mjs', [
    'EL-P01-PRISMATIC-REGRESSION',
    'EL-P02-LINEAR-TAPER-CLOSED-FORM',
    'EL-P03-GAUSS-INTEGRATION-CONVERGENCE',
  ]),
  'P10-M7': milestoneSpec('P10-M7-DYNAMICS-EXTENSION', 'tests/p10-m7-dynamics-extension.mjs', [
    'DY-01-ZERO-PRESTRESS-PARITY',
    'DY-02-COMPRESSION-PERIOD-INCREASE',
    'DY-03-EULER-BUCKLING',
    'DY-04-LEGACY-LOWEST-MODE',
    'DY-05-DIRECT-MODAL-PARITY',
    'DY-06-ENERGY-BALANCE',
  ]),
  'P10-M8': milestoneSpec('P10-M8-WARPING-LTB', 'tests/p10-m8-warping-ltb.mjs', [
    'EL-W01-CLOSED-FORM-MCR',
    'EL-W02-C1-SCALING',
    'EL-W03-STEEL-DESIGN-INTEGRATION',
  ]),
  'P10-M10': milestoneSpec('P10-M10-LOAD-GENERATION', 'tests/p10-m10-load-generation.mjs', [
    'LG-01-ONE-WAY-EQUILIBRIUM',
    'LG-02-TWO-WAY-EQUILIBRIUM',
    'LG-03-SLAB-MASS-DEDUP',
    'LG-04-WIND-SIGN-DIRECTION',
  ], { testsArray: true, recordSourceRequired: false }),
});

export const PHASE10_PRODUCT_FEATURES = Object.freeze([
  feature('timoshenko', 'P10-M2', ['model', 'analysis', 'report', 'calculation-package', 'agent']),
  feature('partial-fixity', 'P10-M3', ['model', 'analysis', 'report', 'calculation-package', 'agent'], 'Direct P-Delta uses the documented prismatic geometric-stiffness approximation.'),
  feature('offsets-panel-zones', 'P10-M4', ['model', 'analysis', 'report', 'calculation-package', 'agent'], 'Nonlinear corotational offsets fail closed.'),
  feature('mpc-rigid-links', 'P10-M5', ['model', 'analysis', 'report', 'calculation-package', 'agent']),
  feature('tapered-members', 'P10-M6', ['model', 'analysis', 'report', 'calculation-package', 'agent']),
  feature('prestressed-dynamics', 'P10-M7', ['analysis-center', 'report', 'calculation-package', 'agent'], 'Qualification is limited to the implemented prestressed modal/RSA/direct-integration scope.'),
  feature('warping-ltb', 'P10-M8', ['analysis', 'report', 'calculation-package', 'agent'], 'LTB option B is a verification check; it does not add a seventh frame DOF.'),
  feature('shell-fem', 'P10-M9', ['model', 'analysis-center', 'results', 'report', 'calculation-package', 'agent'], 'CPU element/kernel numerical qualification is complete; user-model mesh-convergence design transfer, native formulation-generating WebGPU, and external XV-10 remain unavailable.'),
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
  const limits = {
    maxElapsedMs: positiveFinite(options.maxElapsedMs, 10_000, 'maxElapsedMs'),
    maxMemoryBytes: positiveFinite(options.maxMemoryBytes, 64 * 1024 * 1024, 'maxMemoryBytes'),
  };
  const core = {
    version: PHASE10_PERFORMANCE_VERSION,
    profile: 'large-shell-feature-combination',
    elementCount,
    conceptualDofCount: (elementCount + 1) * 4 * 6,
    elapsedMs,
    memoryBytes,
    limits,
    cpuF64ReferencePassed: shadow.ok === true && shadow.tangentValues?.length > 0,
    gpuF32ShadowPassed: shadow.kernelParityQualified === true,
    nativeWebGpuQualified: false,
    wasmRouteAvailable: options.wasmRouteAvailable === true,
    status: elapsedMs <= limits.maxElapsedMs
      && memoryBytes <= limits.maxMemoryBytes
      && shadow.ok === true
      && shadow.tangentValues?.length > 0
      && shadow.kernelParityQualified === true ? 'PASS' : 'FAIL',
  };
  return freeze({ ...core, measurementHash: stableHash(core).slice(0, 24) });
}

export function buildPhase10ReleaseGate(input = {}) {
  const xval = summarizeXval(input.xval || {});
  const evidence = summarizeEvidence(input.milestoneEvidence || []);
  const performanceInput = input.performance || {};
  const performanceEvidence = validatePerformanceEvidence(performanceInput);
  const integration = input.integration || buildPhase10ProductIntegrationContract();
  const nativeWebGpuQualified = input.nativeWebGpuQualified === true
    && performanceEvidence.valid
    && performanceInput.nativeWebGpuQualified === true
    && evidence.nativeWebGpu.formulationKernelsImplemented
    && evidence.nativeWebGpu.kernelsQualified;
  const evidenceDetail = evidence.duplicateMilestones.length
    ? `Duplicate milestone evidence: ${evidence.duplicateMilestones.join(', ')}`
    : (evidence.missing.length ? `Missing or invalid green milestone evidence: ${evidence.missing.join(', ')}` : null);
  const checks = [
    check('implementation-evidence', evidence.complete, evidenceDetail),
    check('product-integration', integration.features?.length === PHASE10_PRODUCT_FEATURES.length && integration.surfaces?.includes('agent'), 'Phase 10 product surface propagation is incomplete.'),
    check('large-model-performance', performanceEvidence.qualified, performanceEvidence.errors[0] || 'Large-model CPU/GPU-shadow performance budget is not green.'),
    check('full-regression', input.fullRegressionPassed === true, 'Full npm test regression evidence is required.'),
    check('p3-docs', input.p3DocsPassed === true, 'test:p3docs evidence is required.'),
    check('agent-contract', input.agentContractPassed === true, 'Agent contract synchronization is required.'),
    check('documentation', input.documentationComplete === true, 'M11 status, review, and user documentation are required.'),
    check('shell-numerical-qualification', evidence.shellNumericalQualification.status === 'PASS', 'P10-M9 membrane, plate, flat-shell, drilling, and pressure qualification is not green.'),
    check('external-cross-validation', xval.externallyCrossValidated, `Required external references are not green: ${xval.missingGreenCaseIds.join(', ')}`),
    check('native-webgpu-formulation-device', nativeWebGpuQualified, 'Native formulation-generating WebGPU implementation, M9 evidence, performance evidence, and device qualification are required.'),
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
    implementation: {
      status: implementationComplete ? 'complete' : 'incomplete',
      completedMilestones: [
        ...evidence.greenMilestones,
        ...(implementationComplete ? ['P10-M11'] : []),
      ],
    },
    release: {
      status: releaseAllowed ? 'externally-cross-validated' : 'blocked',
      allowed: releaseAllowed,
      designTransferAllowed: releaseAllowed && evidence.shellModelDesignTransfer.allowed,
      externallyCrossValidated: xval.externallyCrossValidated,
    },
    checks,
    blockers,
    xval,
    evidence,
    performance: compactPerformance(performanceInput, performanceEvidence),
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
  const performanceEvidence = validatePerformanceEvidence(artifact.performance || {});
  const performanceCheckPassed = artifact.checks?.find((row) => row.id === 'large-model-performance')?.status === 'PASS';
  if (performanceCheckPassed !== performanceEvidence.qualified) errors.push('gate:performance-evidence');
  if (artifact.performance?.integrity?.status !== (performanceEvidence.valid ? 'PASS' : 'BLOCKED')) errors.push('gate:performance-integrity');
  const implementationEvidencePassed = artifact.checks?.find((row) => row.id === 'implementation-evidence')?.status === 'PASS';
  const milestoneIntegrityPassed = Array.isArray(artifact.evidence?.milestoneIntegrity)
    && artifact.evidence.milestoneIntegrity.length === 11
    && artifact.evidence.milestoneIntegrity.every((row) => row?.status === 'PASS')
    && (artifact.evidence?.missing?.length || 0) === 0
    && (artifact.evidence?.duplicateMilestones?.length || 0) === 0;
  if (implementationEvidencePassed !== milestoneIntegrityPassed) errors.push('gate:milestone-evidence');
  const xvalCheckPassed = artifact.checks?.find((row) => row.id === 'external-cross-validation')?.status === 'PASS';
  const xvalEvidencePassed = artifact.xval?.integrity?.status === 'PASS'
    && artifact.xval?.externallyCrossValidated === true
    && (artifact.xval?.missingGreenCaseIds?.length || 0) === 0;
  if (xvalCheckPassed !== xvalEvidencePassed) errors.push('gate:xval-evidence');
  if (artifact.evidence?.shellNumericalQualification?.status === 'PASS'
    && artifact.evidence?.shellNumericalQualification?.integrityValidated !== true) errors.push('gate:shell-evidence');
  const shellCheckPassed = artifact.checks?.find((row) => row.id === 'shell-numerical-qualification')?.status === 'PASS';
  if (shellCheckPassed !== (artifact.evidence?.shellNumericalQualification?.status === 'PASS')) errors.push('gate:shell-check');
  if (artifact.release?.designTransferAllowed === true
    && artifact.evidence?.shellModelDesignTransfer?.allowed !== true) errors.push('gate:shell-design-transfer');
  const copy = clone(artifact); delete copy.artifactHash;
  if (artifact.artifactHash !== stableHash(copy).slice(0, 24)) errors.push('gate:hash');
  return { ok: errors.length === 0, errors };
}

function summarizeXval(input) {
  const required = PHASE10_XVAL_REQUIRED_CASE_IDS;
  const integrity = validateXvalEvidence(input);
  const cases = Array.isArray(input.cases) ? input.cases : [];
  const counts = new Map();
  for (const row of cases) counts.set(row?.caseId, (counts.get(row?.caseId) || 0) + 1);
  const duplicateCaseIds = required.filter((id) => (counts.get(id) || 0) > 1);
  const eligibleExternalSources = new Set(['opensees', 'sap2000', 'etabs']);
  const sourceEligible = (row) => row.caseId === 'XV-01'
    ? row.referenceSource === 'hand-calc'
    : eligibleExternalSources.has(row.referenceSource);
  const green = new Set(cases
    .filter((row) => integrity.valid
      && integrity.validGreenCaseIds.includes(row.caseId)
      && sourceEligible(row)
      && (counts.get(row.caseId) || 0) === 1)
    .map((row) => row.caseId));
  const inherited = input.releaseQualification || {};
  const missingGreenCaseIds = required.filter((id) => !green.has(id));
  const sourceIneligibleCaseIds = required.filter((id) => cases.some((row) => (
    row.caseId === id && row.status === 'PASS' && !sourceEligible(row)
  )));
  return {
    requiredCaseIds: required,
    greenCaseIds: required.filter((id) => green.has(id)),
    missingGreenCaseIds,
    duplicateCaseIds,
    sourceIneligibleCaseIds,
    pendingReferenceCount: cases.filter((row) => row.status === 'PENDING' || row.referenceSource === 'pending-reference').length + Math.max(0, required.length - cases.length),
    externallyCrossValidated: integrity.valid
      && missingGreenCaseIds.length === 0
      && duplicateCaseIds.length === 0
      && sourceIneligibleCaseIds.length === 0
      && inherited.externallyCrossValidated === true
      && (inherited.sourceIneligibleCaseIds?.length || 0) === 0,
    integrity: {
      status: integrity.valid ? 'PASS' : 'BLOCKED',
      version: input.version || null,
      artifactHash: input.artifactHash || null,
      errors: integrity.errors,
    },
  };
}

export function validateXvalEvidence(input = {}) {
  const errors = [];
  if (!isPlainObject(input)) return { valid: false, errors: ['XVAL_EVIDENCE_SCHEMA_INVALID'], validGreenCaseIds: [] };
  if (!exactObjectKeys(input, [
    'artifactHash',
    'cases',
    'duplicateArtifactCaseIds',
    'duplicateCaseIds',
    'milestoneGate',
    'releaseQualification',
    'solverVersion',
    'status',
    'summary',
    'version',
  ])) errors.push('XVAL_EVIDENCE_SCHEMA_INVALID');
  if (input.version !== PHASE10_XVAL_EVIDENCE_VERSION) errors.push('XVAL_EVIDENCE_VERSION_MISMATCH');
  if (input.solverVersion !== PHASE10_XVAL_SOLVER_VERSION) errors.push('XVAL_EVIDENCE_SOLVER_VERSION_MISMATCH');
  const cases = Array.isArray(input.cases) ? input.cases : [];
  if (!Array.isArray(input.cases)) errors.push('XVAL_EVIDENCE_CASES_INVALID');
  const caseIds = cases.map((row) => row?.caseId);
  const counts = new Map();
  for (const caseId of caseIds) counts.set(caseId, (counts.get(caseId) || 0) + 1);
  const duplicateCaseIds = PHASE10_XVAL_REQUIRED_CASE_IDS.filter((id) => (counts.get(id) || 0) > 1);
  const unexpectedCaseIds = [...counts.keys()].filter((id) => !PHASE10_XVAL_REQUIRED_CASE_IDS.includes(id));
  if (unexpectedCaseIds.length) errors.push('XVAL_EVIDENCE_CASE_SET_INVALID');
  const expectedCaseOrder = PHASE10_XVAL_REQUIRED_CASE_IDS.filter((id) => counts.has(id));
  if (!sameArray(caseIds, expectedCaseOrder)) errors.push('XVAL_EVIDENCE_CASE_ORDER_OR_DUPLICATE_INVALID');
  const validGreenCaseIds = [];
  for (const row of cases) {
    const rowErrors = validateXvalCaseEvidence(row, input.solverVersion);
    if (rowErrors.length === 0 && row.status === 'PASS') validGreenCaseIds.push(row.caseId);
    errors.push(...rowErrors.map((code) => `${code}:${row?.caseId || 'UNKNOWN'}`));
  }
  if (!sameArray(input.duplicateCaseIds, duplicateCaseIds)) errors.push('XVAL_EVIDENCE_DUPLICATE_CASE_SUMMARY_INVALID');
  if (!Array.isArray(input.duplicateArtifactCaseIds) || input.duplicateArtifactCaseIds.length !== 0) {
    errors.push('XVAL_EVIDENCE_DUPLICATE_ARTIFACT_SUMMARY_INVALID');
  }
  const statuses = {
    pass: cases.filter((row) => row?.status === 'PASS').length,
    pending: cases.filter((row) => row?.status === 'PENDING').length,
    blocked: cases.filter((row) => row?.status === 'BLOCKED').length,
    ng: cases.filter((row) => row?.status === 'NG').length,
  };
  if (!isPlainObject(input.summary)
    || input.summary.total !== cases.length
    || input.summary.pass !== statuses.pass
    || input.summary.pending !== statuses.pending
    || input.summary.blocked !== statuses.blocked
    || input.summary.ng !== statuses.ng) errors.push('XVAL_EVIDENCE_SUMMARY_INVALID');
  const m1Required = ['XV-01', 'XV-02'];
  const missingM1 = m1Required.filter((id) => !counts.has(id));
  const milestoneOk = missingM1.length === 0
    && duplicateCaseIds.length === 0
    && m1Required.every((id) => cases.find((row) => row?.caseId === id)?.status === 'PASS');
  if (!isPlainObject(input.milestoneGate)
    || !sameArray(input.milestoneGate.requiredCaseIds, m1Required)
    || !sameArray(input.milestoneGate.missingCaseIds, missingM1)
    || input.milestoneGate.ok !== milestoneOk) errors.push('XVAL_EVIDENCE_MILESTONE_GATE_INVALID');
  if (input.status !== (milestoneOk ? 'OK' : 'NG')) errors.push('XVAL_EVIDENCE_STATUS_INCONSISTENT');

  const resultById = new Map(cases.map((row) => [row?.caseId, row]));
  const missingGreenCaseIds = PHASE10_XVAL_REQUIRED_CASE_IDS.filter((id) => resultById.get(id)?.status !== 'PASS');
  const externalReferenceCaseIds = PHASE10_XVAL_REQUIRED_CASE_IDS.slice(1);
  const sourceIneligibleCaseIds = externalReferenceCaseIds.filter((id) => {
    const row = resultById.get(id);
    return row?.status === 'PASS' && !['opensees', 'sap2000', 'etabs'].includes(row.referenceSource);
  });
  const pendingCaseIds = cases.filter((row) => row?.status === 'PENDING').map((row) => row.caseId);
  const blockedCaseIds = cases.filter((row) => row?.status === 'BLOCKED').map((row) => row.caseId);
  const failedCaseIds = cases.filter((row) => row?.status === 'NG').map((row) => row.caseId);
  const externallyCrossValidated = missingGreenCaseIds.length === 0
    && sourceIneligibleCaseIds.length === 0
    && duplicateCaseIds.length === 0;
  const release = input.releaseQualification;
  if (!isPlainObject(release)
    || release.badge !== 'externally-cross-validated'
    || release.externallyCrossValidated !== externallyCrossValidated
    || !sameArray(release.requiredCaseIds, PHASE10_XVAL_REQUIRED_CASE_IDS)
    || !sameArray(release.externalReferenceCaseIds, externalReferenceCaseIds)
    || !sameArray(release.handCalcAnchorCaseIds, ['XV-01'])
    || !sameArray(release.missingGreenCaseIds, missingGreenCaseIds)
    || !sameArray(release.sourceIneligibleCaseIds, sourceIneligibleCaseIds)
    || !sameArray(release.pendingCaseIds, pendingCaseIds)
    || !sameArray(release.blockedCaseIds, blockedCaseIds)
    || !sameArray(release.failedCaseIds, failedCaseIds)) errors.push('XVAL_EVIDENCE_RELEASE_SUMMARY_INVALID');
  let expectedHash = null;
  try {
    const core = clone(input);
    delete core.artifactHash;
    expectedHash = stableHash(core).slice(0, 24);
  } catch {
    errors.push('XVAL_EVIDENCE_HASH_INPUT_INVALID');
  }
  if (!HASH24_PATTERN.test(String(input.artifactHash || '')) || input.artifactHash !== expectedHash) {
    errors.push('XVAL_EVIDENCE_HASH_MISMATCH');
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], validGreenCaseIds };
}

function validateXvalCaseEvidence(row, solverVersion) {
  const errors = [];
  if (!isPlainObject(row) || !exactObjectKeys(row, [
    'caseId',
    'details',
    'modelHash',
    'reason',
    'records',
    'referenceArtifactHash',
    'referenceSource',
    'solverVersion',
    'status',
    'version',
  ])) return ['XVAL_CASE_SCHEMA_INVALID'];
  if (row.version !== PHASE10_XVAL_EVIDENCE_VERSION) errors.push('XVAL_CASE_VERSION_MISMATCH');
  if (!PHASE10_XVAL_REQUIRED_CASE_IDS.includes(row.caseId)) errors.push('XVAL_CASE_ID_INVALID');
  if (!HASH16_PATTERN.test(String(row.modelHash || ''))) errors.push('XVAL_CASE_MODEL_HASH_INVALID');
  if (!HASH24_PATTERN.test(String(row.referenceArtifactHash || ''))) errors.push('XVAL_CASE_REFERENCE_HASH_INVALID');
  if (row.solverVersion !== solverVersion) errors.push('XVAL_CASE_SOLVER_VERSION_MISMATCH');
  if (!['hand-calc', 'opensees', 'sap2000', 'etabs'].includes(row.referenceSource)) errors.push('XVAL_CASE_SOURCE_INVALID');
  if (!Array.isArray(row.records)) errors.push('XVAL_CASE_RECORDS_INVALID');
  if (row.status === 'PASS') {
    if (row.reason !== null
      || !isPlainObject(row.details)
      || !exactObjectKeys(row.details, ['executed', 'quantityCount'])
      || row.details.executed !== true
      || row.details.quantityCount !== row.records?.length
      || row.records.length < 1) errors.push('XVAL_CASE_PASS_SUMMARY_INVALID');
    const metrics = new Set();
    for (const record of row.records || []) {
      const recordErrors = validateXvalRecordEvidence(record, row);
      errors.push(...recordErrors);
      if (record?.metric) {
        if (metrics.has(record.metric)) errors.push('XVAL_RECORD_METRIC_DUPLICATE');
        metrics.add(record.metric);
      }
    }
  } else if (row.status === 'PENDING') {
    if (row.reason !== 'XVAL_REFERENCE_PENDING'
      || !isPlainObject(row.details)
      || !exactObjectKeys(row.details, ['executed'])
      || row.details.executed !== false
      || row.records?.length !== 0) errors.push('XVAL_CASE_PENDING_SUMMARY_INVALID');
  } else {
    errors.push('XVAL_CASE_STATUS_INVALID');
  }
  return [...new Set(errors)];
}

function validateXvalRecordEvidence(record, parent) {
  const errors = [];
  if (!isPlainObject(record) || !exactObjectKeys(record, [
    'caseId',
    'computed',
    'details',
    'metric',
    'modelHash',
    'name',
    'reference',
    'referenceSource',
    'relError',
    'solverVersion',
    'status',
    'tier',
    'tolerance',
    'toleranceKey',
    'units',
    'version',
  ])) return ['XVAL_RECORD_SCHEMA_INVALID'];
  if (record.version !== 'p6-m3-verification-record-v1'
    || record.caseId !== parent.caseId
    || record.tier !== 'XV'
    || record.modelHash !== parent.modelHash
    || record.solverVersion !== parent.solverVersion) errors.push('XVAL_RECORD_SCOPE_INVALID');
  if (!cleanString(record.name) || !cleanString(record.metric) || !cleanString(record.units)) errors.push('XVAL_RECORD_LABEL_INVALID');
  if (!Number.isFinite(record.reference)
    || !Number.isFinite(record.computed)
    || !Number.isFinite(record.relError)
    || record.relError < 0
    || !Number.isFinite(record.tolerance)
    || record.tolerance < 0) errors.push('XVAL_RECORD_METRICS_INVALID');
  const explicitScale = Number(record.details?.scale);
  const errorDenominator = Math.max(
    Math.abs(record.reference),
    Number.isFinite(explicitScale) && explicitScale > 0 ? Math.abs(explicitScale) : 0,
    1e-12,
  );
  const expectedRelError = Math.abs(record.computed - record.reference) / errorDenominator;
  if (Number.isFinite(expectedRelError)
    && !nearlyEqual(record.relError, expectedRelError, 1e-12, 1e-15)) {
    errors.push('XVAL_RECORD_REL_ERROR_INCONSISTENT');
  }
  if (record.status !== 'OK' || record.relError > record.tolerance || record.toleranceKey !== null) {
    errors.push('XVAL_RECORD_PASS_INCONSISTENT');
  }
  if (!cleanString(record.referenceSource)
    || !record.referenceSource.startsWith(`${parent.referenceSource}:`)) errors.push('XVAL_RECORD_SOURCE_INVALID');
  if (!isPlainObject(record.details)
    || !exactObjectKeys(record.details, ['extractionCode', 'path', 'referenceArtifactHash', 'scale'])
    || record.details.extractionCode !== 'OK'
    || !cleanString(record.details.path)
    || record.details.referenceArtifactHash !== parent.referenceArtifactHash
    || !(record.details.scale === null
      || (Number.isFinite(record.details.scale) && record.details.scale > 0))) {
    errors.push('XVAL_RECORD_DETAILS_INVALID');
  }
  return errors;
}

function summarizeEvidence(rows) {
  const required = Array.from({ length: 11 }, (_, index) => `P10-M${index}`);
  const counts = new Map(required.map((id) => [id, 0]));
  for (const row of rows) {
    const milestone = milestoneOf(row);
    if (counts.has(milestone)) counts.set(milestone, counts.get(milestone) + 1);
  }
  const duplicateMilestones = required.filter((id) => counts.get(id) > 1);
  const byMilestone = new Map(rows
    .filter((row) => counts.has(milestoneOf(row)) && counts.get(milestoneOf(row)) === 1)
    .map((row) => [milestoneOf(row), row]));
  const milestoneAssessments = new Map(required.map((id) => [
    id,
    validateMilestoneEvidence(byMilestone.get(id), id),
  ]));
  const shell = byMilestone.get('P10-M9');
  const shellEvidence = milestoneAssessments.get('P10-M9');
  const shellQualification = shell?.qualification || {};
  const cpuBlockers = Array.isArray(shellQualification.cpuF64QualificationBlockers)
    ? shellQualification.cpuF64QualificationBlockers : ['SHELL_CPU_BLOCKERS_MISSING'];
  const plateBlockers = Array.isArray(shellQualification.plateNumericalQualificationBlockers)
    ? shellQualification.plateNumericalQualificationBlockers : ['SHELL_PLATE_BLOCKERS_MISSING'];
  const shellPassed = shellEvidence.valid
    && shell?.qualification?.cpuF64Qualified === true
    && shell?.qualification?.plateNumericalQualificationStatus === 'PASS'
    && shell?.qualification?.membranePatchQualificationStatus === 'PASS'
    && shell?.qualification?.flatShellNumericalQualificationStatus === 'PASS'
    && cpuBlockers.length === 0
    && plateBlockers.length === 0
    && shell?.results?.hardScopeRegressions?.status === 'PASS';
  const shellModelDesignTransferAllowed = shellPassed
    && shellQualification.designTransferAllowed === true
    && shellQualification.modelMeshConvergenceQualificationStatus === 'PASS'
    && shellQualification.plateDesignTransferAllowed === true;
  const designTransferBlockers = Array.isArray(shellQualification.designTransferBlockers)
    ? [...new Set(shellQualification.designTransferBlockers)]
    : [];
  if (!shellModelDesignTransferAllowed && designTransferBlockers.length === 0) {
    designTransferBlockers.push('SHELL_MODEL_MESH_CONVERGENCE_REQUIRED');
  }
  const missing = required.filter((id) => {
    const row = byMilestone.get(id);
    return !['OK', 'PASS'].includes(row?.status) || !milestoneAssessments.get(id).valid;
  });
  return {
    requiredMilestones: required,
    greenCount: required.length - missing.length,
    missing,
    duplicateMilestones,
    complete: missing.length === 0 && duplicateMilestones.length === 0,
    greenMilestones: required.filter((id) => !missing.includes(id)),
    milestoneIntegrity: required.map((id) => {
      const row = byMilestone.get(id);
      const validation = milestoneAssessments.get(id);
      return {
        milestone: id,
        status: validation.valid ? 'PASS' : 'BLOCKED',
        version: row?.version || null,
        artifactHash: row?.artifactHash || null,
        contentHash: validation.contentHash || null,
        errors: validation.errors,
      };
    }),
    shellNumericalQualification: {
      status: shellPassed ? 'PASS' : 'BLOCKED',
      integrityValidated: shellEvidence.valid,
      evidenceVersion: shell?.version || null,
      artifactHash: shell?.artifactHash || null,
      requiredCaseCount: PHASE10_M9_REQUIRED_CASE_IDS.length,
      errors: shellEvidence.errors,
      blocker: shellPassed ? null : (
        shellEvidence.errors[0]
        || cpuBlockers[0]
        || plateBlockers[0]
        || shell?.qualification?.cpuF64QualificationBlocker
        || shell?.qualification?.plateNumericalQualificationBlocker
        || 'SHELL_NUMERICAL_QUALIFICATION_MISSING'
      ),
    },
    shellModelDesignTransfer: {
      status: shellModelDesignTransferAllowed ? 'PASS' : 'LIMITED',
      allowed: shellModelDesignTransferAllowed,
      blockers: shellModelDesignTransferAllowed ? [] : designTransferBlockers,
    },
    nativeWebGpu: {
      formulationKernelsImplemented: shellEvidence.valid && shell?.qualification?.nativeFormulationKernelsImplemented === true,
      kernelsQualified: shellEvidence.valid && shell?.qualification?.nativeWebGpuKernelsQualified === true,
    },
  };
}

export function validateMilestoneEvidence(row, milestone = milestoneOf(row)) {
  if (milestone === 'P10-M1') {
    const validation = validateXvalEvidence(row || {});
    return {
      valid: validation.valid,
      errors: validation.errors,
      contentHash: contentHash(row),
    };
  }
  if (milestone === 'P10-M9') {
    const validation = validateShellEvidence(row);
    return {
      ...validation,
      contentHash: contentHash(row),
    };
  }
  const spec = PHASE10_MILESTONE_SPECS[milestone];
  if (!spec) return { valid: false, errors: ['MILESTONE_EVIDENCE_SCOPE_INVALID'], contentHash: null };
  return validateStandardMilestoneEvidence(row, milestone, spec);
}

function validateStandardMilestoneEvidence(row, milestone, spec) {
  const errors = [];
  if (!isPlainObject(row)) return { valid: false, errors: ['MILESTONE_EVIDENCE_MISSING'], contentHash: null };
  if (row.version !== PHASE10_MILESTONE_EVIDENCE_VERSION) errors.push('MILESTONE_EVIDENCE_VERSION_MISMATCH');
  if (row.milestone !== milestone || row.suiteId !== spec.suiteId) errors.push('MILESTONE_EVIDENCE_SCOPE_INVALID');
  if (row.status !== 'OK') errors.push('MILESTONE_EVIDENCE_STATUS_INVALID');
  if (!cleanString(row.generatedAt) || !Number.isFinite(Date.parse(row.generatedAt))) {
    errors.push('MILESTONE_EVIDENCE_TIMESTAMP_INVALID');
  }
  if (!cleanString(row.sourceRevision)) errors.push('MILESTONE_EVIDENCE_SOURCE_REVISION_MISSING');
  if (spec.testsArray) {
    if (!sameArray(row.tests, [spec.test])) errors.push('MILESTONE_EVIDENCE_TEST_PROVENANCE_INVALID');
  } else if (row.test !== spec.test) {
    errors.push('MILESTONE_EVIDENCE_TEST_PROVENANCE_INVALID');
  }
  if (!isPlainObject(row.results)) errors.push('MILESTONE_EVIDENCE_RESULTS_MISSING');
  if (spec.recordSourceRequired && !cleanString(row.solverVersion)) {
    errors.push('MILESTONE_EVIDENCE_SOLVER_VERSION_MISSING');
  }
  const records = Array.isArray(row.records) ? row.records : [];
  const counts = new Map();
  for (const record of records) counts.set(record?.caseId, (counts.get(record?.caseId) || 0) + 1);
  const missing = spec.caseIds.filter((id) => !counts.has(id));
  const duplicates = spec.caseIds.filter((id) => counts.get(id) > 1);
  const unexpected = [...counts.keys()].filter((id) => !spec.caseIds.includes(id));
  if (records.length !== spec.caseIds.length || missing.length || duplicates.length || unexpected.length) {
    errors.push('MILESTONE_EVIDENCE_CASE_SET_INVALID');
  }
  const resultSourceHashes = collectHashValues(row.results);
  const allowedSolverVersions = new Set(String(row.solverVersion || '').split('+').filter(Boolean));
  for (const record of records) {
    const specialPositive = milestone === 'P10-M7' && record?.caseId === 'DY-02-COMPRESSION-PERIOD-INCREASE';
    const numericMetrics = finiteNumericJson(record?.reference)
      && finiteNumericJson(record?.computed)
      && Number.isFinite(record?.relError)
      && record.relError >= 0
      && Number.isFinite(record?.tolerance)
      && record.tolerance >= 0;
    const specialMetrics = specialPositive
      && record.reference === '>0'
      && Number.isFinite(record.computed)
      && record.computed > 0
      && record.relError === null
      && record.tolerance === 'positive';
    if (!numericMetrics && !specialMetrics) {
      errors.push(`MILESTONE_EVIDENCE_METRICS_INVALID:${record?.caseId || 'UNKNOWN'}`);
    }
    if (numericMetrics) {
      const expectedRelError = standardEvidenceError(record.computed, record.reference);
      if (!nearlyEqual(record.relError, expectedRelError, 1e-12, 1e-15)) {
        errors.push(`MILESTONE_EVIDENCE_REL_ERROR_INCONSISTENT:${record?.caseId || 'UNKNOWN'}`);
      }
    }
    const tolerancePassed = specialMetrics || (numericMetrics && record.relError <= record.tolerance);
    const passFlagConsistent = record?.pass === undefined || record.pass === tolerancePassed;
    if (record?.status !== 'OK' || !tolerancePassed || !passFlagConsistent) {
      errors.push(`MILESTONE_EVIDENCE_PASS_INCONSISTENT:${record?.caseId || 'UNKNOWN'}`);
    }
    if (spec.recordSourceRequired) {
      if (!MODEL_HASH_PATTERN.test(String(record?.modelHash || ''))
        || !cleanString(record?.solverVersion)
        || !allowedSolverVersions.has(record.solverVersion)) {
        errors.push(`MILESTONE_EVIDENCE_SOURCE_INVALID:${record?.caseId || 'UNKNOWN'}`);
      }
      if (resultSourceHashes.size > 0
        && milestone !== 'P10-M0'
        && !resultSourceHashes.has(record.modelHash)) {
        errors.push(`MILESTONE_EVIDENCE_SOURCE_HASH_MISMATCH:${record?.caseId || 'UNKNOWN'}`);
      }
    }
  }
  let expectedHash = null;
  if (spec.artifactHashRequired || row.artifactHash !== undefined) {
    try {
      const core = clone(row);
      delete core.artifactHash;
      expectedHash = stableHash(core).slice(0, 24);
    } catch {
      errors.push('MILESTONE_EVIDENCE_HASH_INPUT_INVALID');
    }
    if (!HASH24_PATTERN.test(String(row.artifactHash || '')) || row.artifactHash !== expectedHash) {
      errors.push('MILESTONE_EVIDENCE_HASH_MISMATCH');
    }
  }
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    contentHash: contentHash(row),
  };
}

export function validatePerformanceEvidence(row = {}) {
  const errors = [];
  if (row.version !== PHASE10_PERFORMANCE_VERSION) errors.push('PERFORMANCE_VERSION_MISMATCH');
  if (row.profile !== 'large-shell-feature-combination') errors.push('PERFORMANCE_PROFILE_MISMATCH');
  if (!Number.isInteger(row.elementCount) || row.elementCount < 1) errors.push('PERFORMANCE_ELEMENT_COUNT_INVALID');
  if (!Number.isInteger(row.conceptualDofCount)
    || row.conceptualDofCount !== (row.elementCount + 1) * 4 * 6) errors.push('PERFORMANCE_DOF_COUNT_INVALID');
  if (!Number.isFinite(row.elapsedMs) || row.elapsedMs <= 0) errors.push('PERFORMANCE_ELAPSED_INVALID');
  if (!Number.isSafeInteger(row.memoryBytes) || row.memoryBytes < 1) errors.push('PERFORMANCE_MEMORY_INVALID');
  const expectedMemoryBytes = Number.isInteger(row.elementCount) && row.elementCount > 0
    ? row.elementCount * (1 + 4 * 4 + 4 * 8 + 4 + 4 + 24 * 24 * 8) + 8
    : null;
  if (expectedMemoryBytes !== null && row.memoryBytes !== expectedMemoryBytes) {
    errors.push('PERFORMANCE_MEMORY_MODEL_INCONSISTENT');
  }
  if (!Number.isFinite(row.limits?.maxElapsedMs) || row.limits.maxElapsedMs <= 0
    || !Number.isFinite(row.limits?.maxMemoryBytes) || row.limits.maxMemoryBytes <= 0) errors.push('PERFORMANCE_LIMITS_INVALID');
  if (typeof row.cpuF64ReferencePassed !== 'boolean'
    || typeof row.gpuF32ShadowPassed !== 'boolean'
    || typeof row.nativeWebGpuQualified !== 'boolean'
    || typeof row.wasmRouteAvailable !== 'boolean') errors.push('PERFORMANCE_FLAGS_INVALID');
  const expectedPass = row.elapsedMs <= row.limits?.maxElapsedMs
    && row.memoryBytes <= row.limits?.maxMemoryBytes
    && row.cpuF64ReferencePassed === true
    && row.gpuF32ShadowPassed === true;
  const expectedStatus = expectedPass ? 'PASS' : 'FAIL';
  if (row.status !== expectedStatus) errors.push('PERFORMANCE_STATUS_INCONSISTENT');
  const core = performanceHashCore(row);
  let expectedHash = null;
  try { expectedHash = stableHash(core).slice(0, 24); } catch { errors.push('PERFORMANCE_HASH_INPUT_INVALID'); }
  if (typeof row.measurementHash !== 'string' || row.measurementHash !== expectedHash) errors.push('PERFORMANCE_HASH_MISMATCH');
  const valid = errors.length === 0;
  return { valid, qualified: valid && row.status === 'PASS', errors };
}

function validateShellEvidence(shell) {
  const errors = [];
  if (!shell || typeof shell !== 'object') return { valid: false, errors: ['SHELL_EVIDENCE_MISSING'] };
  if (shell.version !== PHASE10_M9_EVIDENCE_VERSION) errors.push('SHELL_EVIDENCE_VERSION_MISMATCH');
  if (shell.milestone !== 'P10-M9' || shell.status !== 'PASS') errors.push('SHELL_EVIDENCE_SCOPE_STATUS_INVALID');
  const records = Array.isArray(shell.records) ? shell.records : [];
  const counts = new Map();
  for (const row of records) counts.set(row?.caseId, (counts.get(row?.caseId) || 0) + 1);
  const missingCaseIds = PHASE10_M9_REQUIRED_CASE_IDS.filter((id) => !counts.has(id));
  const duplicateCaseIds = PHASE10_M9_REQUIRED_CASE_IDS.filter((id) => counts.get(id) > 1);
  const unexpectedCaseIds = [...counts.keys()].filter((id) => !PHASE10_M9_REQUIRED_CASE_IDS.includes(id));
  if (records.length !== PHASE10_M9_REQUIRED_CASE_IDS.length
    || missingCaseIds.length || duplicateCaseIds.length || unexpectedCaseIds.length) errors.push('SHELL_EVIDENCE_CASE_SET_INVALID');
  for (const row of records) {
    const metricsFinite = Number.isFinite(row?.computed)
      && Number.isFinite(row?.reference)
      && Number.isFinite(row?.relError)
      && row.relError >= 0
      && Number.isFinite(row?.tolerance)
      && row.tolerance >= 0;
    if (!metricsFinite) {
      errors.push(`SHELL_EVIDENCE_METRICS_INVALID:${row?.caseId || 'UNKNOWN'}`);
      continue;
    }
    const statusPassed = row.status === 'OK' || row.status === 'PASS';
    const tolerancePassed = row.relError <= row.tolerance;
    const passFlagConsistent = row.pass === undefined || row.pass === (statusPassed && tolerancePassed);
    const positiveLowerBoundCase = row.caseId === 'SH-CQ-DR-04-INDEPENDENT-THETA-POSITIVE';
    const expectedRelError = positiveLowerBoundCase
      ? 0
      : (row.reference === 0
        ? Math.abs(row.computed)
        : Math.abs(row.computed - row.reference) / Math.max(Math.abs(row.reference), 1e-12));
    const metricConsistent = positiveLowerBoundCase
      ? row.computed >= row.reference && row.relError === 0
      : nearlyEqual(row.relError, expectedRelError, 1e-12, 1e-15);
    if (!statusPassed || !tolerancePassed || !passFlagConsistent || !metricConsistent) {
      errors.push(`SHELL_EVIDENCE_PASS_INCONSISTENT:${row?.caseId || 'UNKNOWN'}`);
    }
  }
  let expectedHash = null;
  try {
    const core = clone(shell);
    delete core.artifactHash;
    expectedHash = stableHash(core).slice(0, 24);
  } catch {
    errors.push('SHELL_EVIDENCE_HASH_INPUT_INVALID');
  }
  if (typeof shell.artifactHash !== 'string' || shell.artifactHash !== expectedHash) errors.push('SHELL_EVIDENCE_HASH_MISMATCH');
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    missingCaseIds,
    duplicateCaseIds,
    unexpectedCaseIds,
  };
}

function compactPerformance(row, validation) {
  return {
    version: row.version || null,
    profile: row.profile || null,
    elementCount: row.elementCount ?? null,
    conceptualDofCount: row.conceptualDofCount ?? null,
    elapsedMs: row.elapsedMs ?? null,
    memoryBytes: row.memoryBytes ?? null,
    limits: row.limits && typeof row.limits === 'object'
      ? cloneOr(row.limits, { maxElapsedMs: null, maxMemoryBytes: null })
      : { maxElapsedMs: null, maxMemoryBytes: null },
    cpuF64ReferencePassed: row.cpuF64ReferencePassed === true,
    gpuF32ShadowPassed: row.gpuF32ShadowPassed === true,
    nativeWebGpuQualified: row.nativeWebGpuQualified === true,
    wasmRouteAvailable: row.wasmRouteAvailable === true,
    status: row.status || 'MISSING',
    measurementHash: row.measurementHash || null,
    integrity: {
      status: validation.valid ? 'PASS' : 'BLOCKED',
      errors: validation.errors,
    },
  };
}
function performanceHashCore(row) {
  const core = {
    version: row.version,
    profile: row.profile,
    elementCount: row.elementCount,
    conceptualDofCount: row.conceptualDofCount,
    elapsedMs: row.elapsedMs,
    memoryBytes: row.memoryBytes,
    limits: row.limits,
    cpuF64ReferencePassed: row.cpuF64ReferencePassed,
    gpuF32ShadowPassed: row.gpuF32ShadowPassed,
    nativeWebGpuQualified: row.nativeWebGpuQualified,
    wasmRouteAvailable: row.wasmRouteAvailable,
    status: row.status,
  };
  return core;
}
function check(id, passed, detail) { return { id, status: passed ? 'PASS' : 'BLOCKED', detail: passed ? null : detail }; }
function blocker(id) { return `P10_M11_${id.replaceAll('-', '_').toUpperCase()}_REQUIRED`; }
function feature(id, milestone, surfaces, limitation = null) { return { id, milestone, surfaces, limitation }; }
function milestoneSpec(suiteId, test, caseIds, options = {}) {
  return Object.freeze({
    suiteId,
    test,
    caseIds: Object.freeze([...caseIds]),
    artifactHashRequired: options.artifactHashRequired !== false,
    testsArray: options.testsArray === true,
    recordSourceRequired: options.recordSourceRequired !== false,
  });
}
function milestoneOf(row) {
  if (typeof row?.milestone === 'string') return row.milestone;
  return row?.version === PHASE10_XVAL_EVIDENCE_VERSION ? 'P10-M1' : null;
}
function exactObjectKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}
function sameArray(actual, expected) {
  return Array.isArray(actual)
    && Array.isArray(expected)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}
function isPlainObject(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function cleanString(value) { return typeof value === 'string' && value.trim().length > 0; }
function nearlyEqual(actual, expected, relativeTolerance, absoluteTolerance) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  return Math.abs(actual - expected) <= Math.max(
    absoluteTolerance,
    relativeTolerance * Math.max(Math.abs(actual), Math.abs(expected)),
  );
}
function finiteNumericJson(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  return Array.isArray(value) && value.every(finiteNumericJson);
}
function standardEvidenceError(computed, reference) {
  if (typeof computed === 'number' && typeof reference === 'number') {
    return Math.abs(computed - reference);
  }
  const actual = numericLeaves(computed);
  const expected = numericLeaves(reference);
  if (!actual.length || actual.length !== expected.length) return Number.POSITIVE_INFINITY;
  let differenceSquared = 0;
  let referenceSquared = 0;
  for (let index = 0; index < actual.length; index += 1) {
    differenceSquared += (actual[index] - expected[index]) ** 2;
    referenceSquared += expected[index] ** 2;
  }
  return Math.sqrt(differenceSquared) / Math.max(1e-12, Math.sqrt(referenceSquared));
}
function numericLeaves(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return [value];
  return Array.isArray(value) ? value.flatMap(numericLeaves) : [];
}
function collectHashValues(value, inHashBlock = false, output = new Set()) {
  if (!value || typeof value !== 'object') return output;
  for (const [key, item] of Object.entries(value)) {
    const hashBlock = inHashBlock || /hash/i.test(key);
    if (typeof item === 'string' && hashBlock && MODEL_HASH_PATTERN.test(item)) output.add(item);
    else if (item && typeof item === 'object') collectHashValues(item, hashBlock, output);
  }
  return output;
}
function contentHash(value) {
  if (!value || typeof value !== 'object') return null;
  try { return stableHash(value).slice(0, 24); } catch { return null; }
}
function positiveInteger(value, fallback) { const n = Number(value ?? fallback); if (!Number.isInteger(n) || n < 1) throw new RangeError('elementCount must be a positive integer.'); return n; }
function positiveFinite(value, fallback, name) { const n = Number(value ?? fallback); if (!Number.isFinite(n) || n <= 0) throw new RangeError(`${name} must be a positive finite number.`); return n; }
function now() { return globalThis.performance?.now?.() ?? Date.now(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function cloneOr(value, fallback) { try { return clone(value); } catch { return fallback; } }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }

function shellGrid(count) {
  const elements = [];
  const nodeIndex = new Map();
  for (let index = 0; index < count; index += 1) {
    const x = index % 20; const y = Math.floor(index / 20);
    const nodes = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].map(([nx, ny], local) => ({ id: `N${index}-${local}`, x: nx, y: ny, z: 0 }));
    nodes.forEach((node) => { if (!nodeIndex.has(node.id)) nodeIndex.set(node.id, nodeIndex.size); });
    elements.push({ id: `S${index}`, formulation: 'shell', nodes, nodeIds: nodes.map((node) => node.id), material: { E: 30e9, nu: 0.2 }, t: 0.05 });
  }
  return { elements, nodeIndex };
}
