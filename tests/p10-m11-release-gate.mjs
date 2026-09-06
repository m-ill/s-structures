import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  PHASE10_M9_REQUIRED_CASE_IDS,
  PHASE10_RELEASE_GATE_VERSION,
  PHASE10_XVAL_EVIDENCE_VERSION,
  PHASE10_XVAL_REQUIRED_CASE_IDS,
  PHASE10_XVAL_SOLVER_VERSION,
  buildPhase10ProductIntegrationContract,
  buildPhase10ReleaseGate,
  measurePhase10LargeModelPerformance,
  validatePhase10ReleaseGate,
} from '../src/index.js';
import { stableHash } from '../src/core/stableHash.js';
import { createIndexAgentApi } from '../src/ui/indexAgentApi.js';
import { findFeature, resolveFeatureEnabled } from '../src/platform/featureCatalog.js';

const evidenceDir = path.resolve('verification', 'evidence', 'validation', 'phase10');
const evidenceFiles = (await readdir(evidenceDir)).filter((name) => /^p10-m(?:[0-9]|10)-.*\.json$/.test(name));
const milestoneEvidence = await Promise.all(evidenceFiles.map(async (name) => JSON.parse(await readFile(path.join(evidenceDir, name), 'utf8'))));
const xval = JSON.parse(await readFile(path.join(evidenceDir, 'p10-m1-cross-validation.json'), 'utf8'));
const integration = buildPhase10ProductIntegrationContract();
const performance = measurePhase10LargeModelPerformance({ elementCount: 120, maxElapsedMs: 10_000 });
const shellEvidence = milestoneEvidence.find((row) => row.milestone === 'P10-M9');

function replaceM9(rows, mutate) {
  return rows.map((row) => row.milestone === 'P10-M9' ? rehashArtifact(mutate(structuredClone(row))) : row);
}

function rehashArtifact(row) {
  const core = structuredClone(row);
  delete core.artifactHash;
  return { ...core, artifactHash: stableHash(core).slice(0, 24) };
}

function rehashPerformance(row, patch = {}) {
  const core = { ...structuredClone(row), ...patch };
  delete core.measurementHash;
  return { ...core, measurementHash: stableHash(core).slice(0, 24) };
}

function syntheticGreenXval() {
  const cases = PHASE10_XVAL_REQUIRED_CASE_IDS.map((caseId, index) => {
    const referenceSource = index === 0 ? 'hand-calc' : 'opensees';
    const modelHash = stableHash({ caseId, kind: 'synthetic-model' }).slice(0, 16);
    const referenceArtifactHash = stableHash({ caseId, kind: 'synthetic-reference' }).slice(0, 24);
    const record = {
      version: 'p6-m3-verification-record-v1',
      caseId,
      tier: 'XV',
      name: `${caseId} synthetic.metric`,
      metric: 'synthetic.metric',
      units: '1',
      reference: 1,
      computed: 1,
      relError: 0,
      tolerance: 1e-12,
      toleranceKey: null,
      modelHash,
      solverVersion: PHASE10_XVAL_SOLVER_VERSION,
      referenceSource: `${referenceSource}:synthetic-test-reference-v1`,
      status: 'OK',
      details: {
        scale: 1,
        path: 'synthetic.metric',
        extractionCode: 'OK',
        referenceArtifactHash,
      },
    };
    return {
      version: PHASE10_XVAL_EVIDENCE_VERSION,
      caseId,
      status: 'PASS',
      reason: null,
      modelHash,
      referenceArtifactHash,
      referenceSource,
      solverVersion: PHASE10_XVAL_SOLVER_VERSION,
      records: [record],
      details: { executed: true, quantityCount: 1 },
    };
  });
  const core = {
    version: PHASE10_XVAL_EVIDENCE_VERSION,
    status: 'OK',
    solverVersion: PHASE10_XVAL_SOLVER_VERSION,
    cases,
    summary: { total: 10, pass: 10, pending: 0, blocked: 0, ng: 0 },
    milestoneGate: {
      requiredCaseIds: ['XV-01', 'XV-02'],
      missingCaseIds: [],
      ok: true,
    },
    releaseQualification: {
      badge: 'externally-cross-validated',
      externallyCrossValidated: true,
      requiredCaseIds: [...PHASE10_XVAL_REQUIRED_CASE_IDS],
      externalReferenceCaseIds: PHASE10_XVAL_REQUIRED_CASE_IDS.slice(1),
      handCalcAnchorCaseIds: ['XV-01'],
      missingGreenCaseIds: [],
      sourceIneligibleCaseIds: [],
      pendingCaseIds: [],
      blockedCaseIds: [],
      failedCaseIds: [],
    },
    duplicateCaseIds: [],
    duplicateArtifactCaseIds: [],
  };
  return { ...core, artifactHash: stableHash(core).slice(0, 24) };
}

