import { stableHash } from '../../core/stableHash.js';

export const P11_RELEASE_GATE_VERSION = 'p11-report-release-gate-v1';
export const P11_RELEASE_MANIFEST_VERSION = 'p11-report-release-manifest-v1';
export const P11_M9_VERIFICATION_IDS = Object.freeze([
  ...series('P11-E2E', 1, 12),
  ...series('P11-REL', 2, 14),
]);
export const PHASE11_REPORT_RELEASE_QUALIFICATION = Object.freeze({
  version: P11_RELEASE_GATE_VERSION,
  status: 'PASS',
  releaseQualified: true,
  profile: 'windows-chromium-poppler-pypdf-v1',
  engineeringVerdictCeiling: 'CONDITIONAL_PASS',
});

export function buildPhase11ReleaseManifest(input = {}) {
  const runs = [...(input.runs || [])].map(normalizeRun);
  const parity = Object.freeze({
    runCount: runs.length,
    model: unique(runs, 'modelDomainHash') === 1,
    snapshot: unique(runs, 'reportSnapshotHash') === 1,
    numeric: unique(runs, 'numericHash') === 1,
    sceneSelection: unique(runs, 'sceneSelectionHash') === 1,
    figureManifest: unique(runs, 'figureManifestHash') === 1,
    plan: unique(runs, 'planHash') === 1,
    uiAgentArtifact: input.uiAgentArtifactParity === true,
  });
  const artifactIntegrity = runs.every((run) => run.manifestValid
    && run.pairComplete
    && run.pageParity
    && run.artifacts.every((row) => /^[a-f0-9]{64}$/u.test(row.sha256) && row.hashVerified));
  const coverage = Object.freeze({
    requiredSections: Number(input.coverage?.requiredSections || 0),
    coveredSections: Number(input.coverage?.coveredSections || 0),
    requiredFigures: Number(input.coverage?.requiredFigures || 0),
    coveredFigures: Number(input.coverage?.coveredFigures || 0),
    verdict: input.coverage?.verdict === true,
    limitations: input.coverage?.limitations === true,
  });
  const coverageComplete = coverage.requiredSections > 0
    && coverage.coveredSections === coverage.requiredSections
    && coverage.requiredFigures === 7
    && coverage.coveredFigures === 7
    && coverage.verdict
    && coverage.limitations;
  const blockers = [];
  if (runs.length !== 3) blockers.push('P11_RELEASE_THREE_RUNS_REQUIRED');
  if (!Object.values(parity).every(Boolean)) blockers.push('P11_RELEASE_PARITY_FAILED');
  if (!artifactIntegrity) blockers.push('P11_RELEASE_ARTIFACT_INTEGRITY_FAILED');
  if (!coverageComplete) blockers.push('P11_RELEASE_COVERAGE_FAILED');
  if (Number(input.openCriticalHigh ?? -1) !== 0) blockers.push('P11_RELEASE_CRITICAL_HIGH_OPEN');
  if (Number(input.ownerlessDebt ?? -1) !== 0) blockers.push('P11_RELEASE_OWNERLESS_DEBT');
  if (input.fullRegression !== true) blockers.push('P11_RELEASE_FULL_REGRESSION_REQUIRED');
  if (input.packageInstallSmoke !== true) blockers.push('P11_RELEASE_PACKAGE_SMOKE_REQUIRED');
  if (input.m8QualificationHash == null) blockers.push('P11_RELEASE_M8_QUALIFICATION_REQUIRED');
  const releaseQualified = blockers.length === 0;
  const selectedRun = releaseQualified ? runs.find((row) => row.runId === input.selectedRunId) : null;
  if (releaseQualified && !selectedRun) blockers.push('P11_RELEASE_SELECTED_RUN_INVALID');
  const finalQualified = blockers.length === 0;
  const core = {
    version: P11_RELEASE_MANIFEST_VERSION,
    status: finalQualified ? 'release-qualified' : 'blocked',
    releaseQualified: finalQualified,
    projectId: String(input.projectId || ''),
    sourceRevision: input.sourceRevision || null,
    generatedAt: input.generatedAt || null,
    qualificationProfile: input.qualificationProfile || null,
    reportVerdict: input.reportVerdict || null,
    engineeringVerdictCeiling: 'CONDITIONAL_PASS',
    independentReferenceAvailable: false,
    m8QualificationHash: input.m8QualificationHash || null,
    parity,
    artifactIntegrity,
    coverage,
    coverageComplete,
    openCriticalHigh: Number(input.openCriticalHigh ?? -1),
    ownerlessDebt: Number(input.ownerlessDebt ?? -1),
    fullRegression: input.fullRegression === true,
    packageInstallSmoke: input.packageInstallSmoke === true,
    selectedRunId: selectedRun?.runId || null,
    selectedArtifacts: selectedRun?.artifacts || [],
    runs,
    blockers,
    limitations: Object.freeze([...(input.limitations || [])]),
  };
  return Object.freeze({ ...core, manifestHash: stableHash(core) });
}

export function validatePhase11ReleaseManifest(value) {
  const errors = [];
  if (value?.version !== P11_RELEASE_MANIFEST_VERSION) errors.push('version');
  if (!['release-qualified', 'blocked'].includes(value?.status)) errors.push('status');
  if (value?.releaseQualified !== (value?.status === 'release-qualified')) errors.push('releaseQualified');
  if (value?.runs?.length !== 3 && value?.releaseQualified) errors.push('runs');
  if (value?.releaseQualified && (!value?.artifactIntegrity || !value?.coverageComplete)) errors.push('gates');
  if (value?.releaseQualified && value?.reportVerdict !== 'CONDITIONAL_PASS') errors.push('verdict');
  const { manifestHash, ...core } = value || {};
  if (!manifestHash || stableHash(core) !== manifestHash) errors.push('manifestHash');
  return Object.freeze({ ok: errors.length === 0, errors });
}

function normalizeRun(run = {}) {
  return Object.freeze({
    runId: String(run.runId || ''),
    modelDomainHash: run.modelDomainHash || null,
    reportSnapshotHash: run.reportSnapshotHash || null,
    numericHash: run.numericHash || null,
    sceneSelectionHash: run.sceneSelectionHash || null,
    figureManifestHash: run.figureManifestHash || null,
    planHash: run.planHash || null,
    artifactManifestHash: run.artifactManifestHash || null,
    manifestPath: run.manifestPath || null,
    manifestValid: run.manifestValid === true,
    pairComplete: run.pairComplete === true,
    pageParity: run.pageParity === true,
    artifacts: Object.freeze([...(run.artifacts || [])].map((row) => Object.freeze({
      locale: row.locale,
      path: row.path,
      bytes: Number(row.bytes || 0),
      pages: Number(row.pages || 0),
      sha256: row.sha256,
      hashVerified: row.hashVerified === true,
    }))),
  });
}

function unique(rows, field) {
  return new Set(rows.map((row) => row[field])).size;
}

function series(prefix, first, last) {
  return Array.from({ length: last - first + 1 }, (_row, index) => `${prefix}-${String(first + index).padStart(2, '0')}`);
}
