import { validatePhase15CorrectiveBaseline } from './baseline.js';
import { validatePhase15FullRegressionEvidence } from './fullRegressionEvidence.js';
import {
  cloneStrictJson,
  immutable,
  strictCanonicalHash,
} from './strictCanonical.js';

export const PHASE15_RELEASE_MANIFEST_VERSION = 'p15-m9-capability-release-manifest-v1';
export const PHASE15_PUBLISHED_BENCHMARK_CASES = Object.freeze([
  'PD1', 'SB1', 'SB10', 'SB2', 'SB3', 'SB5', 'SB6', 'SB7', 'SB8', 'SB9', 'SM5',
]);
export const PHASE15_CUSTOM_BENCHMARK_CASES = Object.freeze(['P3S2-SS']);
export const PHASE15_RELEASE_REVIEW_ROLES = Object.freeze([
  'numerical', 'structural-domain', 'verification', 'architecture', 'release',
]);

const CLOSED_FINDING_STATUSES = new Set(['CLOSED', 'RESOLVED']);
const CRITICAL_HIGH = new Set(['CRITICAL', 'HIGH']);

/**
 * Builds the Phase 15 fail-closed capability/release manifest.
 *
 * The deterministic manifest hash intentionally excludes the run timestamp and
 * host metadata. Missing approvals or evidence are represented as BLOCKED gates;
 * this function never invents reviewer, R4, or clean-environment evidence.
 */
export function buildPhase15ReleaseManifest(input = {}) {
  const benchmark = auditBenchmarkArtifact(input.benchmarkArtifact);
  const architecture = auditArchitectureInput(input.architectureAudit);
  const governance = auditGovernanceInput(input.governance);
  const execution = auditExecutionInput(input.execution, benchmark, architecture);
  const review = auditReviewInput(input.review);
  const crossSolver = auditCrossSolverInput(input.crossSolver);
  const sourceRevision = normalizeHash(input.sourceRevision, [40]);

  const gates = [
    gate('P15-REL-01', sourceRevision != null, 'source revision is bound'),
    gate('P15-REL-02', benchmark.integrityPassed, 'benchmark calculation/result/run hashes are valid'),
    gate('P15-REL-03', benchmark.caseSetPassed, 'all 12 cases execute with PASS/CUSTOM_PASS or an explicit capability BLOCKED record'),
    gate('P15-REL-04', benchmark.numericMetricPassed, 'all signed numerical benchmark metrics pass'),
    gate('P15-REL-05', benchmark.externalRuntimeUsed === false, 'no external runtime solver was used'),
    gate('P15-REL-06', benchmark.r4ClaimBoundaryPassed, 'R4 and custom stabilization claims are explicit and non-silent'),
    gate('P15-REL-07', execution.determinismPassed, 'three runs reproduce calculation and result hashes'),
    gate('P15-REL-08', execution.fullRegressionPassed, 'full mandatory regression completed without fail, skip, timeout, or flake'),
    gate('P15-REL-09', execution.cleanEnvironmentPassed, 'independent clean-environment rerun passed'),
    gate('P15-REL-10', execution.mutationAndSurfacePassed, 'mutation and product-surface parity gates pass'),
    gate('P15-REL-11', governance.passed, 'approved M0 governance baseline and fresh trace/evidence are bound'),
    gate('P15-REL-12', architecture.passed, 'M8 architecture audit is valid and all architecture gates pass'),
    gate('P15-REL-13', architecture.openCriticalHighCount + review.openCriticalHighCount === 0, 'no unresolved Critical/High findings remain'),
    gate('P15-REL-14', review.requiredApprovalsPassed, 'all required independent reviewer approvals are present'),
    gate('P15-REL-15', crossSolver.actualR4Passed, 'full-precision MIDAS and STRIX R4 evidence and mapping audit are present'),
    gate('P15-REL-16', benchmark.allCapabilityQualificationPassed, 'every benchmark capability has complete mandatory qualification evidence'),
  ];

  const commonCapabilityGatePassed = gates
    .filter((row) => !['P15-REL-15', 'P15-REL-16'].includes(row.id))
    .every((row) => row.status === 'PASS');
  const capabilities = buildCapabilities(benchmark, commonCapabilityGatePassed, crossSolver.actualR4Passed);
  const releaseAllowed = gates.every((row) => row.status === 'PASS');
  const structuralOwner = review.structuralOwner;
  const finalDesignTransferAllowed = releaseAllowed
    && structuralOwner.approved
    && structuralOwner.finalDesignTransferApproved
    && structuralOwner.owner != null
    && structuralOwner.approvalHash != null;

  const core = {
    version: PHASE15_RELEASE_MANIFEST_VERSION,
    phase: 'Phase 15',
    milestone: 'P15-M9',
    sourceRevision,
    benchmark,
    architecture,
    governance,
    execution,
    review,
    crossSolver,
    capabilities,
    gates,
    status: releaseAllowed ? 'RELEASE_ALLOWED' : 'BLOCKED',
    releaseAllowed,
    finalDesignTransferAllowed,
    blockers: gates.filter((row) => row.status !== 'PASS').map((row) => row.id),
    limitations: buildLimitations({ benchmark, architecture, governance, execution, review, crossSolver, finalDesignTransferAllowed }),
  };
  const manifestHash = strictCanonicalHash(core, 'Phase 15 release manifest');
  const runCore = {
    manifestHash,
    generatedAt: normalizeTimestamp(input.run?.generatedAt),
    environment: normalizeObject(input.run?.environment),
    invocationId: normalizeText(input.run?.invocationId),
  };
  const run = { ...runCore, runRecordHash: strictCanonicalHash(runCore, 'Phase 15 release run record') };
  return immutable({ ...core, manifestHash, run });
}