function buildGreenGate(options = {}) {
  return buildPhase10ReleaseGate({
    generatedAt: '2026-07-22T23:59:59.000+09:00',
    sourceRevision: 'a871573+p10-m11-worktree',
    xval: options.xval || greenXval,
    milestoneEvidence: options.milestoneEvidence || fullyQualifiedMilestoneEvidence,
    integration,
    performance: options.performance || nativeQualifiedPerformance,
    fullRegressionPassed: true,
    p3DocsPassed: true,
    agentContractPassed: true,
    documentationComplete: true,
    nativeWebGpuQualified: options.nativeWebGpuQualified ?? true,
  });
}

assert.equal(integration.features.length, 9);
assert.ok(integration.features.every((row) => row.surfaces.includes('agent')));
assert.equal(performance.status, 'PASS');
assert.equal(performance.cpuF64ReferencePassed, true);
assert.equal(performance.gpuF32ShadowPassed, true);
assert.equal(performance.nativeWebGpuQualified, false);
assert.equal(PHASE10_M9_REQUIRED_CASE_IDS.length, 35);
assert.deepEqual(new Set(shellEvidence.records.map((row) => row.caseId)), new Set(PHASE10_M9_REQUIRED_CASE_IDS));

const candidate = buildPhase10ReleaseGate({
  generatedAt: '2026-07-22T23:59:59.000+09:00', sourceRevision: 'a871573+p10-m11-worktree',
  xval, milestoneEvidence, integration, performance,
  fullRegressionPassed: true, p3DocsPassed: true, agentContractPassed: true, documentationComplete: true,
  nativeWebGpuQualified: false,
});
assert.deepEqual(validatePhase10ReleaseGate(candidate), { ok: true, errors: [] });
assert.equal(candidate.implementation.status, 'complete');
assert.equal(candidate.release.allowed, false);
assert.equal(candidate.release.externallyCrossValidated, false);
assert.ok(candidate.blockers.includes('P10_M11_EXTERNAL_CROSS_VALIDATION_REQUIRED'));
assert.ok(candidate.blockers.includes('P10_M11_NATIVE_WEBGPU_FORMULATION_DEVICE_REQUIRED'));
assert.ok(!candidate.blockers.includes('P10_M11_SHELL_NUMERICAL_QUALIFICATION_REQUIRED'));
assert.equal(candidate.evidence.shellNumericalQualification.status, 'PASS');
assert.equal(candidate.evidence.shellNumericalQualification.integrityValidated, true);
assert.equal(candidate.evidence.shellModelDesignTransfer.status, 'LIMITED');
assert.equal(candidate.evidence.shellModelDesignTransfer.allowed, false);
assert.equal(candidate.xval.integrity.status, 'PASS');
assert.ok(candidate.evidence.milestoneIntegrity.every((row) => row.status === 'PASS'));
assert.deepEqual(candidate.xval.missingGreenCaseIds, ['XV-02', 'XV-03', 'XV-04', 'XV-05', 'XV-06', 'XV-07', 'XV-08', 'XV-09', 'XV-10']);

