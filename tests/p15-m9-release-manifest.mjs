import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  PHASE15_CUSTOM_BENCHMARK_CASES,
  PHASE15_PUBLISHED_BENCHMARK_CASES,
  PHASE15_RELEASE_REVIEW_ROLES,
  buildPhase15CorrectiveBaseline,
  buildPhase15ReleaseManifest,
  runPhase15FullRegressionEvidence,
  strictCanonicalHash,
  validatePhase15ReleaseManifest,
} from '../verification/framework/phase15/index.js';
import { phase15BaselineInput } from './helpers/phase15-fixtures.mjs';

const benchmarkArtifact = benchmarkFixture();
const architectureAudit = architectureFixture();
const baselineArtifact = buildPhase15CorrectiveBaseline(phase15BaselineInput());
const fullRegressionArtifact = await fullRegressionFixture(architectureAudit.sourceDigest);
const input = releaseInput({ benchmarkArtifact, architectureAudit, baselineArtifact, fullRegressionArtifact });

const qualifiedBatch = buildPhase15ReleaseManifest(input);
assert.deepEqual(validatePhase15ReleaseManifest(qualifiedBatch), { ok: true, errors: [] });
assert.equal(qualifiedBatch.status, 'BLOCKED', 'PD1 and SM5 mandatory qualification blockers must prevent whole-batch release');
assert.equal(qualifiedBatch.releaseAllowed, false);
assert.equal(qualifiedBatch.benchmark.summary.PASS, 9);
assert.equal(qualifiedBatch.benchmark.summary.CUSTOM_PASS, 1);
assert.equal(qualifiedBatch.benchmark.summary.BLOCKED, 2);
assert.equal(qualifiedBatch.benchmark.numericMetricPassed, true);
assert.equal(qualifiedBatch.benchmark.caseSetPassed, true);
assert.equal(qualifiedBatch.benchmark.allCapabilityQualificationPassed, false);
assert.equal(qualifiedBatch.benchmark.calculationHashValid, true, 'declared deterministic result projection must be calculation-hash bound');
assert.ok(qualifiedBatch.blockers.includes('P15-REL-16'));
assert.equal(qualifiedBatch.capabilities.length, 12);
assert.equal(qualifiedBatch.capabilities.filter((row) => row.internallyQualified).length, 10);
assert.equal(qualifiedBatch.capabilities.filter((row) => row.releaseAllowed).length, 10, 'complete external gates may release only the independently qualified subset');
assert.equal(qualifiedBatch.capabilities.find((row) => row.id === 'PD1').qualificationBlockers[0], 'PD1_STAGE_WORK_BALANCE_NOT_EXPOSED');
assert.equal(qualifiedBatch.capabilities.find((row) => row.id === 'SM5').qualificationBlockers[0], 'SM5_INDEPENDENT_REFERENCE_MODE_VECTORS_UNAVAILABLE');
assert.equal(qualifiedBatch.crossSolver.crossSolverCompared, true);
assert.equal(qualifiedBatch.benchmark.externalRuntimeUsed, false);
assert.equal(qualifiedBatch.finalDesignTransferAllowed, false, 'review approvals do not silently authorize final design transfer');
assert.ok(qualifiedBatch.limitations.some((row) => row.includes('qualification blockers')));

const fullyQualifiedArtifact = benchmarkFixture({ blockedCases: [] });
const fullyQualifiedInput = releaseInput({
  benchmarkArtifact: fullyQualifiedArtifact,
  architectureAudit,
  baselineArtifact,
  fullRegressionArtifact,
});
const green = buildPhase15ReleaseManifest(fullyQualifiedInput);
assert.equal(green.status, 'RELEASE_ALLOWED');
assert.equal(green.releaseAllowed, true);
assert.equal(green.capabilities.filter((row) => row.releaseAllowed).length, 12);
assert.equal(green.finalDesignTransferAllowed, false);
assert.ok(green.limitations.some((row) => row.includes('structural owner')));

const ownerApproved = buildPhase15ReleaseManifest({
  ...fullyQualifiedInput,
  review: {
    ...fullyQualifiedInput.review,
    structuralOwner: {
      owner: 'licensed-structural-owner',
      professionalRegistration: 'fixture-registration',
      approvalHash: '9'.repeat(64),
      approved: true,
      finalDesignTransferApproved: true,
    },
  },
});
assert.equal(ownerApproved.releaseAllowed, true);
assert.equal(ownerApproved.finalDesignTransferAllowed, true);

