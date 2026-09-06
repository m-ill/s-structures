import { stableHash } from '../../core/stableHash.js';
import { NONLINEAR_ENGINE_IDS, getNonlinearCapability } from '../capabilities.js';
import { summarizePhase8PilotArtifacts } from './pilotPackages.js';
import { normalizePhase8NumericalComparisons } from './comparisonContract.js';

export const PHASE8_RELEASE_MANIFEST_VERSION = 'p8-m11-release-manifest-v1';
export const PHASE8_M11_EVIDENCE_VERSION = 'p8-m11-qualification-evidence-v1';
export const PHASE8_EXTERNAL_COMPARISON_VERSION = 'p8-m11-external-comparison-v1';

const PERF_IDS = Object.freeze(Array.from({ length: 16 }, (_, index) => `NL-PERF-${String(index + 1).padStart(2, '0')}`));
const PILOT_IDS = Object.freeze(Array.from({ length: 5 }, (_, index) => `NL-PILOT-${String(index + 1).padStart(2, '0')}`));
const REQUIRED_M11_IDS = Object.freeze([...PERF_IDS, ...PILOT_IDS]);

export function buildPhase8ReleaseManifest(input = {}) {
  const independent = normalizeIndependentQualification(input.independent);
  const performance = normalizePerformanceQualification(input.performance);
  const pilots = input.pilotSummary || summarizePhase8PilotArtifacts(input.pilotArtifacts || []);
  const historical = normalizeHistoricalEvidence(input.historicalEvidence || []);
  const review = normalizeReview(input.review);
  const externalComparisons = (input.externalComparisons || []).map(normalizeExternalComparison);
  const validExternalCount = new Set(externalComparisons
    .filter((row) => row.status === 'PASS')
    .map((row) => `${row.sourceKind}:${row.solver}:${row.solverVersion}:${row.sourceHash}`)).size;
  const m9Pass = historical.byMilestone['P8-M9'] === 'PASS';
  const m10Pass = historical.byMilestone['P8-M10'] === 'PASS';

  const grades = [
    grade('Q1', 'Numerically Qualified', independent.status === 'PASS' && validExternalCount >= 2, [
      independent.status === 'PASS' ? null : 'INDEPENDENT_REFERENCE_QUALIFICATION_REQUIRED',
      validExternalCount >= 2 ? null : 'TWO_INDEPENDENT_EXTERNAL_COMPARISONS_REQUIRED',
    ]),
    grade('Q2', 'Model-Integrated', m9Pass && pilots.status === 'PASS', [
      m9Pass ? null : 'P8_M9_INTEGRATION_EVIDENCE_REQUIRED',
      pilots.status === 'PASS' ? null : 'PILOT_REPRODUCIBILITY_REQUIRED',
    ], 'candidate'),
    grade('Q3', 'Workflow-Complete', m10Pass, [m10Pass ? null : 'P8_M10_WORKFLOW_EVIDENCE_REQUIRED']),
    grade('Q4', 'Scale-Qualified', performance.status === 'PASS', performance.blockers || ['PERFORMANCE_QUALIFICATION_REQUIRED']),
    grade('Q5', 'Commercial-Grade in Scope', false, []),
  ];
  const q1 = grades[0].status === 'PASS';
  const q2 = grades[1].status === 'PASS';
  const q3 = grades[2].status === 'PASS';
  const q4 = grades[3].status === 'PASS';
  const q5Pass = q1 && q2 && q3 && q4
    && pilots.independentlyQualified === true
    && historical.requiredEvidencePresent === true
    && review.completed === true
    && review.criticalCount === 0
    && review.highCount === 0;
  grades[4] = grade('Q5', 'Commercial-Grade in Scope', q5Pass, [
    q1 ? null : 'Q1_REQUIRED',
    q2 ? null : 'Q2_REQUIRED',
    q3 ? null : 'Q3_REQUIRED',
    q4 ? null : 'Q4_REQUIRED',
    pilots.independentlyQualified === true ? null : 'INDEPENDENT_PILOT_QUALIFICATION_REQUIRED',
    historical.requiredEvidencePresent === true ? null : 'HISTORICAL_EVIDENCE_REQUIRED',
    review.completed === true ? null : 'CODE_REVIEW_REQUIRED',
    review.criticalCount === 0 ? null : 'CRITICAL_FINDINGS_OPEN',
    review.highCount === 0 ? null : 'HIGH_FINDINGS_OPEN',
  ]);

  const releaseAllowed = grades[4].status === 'PASS';
  const blockers = [...new Set(grades.flatMap((row) => row.blockers))];
  const implementationComplete = independent.status === 'PASS'
    && pilots.status === 'PASS'
    && review.completed === true
    && historical.requiredEvidencePresent === true;
  const core = {
    version: PHASE8_RELEASE_MANIFEST_VERSION,
    phase: 'Phase 8',
    milestone: 'P8-M11',
    generatedAt: clean(input.generatedAt) || null,
    sourceRevision: clean(input.sourceRevision) || null,
    implementation: {
      status: implementationComplete ? 'complete' : 'incomplete',
      qualificationHarness: independent.status === 'PASS' ? 'ready' : 'blocked',
      pilotPackages: pilots.status === 'PASS' ? 'reproducible' : 'incomplete',
      performanceHarness: performance.version ? 'ready' : 'missing',
    },
    release: {
      status: releaseAllowed ? 'verified' : 'candidate',
      allowed: releaseAllowed,
      designTransferAllowed: releaseAllowed,
      cumulativeGrade: cumulativeGrade(grades),
      statement: releaseAllowed
        ? 'Phase 8 is released only for the manifest scope and evidence hashes listed here.'
        : 'Phase 8 production nonlinear results remain candidate and design-blocked until every listed blocker is closed.',
    },
    grades,
    featureDecisions: featureDecisions(releaseAllowed),
    evidence: {
      independentHash: independent.qualificationHash,
      performanceHash: performance.qualificationHash,
      pilotSummaryHash: pilots.summaryHash,
      historicalHash: historical.evidenceHash,
      reviewHash: review.reviewHash,
      externalComparisonHashes: externalComparisons.filter((row) => row.status === 'PASS').map((row) => row.comparisonHash).sort(),
    },
    qualification: {
      independent,
      performance: compactPerformance(performance),
      pilots,
      historical,
      review,
      externalComparisons,
    },
    blockers,
    reproducibility: {
      command: 'npm run qualify:p8:m11',
      hashPolicy: 'generatedAt is excluded; source revision and all evidence hashes are included',
      fallbackPolicy: 'forbidden',
    },
  };
  return deepFreeze({ ...core, manifestHash: phase8ReleaseManifestHash(core) });
}