const greenXval = syntheticGreenXval();
const releasable = buildPhase10ReleaseGate({
  generatedAt: candidate.generatedAt, sourceRevision: candidate.sourceRevision,
  xval: greenXval, milestoneEvidence, integration, performance,
  fullRegressionPassed: true, p3DocsPassed: true, agentContractPassed: true, documentationComplete: true,
  nativeWebGpuQualified: true,
});
assert.equal(releasable.release.allowed, false);
assert.ok(releasable.blockers.includes('P10_M11_NATIVE_WEBGPU_FORMULATION_DEVICE_REQUIRED'));

const fullyQualifiedMilestoneEvidence = replaceM9(milestoneEvidence, (row) => ({
  ...row,
  qualification: {
    ...row.qualification,
    nativeFormulationKernelsImplemented: true,
    nativeWebGpuKernelsQualified: true,
  },
}));
const nativeQualifiedPerformance = rehashPerformance(performance, { nativeWebGpuQualified: true });
const fullyQualified = buildPhase10ReleaseGate({
  generatedAt: candidate.generatedAt, sourceRevision: candidate.sourceRevision,
  xval: greenXval, milestoneEvidence: fullyQualifiedMilestoneEvidence,
  integration, performance: nativeQualifiedPerformance,
  fullRegressionPassed: true, p3DocsPassed: true, agentContractPassed: true, documentationComplete: true,
  nativeWebGpuQualified: true,
});
assert.deepEqual(validatePhase10ReleaseGate(fullyQualified), { ok: true, errors: [] });
assert.equal(fullyQualified.release.status, 'externally-cross-validated');
assert.equal(fullyQualified.release.allowed, true);
assert.equal(fullyQualified.release.designTransferAllowed, false);
assert.equal(fullyQualified.evidence.shellModelDesignTransfer.status, 'LIMITED');

const failStatusEvidence = milestoneEvidence.map((row) => row.milestone === 'P10-M8'
  ? { ...row, status: 'FAIL', implementationStatus: 'complete' }
  : row);
const failStatusGate = buildPhase10ReleaseGate({
  xval, milestoneEvidence: failStatusEvidence, integration, performance,
  fullRegressionPassed: true, p3DocsPassed: true, agentContractPassed: true, documentationComplete: true,
  nativeWebGpuQualified: false,
});
assert.equal(failStatusGate.evidence.complete, false);
assert.ok(failStatusGate.evidence.missing.includes('P10-M8'));

const selfDeclaredXval = {
  cases: Array.from({ length: 10 }, (_, index) => ({
    caseId: `XV-${String(index + 1).padStart(2, '0')}`,
    status: 'PASS',
    referenceSource: index ? 'self-declared' : 'hand-calc',
  })),
  releaseQualification: { externallyCrossValidated: true, sourceIneligibleCaseIds: [] },
};
const selfDeclaredGate = buildPhase10ReleaseGate({
  xval: selfDeclaredXval, milestoneEvidence: fullyQualifiedMilestoneEvidence,
  integration, performance: nativeQualifiedPerformance,
  fullRegressionPassed: true, p3DocsPassed: true, agentContractPassed: true, documentationComplete: true,
  nativeWebGpuQualified: true,
});
assert.equal(selfDeclaredGate.release.allowed, false);
assert.equal(selfDeclaredGate.xval.externallyCrossValidated, false);
assert.equal(selfDeclaredGate.xval.integrity.status, 'BLOCKED');
assert.ok(selfDeclaredGate.xval.integrity.errors.includes('XVAL_EVIDENCE_SCHEMA_INVALID'));