const laterRun = buildPhase15ReleaseManifest({
  ...fullyQualifiedInput,
  run: { ...fullyQualifiedInput.run, generatedAt: '2026-08-27T01:00:00.000Z' },
});
assert.equal(laterRun.manifestHash, green.manifestHash, 'run timestamp must not affect the deterministic manifest hash');
assert.notEqual(laterRun.run.runRecordHash, green.run.runRecordHash);

const withoutR4 = buildPhase15ReleaseManifest({ ...input, crossSolver: {} });
assert.equal(withoutR4.status, 'BLOCKED');
assert.equal(withoutR4.releaseAllowed, false);
assert.ok(withoutR4.blockers.includes('P15-REL-15'));
assert.equal(withoutR4.crossSolver.crossSolverCompared, false);
assert.equal(withoutR4.crossSolver.provisionalStrixColumnsAreR4, false);
assert.equal(withoutR4.capabilities.find((row) => row.id === 'SB2').releaseAllowed, false);
assert.equal(withoutR4.capabilities.find((row) => row.id === 'P3S2-SS').identicalToStrixP3S2, false);

const withoutReviewers = buildPhase15ReleaseManifest({ ...input, review: { findings: [] } });
assert.ok(withoutReviewers.blockers.includes('P15-REL-14'));

const withoutCleanRun = buildPhase15ReleaseManifest({
  ...input,
  execution: { ...input.execution, cleanEnvironmentPassed: false, cleanRunHash: null },
});
assert.ok(withoutCleanRun.blockers.includes('P15-REL-09'));

const withoutFullRegression = buildPhase15ReleaseManifest({
  ...input,
  execution: { ...input.execution, fullRegressionArtifact: null },
});
assert.ok(withoutFullRegression.blockers.includes('P15-REL-08'));

const legacySelfAttestation = buildPhase15ReleaseManifest({
  ...input,
  execution: {
    ...input.execution,
    fullRegressionArtifact: null,
    fullRegressionPassed: true,
    fullRegressionHash: 'a'.repeat(64),
    mandatoryCounts: { fail: 0, skip: 0, timeout: 0, flake: 0 },
  },
});
assert.equal(legacySelfAttestation.execution.fullRegressionPassed, false, 'legacy self-attested fields must fail closed');
assert.equal(legacySelfAttestation.execution.fullRegressionEvidenceValid, false);
assert.ok(legacySelfAttestation.blockers.includes('P15-REL-08'));

const wrongSourceRegression = await fullRegressionFixture('9'.repeat(64));
const sourceMismatch = buildPhase15ReleaseManifest({
  ...input,
  execution: { ...input.execution, fullRegressionArtifact: wrongSourceRegression },
});
assert.equal(sourceMismatch.execution.fullRegressionSourceBound, false);
assert.equal(sourceMismatch.execution.fullRegressionPassed, false);
assert.ok(sourceMismatch.execution.fullRegressionEvidenceErrors.includes('evidence:source-digest-mismatch'));
assert.ok(sourceMismatch.blockers.includes('P15-REL-08'));

const externalRuntimeBenchmark = structuredClone(benchmarkArtifact);
externalRuntimeBenchmark.externalRuntimeUsed = true;
rehashBenchmark(externalRuntimeBenchmark);
const externalRuntimeBlocked = buildPhase15ReleaseManifest({ ...input, benchmarkArtifact: externalRuntimeBenchmark });
assert.ok(externalRuntimeBlocked.blockers.includes('P15-REL-05'));

const architectureFinding = architectureFixture({
  ok: false,
  gate: { moduleBoundary: false },
  forbiddenImports: [{
    rule: 'solver-upward', severity: 'Critical', source: 'src/solver/a.js', line: 1, target: 'src/ui/b.js',
  }],
});
const withM8Finding = buildPhase15ReleaseManifest({ ...input, architectureAudit: architectureFinding });
assert.ok(withM8Finding.blockers.includes('P15-REL-12'));
assert.ok(withM8Finding.blockers.includes('P15-REL-13'));
assert.equal(withM8Finding.architecture.openCriticalHighCount, 1);

const reviewFinding = buildPhase15ReleaseManifest({
  ...input,
  review: {
    ...input.review,
    findings: [{ id: 'M8-HIGH-1', severity: 'High', status: 'RESOLVED', owner: 'architecture-reviewer' }],
  },
});
assert.ok(reviewFinding.blockers.includes('P15-REL-13'), 'closed Critical/High finding needs closure evidence hash');