export function validatePhase8ReleaseManifest(manifest = {}) {
  const errors = [];
  if (manifest.version !== PHASE8_RELEASE_MANIFEST_VERSION) errors.push('manifest:version');
  if (manifest.phase !== 'Phase 8' || manifest.milestone !== 'P8-M11') errors.push('manifest:scope');
  if (!clean(manifest.generatedAt)) errors.push('manifest:generated-at');
  if (!clean(manifest.sourceRevision)) errors.push('manifest:source-revision');
  if (!Array.isArray(manifest.grades) || manifest.grades.length !== 5) errors.push('manifest:grades');
  if (!Array.isArray(manifest.featureDecisions) || !manifest.featureDecisions.length) errors.push('manifest:features');
  const expectedHash = phase8ReleaseManifestHash({ ...manifest, manifestHash: undefined });
  if (manifest.manifestHash !== expectedHash) errors.push('manifest:integrity-hash');
  const q5 = manifest.grades?.find((row) => row.id === 'Q5');
  if (manifest.release?.allowed === true && q5?.status !== 'PASS') errors.push('manifest:release-without-q5');
  if (manifest.release?.allowed === true && manifest.implementation?.status !== 'complete') errors.push('manifest:release-without-complete-implementation');
  if (manifest.release?.designTransferAllowed === true && manifest.release?.allowed !== true) errors.push('manifest:design-transfer-without-release');
  for (const decision of manifest.featureDecisions || []) {
    if (decision.qualification === 'verified' && manifest.release?.allowed !== true) errors.push(`manifest:unreleased-verified:${decision.id}`);
    if (decision.designBlocked === false && decision.qualification !== 'verified') errors.push(`manifest:unblocked-candidate:${decision.id}`);
  }
  if (manifest.release?.allowed !== true && !Array.isArray(manifest.blockers)) errors.push('manifest:blockers');
  return { ok: errors.length === 0, errors };
}