const tamperedXvalHash = { ...greenXval, artifactHash: '000000000000000000000000' };
const tamperedXvalHashGate = buildGreenGate({ xval: tamperedXvalHash });
assert.equal(tamperedXvalHashGate.release.allowed, false);
assert.equal(tamperedXvalHashGate.xval.integrity.status, 'BLOCKED');
assert.ok(tamperedXvalHashGate.xval.integrity.errors.includes('XVAL_EVIDENCE_HASH_MISMATCH'));

const mismatchedXvalSourceHash = structuredClone(greenXval);
mismatchedXvalSourceHash.cases[2].referenceArtifactHash = '111111111111111111111111';
const mismatchedXvalSourceHashGate = buildGreenGate({ xval: rehashArtifact(mismatchedXvalSourceHash) });
assert.equal(mismatchedXvalSourceHashGate.release.allowed, false);
assert.equal(mismatchedXvalSourceHashGate.xval.integrity.status, 'BLOCKED');
assert.ok(mismatchedXvalSourceHashGate.xval.integrity.errors.some((code) => code.startsWith('XVAL_RECORD_DETAILS_INVALID:')));

const malformedXvalMetric = structuredClone(greenXval);
malformedXvalMetric.cases[1].records[0].computed = '1';
const malformedXvalMetricGate = buildGreenGate({ xval: rehashArtifact(malformedXvalMetric) });
assert.equal(malformedXvalMetricGate.release.allowed, false);
assert.equal(malformedXvalMetricGate.xval.integrity.status, 'BLOCKED');
assert.ok(malformedXvalMetricGate.xval.integrity.errors.some((code) => code.startsWith('XVAL_RECORD_METRICS_INVALID:')));

const forgedXvalComputed = structuredClone(greenXval);
forgedXvalComputed.cases[0].records[0].computed = 999;
const forgedXvalComputedGate = buildGreenGate({ xval: rehashArtifact(forgedXvalComputed) });
assert.equal(forgedXvalComputedGate.release.allowed, false);
assert.equal(forgedXvalComputedGate.xval.integrity.status, 'BLOCKED');
assert.ok(forgedXvalComputedGate.xval.integrity.errors.some((code) => code.startsWith('XVAL_RECORD_REL_ERROR_INCONSISTENT:')));

const blockedShellEvidence = replaceM9(fullyQualifiedMilestoneEvidence, (row) => ({
  ...row,
  qualification: { ...row.qualification, cpuF64QualificationBlockers: ['INJECTED'] },
}));
const blockedShellGate = buildPhase10ReleaseGate({
  xval: greenXval, milestoneEvidence: blockedShellEvidence,
  integration, performance: nativeQualifiedPerformance,
  fullRegressionPassed: true, p3DocsPassed: true, agentContractPassed: true, documentationComplete: true,
  nativeWebGpuQualified: true,
});
assert.equal(blockedShellGate.evidence.shellNumericalQualification.status, 'BLOCKED');
assert.equal(blockedShellGate.release.allowed, false);

const modelDesignLimitedEvidence = replaceM9(fullyQualifiedMilestoneEvidence, (row) => ({
  ...row,
  qualification: {
    ...row.qualification,
    designTransferAllowed: false,
    modelMeshConvergenceQualificationStatus: 'BLOCKED',
    plateDesignTransferAllowed: false,
    designTransferBlockers: ['SHELL_MODEL_MESH_CONVERGENCE_REQUIRED'],
  },
}));
const modelDesignLimitedGate = buildGreenGate({ milestoneEvidence: modelDesignLimitedEvidence });
assert.equal(modelDesignLimitedGate.evidence.shellNumericalQualification.status, 'PASS');
assert.equal(modelDesignLimitedGate.evidence.shellModelDesignTransfer.status, 'LIMITED');
assert.equal(modelDesignLimitedGate.release.allowed, true);
assert.equal(modelDesignLimitedGate.release.designTransferAllowed, false);