export function validatePhase15ReleaseManifest(value = {}) {
  const errors = [];
  try {
    const expectedKeys = [
      'version', 'phase', 'milestone', 'sourceRevision', 'benchmark', 'architecture', 'governance',
      'execution', 'review', 'crossSolver', 'capabilities', 'gates', 'status', 'releaseAllowed',
      'finalDesignTransferAllowed', 'blockers', 'limitations', 'manifestHash', 'run',
    ];
    if (!hasExactKeys(value, expectedKeys)) errors.push('manifest:unknown-or-missing-field');
    if (value.version !== PHASE15_RELEASE_MANIFEST_VERSION) errors.push('manifest:version');
    if (value.phase !== 'Phase 15' || value.milestone !== 'P15-M9') errors.push('manifest:scope');
    if (!Array.isArray(value.gates) || value.gates.length !== 16) errors.push('manifest:gates');
    const semanticGates = expectedReleaseGates(value);
    if (strictCanonicalHash(value.gates || [], 'release gates') !== strictCanonicalHash(semanticGates, 'expected release gates')) errors.push('manifest:gate-semantics');
    const releaseAllowed = Array.isArray(value.gates) && value.gates.every((row) => row?.status === 'PASS');
    if (value.releaseAllowed !== releaseAllowed) errors.push('manifest:release-status');
    if (value.status !== (releaseAllowed ? 'RELEASE_ALLOWED' : 'BLOCKED')) errors.push('manifest:status');
    const expectedBlockers = (value.gates || []).filter((row) => row?.status !== 'PASS').map((row) => row.id);
    if (strictCanonicalHash(value.blockers || [], 'release blockers') !== strictCanonicalHash(expectedBlockers, 'expected release blockers')) errors.push('manifest:blockers');
    if (value.finalDesignTransferAllowed && !(value.releaseAllowed
      && value.review?.structuralOwner?.approved === true
      && value.review?.structuralOwner?.finalDesignTransferApproved === true
      && value.review?.structuralOwner?.owner
      && value.review?.structuralOwner?.approvalHash)) errors.push('manifest:design-transfer');
    if ((value.capabilities || []).length !== 12) errors.push('manifest:capabilities');
    if (value.benchmark?.caseSetPassed !== benchmarkSnapshotCaseSetPassed(value.benchmark)) errors.push('manifest:benchmark-case-set');
    if (value.benchmark?.numericMetricPassed !== benchmarkSnapshotNumericPassed(value.benchmark)) errors.push('manifest:benchmark-numeric-status');
    if (value.benchmark?.allCapabilityQualificationPassed !== benchmarkSnapshotAllQualified(value.benchmark)) errors.push('manifest:benchmark-qualification-status');
    if ((value.capabilities || []).some((row) => row?.id === 'P3S2-SS' && row?.identicalToStrixP3S2 !== false)) errors.push('manifest:custom-claim');
    if ((value.capabilities || []).some((row) => row?.designTransferAllowed !== false)) errors.push('manifest:capability-design-transfer');
    if ((value.capabilities || []).some((row) => row?.releaseAllowed === true && row?.internallyQualified !== true)) errors.push('manifest:capability-release-without-qualification');
    if ((value.capabilities || []).some((row) => row?.id !== 'P3S2-SS' && row?.releaseAllowed === true && row?.crossSolverCompared !== true)) errors.push('manifest:published-release-without-r4');
    if (value.crossSolver?.crossSolverCompared !== value.crossSolver?.actualR4Passed) errors.push('manifest:r4-status');

    const core = cloneStrictJson(value, 'Phase 15 release manifest');
    delete core.manifestHash;
    delete core.run;
    if (value.manifestHash !== strictCanonicalHash(core, 'Phase 15 release manifest')) errors.push('manifest:hash');
    const runCore = cloneStrictJson(value.run, 'Phase 15 release run record');
    delete runCore.runRecordHash;
    if (value.run?.manifestHash !== value.manifestHash) errors.push('manifest:run-binding');
    if (value.run?.runRecordHash !== strictCanonicalHash(runCore, 'Phase 15 release run record')) errors.push('manifest:run-hash');
  } catch (error) {
    errors.push(`manifest:schema:${error.message}`);
  }
  return immutable({ ok: errors.length === 0, errors });
}

