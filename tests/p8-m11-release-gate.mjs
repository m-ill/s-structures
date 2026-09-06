import assert from 'node:assert/strict';
import {
  buildPhase8M11EvidenceArtifact,
  buildPhase8PilotArtifact,
  buildPhase8ReleaseManifest,
  listPhase8PilotPackages,
  normalizePhase8NumericalComparisons,
  runPhase8IndependentReferenceQualification,
  summarizePhase8PilotArtifacts,
  validatePhase8ExternalComparison,
  validatePhase8M11EvidenceArtifact,
  validatePhase8ReleaseManifest,
} from '../src/index.js';

const independent = runPhase8IndependentReferenceQualification();
const pilots = listPhase8PilotPackages();
const candidateArtifacts = pilots.map((pilot) => pilotArtifact(pilot, false));
const candidateSummary = summarizePhase8PilotArtifacts(candidateArtifacts);
const performanceBlocked = performanceQualification('BLOCKED');
const historical = historicalEvidence();
const review = { completed: true, reportPath: 'verification/evidence/validation/phase8/p8-m11-code-review.md', findings: [] };

const candidate = buildPhase8ReleaseManifest({
  generatedAt: '2026-07-14T22:30:00+09:00',
  sourceRevision: 'p8-m11-test',
  independent,
  performance: performanceBlocked,
  pilotArtifacts: candidateArtifacts,
  historicalEvidence: historical,
  review,
});
assert.equal(validatePhase8ReleaseManifest(candidate).ok, true, validatePhase8ReleaseManifest(candidate).errors.join(', '));
assert.equal(candidate.implementation.status, 'complete');
assert.equal(candidate.release.status, 'candidate');
assert.equal(candidate.release.allowed, false);
assert.equal(candidate.release.designTransferAllowed, false);
assert.equal(candidate.release.cumulativeGrade, 'Q0');
assert.ok(candidate.blockers.includes('TWO_INDEPENDENT_EXTERNAL_COMPARISONS_REQUIRED'));
assert.ok(candidate.blockers.includes('M_TIER_PUSHOVER_END_TO_END_REQUIRED'));
assert.ok(candidate.featureDecisions.filter((row) => row.id.startsWith('production-')).every((row) => row.qualification === 'candidate' && row.designBlocked));

const evidence = buildPhase8M11EvidenceArtifact({
  generatedAt: '2026-07-14T22:30:00+09:00',
  sourceRevision: 'p8-m11-test',
  independentHash: independent.qualificationHash,
  performance: performanceBlocked,
  pilotSummary: candidateSummary,
  releaseManifestHash: candidate.manifestHash,
  environment: { profileVersion: 'p8-m11-test-profile' },
});
assert.equal(validatePhase8M11EvidenceArtifact(evidence).ok, true, validatePhase8M11EvidenceArtifact(evidence).errors.join(', '));
assert.equal(evidence.status, 'BLOCKED');
assert.equal(evidence.verificationIds.length, 21);
assert.ok(evidence.results.filter((row) => row.id.startsWith('NL-PILOT-')).every((row) => row.status === 'BLOCKED'));

const verifiedArtifacts = pilots.map((pilot) => pilotArtifact(pilot, true));
const comparisons = [externalComparison('EXT-1', 'Solver A'), externalComparison('EXT-2', 'Solver B')];
for (const comparison of comparisons) assert.equal(validatePhase8ExternalComparison(comparison).ok, true);
const failedNumericalComparison = externalComparison('EXT-FAIL', 'Solver C');
failedNumericalComparison.comparisons[0].actual = [10, 20];
assert.equal(validatePhase8ExternalComparison(failedNumericalComparison).ok, false);
assert.equal(normalizePhase8NumericalComparisons(
  failedNumericalComparison,
  failedNumericalComparison.channels,
).ok, false);
const verified = buildPhase8ReleaseManifest({
  generatedAt: '2026-07-14T22:30:00+09:00',
  sourceRevision: 'p8-m11-test',
  independent,
  performance: performanceQualification('PASS'),
  pilotArtifacts: verifiedArtifacts,
  historicalEvidence: historical,
  review,
  externalComparisons: comparisons,
});
assert.equal(validatePhase8ReleaseManifest(verified).ok, true, validatePhase8ReleaseManifest(verified).errors.join(', '));
assert.equal(verified.release.allowed, true);
assert.equal(verified.release.designTransferAllowed, true);
assert.equal(verified.release.cumulativeGrade, 'Q5');
assert.ok(verified.grades.every((row) => row.status === 'PASS'));
assert.ok(verified.featureDecisions.filter((row) => row.id.startsWith('production-')).every((row) => row.qualification === 'verified' && !row.designBlocked));

const noReview = buildPhase8ReleaseManifest({
  generatedAt: '2026-07-14T22:30:00+09:00', sourceRevision: 'p8-m11-test', independent,
  performance: performanceQualification('PASS'), pilotArtifacts: verifiedArtifacts,
  historicalEvidence: historical, externalComparisons: comparisons,
});
assert.equal(noReview.release.allowed, false);
assert.ok(noReview.blockers.includes('CODE_REVIEW_REQUIRED'));