const duplicateMilestoneGate = buildGreenGate({
  milestoneEvidence: [
    ...fullyQualifiedMilestoneEvidence,
    structuredClone(fullyQualifiedMilestoneEvidence.find((row) => row.milestone === 'P10-M8')),
  ],
});
assert.equal(duplicateMilestoneGate.evidence.complete, false);
assert.deepEqual(duplicateMilestoneGate.evidence.duplicateMilestones, ['P10-M8']);
assert.ok(duplicateMilestoneGate.evidence.missing.includes('P10-M8'));
assert.ok(duplicateMilestoneGate.blockers.includes('P10_M11_IMPLEMENTATION_EVIDENCE_REQUIRED'));

const minimalMilestoneEvidence = fullyQualifiedMilestoneEvidence.map((row) => row.milestone === 'P10-M8'
  ? { milestone: 'P10-M8', status: 'OK' }
  : row);
const minimalMilestoneGate = buildGreenGate({ milestoneEvidence: minimalMilestoneEvidence });
assert.equal(minimalMilestoneGate.evidence.complete, false);
assert.ok(minimalMilestoneGate.evidence.missing.includes('P10-M8'));
assert.ok(minimalMilestoneGate.evidence.milestoneIntegrity
  .find((row) => row.milestone === 'P10-M8').errors.includes('MILESTONE_EVIDENCE_VERSION_MISMATCH'));

const tamperedMilestoneHash = fullyQualifiedMilestoneEvidence.map((row) => row.milestone === 'P10-M8'
  ? { ...row, artifactHash: '222222222222222222222222' }
  : row);
const tamperedMilestoneHashGate = buildGreenGate({ milestoneEvidence: tamperedMilestoneHash });
assert.equal(tamperedMilestoneHashGate.evidence.complete, false);
assert.ok(tamperedMilestoneHashGate.evidence.milestoneIntegrity
  .find((row) => row.milestone === 'P10-M8').errors.includes('MILESTONE_EVIDENCE_HASH_MISMATCH'));

const malformedMilestoneMetrics = fullyQualifiedMilestoneEvidence.map((row) => {
  if (row.milestone !== 'P10-M8') return row;
  const mutated = structuredClone(row);
  mutated.records[0].computed = '0';
  return rehashArtifact(mutated);
});
const malformedMilestoneMetricsGate = buildGreenGate({ milestoneEvidence: malformedMilestoneMetrics });
assert.equal(malformedMilestoneMetricsGate.evidence.complete, false);
assert.ok(malformedMilestoneMetricsGate.evidence.milestoneIntegrity
  .find((row) => row.milestone === 'P10-M8').errors.some((code) => code.startsWith('MILESTONE_EVIDENCE_METRICS_INVALID:')));

const forgedMilestoneComputed = fullyQualifiedMilestoneEvidence.map((row) => {
  if (row.milestone !== 'P10-M8') return row;
  const mutated = structuredClone(row);
  mutated.records[0].computed = 999;
  return rehashArtifact(mutated);
});
const forgedMilestoneComputedGate = buildGreenGate({ milestoneEvidence: forgedMilestoneComputed });
assert.equal(forgedMilestoneComputedGate.evidence.complete, false);
assert.ok(forgedMilestoneComputedGate.evidence.milestoneIntegrity
  .find((row) => row.milestone === 'P10-M8').errors.some((code) => code.startsWith('MILESTONE_EVIDENCE_REL_ERROR_INCONSISTENT:')));

const mismatchedMilestoneSourceHash = fullyQualifiedMilestoneEvidence.map((row) => {
  if (row.milestone !== 'P10-M8') return row;
  const mutated = structuredClone(row);
  mutated.records[0].modelHash = '3333333333333333';
  return rehashArtifact(mutated);
});
const mismatchedMilestoneSourceHashGate = buildGreenGate({ milestoneEvidence: mismatchedMilestoneSourceHash });
assert.equal(mismatchedMilestoneSourceHashGate.evidence.complete, false);
assert.ok(mismatchedMilestoneSourceHashGate.evidence.milestoneIntegrity
  .find((row) => row.milestone === 'P10-M8').errors.some((code) => code.startsWith('MILESTONE_EVIDENCE_SOURCE_HASH_MISMATCH:')));