function auditBenchmarkArtifact(value) {
  const artifact = isObject(value) ? value : {};
  const cases = Array.isArray(artifact.cases) ? artifact.cases : [];
  const summary = isObject(artifact.summary) ? artifact.summary : {};
  let calculationHashValid = false;
  let resultHashValid = false;
  let runRecordHashValid = false;
  try {
    const requiredMetricFields = ['quantity', 'unit', 'reference', 'strix', 'tolerancePct', 'comparison'];
    const projectionFields = [
      'version', 'excludedRuntimeTelemetryFields', 'retainedEngineeringDiagnostics',
    ];
    const projectionPresent = Object.hasOwn(artifact, 'resultHashProjection');
    const projection = artifact.resultHashProjection;
    const projectionOptionalForLegacy = artifact.version === 'strix21-sstructures-phase15-v2';
    const projectionComplete = (!projectionPresent && projectionOptionalForLegacy) || (projectionPresent
      && isObject(projection)
      && hasExactKeys(projection, projectionFields)
      && typeof projection.version === 'string'
      && Array.isArray(projection.excludedRuntimeTelemetryFields)
      && projection.excludedRuntimeTelemetryFields.every((field) => typeof field === 'string')
      && new Set(projection.excludedRuntimeTelemetryFields).size === projection.excludedRuntimeTelemetryFields.length
      && Array.isArray(projection.retainedEngineeringDiagnostics)
      && projection.retainedEngineeringDiagnostics.every((field) => typeof field === 'string')
      && new Set(projection.retainedEngineeringDiagnostics).size === projection.retainedEngineeringDiagnostics.length);
    const specificationsComplete = cases.every((row) => typeof row?.id === 'string'
      && typeof row?.modelHash === 'string'
      && Array.isArray(row.metrics)
      && row.metrics.every((metric) => requiredMetricFields.every((field) => Object.hasOwn(metric, field))));
    if (specificationsComplete && projectionComplete) {
      const calculationCore = {
        version: artifact.version,
        engine: artifact.engine,
        externalRuntimeUsed: artifact.externalRuntimeUsed,
        referencePolicy: artifact.referencePolicy,
        ...(projectionPresent ? {
          resultHashProjection: cloneStrictJson(projection, 'benchmark result-hash projection'),
        } : {}),
        caseSpecifications: cases.map((row) => ({
          id: row.id,
          modelHash: row.modelHash,
          metrics: row.metrics.map((metric) => Object.fromEntries(requiredMetricFields.map((field) => [field, metric[field]]))),
        })),
      };
      calculationHashValid = normalizeHash(artifact.calculationHash) === strictCanonicalHash(calculationCore, 'benchmark calculation');
    }
    const resultCore = { calculationHash: artifact.calculationHash, cases, summary };
    resultHashValid = normalizeHash(artifact.resultHash) === strictCanonicalHash(resultCore, 'benchmark result')
      && artifact.artifactHash === artifact.resultHash;
    runRecordHashValid = isObject(artifact.runRecord)
      && normalizeHash(artifact.runRecordHash) === strictCanonicalHash(artifact.runRecord, 'benchmark run record')
      && artifact.runRecord.calculationHash === artifact.calculationHash
      && artifact.runRecord.resultHash === artifact.resultHash;
  } catch {
    calculationHashValid = false;
    resultHashValid = false;
    runRecordHashValid = false;
  }

  const ids = cases.map((row) => String(row?.id || '').toUpperCase());
  const published = [...PHASE15_PUBLISHED_BENCHMARK_CASES];
  const custom = [...PHASE15_CUSTOM_BENCHMARK_CASES];
  const expectedIds = [...published, ...custom].sort();
  const publishedStatusesAdmissible = published.every((id) => {
    const row = cases.find((candidate) => candidate?.id === id);
    return row?.status === 'PASS' || hasExplicitQualificationBlocker(row);
  });
  const customStatusesPassed = custom.every((id) => cases.find((row) => row?.id === id)?.status === 'CUSTOM_PASS');
  const observedCounts = countCaseStatuses(cases);
  const caseSetPassed = sameArray([...ids].sort(), expectedIds)
    && new Set(ids).size === expectedIds.length
    && publishedStatusesAdmissible
    && customStatusesPassed
    && summary.attempted === 12
    && summary.PASS === observedCounts.PASS
    && summary.CUSTOM_PASS === observedCounts.CUSTOM_PASS
    && summary.REVIEW === 0
    && summary.BLOCKED === observedCounts.BLOCKED
    && observedCounts.CUSTOM_PASS === 1
    && observedCounts.REVIEW === 0;
  const metrics = cases.flatMap((row) => Array.isArray(row?.metrics) ? row.metrics : []);
  const numericMetricPassed = metrics.length > 0
    && metrics.every((row) => row?.passed === true && row?.comparison === 'signed')
    && summary.metricCount === metrics.length
    && summary.metricPassCount === metrics.length
    && cases.every((row) => row?.benchmarkExecuted === true);
  const allCapabilityQualificationPassed = published.every((id) => cases.find((row) => row?.id === id)?.status === 'PASS')
    && customStatusesPassed;
  const customRow = cases.find((row) => row?.id === 'P3S2-SS');
  const unjustifiedCaseR4Claim = artifact.crossSolverCompared === true
    || artifact.referenceLevel === 'R4'
    || !String(artifact.referencePolicy || '').startsWith('R1/R2')
    || cases.some((row) => row?.crossSolverCompared === true
      || row?.referenceLevel === 'R4'
      || row?.audit?.crossSolverCompared === true
      || row?.audit?.referenceLevel === 'R4');
  const r4ClaimBoundaryPassed = !unjustifiedCaseR4Claim
    && customRow?.audit?.identicalToStrixP3S2 === false;

  return {
    version: normalizeText(artifact.version),
    calculationHash: normalizeHash(artifact.calculationHash),
    resultHash: normalizeHash(artifact.resultHash),
    runRecordHash: normalizeHash(artifact.runRecordHash),
    artifactHash: normalizeHash(artifact.artifactHash),
    calculationHashValid,
    resultHashValid,
    runRecordHashValid,
    integrityPassed: calculationHashValid && resultHashValid && runRecordHashValid,
    externalRuntimeUsed: artifact.externalRuntimeUsed === false ? false : true,
    caseSetPassed,
    numericMetricPassed,
    allCapabilityQualificationPassed,
    r4ClaimBoundaryPassed,
    summary: {
      attempted: finiteOrNull(summary.attempted),
      PASS: finiteOrNull(summary.PASS),
      CUSTOM_PASS: finiteOrNull(summary.CUSTOM_PASS),
      REVIEW: finiteOrNull(summary.REVIEW),
      BLOCKED: finiteOrNull(summary.BLOCKED),
      metricCount: finiteOrNull(summary.metricCount),
      metricPassCount: finiteOrNull(summary.metricPassCount),
    },
    cases: expectedIds.map((id) => {
      const row = cases.find((candidate) => candidate?.id === id);
      const qualification = qualificationSnapshot(row);
      return {
        id,
        status: normalizeText(row?.status),
        modelHash: normalizeHash(row?.modelHash),
        resultHash: normalizeHash(row?.resultHash),
        metricCount: Array.isArray(row?.metrics) ? row.metrics.length : 0,
        numericMetricsPassed: Boolean(row?.benchmarkExecuted === true
          && row?.metrics?.every((metric) => metric?.passed === true && metric?.comparison === 'signed')
        ),
        internallyQualified: qualification.internallyQualified,
        qualificationStatus: qualification.status,
        qualificationBlockers: qualification.blockers,
      };
    }),
    claimBoundary: 'STRIX comparison columns are not actual R4 evidence; P3S2-SS is an S-Structures R5 custom stabilization claim and is not STRIX-identical.',
  };
}