const duplicateExternal = buildPhase8ReleaseManifest({
  generatedAt: '2026-07-14T22:30:00+09:00', sourceRevision: 'p8-m11-test', independent,
  performance: performanceQualification('PASS'), pilotArtifacts: verifiedArtifacts,
  historicalEvidence: historical, review, externalComparisons: [comparisons[0], comparisons[0]],
});
assert.equal(duplicateExternal.release.allowed, false);
assert.ok(duplicateExternal.blockers.includes('TWO_INDEPENDENT_EXTERNAL_COMPARISONS_REQUIRED'));

const incompleteHistory = buildPhase8ReleaseManifest({
  generatedAt: '2026-07-14T22:30:00+09:00', sourceRevision: 'p8-m11-test', independent,
  performance: performanceQualification('PASS'), pilotArtifacts: verifiedArtifacts,
  historicalEvidence: historical.slice(1), review, externalComparisons: comparisons,
});
assert.equal(incompleteHistory.release.allowed, false);
assert.ok(incompleteHistory.blockers.includes('HISTORICAL_EVIDENCE_REQUIRED'));

const forged = structuredClone(candidate);
forged.release.allowed = true;
assert.equal(validatePhase8ReleaseManifest(forged).ok, false);

console.log(JSON.stringify({
  ok: true,
  candidateManifestHash: candidate.manifestHash,
  candidateBlockers: candidate.blockers,
  evidenceStatus: evidence.status,
  verifiedManifestHash: verified.manifestHash,
  verifiedGrade: verified.release.cumulativeGrade,
}, null, 2));

function performanceQualification(status) {
  const pass = status === 'PASS';
  const blocked = new Map([
    ['NL-PERF-02', 'M_TIER_PUSHOVER_END_TO_END_REQUIRED'],
    ['NL-PERF-07', 'BROWSER_UI_LATENCY_EVIDENCE_REQUIRED'],
    ['NL-PERF-12', 'M_TIER_PUSHOVER_END_TO_END_REQUIRED'],
    ['NL-PERF-13', 'M_TIER_NLTH_END_TO_END_REQUIRED'],
    ['NL-PERF-16', 'PARALLEL_WORKER_EVIDENCE_REQUIRED'],
  ]);
  const results = Array.from({ length: 16 }, (_, index) => {
    const id = `NL-PERF-${String(index + 1).padStart(2, '0')}`;
    return {
      id,
      status: pass || !blocked.has(id) ? 'PASS' : 'BLOCKED',
      statement: id,
      blockerCode: pass ? null : blocked.get(id) || null,
    };
  });
  return {
    version: 'p8-m11-performance-qualification-v1',
    status,
    qualificationHash: `perf-${status.toLowerCase()}`,
    blockers: pass ? [] : [...new Set(blocked.values())],
    results,
  };
}

function historicalEvidence() {
  return Array.from({ length: 11 }, (_, index) => ({
    version: 'p8-evidence-artifact-v1',
    suiteId: `P8-M${index}-TEST`,
    milestone: `P8-M${index}`,
    status: 'PASS',
    sourceRevision: 'p8-m11-test',
  }));
}

function pilotArtifact(pilot, verified) {
  const blocked = pilot.expected.executionStatus === 'blocked';
  const resultChannels = Object.fromEntries(pilot.requiredResultFields.map((field) => [field, true]));
  return buildPhase8PilotArtifact(pilot, {
    generatedAt: '2026-07-14T22:00:00+09:00',
    sourceRevision: 'p8-m11-test',
    execution: blocked ? {
      status: 'blocked', reason: pilot.expected.reason, designBlocked: true, fallbackUsed: false, resultChannels,
    } : {
      status: 'completed',
      terminationReason: pilot.expected.acceptedTermination[0],
      resultHash: `result-${pilot.id}`,
      runRecordId: `run-${pilot.id}`,
      checkpointHash: `checkpoint-${pilot.id}`,
      fallbackUsed: false,
      designBlocked: true,
      resultChannels,
    },
    report: { path: `pilots/${pilot.id}.md`, reportHash: `report-${pilot.id}` },
    ...(verified ? {
      externalComparison: {
        status: 'PASS', solver: 'Independent solver', solverVersion: '1.0', sourceHash: `source-${pilot.id}`,
        channels: ['response'], conventionAudit: { ok: true }, tolerance: { relative: 0.01 },
        comparisons: [{ channel: 'response', actual: [1, 2], reference: [1, 2] }],
      },
      ownerReview: { status: 'APPROVED', reviewerId: 'reviewer', reviewedAt: '2026-07-14T22:00:00+09:00' },
    } : {}),
  });
}

function externalComparison(id, solver) {
  const channels = ['displacement', 'baseShear'];
  return {
    id,
    status: 'PASS',
    sourceKind: 'independent-open-source-solver',
    solver,
    solverVersion: '1.0.0',
    sourceHash: `source-${id}`,
    modelHash: `model-${id}`,
    channels,
    tolerance: { relative: 0.01, absolute: 1e-6 },
    comparisons: channels.map((channel) => ({ channel, actual: [1, 2], reference: [1, 2] })),
    conventionAudit: { ok: true, hash: `convention-${id}` },
    licenseRecord: { name: 'permissive-test-fixture' },
  };
}
