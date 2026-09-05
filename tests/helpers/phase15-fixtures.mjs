import {
  PHASE15_DISCREPANCY_IDS,
  createPhase15ProbeManifest,
  createPhase15ReferenceManifest,
  createPhase15ToleranceManifest,
} from '../../verification/framework/phase15/index.js';

export const HASH = Object.freeze({
  approval: 'a'.repeat(64),
  source: 'b'.repeat(64),
  build: 'c'.repeat(64),
  model: 'd'.repeat(64),
  input: 'e'.repeat(64),
  solver: 'f'.repeat(64),
  audit: '1'.repeat(64),
  document: '2'.repeat(64),
});

export function phase15Manifests(caseId = 'SB1') {
  const reference = createPhase15ReferenceManifest({
    caseId,
    specVersion: 'fixture-v1',
    claimScope: 'closed-form signed response',
    source: {
      level: 'R1',
      title: 'Independent closed-form fixture',
      revision: 'v1',
      locator: 'tests/references/phase15/fixture.json',
      page: 'equation 1',
      fileHash: HASH.source,
      licenseNote: 'internal test fixture',
      displayedPrecision: '6 significant digits',
      independentFromProduction: true,
    },
    definition: {
      geometry: { length: 1 },
      materials: { E: 200e9 },
      supports: { left: 'fixed' },
      loads: { tip: 1 },
      mass: { included: false },
      mesh: { elements: 1 },
    },
    values: [{ id: 'tip', value: -1, unit: 'm', resultKind: 'displacement', displayedPrecision: 'exact' }],
    frozenBeforeRun: true,
    approvedBy: 'verification-reviewer',
    approvalHash: HASH.approval,
  });
  const tolerance = createPhase15ToleranceManifest({
    caseId,
    specVersion: 'fixture-v1',
    referenceHash: reference.referenceHash,
    metrics: [{
      id: 'tip',
      unit: 'm',
      relativeTolerance: 0.001,
      characteristicFloor: 1e-12,
      rationale: 'closed-form fixture contract',
    }],
    frozenBeforeRun: true,
    rationale: 'frozen before test execution',
    approvedBy: 'verification-reviewer',
    approvalHash: HASH.approval,
  });
  const probe = createPhase15ProbeManifest({
    caseId,
    specVersion: 'fixture-v1',
    referenceHash: reference.referenceHash,
    probes: [{
      id: 'tip',
      resultKind: 'displacement',
      location: { node: 'N2' },
      axis: 'global-z',
      signConvention: 'positive-global-z',
      unit: 'm',
      recoveryPolicy: 'joint',
      component: 'uz',
    }],
    frozenBeforeRun: true,
    approvedBy: 'verification-reviewer',
    approvalHash: HASH.approval,
  });
  return { reference, tolerance, probe };
}

export function phase15Binding(manifests = phase15Manifests()) {
  return {
    sourceHash: HASH.source,
    buildHash: HASH.build,
    modelHash: HASH.model,
    inputHash: HASH.input,
    solverSettingsHash: HASH.solver,
    referenceHash: manifests.reference.referenceHash,
    toleranceHash: manifests.tolerance.toleranceHash,
    probeHash: manifests.probe.probeHash,
  };
}

export function phase15BaselineInput(overrides = {}) {
  const manifests = phase15Manifests();
  const reviewer = (name) => ({ reviewer: name, approvalHash: HASH.approval });
  return {
    sourceRevision: '0'.repeat(40),
    dirtyEntries: [' M docs/phase14/IMPLEMENTATION_STATUS.md', '?? docs/phase15/'],
    environment: { node: 'v22.0.0', platform: 'win32', arch: 'x64' },
    preservedArtifacts: [
      artifact('first-batch-json'),
      artifact('first-batch-pdf'),
      artifact('phase14-release-manifest'),
      artifact('phase14-m0-baseline'),
    ],
    referenceManifests: [manifests.reference],
    toleranceManifests: [manifests.tolerance],
    probeManifests: [manifests.probe],
    discrepancyIds: PHASE15_DISCREPANCY_IDS,
    reviewers: {
      numerical: reviewer('numerical-reviewer'),
      'structural-domain': reviewer('structural-reviewer'),
      verification: reviewer('verification-reviewer'),
      architecture: reviewer('architecture-reviewer'),
      release: reviewer('release-reviewer'),
    },
    expectedImportAudit: { scannedFileCount: 100, violations: [] },
    phase14StatusAudit: { benchmarkExecutionStarted: true, staleAssertionCount: 0, statusDocumentHash: HASH.document },
    traceCoverage: 1,
    performanceBaseline: {
      repeatabilityRuns: 3,
      measurements: [{ id: 'fixture', runtimeMs: 1, peakMemoryBytes: 1024 }],
    },
    run: { capturedAt: '2026-08-27T00:00:00.000Z', host: 'fixture-host' },
    ...overrides,
  };
}

function artifact(id) {
  return { id, kind: 'fixture', path: `${id}.json`, sha256: HASH.source, byteLength: 100 };
}