function auditArchitectureInput(value) {
  const report = isObject(value) ? value : {};
  const gates = isObject(report.gate) ? Object.fromEntries(Object.entries(report.gate).sort(([left], [right]) => left.localeCompare(right))) : {};
  const findings = Array.isArray(report.forbiddenImports) ? report.forbiddenImports : [];
  const openCriticalHigh = findings
    .filter((row) => CRITICAL_HIGH.has(String(row?.severity || '').toUpperCase()))
    .map((row) => ({
      rule: normalizeText(row.rule),
      severity: String(row.severity || '').toUpperCase(),
      source: normalizeText(row.source),
      line: nonnegativeIntegerOrNull(row.line),
      target: normalizeText(row.target),
    }))
    .sort(compareFinding);
  let auditHashValid = false;
  try {
    const core = cloneStrictJson(report, 'architecture audit');
    const supplied = core.auditHash;
    delete core.auditHash;
    core.root = null;
    auditHashValid = normalizeHash(supplied) === strictCanonicalHash(core, 'architecture audit');
  } catch {
    auditHashValid = false;
  }
  const gatesPassed = Object.keys(gates).length > 0 && Object.values(gates).every((status) => status === true);
  return {
    version: normalizeText(report.version),
    auditHash: normalizeHash(report.auditHash),
    sourceDigest: normalizeHash(report.sourceDigest),
    auditHashValid,
    gates,
    gatesPassed,
    reportedOk: report.ok === true,
    openCriticalHighCount: openCriticalHigh.length,
    openCriticalHigh,
    passed: auditHashValid && gatesPassed && report.ok === true && openCriticalHigh.length === 0,
  };
}