export function buildPhase8M11EvidenceArtifact(input = {}) {
  const performance = normalizePerformanceQualification(input.performance);
  const pilots = input.pilotSummary || summarizePhase8PilotArtifacts(input.pilotArtifacts || []);
  const performanceRows = PERF_IDS.map((id) => {
    const source = performance.results.find((row) => row.id === id);
    return evidenceRow(id, source?.status || 'BLOCKED', source?.statement || 'Performance evidence is missing.', source?.blockerCode || null);
  });
  const pilotRows = PILOT_IDS.map((id) => {
    const source = pilots.results.find((row) => row.id === id);
    const qualified = source?.status === 'PASS' && source?.qualification === 'verified';
    const status = qualified ? 'PASS' : source?.status === 'FAIL' ? 'FAIL' : 'BLOCKED';
    const blockerCode = source?.errors?.length
      ? source.errors.join(',')
      : qualified ? null : 'INDEPENDENT_PILOT_QUALIFICATION_REQUIRED';
    return evidenceRow(
      id,
      status,
      `Pilot package ${source?.pilotId || id} reproducibility and independent qualification.`,
      blockerCode,
    );
  });
  const results = [...performanceRows, ...pilotRows];
  const core = {
    version: PHASE8_M11_EVIDENCE_VERSION,
    suiteId: 'P8-M11-QUALIFICATION-RELEASE',
    milestone: 'P8-M11',
    status: results.every((row) => row.status === 'PASS') ? 'PASS' : 'BLOCKED',
    generatedAt: clean(input.generatedAt) || null,
    sourceRevision: clean(input.sourceRevision) || null,
    verificationIds: REQUIRED_M11_IDS,
    results,
    environment: clone(input.environment || null),
    evidence: {
      independentHash: clean(input.independentHash) || null,
      performanceHash: performance.qualificationHash || null,
      pilotSummaryHash: pilots.summaryHash || null,
      releaseManifestHash: clean(input.releaseManifestHash) || null,
    },
    qualificationImpact: results.every((row) => row.status === 'PASS')
      ? 'eligible-for-release-manifest-review'
      : 'candidate-design-transfer-blocked',
  };
  return deepFreeze({ ...core, artifactHash: phase8M11EvidenceHash(core) });
}

export function validatePhase8M11EvidenceArtifact(artifact = {}) {
  const errors = [];
  if (artifact.version !== PHASE8_M11_EVIDENCE_VERSION) errors.push('artifact:version');
  if (artifact.suiteId !== 'P8-M11-QUALIFICATION-RELEASE') errors.push('artifact:suite');
  if (artifact.milestone !== 'P8-M11') errors.push('artifact:milestone');
  if (!['PASS', 'BLOCKED'].includes(artifact.status)) errors.push('artifact:status');
  if (!clean(artifact.generatedAt)) errors.push('artifact:generated-at');
  if (!clean(artifact.sourceRevision)) errors.push('artifact:source-revision');
  const ids = new Set(artifact.verificationIds || []);
  REQUIRED_M11_IDS.forEach((id) => { if (!ids.has(id)) errors.push(`artifact:missing:${id}`); });
  const results = Array.isArray(artifact.results) ? artifact.results : [];
  REQUIRED_M11_IDS.forEach((id) => {
    const row = results.find((item) => item?.id === id);
    if (!row || !['PASS', 'BLOCKED', 'FAIL'].includes(row.status)) errors.push(`artifact:result:${id}`);
  });
  const hasNonPass = results.some((row) => row.status !== 'PASS');
  if ((artifact.status === 'PASS') === hasNonPass) errors.push('artifact:aggregate-status');
  const expectedHash = phase8M11EvidenceHash({ ...artifact, artifactHash: undefined });
  if (artifact.artifactHash !== expectedHash) errors.push('artifact:integrity-hash');
  return { ok: errors.length === 0, errors };
}