const tamperedBenchmark = structuredClone(benchmarkArtifact);
tamperedBenchmark.cases[0].metrics[0].sStructures = 99;
const tamperedRelease = buildPhase15ReleaseManifest({ ...input, benchmarkArtifact: tamperedBenchmark });
assert.ok(tamperedRelease.blockers.includes('P15-REL-02'));

const tamperedProjectionBenchmark = structuredClone(benchmarkArtifact);
tamperedProjectionBenchmark.resultHashProjection.excludedRuntimeTelemetryFields.push('engineering-response');
const tamperedProjectionRelease = buildPhase15ReleaseManifest({ ...input, benchmarkArtifact: tamperedProjectionBenchmark });
assert.ok(tamperedProjectionRelease.blockers.includes('P15-REL-02'), 'result projection mutation must invalidate the calculation hash');

const missingProjectionV3Benchmark = structuredClone(benchmarkArtifact);
missingProjectionV3Benchmark.version = 'strix21-sstructures-phase15-v3-m7-qualification';
delete missingProjectionV3Benchmark.resultHashProjection;
rehashBenchmark(missingProjectionV3Benchmark);
const missingProjectionV3Release = buildPhase15ReleaseManifest({ ...input, benchmarkArtifact: missingProjectionV3Benchmark });
assert.ok(missingProjectionV3Release.blockers.includes('P15-REL-02'), 'v3 benchmark must declare and bind its deterministic result projection');

const actualBenchmarkArtifact = JSON.parse(await readFile(
  new URL('../verification/benchmarks/strix21/runs/first-batch-results.json', import.meta.url),
  'utf8',
));
const actualBenchmarkRelease = buildPhase15ReleaseManifest({ ...input, benchmarkArtifact: actualBenchmarkArtifact });
assert.equal(actualBenchmarkRelease.benchmark.calculationHashValid, true, 'actual first-batch artifact must pass M9 calculation-hash audit');
assert.equal(actualBenchmarkRelease.benchmark.resultHashValid, true);
assert.equal(actualBenchmarkRelease.benchmark.runRecordHashValid, true);
assert.ok(!actualBenchmarkRelease.blockers.includes('P15-REL-02'));

const falseR4Claim = structuredClone(benchmarkArtifact);
falseR4Claim.cases.find((row) => row.id === 'SB2').crossSolverCompared = true;
rehashBenchmark(falseR4Claim);
const claimBlocked = buildPhase15ReleaseManifest({ ...input, benchmarkArtifact: falseR4Claim });
assert.ok(claimBlocked.blockers.includes('P15-REL-06'));

const staleOldBatch = benchmarkFixture({
  blockedCases: [],
  reviewCases: ['SB2', 'SB3', 'SB5', 'SB6', 'SB7'],
});
const staleOldRelease = buildPhase15ReleaseManifest({ ...input, benchmarkArtifact: staleOldBatch });
assert.equal(staleOldRelease.benchmark.summary.PASS, 6);
assert.equal(staleOldRelease.benchmark.summary.CUSTOM_PASS, 1);
assert.equal(staleOldRelease.benchmark.summary.REVIEW, 5);
assert.equal(staleOldRelease.benchmark.integrityPassed, true, 'stale status contract must be rejected even when hashes are internally consistent');
assert.equal(staleOldRelease.benchmark.caseSetPassed, false);
assert.ok(staleOldRelease.blockers.includes('P15-REL-03'));

const forged = structuredClone(green);
forged.releaseAllowed = false;
assert.equal(validatePhase15ReleaseManifest(forged).ok, false);

const liveCli = JSON.parse(execFileSync(process.execPath, [
  'tools/run-p15-m9-release.mjs', '--no-output', '--generated-at=2026-08-27T00:00:00.000Z',
], { encoding: 'utf8' }));
assert.equal(liveCli.status, 'BLOCKED', 'live CLI must not fabricate missing governance/reviewer/R4 evidence');
assert.ok(liveCli.blockers.includes('P15-REL-11'));
assert.ok(liveCli.blockers.includes('P15-REL-14'));
assert.ok(liveCli.blockers.includes('P15-REL-15'));

console.log(JSON.stringify({
  ok: true,
  milestone: 'P15-M9',
  deterministicManifestHash: green.manifestHash,
  runHashSeparated: true,
  releaseAllowedWithCompleteFixtureEvidence: green.releaseAllowed,
  validBlockedBatch: qualifiedBatch.benchmark.summary,
  independentlyRecordedCapabilities: qualifiedBatch.capabilities.filter((row) => row.internallyQualified).length,
  staleOldStatusRejected: true,
  finalDesignTransferWithoutOwner: green.finalDesignTransferAllowed,
  liveCliStatus: liveCli.status,
  failClosedScenarios: ['R4', 'reviewers', 'clean-run', 'full-regression', 'external-runtime', 'M8-finding', 'closure-evidence', 'benchmark-hash', 'projection-mutation', 'v3-projection-missing', 'silent-R4-claim'],
}, null, 2));

