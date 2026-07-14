import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import {
  getPhase8PilotPackage,
  phase8ReleaseManifestHash,
  validatePhase8M11EvidenceArtifact,
  validatePhase8PerformanceMeasurement,
  validatePhase8PilotArtifact,
  validatePhase8ReleaseManifest,
} from '../src/index.js';

const evidenceRoot = new URL('../reports/validation-evidence/phase8/', import.meta.url);
const verificationRoot = new URL('../docs/verification/phase8/', import.meta.url);
const independent = await json(new URL('p8-m11-independent-reference.json', evidenceRoot));
const performance = await json(new URL('performance/p8-m11-reference-measurement.json', evidenceRoot));
const pilotSummary = await json(new URL('pilots/p8-m11-pilot-summary.json', evidenceRoot));
const releaseManifest = await json(new URL('release-manifest.json', verificationRoot));
const evidence = await json(new URL('p8-m11-qualification-release.json', evidenceRoot));
const review = await json(new URL('p8-m11-code-review.json', evidenceRoot));

assert.equal(independent.status, 'PASS');
assert.equal(independent.externalCommercialComparison, false);
assert.equal(independent.results.length, 5);

assert.equal(validatePhase8PerformanceMeasurement(performance.measurement).ok, true);
assert.equal(performance.status, 'BLOCKED');
assert.equal(performance.measurement.config.mediumDof, 10000);
assert.equal(performance.measurement.config.targetDof, 50000);
assert.equal(performance.measurement.config.targetNnz, 75000 * 144);
assert.equal(performance.measurement.mediumKernel.solveCount, 500);
assert.equal(performance.measurement.streaming.outputStepCount, 20000);
assert.equal(performance.measurement.parallel.status, 'PASS');
assert.equal(performance.measurement.parallel.metrics.deterministic, true);
assert.equal(performance.measurement.parallel.metrics.eventOrderingEquivalent, true);
assert.equal(performance.results.find((row) => row.id === 'NL-PERF-16').status, 'PASS');
assert.deepEqual(
  performance.results.filter((row) => row.status !== 'PASS').map((row) => row.id),
  ['NL-PERF-02', 'NL-PERF-07', 'NL-PERF-12', 'NL-PERF-13'],
);

assert.equal(pilotSummary.status, 'PASS');
assert.equal(pilotSummary.pilotCount, 5);
assert.equal(pilotSummary.verifiedPilotCount, 0);
assert.equal(pilotSummary.independentlyQualified, false);
for (const row of pilotSummary.results) {
  const pilot = getPhase8PilotPackage(row.pilotId);
  const artifact = await json(new URL(`pilots/${row.pilotId}.artifact.json`, evidenceRoot));
  const run = await json(new URL(`pilots/${row.pilotId}.run.json`, evidenceRoot));
  assert.equal(validatePhase8PilotArtifact(artifact, pilot).ok, true, row.pilotId);
  assert.equal(artifact.reproducibility.status, 'PASS');
  assert.equal(artifact.qualification.status, 'candidate');
  assert.equal(artifact.qualification.designBlocked, true);
  assert.ok(pilot.requiredResultFields.every((field) => artifact.execution.resultChannels[field] === true));
  assert.equal(run.packageHash, pilot.packageHash);
}

const unsupported = await json(new URL('pilots/PILOT-ST-03.artifact.json', evidenceRoot));
assert.equal(unsupported.execution.status, 'blocked');
assert.equal(unsupported.execution.terminationReason, 'NONLINEAR_UNILATERAL_ACTIVE_SET_UNSUPPORTED');

assert.equal(validatePhase8ReleaseManifest(releaseManifest).ok, true);
assert.equal(releaseManifest.implementation.status, 'complete');
assert.equal(releaseManifest.release.status, 'candidate');
assert.equal(releaseManifest.release.allowed, false);
assert.equal(releaseManifest.release.designTransferAllowed, false);
assert.equal(releaseManifest.release.cumulativeGrade, 'Q0');
assert.ok(releaseManifest.blockers.includes('TWO_INDEPENDENT_EXTERNAL_COMPARISONS_REQUIRED'));
assert.ok(releaseManifest.blockers.includes('M_TIER_PUSHOVER_END_TO_END_REQUIRED'));
assert.equal(
  phase8ReleaseManifestHash({ ...releaseManifest, generatedAt: '2099-01-01T00:00:00.000Z' }),
  releaseManifest.manifestHash,
);

assert.equal(validatePhase8M11EvidenceArtifact(evidence).ok, true);
assert.equal(evidence.status, 'BLOCKED');
assert.equal(evidence.verificationIds.length, 21);
assert.ok(evidence.results.filter((row) => row.id.startsWith('NL-PILOT-')).every((row) => row.status === 'BLOCKED'));
assert.equal(review.completed, true);
assert.equal(review.findings.filter((row) => row.status !== 'closed' && ['critical', 'high'].includes(row.severity)).length, 0);

for (const relative of [
  'QUALIFICATION_RELEASE.md',
  'performance/REFERENCE_PROFILE.md',
  'pilots/PILOT-ST-01.md',
  'pilots/PILOT-ST-02.md',
  'pilots/PILOT-ST-03.md',
  'pilots/PILOT-RC-01.md',
  'pilots/PILOT-DYN-01.md',
]) await access(new URL(relative, verificationRoot));

console.log(JSON.stringify({
  ok: true,
  implementationStatus: releaseManifest.implementation.status,
  releaseStatus: releaseManifest.release.status,
  manifestHash: releaseManifest.manifestHash,
  performanceBlockers: performance.blockers,
  pilotSummaryHash: pilotSummary.summaryHash,
}, null, 2));

async function json(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}