export function validatePhase8ExternalComparison(input = {}) {
  const row = normalizeExternalComparison(input);
  const errors = [];
  if (row.status !== 'PASS') errors.push('comparison:incomplete');
  if (!['commercial-solver', 'independent-open-source-solver', 'published-numerical-table'].includes(row.sourceKind)) errors.push('comparison:source-kind');
  if (!clean(row.solver) || !clean(row.solverVersion)) errors.push('comparison:solver');
  if (!clean(row.sourceHash)) errors.push('comparison:source-hash');
  if (!row.conventionAudit?.ok) errors.push('comparison:convention');
  if (!row.channels.length) errors.push('comparison:channels');
  if (!row.tolerance || !Number.isFinite(Number(row.tolerance.relative))) errors.push('comparison:tolerance');
  if (!row.comparisonAudit?.ok) errors.push('comparison:numerical-results');
  return { ok: errors.length === 0, errors, comparison: row };
}

export function phase8ReleaseManifestHash(manifest = {}) {
  const copy = clone(manifest);
  delete copy.manifestHash;
  delete copy.generatedAt;
  return stableHash(copy).slice(0, 24);
}

function phase8M11EvidenceHash(artifact = {}) {
  const copy = clone(artifact);
  delete copy.artifactHash;
  return stableHash(copy).slice(0, 24);
}

function normalizeIndependentQualification(input = {}) {
  return deepFreeze({
    version: input?.version || null,
    status: input?.status === 'PASS' ? 'PASS' : 'BLOCKED',
    qualificationLevel: input?.qualificationLevel || null,
    externalCommercialComparison: input?.externalCommercialComparison === true,
    qualificationHash: clean(input?.qualificationHash) || null,
    resultCount: Array.isArray(input?.results) ? input.results.length : 0,
  });
}

function normalizePerformanceQualification(input = {}) {
  return deepFreeze({
    version: input?.version || null,
    status: input?.status === 'PASS' ? 'PASS' : 'BLOCKED',
    qualificationHash: clean(input?.qualificationHash) || null,
    blockers: [...new Set(Array.isArray(input?.blockers) ? input.blockers.map(String) : ['PERFORMANCE_QUALIFICATION_REQUIRED'])],
    results: Array.isArray(input?.results) ? clone(input.results) : [],
  });
}

function normalizeHistoricalEvidence(artifacts) {
  const byMilestone = {};
  const rows = (artifacts || []).map((artifact) => {
    const milestone = clean(artifact?.milestone) || null;
    const status = artifact?.status === 'PASS' ? 'PASS' : 'FAIL';
    if (milestone) byMilestone[milestone] = status;
    return {
      milestone,
      suiteId: clean(artifact?.suiteId) || null,
      status,
      sourceRevision: clean(artifact?.sourceRevision) || null,
      evidenceHash: stableHash(artifact).slice(0, 24),
    };
  });
  const requiredMilestones = Array.from({ length: 11 }, (_, index) => `P8-M${index}`);
  const requiredEvidencePresent = requiredMilestones.every((milestone) => byMilestone[milestone] === 'PASS');
  const core = { rows, byMilestone, requiredMilestones, requiredEvidencePresent };
  return deepFreeze({ ...core, evidenceHash: stableHash(core).slice(0, 24) });
}

function normalizeReview(input = {}) {
  const reportPath = clean(input.reportPath) || null;
  const findings = Array.isArray(input.findings) ? input.findings.map((row) => ({
    severity: String(row?.severity || '').toLowerCase(),
    status: String(row?.status || 'open').toLowerCase(),
    id: clean(row?.id) || null,
  })) : [];
  const open = findings.filter((row) => row.status !== 'closed');
  const core = {
    completed: input.completed === true && Boolean(reportPath),
    criticalCount: open.filter((row) => row.severity === 'critical').length,
    highCount: open.filter((row) => row.severity === 'high').length,
    findings,
    reportPath,
  };
  return deepFreeze({ ...core, reviewHash: stableHash(core).slice(0, 24) });
}