const duplicateShellCases = replaceM9(fullyQualifiedMilestoneEvidence, (row) => ({
  ...row,
  records: PHASE10_M9_REQUIRED_CASE_IDS.map(() => structuredClone(row.records[0])),
}));
const duplicateShellCaseGate = buildGreenGate({ milestoneEvidence: duplicateShellCases });
assert.equal(duplicateShellCaseGate.evidence.shellNumericalQualification.status, 'BLOCKED');
assert.ok(duplicateShellCaseGate.evidence.shellNumericalQualification.errors.includes('SHELL_EVIDENCE_CASE_SET_INVALID'));

const tamperedShellHash = fullyQualifiedMilestoneEvidence.map((row) => row.milestone === 'P10-M9'
  ? { ...row, artifactHash: '000000000000000000000000' }
  : row);
const tamperedShellHashGate = buildGreenGate({ milestoneEvidence: tamperedShellHash });
assert.equal(tamperedShellHashGate.evidence.shellNumericalQualification.status, 'BLOCKED');
assert.ok(tamperedShellHashGate.evidence.shellNumericalQualification.errors.includes('SHELL_EVIDENCE_HASH_MISMATCH'));

const wrongShellVersion = replaceM9(fullyQualifiedMilestoneEvidence, (row) => ({
  ...row,
  version: 'p10-evidence-artifact-forged',
}));
const wrongShellVersionGate = buildGreenGate({ milestoneEvidence: wrongShellVersion });
assert.equal(wrongShellVersionGate.evidence.shellNumericalQualification.status, 'BLOCKED');
assert.ok(wrongShellVersionGate.evidence.shellNumericalQualification.errors.includes('SHELL_EVIDENCE_VERSION_MISMATCH'));

const malformedShellMetrics = replaceM9(fullyQualifiedMilestoneEvidence, (row) => {
  row.records[0].computed = '0';
  return row;
});
const malformedShellMetricsGate = buildGreenGate({ milestoneEvidence: malformedShellMetrics });
assert.equal(malformedShellMetricsGate.evidence.shellNumericalQualification.status, 'BLOCKED');
assert.ok(malformedShellMetricsGate.evidence.shellNumericalQualification.errors.some((code) => code.startsWith('SHELL_EVIDENCE_METRICS_INVALID:')));

const inconsistentShellPass = replaceM9(fullyQualifiedMilestoneEvidence, (row) => {
  row.records[0].relError = row.records[0].tolerance + 1;
  row.records[0].status = 'OK';
  return row;
});
const inconsistentShellPassGate = buildGreenGate({ milestoneEvidence: inconsistentShellPass });
assert.equal(inconsistentShellPassGate.evidence.shellNumericalQualification.status, 'BLOCKED');
assert.ok(inconsistentShellPassGate.evidence.shellNumericalQualification.errors.some((code) => code.startsWith('SHELL_EVIDENCE_PASS_INCONSISTENT:')));

const forgedShellComputed = replaceM9(fullyQualifiedMilestoneEvidence, (row) => {
  row.records[0].computed = 999;
  return row;
});
const forgedShellComputedGate = buildGreenGate({ milestoneEvidence: forgedShellComputed });
assert.equal(forgedShellComputedGate.evidence.shellNumericalQualification.status, 'BLOCKED');
assert.ok(forgedShellComputedGate.evidence.shellNumericalQualification.errors.some((code) => code.startsWith('SHELL_EVIDENCE_PASS_INCONSISTENT:')));