function auditGovernanceInput(value) {
  const input = isObject(value) ? value : {};
  const baseline = isObject(input.baselineArtifact) ? input.baselineArtifact : null;
  const validation = baseline ? validatePhase15CorrectiveBaseline(baseline) : { ok: false, errors: ['baseline:missing'] };
  const statusPassed = baseline?.status === 'PASS';
  const traceabilityComplete = input.traceabilityComplete === true && baseline?.traceCoverage === 1;
  const evidenceFresh = input.evidenceFresh === true && nonnegativeIntegerOrNull(input.staleEvidenceCount) === 0;
  const manifestApprovalsComplete = input.manifestApprovalsComplete === true
    && Array.isArray(baseline?.manifestBindings)
    && baseline.manifestBindings.length > 0
    && baseline.manifestBindings.every((row) => row?.approved === true);
  return {
    baselineHash: normalizeHash(baseline?.baselineHash),
    baselineArtifactHash: normalizeHash(baseline?.artifactHash),
    baselineValidationPassed: validation.ok,
    baselineStatus: normalizeText(baseline?.status),
    traceabilityComplete,
    manifestApprovalsComplete,
    evidenceFresh,
    staleEvidenceCount: nonnegativeIntegerOrNull(input.staleEvidenceCount),
    validationErrors: [...(validation.errors || [])].sort(),
    passed: validation.ok && statusPassed && traceabilityComplete && manifestApprovalsComplete && evidenceFresh,
  };
}

function auditExecutionInput(value, benchmark, architecture) {
  const input = isObject(value) ? value : {};
  const runs = Array.isArray(input.determinismRuns) ? input.determinismRuns.map((row, index) => ({
    runId: normalizeText(row?.runId) || `run-${index + 1}`,
    calculationHash: normalizeHash(row?.calculationHash),
    resultHash: normalizeHash(row?.resultHash),
  })) : [];
  const determinismPassed = runs.length === 3
    && runs.every((row) => row.calculationHash === benchmark.calculationHash && row.resultHash === benchmark.resultHash)
    && new Set(runs.map((row) => row.calculationHash)).size === 1
    && new Set(runs.map((row) => row.resultHash)).size === 1;
  const fullRegressionArtifact = isObject(input.fullRegressionArtifact) ? input.fullRegressionArtifact : null;
  const fullRegressionValidation = fullRegressionArtifact
    ? validatePhase15FullRegressionEvidence(fullRegressionArtifact)
    : { ok: false, errors: ['evidence:missing'] };
  const fullRegressionSourceBound = fullRegressionValidation.ok
    && fullRegressionArtifact.calculation?.sourceDigest === architecture.sourceDigest;
  const fullRegressionEvidenceValid = fullRegressionValidation.ok && fullRegressionSourceBound;
  const mandatoryCounts = Object.fromEntries(['fail', 'skip', 'timeout', 'flake'].map((field) => [
    field,
    fullRegressionEvidenceValid ? nonnegativeIntegerOrNull(fullRegressionArtifact.mandatoryCounts?.[field]) : null,
  ]));
  const mandatoryCountsPassed = Object.values(mandatoryCounts).every((count) => count === 0);
  const fullRegressionPassed = fullRegressionEvidenceValid
    && fullRegressionArtifact.fullRegressionPassed === true
    && normalizeHash(fullRegressionArtifact.fullRegressionHash) != null
    && mandatoryCountsPassed;
  const cleanEnvironmentPassed = input.cleanEnvironmentPassed === true
    && normalizeHash(input.cleanRunHash) != null;
  const mutationKillRate = finiteOrNull(input.mutationKillRate);
  const mutationAndSurfacePassed = mutationKillRate === 1 && input.productSurfaceParityPassed === true;
  return {
    determinismRuns: runs,
    determinismPassed,
    fullRegressionEvidenceValid,
    fullRegressionEvidenceErrors: fullRegressionValidation.ok
      ? fullRegressionSourceBound ? [] : ['evidence:source-digest-mismatch']
      : [...(fullRegressionValidation.errors || [])].sort(),
    fullRegressionSourceBound,
    fullRegressionPassed,
    fullRegressionHash: fullRegressionEvidenceValid ? normalizeHash(fullRegressionArtifact.fullRegressionHash) : null,
    fullRegressionCalculationHash: fullRegressionEvidenceValid ? normalizeHash(fullRegressionArtifact.calculationHash) : null,
    fullRegressionRunRecordHash: fullRegressionEvidenceValid ? normalizeHash(fullRegressionArtifact.run?.runRecordHash) : null,
    fullRegressionSourceDigest: fullRegressionEvidenceValid ? normalizeHash(fullRegressionArtifact.calculation?.sourceDigest) : null,
    fullRegressionTestInventoryHash: fullRegressionEvidenceValid ? normalizeHash(fullRegressionArtifact.calculation?.testInventoryHash) : null,
    fullRegressionCommandHash: fullRegressionEvidenceValid ? normalizeHash(fullRegressionArtifact.calculation?.commandHash) : null,
    fullRegressionPlannedCount: fullRegressionEvidenceValid
      ? nonnegativeIntegerOrNull(fullRegressionArtifact.result?.plannedCount)
      : null,
    cleanEnvironmentPassed,
    cleanRunHash: normalizeHash(input.cleanRunHash),
    mandatoryCounts,
    mandatoryCountsPassed,
    mutationKillRate,
    productSurfaceParityPassed: input.productSurfaceParityPassed === true,
    mutationAndSurfacePassed,
  };
}