function benchmarkFixture(options = {}) {
  const blockedCases = new Set(options.blockedCases ?? ['PD1', 'SM5']);
  const reviewCases = new Set(options.reviewCases || []);
  const ids = [...PHASE15_PUBLISHED_BENCHMARK_CASES, ...PHASE15_CUSTOM_BENCHMARK_CASES];
  const cases = ids.map((id, index) => {
    const status = id === 'P3S2-SS' ? 'CUSTOM_PASS' : reviewCases.has(id) ? 'REVIEW' : blockedCases.has(id) ? 'BLOCKED' : 'PASS';
    const reasonCode = id === 'PD1'
      ? 'PD1_STAGE_WORK_BALANCE_NOT_EXPOSED'
      : id === 'SM5'
        ? 'SM5_INDEPENDENT_REFERENCE_MODE_VECTORS_UNAVAILABLE'
        : `${id}_QUALIFICATION_EVIDENCE_UNAVAILABLE`;
    const audit = id === 'P3S2-SS'
      ? { mandatoryPassed: true, identicalToStrixP3S2: false }
      : status === 'BLOCKED'
        ? {
          preliminaryMetricsPassed: true,
          phase15Qualification: {
            status: 'BLOCKED',
            reasonCodes: [reasonCode],
            mandatoryGates: [{ id: `${id}-BLOCKER`, status: 'BLOCKED', reasonCode }],
          },
        }
        : { mandatoryPassed: status === 'PASS' };
    return {
      id,
      status,
    benchmarkExecuted: true,
    modelHash: strictCanonicalHash({ id, kind: 'model' }),
    resultHash: strictCanonicalHash({ id, kind: 'result' }),
    metrics: [{
      quantity: `${id}-signed-response`,
      unit: 'ratio',
      sStructures: index + 1,
      reference: index + 1,
      strix: index + 1,
      errorVsReferencePct: 0,
      errorVsStrixPct: 0,
      absoluteError: 0,
      tolerancePct: 1,
      comparison: 'signed',
      passed: true,
    }],
      audit,
    };
  });
  const counts = Object.fromEntries(['PASS', 'CUSTOM_PASS', 'REVIEW', 'BLOCKED']
    .map((status) => [status, cases.filter((row) => row.status === status).length]));
  const artifact = {
    version: 'strix21-sstructures-phase15-v2',
    startedAt: '2026-08-27T00:00:00.000Z',
    completedAt: '2026-08-27T00:01:00.000Z',
    engine: 'S-Structures in-house deterministic solver',
    externalRuntimeUsed: false,
    referencePolicy: 'R1/R2 published values frozen in verification-only module before execution',
    resultHashProjection: {
      version: 'strix21-deterministic-result-projection-v1',
      excludedRuntimeTelemetryFields: ['durationMs', 'startedAt', 'completedAt'],
      retainedEngineeringDiagnostics: ['iterations', 'residuals', 'equilibrium'],
    },
    cases,
    summary: {
      attempted: 12,
      ...counts,
      metricCount: 12,
      metricPassCount: 12,
      maximumAbsoluteReferenceErrorPct: 0,
    },
  };
  rehashBenchmark(artifact);
  return artifact;
}

function rehashBenchmark(artifact) {
  const calculationCore = {
    version: artifact.version,
    engine: artifact.engine,
    externalRuntimeUsed: artifact.externalRuntimeUsed,
    referencePolicy: artifact.referencePolicy,
    ...(Object.hasOwn(artifact, 'resultHashProjection') ? {
      resultHashProjection: artifact.resultHashProjection,
    } : {}),
    caseSpecifications: artifact.cases.map((row) => ({
      id: row.id,
      modelHash: row.modelHash,
      metrics: row.metrics.map(({ quantity, unit, reference, strix, tolerancePct, comparison }) => ({
        quantity, unit, reference, strix, tolerancePct, comparison,
      })),
    })),
  };
  artifact.calculationHash = strictCanonicalHash(calculationCore);
  artifact.resultHash = strictCanonicalHash({ calculationHash: artifact.calculationHash, cases: artifact.cases, summary: artifact.summary });
  artifact.artifactHash = artifact.resultHash;
  artifact.runRecord = {
    calculationHash: artifact.calculationHash,
    resultHash: artifact.resultHash,
    startedAt: artifact.startedAt,
    completedAt: artifact.completedAt,
    environment: { runtime: 'node-fixture', platform: 'win32', architecture: 'x64' },
    runId: 'fixture-run',
  };
  artifact.runRecordHash = strictCanonicalHash(artifact.runRecord);
}

