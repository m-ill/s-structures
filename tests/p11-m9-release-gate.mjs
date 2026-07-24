import assert from 'node:assert/strict';
import {
  P11_M9_VERIFICATION_IDS,
  PHASE11_REPORT_RELEASE_QUALIFICATION,
  buildPhase11ReleaseManifest,
  validatePhase11ReleaseManifest,
} from '../src/report/phase11/releaseGate.js';
import { createReportExportWorkflow } from '../src/ui/indexReportExportWorkflow.js';

const runs = Array.from({ length: 3 }, (_row, index) => fixtureRun(index + 1));
const release = buildPhase11ReleaseManifest({
  projectId: 'PILOT-OFFICE-01',
  sourceRevision: 'p11-m9-test',
  generatedAt: '2026-07-23T00:00:00.000Z',
  qualificationProfile: 'windows-chromium-poppler-pypdf-v1',
  reportVerdict: 'CONDITIONAL_PASS',
  m8QualificationHash: 'a'.repeat(64),
  runs,
  selectedRunId: 'P11-M9-R03',
  uiAgentArtifactParity: true,
  coverage: {
    requiredSections: 12,
    coveredSections: 12,
    requiredFigures: 7,
    coveredFigures: 7,
    verdict: true,
    limitations: true,
  },
  openCriticalHigh: 0,
  ownerlessDebt: 0,
  fullRegression: true,
  packageInstallSmoke: true,
  limitations: ['Independent engineering reference is unavailable.'],
});
assert.deepEqual(validatePhase11ReleaseManifest(release), { ok: true, errors: [] });
assert.equal(release.releaseQualified, true);
assert.equal(release.reportVerdict, 'CONDITIONAL_PASS');
assert.equal(release.independentReferenceAvailable, false);
assert.equal(release.parity.snapshot, true);
assert.equal(release.parity.numeric, true);
assert.equal(release.parity.sceneSelection, true);
assert.equal(release.selectedArtifacts.length, 2);
assert.equal(P11_M9_VERIFICATION_IDS.length, 25);
assert.equal(PHASE11_REPORT_RELEASE_QUALIFICATION.engineeringVerdictCeiling, 'CONDITIONAL_PASS');

const numericDrift = structuredClone(runs);
numericDrift[2].numericHash = 'f'.repeat(64);
const blocked = buildPhase11ReleaseManifest({
  ...releaseInput(numericDrift),
  selectedRunId: 'P11-M9-R03',
});
assert.equal(blocked.releaseQualified, false);
assert.ok(blocked.blockers.includes('P11_RELEASE_PARITY_FAILED'));

const invalidHash = structuredClone(release);
invalidHash.manifestHash = '0'.repeat(64);
assert.equal(validatePhase11ReleaseManifest(invalidHash).ok, false);

const transport = {
  async plan(input) {
    return {
      jobId: 'M9-WORKFLOW', status: 'planned', stage: 'planned', progress: 0,
      planHash: 'b'.repeat(64), reportSnapshotHash: input.snapshot.reportSnapshotHash,
    };
  },
  async run() {
    return {
      jobId: 'M9-WORKFLOW', status: 'completed', stage: 'completed', progress: 1,
      planHash: 'b'.repeat(64), reportSnapshotHash: '1'.repeat(64),
      artifacts: Object.fromEntries(runs[2].artifacts.map((row) => [row.locale, row])),
      manifestPath: runs[2].manifestPath,
    };
  },
  async status() { throw new Error('not required'); },
  async cancel() { throw new Error('not required'); },
};
const workflow = createReportExportWorkflow({ transport });
const input = {
  projectId: 'PILOT-OFFICE-01',
  snapshot: { reportSnapshotHash: '1'.repeat(64), verdict: { overall: 'CONDITIONAL_PASS' } },
  figureManifest: {
    status: 'complete', reportSnapshotHash: '1'.repeat(64), figureCount: 7,
    figureManifestHash: '2'.repeat(64),
  },
  qualification: PHASE11_REPORT_RELEASE_QUALIFICATION,
};
assert.equal(workflow.preflight(input).ready, true);
const planned = await workflow.plan(input);
const completed = await workflow.run(planned.jobId);
assert.equal(completed.status, 'completed');
assert.equal(workflow.artifacts(completed).locales['ko-KR'].sha256, runs[2].artifacts[0].sha256);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P11-M9',
  releaseQualified: release.releaseQualified,
  reportVerdict: release.reportVerdict,
  runs: release.runs.length,
  numericSceneSnapshotParity: true,
  artifactIntegrity: release.artifactIntegrity,
  coverageComplete: release.coverageComplete,
  verificationIds: P11_M9_VERIFICATION_IDS.length,
  manifestHash: release.manifestHash,
}, null, 2));

function fixtureRun(index) {
  return {
    runId: `P11-M9-R${String(index).padStart(2, '0')}`,
    modelDomainHash: '1'.repeat(24),
    reportSnapshotHash: '2'.repeat(64),
    numericHash: '3'.repeat(64),
    sceneSelectionHash: '4'.repeat(64),
    figureManifestHash: '5'.repeat(64),
    planHash: '6'.repeat(64),
    artifactManifestHash: `${index}`.repeat(64),
    manifestPath: `output/P11-M9-R0${index}/artifact-manifest.json`,
    manifestValid: true,
    pairComplete: true,
    pageParity: true,
    artifacts: [
      { locale: 'ko-KR', path: `run-${index}/ko.pdf`, bytes: 100, pages: 14, sha256: 'a'.repeat(64), hashVerified: true },
      { locale: 'en-US', path: `run-${index}/en.pdf`, bytes: 90, pages: 14, sha256: 'b'.repeat(64), hashVerified: true },
    ],
  };
}

function releaseInput(inputRuns) {
  return {
    projectId: 'PILOT-OFFICE-01',
    sourceRevision: 'test',
    generatedAt: '2026-07-23T00:00:00.000Z',
    qualificationProfile: 'windows-chromium-poppler-pypdf-v1',
    reportVerdict: 'CONDITIONAL_PASS',
    m8QualificationHash: 'a'.repeat(64),
    runs: inputRuns,
    uiAgentArtifactParity: true,
    coverage: {
      requiredSections: 12, coveredSections: 12, requiredFigures: 7, coveredFigures: 7,
      verdict: true, limitations: true,
    },
    openCriticalHigh: 0,
    ownerlessDebt: 0,
    fullRegression: true,
    packageInstallSmoke: true,
  };
}