const falseShellPassFlag = replaceM9(fullyQualifiedMilestoneEvidence, (row) => {
  row.records[0].pass = false;
  return row;
});
const falseShellPassFlagGate = buildGreenGate({ milestoneEvidence: falseShellPassFlag });
assert.equal(falseShellPassFlagGate.evidence.shellNumericalQualification.status, 'BLOCKED');
assert.ok(falseShellPassFlagGate.evidence.shellNumericalQualification.errors.some((code) => code.startsWith('SHELL_EVIDENCE_PASS_INCONSISTENT:')));

const forgedPerformance = { ...nativeQualifiedPerformance, elapsedMs: 0 };
const forgedPerformanceGate = buildGreenGate({ performance: forgedPerformance });
assert.equal(forgedPerformanceGate.release.allowed, false);
assert.equal(forgedPerformanceGate.performance.integrity.status, 'BLOCKED');
assert.ok(forgedPerformanceGate.performance.integrity.errors.includes('PERFORMANCE_HASH_MISMATCH'));
assert.equal(forgedPerformanceGate.checks.find((row) => row.id === 'large-model-performance').status, 'BLOCKED');
assert.deepEqual(validatePhase10ReleaseGate(forgedPerformanceGate), { ok: true, errors: [] });

const malformedPerformance = rehashPerformance(nativeQualifiedPerformance, { elapsedMs: '0' });
const malformedPerformanceGate = buildGreenGate({ performance: malformedPerformance });
assert.equal(malformedPerformanceGate.release.allowed, false);
assert.equal(malformedPerformanceGate.performance.integrity.status, 'BLOCKED');
assert.ok(malformedPerformanceGate.performance.integrity.errors.includes('PERFORMANCE_ELAPSED_INVALID'));

const forgedPerformanceMemory = rehashPerformance(nativeQualifiedPerformance, { memoryBytes: 1 });
const forgedPerformanceMemoryGate = buildGreenGate({ performance: forgedPerformanceMemory });
assert.equal(forgedPerformanceMemoryGate.release.allowed, false);
assert.ok(forgedPerformanceMemoryGate.performance.integrity.errors.includes('PERFORMANCE_MEMORY_MODEL_INCONSISTENT'));

const forgedPerformancePass = rehashPerformance(nativeQualifiedPerformance, {
  cpuF64ReferencePassed: false,
  status: 'PASS',
});
const forgedPerformancePassGate = buildGreenGate({ performance: forgedPerformancePass });
assert.equal(forgedPerformancePassGate.release.allowed, false);
assert.ok(forgedPerformancePassGate.performance.integrity.errors.includes('PERFORMANCE_STATUS_INCONSISTENT'));

const catalogFeature = findFeature('phase10-advanced-elastic');
assert.equal(catalogFeature.control.key, 'feature.phase10-advanced-elastic');
assert.equal(resolveFeatureEnabled(catalogFeature.id), true);
assert.equal(resolveFeatureEnabled(catalogFeature.id, { [catalogFeature.control.key]: false }), false);

const target = { S: { model: null } };
const api = createIndexAgentApi(target, null);
assert.ok(api.getCapabilities().readApis.includes('getPhase10ReleaseStatus'));
const agentStatus = api.getPhase10ReleaseStatus({ xval, milestoneEvidence, performance });
assert.equal(agentStatus.release.allowed, false);
assert.equal(agentStatus.integrationContractHash, integration.contractHash);

if (process.argv.includes('--print')) {
  console.log(JSON.stringify(candidate, null, 2));
} else {
  const committed = JSON.parse(await readFile(path.join(evidenceDir, 'p10-m11-release-gate.json'), 'utf8'));
  assert.deepEqual(validatePhase10ReleaseGate(committed), { ok: true, errors: [] });
  assert.equal(committed.version, PHASE10_RELEASE_GATE_VERSION);
  assert.equal(committed.implementation.status, 'complete');
  assert.equal(committed.release.status, 'blocked');
  console.log(JSON.stringify({ ok: true, implementation: candidate.implementation.status, release: candidate.release.status, blockers: candidate.blockers, performanceMs: performance.elapsedMs }, null, 2));
}