function auditReviewInput(value) {
  const input = isObject(value) ? value : {};
  const reviewers = Object.fromEntries(PHASE15_RELEASE_REVIEW_ROLES.map((role) => {
    const row = isObject(input.reviewers?.[role]) ? input.reviewers[role] : {};
    return [role, {
      reviewer: normalizeText(row.reviewer),
      approvalHash: normalizeHash(row.approvalHash),
      approved: row.approved === true,
      independent: row.independent === true,
    }];
  }));
  const requiredApprovalsPassed = PHASE15_RELEASE_REVIEW_ROLES.every((role) => {
    const row = reviewers[role];
    return row.reviewer != null && row.approvalHash != null && row.approved && row.independent;
  });
  const findings = (Array.isArray(input.findings) ? input.findings : []).map((row, index) => ({
    id: normalizeText(row?.id) || `finding-${index + 1}`,
    severity: String(row?.severity || 'UNKNOWN').toUpperCase(),
    status: String(row?.status || 'OPEN').toUpperCase(),
    owner: normalizeText(row?.owner),
    closureEvidenceHash: normalizeHash(row?.closureEvidenceHash),
  })).sort((left, right) => left.id.localeCompare(right.id));
  const openCriticalHigh = findings.filter((row) => CRITICAL_HIGH.has(row.severity)
    && !(CLOSED_FINDING_STATUSES.has(row.status) && row.owner && row.closureEvidenceHash));
  const ownerInput = isObject(input.structuralOwner) ? input.structuralOwner : {};
  const structuralOwner = {
    owner: normalizeText(ownerInput.owner),
    professionalRegistration: normalizeText(ownerInput.professionalRegistration),
    approvalHash: normalizeHash(ownerInput.approvalHash),
    approved: ownerInput.approved === true,
    finalDesignTransferApproved: ownerInput.finalDesignTransferApproved === true,
  };
  return {
    reviewers,
    requiredApprovalsPassed,
    findings,
    openCriticalHighCount: openCriticalHigh.length,
    openCriticalHigh,
    structuralOwner,
  };
}

function auditCrossSolverInput(value) {
  const input = isObject(value) ? value : {};
  const providers = Object.fromEntries(['MIDAS', 'STRIX'].map((id) => {
    const row = isObject(input.providers?.[id]) ? input.providers[id] : {};
    return [id, {
      product: normalizeText(row.product),
      version: normalizeText(row.version),
      artifactHash: normalizeHash(row.artifactHash),
      modelMappingHash: normalizeHash(row.modelMappingHash),
      fullPrecisionResults: row.fullPrecisionResults === true,
      independentlyGenerated: row.independentlyGenerated === true,
    }];
  }));
  const providersPassed = Object.values(providers).every((row) => row.product && row.version
    && row.artifactHash && row.modelMappingHash && row.fullPrecisionResults && row.independentlyGenerated);
  const mappingAuditPassed = input.mappingAuditPassed === true && normalizeHash(input.mappingAuditHash) != null;
  const actualR4Passed = input.actualR4Available === true && providersPassed && mappingAuditPassed;
  return {
    actualR4Available: input.actualR4Available === true,
    providers,
    providersPassed,
    mappingAuditPassed,
    mappingAuditHash: normalizeHash(input.mappingAuditHash),
    actualR4Passed,
    crossSolverCompared: actualR4Passed,
    provisionalStrixColumnsAreR4: false,
  };
}

function buildCapabilities(benchmark, commonCapabilityGatePassed, actualR4Passed) {
  return benchmark.cases.map((row) => {
    const custom = row.id === 'P3S2-SS';
    const releaseAllowed = row.internallyQualified && commonCapabilityGatePassed
      && (custom ? true : actualR4Passed);
    return {
      id: row.id,
      kind: custom ? 'R5-custom-stabilization' : 'published-benchmark',
      benchmarkStatus: row.status,
      numericalMetricsPassed: row.numericMetricsPassed,
      qualificationStatus: row.qualificationStatus,
      qualificationBlockers: row.qualificationBlockers,
      internallyQualified: row.internallyQualified,
      evidenceResultHash: benchmark.resultHash,
      crossSolverCompared: custom ? false : (releaseAllowed && actualR4Passed),
      identicalToStrixP3S2: custom ? false : null,
      claimStatus: releaseAllowed
        ? (custom ? 'internally-verified-custom' : 'cross-solver-compared')
        : (row.internallyQualified ? (custom ? 'internally-verified-custom' : 'internally-qualified') : 'blocked'),
      releaseAllowed,
      designTransferAllowed: false,
    };
  });
}