function normalizeExternalComparison(input = {}) {
  const channels = Array.isArray(input.channels) ? input.channels.map(String).sort() : [];
  const comparisonAudit = normalizePhase8NumericalComparisons(input, channels);
  const core = {
    version: PHASE8_EXTERNAL_COMPARISON_VERSION,
    id: clean(input.id) || null,
    status: input.status === 'PASS' ? 'PASS' : 'MISSING',
    sourceKind: clean(input.sourceKind) || null,
    solver: clean(input.solver) || null,
    solverVersion: clean(input.solverVersion) || null,
    sourceHash: clean(input.sourceHash) || null,
    modelHash: clean(input.modelHash) || null,
    channels,
    tolerance: clone(input.tolerance || null),
    comparisons: clone(comparisonAudit.rows),
    comparisonAudit: {
      ok: comparisonAudit.ok,
      unexpectedChannels: comparisonAudit.unexpectedChannels,
      duplicateChannels: comparisonAudit.duplicateChannels,
      comparisonAuditHash: comparisonAudit.comparisonAuditHash,
    },
    conventionAudit: clone(input.conventionAudit || null),
    licenseRecord: clone(input.licenseRecord || null),
  };
  const structurallyComplete = core.status === 'PASS'
    && core.id
    && ['commercial-solver', 'independent-open-source-solver', 'published-numerical-table'].includes(core.sourceKind)
    && core.solver
    && core.solverVersion
    && core.sourceHash
    && core.modelHash
    && core.channels.length
    && core.conventionAudit?.ok === true
    && core.comparisonAudit.ok === true;
  const normalized = { ...core, status: structurallyComplete ? 'PASS' : 'MISSING' };
  return deepFreeze({ ...normalized, comparisonHash: stableHash(normalized).slice(0, 24) });
}

function grade(id, name, pass, blockers, otherwise = 'blocked') {
  return deepFreeze({
    id,
    name,
    status: pass ? 'PASS' : otherwise.toUpperCase(),
    blockers: [...new Set((blockers || []).filter(Boolean))],
  });
}

function cumulativeGrade(grades) {
  let gradeId = 'Q0';
  for (const row of grades) {
    if (row.status !== 'PASS') break;
    gradeId = row.id;
  }
  return gradeId;
}

function featureDecisions(releaseAllowed) {
  const productionPushover = getNonlinearCapability(NONLINEAR_ENGINE_IDS.productionPushover);
  const productionNlth = getNonlinearCapability(NONLINEAR_ENGINE_IDS.productionNlth);
  return deepFreeze([
    feature('production-pushover', productionPushover, releaseAllowed),
    feature('production-nlth', productionNlth, releaseAllowed),
    {
      id: 'unilateral-member-active-set',
      qualification: 'unsupported',
      designBlocked: true,
      reason: 'NONLINEAR_UNILATERAL_ACTIVE_SET_UNSUPPORTED',
    },
    {
      id: 'legacy-preliminary-nonlinear-results',
      qualification: 'legacy-preliminary',
      designBlocked: true,
      reason: 'LEGACY_RESULT_DESIGN_TRANSFER_FORBIDDEN',
    },
  ]);
}

function feature(id, capability, releaseAllowed) {
  return {
    id,
    engineId: capability?.engineId || null,
    qualification: releaseAllowed ? 'verified' : 'candidate',
    qualificationCeiling: releaseAllowed ? 'verified' : capability?.qualificationCeiling || 'candidate',
    designBlocked: !releaseAllowed,
    reason: releaseAllowed ? null : 'P8_M11_RELEASE_GATE_NOT_SATISFIED',
  };
}

function compactPerformance(performance) {
  return {
    version: performance.version,
    status: performance.status,
    qualificationHash: performance.qualificationHash,
    blockers: performance.blockers,
    results: performance.results.map((row) => ({ id: row.id, status: row.status, blockerCode: row.blockerCode || null })),
  };
}

function evidenceRow(id, status, statement, blockerCode) {
  return deepFreeze({
    id,
    status: status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : 'BLOCKED',
    test: 'npm run qualify:p8:m11',
    statement,
    blockerCode: status === 'PASS' ? null : blockerCode || `${id.replaceAll('-', '_')}_BLOCKED`,
  });
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