function architectureFixture(overrides = {}) {
  const core = {
    version: 'p15-m8-architecture-audit-v1',
    root: 'C:/fixture/S-Structures-main',
    sourceDigest: '1'.repeat(64),
    sourceFileCount: 100,
    importEdgeCount: 200,
    gate: { moduleBoundary: true },
    ok: true,
    cycles: [],
    forbiddenImports: [],
    ownership: {},
    compatibility: {},
    publicApi: {},
    unresolvedRelativeImports: [],
    ...overrides,
  };
  return { ...core, auditHash: strictCanonicalHash({ ...core, root: null }) };
}

function releaseInput({ benchmarkArtifact: benchmark, architectureAudit: architecture, baselineArtifact, fullRegressionArtifact: regression }) {
  const reviewers = Object.fromEntries(PHASE15_RELEASE_REVIEW_ROLES.map((role, index) => [role, {
    reviewer: `${role}-reviewer`,
    approvalHash: String(index + 3).repeat(64),
    approved: true,
    independent: true,
  }]));
  return {
    sourceRevision: '0'.repeat(40),
    benchmarkArtifact: benchmark,
    architectureAudit: architecture,
    governance: {
      baselineArtifact,
      traceabilityComplete: true,
      manifestApprovalsComplete: true,
      evidenceFresh: true,
      staleEvidenceCount: 0,
    },
    execution: {
      determinismRuns: [1, 2, 3].map((runId) => ({
        runId: `fixture-${runId}`,
        calculationHash: benchmark.calculationHash,
        resultHash: benchmark.resultHash,
      })),
      fullRegressionArtifact: regression,
      cleanEnvironmentPassed: true,
      cleanRunHash: 'b'.repeat(64),
      mutationKillRate: 1,
      productSurfaceParityPassed: true,
    },
    review: { reviewers, findings: [] },
    crossSolver: {
      actualR4Available: true,
      mappingAuditPassed: true,
      mappingAuditHash: 'c'.repeat(64),
      providers: {
        MIDAS: {
          product: 'MIDAS fixture', version: 'fixture-v1', artifactHash: 'd'.repeat(64),
          modelMappingHash: 'e'.repeat(64), fullPrecisionResults: true, independentlyGenerated: true,
        },
        STRIX: {
          product: 'STRIX fixture', version: 'fixture-v1', artifactHash: 'f'.repeat(64),
          modelMappingHash: '8'.repeat(64), fullPrecisionResults: true, independentlyGenerated: true,
        },
      },
    },
    run: {
      generatedAt: '2026-08-27T00:00:00.000Z',
      environment: { runtime: 'node-fixture', platform: 'win32', architecture: 'x64' },
      invocationId: 'fixture',
    },
  };
}

async function fullRegressionFixture(sourceDigest) {
  const inventoryHash = '2'.repeat(64);
  const times = ['2026-08-27T00:00:00.000Z', '2026-08-27T00:00:01.000Z'];
  const ticks = [0, 1000];
  return runPhase15FullRegressionEvidence({
    calculation: {
      sourceDigest,
      suiteManifestHash: '3'.repeat(64),
      frozenTestInventoryHash: inventoryHash,
      testInventoryHash: inventoryHash,
      frozenPlannedCount: 10,
      testInventory: {
        version: 'fixture-inventory-v1',
        entryCount: 12,
        testFileCount: 10,
        runnerFileCount: 2,
        plannedCount: 10,
      },
      command: { program: 'npm.cmd', args: ['test'], display: 'npm.cmd test' },
      timeoutMs: 10_000,
    },
    runner: async () => ({
      exitCode: 0,
      signal: null,
      timedOut: false,
      mandatoryCounts: { fail: 0, skip: 0, timeout: 0, flake: 0 },
      sourceDigestAfter: sourceDigest,
      testInventoryHashAfter: inventoryHash,
    }),
    now: () => times.shift(),
    timer: () => ticks.shift(),
    runtime: { node: 'fixture-node', platform: 'fixture-platform' },
  });
}