function buildLimitations(inputs) {
  const rows = [];
  if (!inputs.crossSolver.actualR4Passed) rows.push('Actual full-precision MIDAS and STRIX R4 evidence is not qualified.');
  if (!inputs.architecture.passed) rows.push('M8 architecture/modularization gate is not closed.');
  if (!inputs.governance.passed) rows.push('Approved governance baseline, manifests, traceability, or evidence freshness is incomplete.');
  if (!inputs.execution.cleanEnvironmentPassed) rows.push('Clean-environment rerun evidence is missing or failed.');
  if (!inputs.execution.fullRegressionPassed) rows.push('Full mandatory regression evidence is missing or failed.');
  if (!inputs.review.requiredApprovalsPassed) rows.push('Independent reviewer approvals are incomplete.');
  if (!inputs.benchmark.allCapabilityQualificationPassed) rows.push('One or more benchmark capabilities retain explicit mandatory qualification blockers.');
  if (!inputs.finalDesignTransferAllowed) rows.push('Final design transfer is not approved by an identified structural owner.');
  if (!inputs.benchmark.r4ClaimBoundaryPassed) rows.push('R4 or P3S2-SS claim boundary is invalid.');
  return rows;
}

function gate(id, passed, label) {
  return { id, status: passed ? 'PASS' : 'BLOCKED', label };
}

function hasExplicitQualificationBlocker(row) {
  const qualification = row?.audit?.phase15Qualification;
  return row?.status === 'BLOCKED'
    && qualification?.status === 'BLOCKED'
    && Array.isArray(qualification.reasonCodes)
    && qualification.reasonCodes.length > 0
    && Array.isArray(qualification.mandatoryGates)
    && qualification.mandatoryGates.length > 0
    && qualification.mandatoryGates.every((gateRow) => gateRow?.status === 'BLOCKED');
}

function qualificationSnapshot(row) {
  if (row?.status === 'PASS') return { status: 'INTERNALLY_QUALIFIED', internallyQualified: true, blockers: [] };
  if (row?.status === 'CUSTOM_PASS') return { status: 'INTERNALLY_VERIFIED_CUSTOM', internallyQualified: true, blockers: [] };
  if (hasExplicitQualificationBlocker(row)) {
    return {
      status: 'BLOCKED',
      internallyQualified: false,
      blockers: [...new Set(row.audit.phase15Qualification.reasonCodes.map(String))].sort(),
    };
  }
  return { status: 'INVALID', internallyQualified: false, blockers: ['QUALIFICATION_STATUS_INVALID'] };
}

function countCaseStatuses(cases) {
  return Object.fromEntries(['PASS', 'CUSTOM_PASS', 'REVIEW', 'BLOCKED']
    .map((status) => [status, cases.filter((row) => row?.status === status).length]));
}

function expectedReleaseGates(value) {
  const benchmark = value.benchmark || {};
  const architecture = value.architecture || {};
  const governance = value.governance || {};
  const execution = value.execution || {};
  const review = value.review || {};
  const crossSolver = value.crossSolver || {};
  const benchmarkIntegrity = benchmark.calculationHashValid === true
    && benchmark.resultHashValid === true
    && benchmark.runRecordHashValid === true;
  const architecturePassed = architecture.auditHashValid === true
    && architecture.gatesPassed === true
    && architecture.reportedOk === true
    && architecture.openCriticalHighCount === 0;
  const governancePassed = governance.baselineValidationPassed === true
    && governance.baselineStatus === 'PASS'
    && governance.traceabilityComplete === true
    && governance.manifestApprovalsComplete === true
    && governance.evidenceFresh === true;
  const reviewerPassed = PHASE15_RELEASE_REVIEW_ROLES.every((role) => {
    const row = review.reviewers?.[role];
    return Boolean(row?.reviewer && row?.approvalHash && row?.approved === true && row?.independent === true);
  });
  const providerPassed = ['MIDAS', 'STRIX'].every((id) => {
    const row = crossSolver.providers?.[id];
    return Boolean(row?.product && row?.version && row?.artifactHash && row?.modelMappingHash
      && row?.fullPrecisionResults === true && row?.independentlyGenerated === true);
  });
  const r4Passed = crossSolver.actualR4Available === true
    && providerPassed
    && crossSolver.mappingAuditPassed === true
    && Boolean(crossSolver.mappingAuditHash);
  return [
    gate('P15-REL-01', normalizeHash(value.sourceRevision, [40]) != null, 'source revision is bound'),
    gate('P15-REL-02', benchmarkIntegrity, 'benchmark calculation/result/run hashes are valid'),
    gate('P15-REL-03', benchmarkSnapshotCaseSetPassed(benchmark), 'all 12 cases execute with PASS/CUSTOM_PASS or an explicit capability BLOCKED record'),
    gate('P15-REL-04', benchmarkSnapshotNumericPassed(benchmark), 'all signed numerical benchmark metrics pass'),
    gate('P15-REL-05', benchmark.externalRuntimeUsed === false, 'no external runtime solver was used'),
    gate('P15-REL-06', benchmark.r4ClaimBoundaryPassed === true, 'R4 and custom stabilization claims are explicit and non-silent'),
    gate('P15-REL-07', execution.determinismPassed === true, 'three runs reproduce calculation and result hashes'),
    gate('P15-REL-08', execution.fullRegressionPassed === true && execution.mandatoryCountsPassed === true, 'full mandatory regression completed without fail, skip, timeout, or flake'),
    gate('P15-REL-09', execution.cleanEnvironmentPassed === true, 'independent clean-environment rerun passed'),
    gate('P15-REL-10', execution.mutationAndSurfacePassed === true, 'mutation and product-surface parity gates pass'),
    gate('P15-REL-11', governancePassed, 'approved M0 governance baseline and fresh trace/evidence are bound'),
    gate('P15-REL-12', architecturePassed, 'M8 architecture audit is valid and all architecture gates pass'),
    gate('P15-REL-13', architecture.openCriticalHighCount + review.openCriticalHighCount === 0, 'no unresolved Critical/High findings remain'),
    gate('P15-REL-14', reviewerPassed, 'all required independent reviewer approvals are present'),
    gate('P15-REL-15', r4Passed, 'full-precision MIDAS and STRIX R4 evidence and mapping audit are present'),
    gate('P15-REL-16', benchmarkSnapshotAllQualified(benchmark), 'every benchmark capability has complete mandatory qualification evidence'),
  ];
}

function benchmarkSnapshotCaseSetPassed(benchmark) {
  const cases = Array.isArray(benchmark?.cases) ? benchmark.cases : [];
  const expectedIds = [...PHASE15_PUBLISHED_BENCHMARK_CASES, ...PHASE15_CUSTOM_BENCHMARK_CASES].sort();
  const ids = cases.map((row) => row?.id).sort();
  if (!sameArray(ids, expectedIds) || new Set(ids).size !== expectedIds.length) return false;
  const publishedValid = PHASE15_PUBLISHED_BENCHMARK_CASES.every((id) => {
    const row = cases.find((candidate) => candidate?.id === id);
    return row?.status === 'PASS'
      || (row?.status === 'BLOCKED' && row?.qualificationStatus === 'BLOCKED' && row?.qualificationBlockers?.length > 0);
  });
  const custom = cases.find((row) => row?.id === 'P3S2-SS');
  const counts = countCaseStatuses(cases);
  return publishedValid
    && custom?.status === 'CUSTOM_PASS'
    && benchmark.summary?.attempted === 12
    && benchmark.summary?.PASS === counts.PASS
    && benchmark.summary?.CUSTOM_PASS === counts.CUSTOM_PASS
    && benchmark.summary?.REVIEW === 0
    && benchmark.summary?.BLOCKED === counts.BLOCKED;
}

function benchmarkSnapshotNumericPassed(benchmark) {
  const cases = Array.isArray(benchmark?.cases) ? benchmark.cases : [];
  return cases.length === 12
    && cases.every((row) => row?.numericMetricsPassed === true)
    && benchmark.summary?.metricCount > 0
    && benchmark.summary?.metricPassCount === benchmark.summary.metricCount;
}

function benchmarkSnapshotAllQualified(benchmark) {
  const cases = Array.isArray(benchmark?.cases) ? benchmark.cases : [];
  return cases.length === 12 && cases.every((row) => row?.internallyQualified === true);
}

function normalizeHash(value, lengths = [64]) {
  const text = normalizeText(value)?.toLowerCase() || null;
  return text && lengths.includes(text.length) && /^[0-9a-f]+$/.test(text) ? text : null;
}

function normalizeText(value) {
  const text = value == null ? '' : String(value).trim();
  return text || null;
}

function normalizeTimestamp(value) {
  const text = normalizeText(value);
  if (!text || !Number.isFinite(Date.parse(text))) throw new TypeError('run.generatedAt must be an ISO-compatible timestamp.');
  return text;
}

function normalizeObject(value) {
  if (!isObject(value)) throw new TypeError('run.environment must be a non-empty object.');
  return cloneStrictJson(value, 'run.environment');
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonnegativeIntegerOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasExactKeys(value, expectedKeys) {
  if (!isObject(value)) return false;
  return sameArray(Object.keys(value).sort(), [...expectedKeys].sort());
}

function compareFinding(left, right) {
  return left.severity.localeCompare(right.severity)
    || (left.source || '').localeCompare(right.source || '')
    || (left.line || 0) - (right.line || 0)
    || (left.rule || '').localeCompare(right.rule || '');
}
