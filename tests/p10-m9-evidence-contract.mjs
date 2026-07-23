import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { stableHash } from '../src/core/stableHash.js';
import { M9A_SNAPSHOT as m9a } from './p10-m9a-wall-membrane.mjs';
import { M9A_MEMBRANE_QUALIFICATION_SNAPSHOT as m9aMembraneQualification } from './p10-m9a-membrane-qualification.mjs';
import { M9B_SNAPSHOT as m9b } from './p10-m9b-slab-plate.mjs';
import { M9B_QUALIFICATION_SNAPSHOT as m9bQualification } from './p10-m9b-plate-qualification.mjs';
import { M9B_SHELL_INVARIANT_SNAPSHOT as m9bInvariants } from './p10-m9b-shell-invariants.mjs';
import { M9B_DYNAMICS_SNAPSHOT as m9bDynamics } from './p10-m9b-plate-dynamics.mjs';
import { M9C_SNAPSHOT as m9c } from './p10-m9c-flat-shell.mjs';
import { M9C_FLAT_SHELL_QUALIFICATION_SNAPSHOT as m9cFlatShellQualification } from './p10-m9c-flat-shell-qualification.mjs';
import { M9_GLOBAL_SNAPSHOT as global } from './p10-m9c-global-assembly.mjs';
import { M9D_SNAPSHOT as m9d } from './p10-m9d-shell-gpu.mjs';
import './p10-m9c-shell-fail-closed.mjs';

const records = [
  record('SH-A01-MEMBRANE-PATCH', m9a.patchError, 1e-10),
  record('SH-A02-WALL-CANTILEVER', m9a.cantilever.relativeError, 5e-2),
  record('SH-B01-SQUARE-PLATE', m9b.simple.relativeError, 1e-2),
  record('SH-C01-RIGID-BODY-ENERGY', m9c.rigidEnergyRatio, 1e-8),
  record('SH-C02-DRILLING-STIFFNESS-RATIO', m9c.drillingStiffnessRatio, 1e-4),
  record('SH-C03-GLOBAL-EQUILIBRIUM', global.reactionShearError, 1e-10),
  record('SH-G01-F32-BATCH-PARITY', m9d.gpuRelativeError, 1e-6),
  record('SH-G02-K1-TRANSPORT-RESIDUAL', m9d.gpuResidual, 1e-6),
  record('SH-G03-DETERMINISTIC-GATHER', m9d.deterministicAssembly ? 0 : 1, 0),
  ...m9aMembraneQualification.cases.flatMap((row) => [
    record(
      `SH-AQ-${row.id.toUpperCase()}-CENTER-DISPLACEMENT`,
      row.centerDisplacementRelativeError,
      m9aMembraneQualification.qualification.centerDisplacementRelativeTolerance,
    ),
    record(
      `SH-AQ-${row.id.toUpperCase()}-FREE-RESIDUAL`,
      row.affineFreeResidualRelativeError,
      m9aMembraneQualification.qualification.affineFreeResidualRelativeTolerance,
    ),
  ]),
  ...m9bQualification.cases.map((row) => ({
    caseId: row.caseId,
    reference: row.reference,
    computed: row.computed,
    relError: row.relativeError,
    tolerance: row.tolerance,
    status: row.status === 'PASS' ? 'OK' : 'NG',
  })),
  ...m9bQualification.convergenceCases.map((row) => ({
    caseId: row.caseId,
    reference: 0,
    computed: row.relativeChange,
    relError: row.relativeChange,
    tolerance: row.tolerance,
    status: row.status === 'PASS' ? 'OK' : 'NG',
  })),
  ...m9bInvariants.qualification.checks.map((row) => ({
    caseId: `SH-BI-${row.id.toUpperCase()}`,
    reference: 0,
    computed: row.normalizedResidual ?? row.relativeError,
    relError: row.normalizedResidual ?? row.relativeError,
    tolerance: row.tolerance,
    status: row.pass ? 'OK' : 'NG',
  })),
  record('SH-BD-01-MODAL-FREQUENCY', m9bDynamics.modalRelativeError, 0.1),
  ...m9cFlatShellQualification.checks.map(flatShellQualificationRecord),
];
const plateNumericalQualified = m9bQualification.status === 'PASS'
  && m9bInvariants.qualification.status === 'PASS'
  && m9bDynamics.modalRelativeError <= 0.1;
const m9bQualificationSummary = {
  version: m9bQualification.version,
  status: m9bQualification.status,
  referenceKind: m9bQualification.referenceKind,
  referenceConvergence: m9bQualification.referenceConvergence,
  convergenceCaseCount: m9bQualification.convergenceCases.length,
  failedCaseIds: m9bQualification.failedCaseIds,
};
const m9bInvariantSummary = {
  version: m9bInvariants.version,
  status: m9bInvariants.qualification.status,
  failedCheckIds: m9bInvariants.qualification.failedCheckIds,
};
const canonicalElementFormulations = ['QM6-EAS', 'MITC4', 'QM6-EAS+MITC4'];
const canonicalElementVersions = [
  'p10-m9a-wall-membrane-qm6-eas-v5-finite-dimensionless-qualified',
  'p10-m9b-slab-plate-mitc4-v5-finite-geometry-qualified',
  'p10-m9c-flat-shell-qm6-mitc4-v5-propagated-hard-scope',
];
const canonicalBatchVersion = 'p10-m9-shell-soa-batch-v4-fail-closed-qualified';
const hardScopeRegressions = {
  status: 'PASS',
  canonicalElementFormulations: m9d.elementFormulations,
  canonicalElementVersions: m9d.elementVersions,
  canonicalBatchVersion: m9d.batchVersion,
  gpuTransportOnlyScope: {
    status: m9d.formulationNativeStiffnessGeneration === false ? 'PASS' : 'BLOCKED',
    kernelVersion: m9d.gpuKernelVersion,
    shadowQualificationScope: m9d.shadowQualificationScope,
    maximumQualificationScope: m9d.qualificationScope,
    formulationNativeStiffnessGeneration: m9d.formulationNativeStiffnessGeneration,
    kernelParityQualified: true,
    genericQualification: false,
    genericDesignTransferAllowed: false,
  },
  membraneGeometryAndWarpGate: {
    status: 'PASS',
    regressionTest: 'tests/p10-m9a-wall-membrane.mjs',
    elementVersion: m9d.elementVersions[0],
    moderateSkewElementQualified: true,
    extremeSkewElementBlocked: true,
    warpedElementBlocked: true,
    modelMeshConvergenceDesignBlocked: true,
  },
  plateGeometryAndWarpGate: {
    status: 'PASS',
    regressionTest: 'tests/p10-m9b-slab-plate.mjs',
    elementVersion: m9d.elementVersions[1],
    snapshotVersion: m9b.version,
    representativeGeometry: m9b.geometryQualification,
    moderateSkewElementQualified: true,
    extremeSkewElementBlocked: true,
    mildlyWarpedElementQualified: true,
    severelyWarpedElementBlocked: true,
    panelAspectThicknessBenchmarkMetadata: {
      shortSideThicknessRatioRange: [15, 100],
      elementLocalGate: false,
    },
    modelMeshConvergenceDesignBlocked: true,
  },
  flatShellWarpToleranceHardCapGate: {
    status: 'PASS',
    regressionTest: 'tests/p10-m9c-flat-shell.mjs',
    elementVersion: m9d.elementVersions[2],
    callerCannotLoosenQualifiedWarpTolerance: true,
    qualifiedWarpToleranceMaximum: 0.01,
    modelMeshConvergenceDesignBlocked: true,
  },
  invalidPropertyGates: {
    status: 'PASS',
    regressionTests: ['tests/p10-m9a-wall-membrane.mjs', 'tests/p10-m9b-slab-plate.mjs'],
    membraneRejectedProperties: ['E', 'nu', 'thickness'],
    plateRejectedProperties: ['E', 'nu', 'thickness', 'density'],
    finiteMatrixRecoveryPressureMassAndClosedFormRequired: true,
  },
  drillingAlphaAndScaleGate: {
    status: m9a.drillingScaleSpread < 1.000001 ? 'PASS' : 'BLOCKED',
    regressionTest: 'tests/p10-m9a-wall-membrane.mjs',
    outsideQualifiedAlphaRangeDesignBlocked: true,
    sampledOutsideAlphaRange: [1e-300, 1e50],
    scaleSpread: m9a.drillingScaleSpread,
    scaleSpreadTolerance: 1.000001,
  },
  gpuQualificationPropagation: {
    status: 'PASS',
    regressionTest: 'tests/p10-m9d-shell-gpu.mjs',
    kernelParityQualified: true,
    shadowTransportQualified: true,
    genericQualified: false,
    genericDesignTransferAllowed: false,
    parityFailureBlocksQualification: true,
    modelMeshConvergenceBlockerPropagates: true,
  },
  shellFailClosedIntegration: {
    status: 'PASS',
    regressionTest: 'tests/p10-m9c-shell-fail-closed.mjs',
    shellIdentityFailClosed: true,
    shellGeometryFailClosed: true,
    shellPressureTargetFailClosed: true,
    shellDomainAggregationFailClosed: true,
  },
  modalRelativeMetric: {
    status: 'PASS',
    regressionTest: 'tests/p10-m9b-plate-dynamics.mjs',
    metric: 'relative-error',
    lowerIsBetter: true,
    value: m9bDynamics.modalRelativeError,
    tolerance: 0.1,
  },
};
assert.deepEqual(m9d.elementFormulations, canonicalElementFormulations);
assert.deepEqual(m9d.elementVersions, canonicalElementVersions);
assert.equal(m9d.batchVersion, canonicalBatchVersion);
assert.equal(m9b.version, 'p10-m9b-verification-v2-hard-qualified-scope');
assert.equal(hardScopeRegressions.gpuTransportOnlyScope.status, 'PASS');
assert.equal(hardScopeRegressions.drillingAlphaAndScaleGate.status, 'PASS');
const core = {
  version: 'p10-evidence-artifact-v6',
  suiteId: 'P10-M9-SHELL-FEM',
  milestone: 'P10-M9',
  status: 'PASS',
  implementationStatus: 'complete',
  generatedAt: '2026-07-22T23:59:00.000+09:00',
  sourceRevision: 'f969f84+p10-m9-worktree',
  tests: [
    'tests/p10-m9a-wall-membrane.mjs',
    'tests/p10-m9a-membrane-qualification.mjs',
    'tests/p10-m9b-slab-plate.mjs',
    'tests/p10-m9b-plate-qualification.mjs',
    'tests/p10-m9b-shell-invariants.mjs',
    'tests/p10-m9b-plate-dynamics.mjs',
    'tests/p10-m9c-flat-shell.mjs',
    'tests/p10-m9c-flat-shell-qualification.mjs',
    'tests/p10-m9c-global-assembly.mjs',
    'tests/p10-m9c-shell-fail-closed.mjs',
    'tests/p10-m9d-shell-gpu.mjs',
  ],
  results: {
    m9a,
    m9aMembraneQualification,
    m9b,
    m9bQualification: m9bQualificationSummary,
    m9bInvariants: m9bInvariantSummary,
    m9bDynamics,
    m9c,
    m9cFlatShellQualification,
    global,
    m9d,
    hardScopeRegressions,
  },
  records,
  qualification: {
    implementationOption: 'C-full',
    ownerApprovalRecorded: true,
    sharedSixDofAssembly: true,
    shellLumpedMassConnected: true,
    cpuF64ExecutionAvailable: true,
    cpuF64Qualified: true,
    membranePatchQualificationStatus: m9aMembraneQualification.qualification.status,
    plateNumericalQualificationStatus: plateNumericalQualified ? 'PASS' : 'BLOCKED',
    plateInvariantQualificationStatus: m9bInvariants.qualification.status,
    plateDynamicsQualificationStatus: m9bDynamics.modalRelativeError <= 0.1 ? 'PASS' : 'BLOCKED',
    plateDesignTransferAllowed: false,
    flatShellNumericalQualificationStatus: m9cFlatShellQualification.status,
    modelMeshConvergenceQualificationStatus: 'BLOCKED',
    cpuF64QualificationBlocker: null,
    cpuF64QualificationBlockers: [],
    plateNumericalQualificationBlocker: null,
    plateNumericalQualificationBlockers: [],
    designTransferAllowed: false,
    designTransferBlockers: ['SHELL_MODEL_MESH_CONVERGENCE_REQUIRED'],
    gpuBatchShadowQualified: true,
    gpuKernelParityQualified: true,
    gpuShadowTransportQualified: true,
    gpuQualified: false,
    gpuDesignTransferAllowed: false,
    gpuShadowQualificationScope: m9d.shadowQualificationScope,
    gpuMaximumQualificationScope: m9d.qualificationScope,
    nativeWebGpuTransportImplemented: true,
    nativeWebGpuKernelsImplemented: false,
    nativeFormulationKernelsImplemented: false,
    nativeWebGpuKernelsQualified: false,
    browserQualificationStatus: 'BLOCKED_BROWSER_CONTROL_RUNTIME',
    externallyCrossValidated: false,
    releaseQualified: false,
    releaseGate: 'P10-M11',
    remainingGates: [
      'shell-model-mesh-convergence-provenance',
      'XV-10-external-reference',
      'native-WebGPU-formulation-kernels-implementation-and-device-validation',
    ],
  },
};
export const LIVE_P10_M9_EVIDENCE = Object.freeze({ ...core, artifactHash: stableHash(core).slice(0, 24) });

if (process.argv.includes('--print')) {
  console.log(JSON.stringify(LIVE_P10_M9_EVIDENCE, null, 2));
} else {
  const committed = JSON.parse(await readFile(path.resolve(
    'reports', 'validation-evidence', 'phase10', 'p10-m9-shell-fem.json',
  ), 'utf8'));
  assert.deepEqual(committed, LIVE_P10_M9_EVIDENCE, 'P10-M9 committed evidence is stale');
  assert.equal(committed.status, 'PASS');
  assert.equal(committed.implementationStatus, 'complete');
  assert.equal(committed.records.length, 35);
  assert.equal(committed.records.every((row) => row.status === 'OK'), true);
  assert.equal(committed.results.hardScopeRegressions.status, 'PASS');
  assert.deepEqual(
    committed.results.hardScopeRegressions.canonicalElementFormulations,
    canonicalElementFormulations,
  );
  assert.equal(committed.results.hardScopeRegressions.gpuTransportOnlyScope.status, 'PASS');
  assert.equal(committed.results.hardScopeRegressions.membraneGeometryAndWarpGate.status, 'PASS');
  assert.equal(committed.results.hardScopeRegressions.drillingAlphaAndScaleGate.status, 'PASS');
  assert.equal(committed.results.hardScopeRegressions.plateGeometryAndWarpGate.status, 'PASS');
  assert.equal(committed.results.hardScopeRegressions.flatShellWarpToleranceHardCapGate.status, 'PASS');
  assert.equal(committed.results.hardScopeRegressions.invalidPropertyGates.status, 'PASS');
  assert.equal(committed.results.hardScopeRegressions.gpuQualificationPropagation.status, 'PASS');
  assert.equal(committed.results.hardScopeRegressions.shellFailClosedIntegration.status, 'PASS');
  assert.equal(committed.results.hardScopeRegressions.modalRelativeMetric.status, 'PASS');
  assert.equal(committed.qualification.cpuF64ExecutionAvailable, true);
  assert.equal(committed.qualification.cpuF64Qualified, true);
  assert.equal(committed.qualification.membranePatchQualificationStatus, 'PASS');
  assert.equal(committed.qualification.plateNumericalQualificationStatus, 'PASS');
  assert.equal(committed.qualification.plateInvariantQualificationStatus, 'PASS');
  assert.equal(committed.qualification.plateDynamicsQualificationStatus, 'PASS');
  assert.equal(committed.qualification.plateDesignTransferAllowed, false);
  assert.equal(committed.qualification.flatShellNumericalQualificationStatus, 'PASS');
  assert.equal(committed.qualification.modelMeshConvergenceQualificationStatus, 'BLOCKED');
  assert.equal(committed.qualification.cpuF64QualificationBlocker, null);
  assert.deepEqual(committed.qualification.cpuF64QualificationBlockers, []);
  assert.equal(committed.qualification.plateNumericalQualificationBlocker, null);
  assert.deepEqual(committed.qualification.plateNumericalQualificationBlockers, []);
  assert.equal(committed.qualification.designTransferAllowed, false);
  assert.deepEqual(
    committed.qualification.designTransferBlockers,
    ['SHELL_MODEL_MESH_CONVERGENCE_REQUIRED'],
  );
  assert.equal(committed.qualification.gpuKernelParityQualified, true);
  assert.equal(committed.qualification.gpuShadowTransportQualified, true);
  assert.equal(committed.qualification.gpuQualified, false);
  assert.equal(committed.qualification.gpuDesignTransferAllowed, false);
  assert.equal(committed.qualification.nativeWebGpuTransportImplemented, true);
  assert.equal(committed.qualification.nativeWebGpuKernelsImplemented, false);
  assert.equal(committed.qualification.nativeFormulationKernelsImplemented, false);
  assert.equal(committed.qualification.nativeWebGpuKernelsQualified, false);
  assert.equal(committed.qualification.releaseQualified, false);
  console.log(JSON.stringify({ ok: true, artifactHash: committed.artifactHash, recordCount: committed.records.length }, null, 2));
}

function record(caseId, computed, tolerance) {
  return {
    caseId,
    reference: 0,
    computed,
    relError: Math.abs(computed),
    tolerance,
    status: Math.abs(computed) <= tolerance ? 'OK' : 'NG',
  };
}

function flatShellQualificationRecord(check) {
  const caseId = `SH-CQ-${check.id.toUpperCase()}`;
  if (check.id.startsWith('DR-01') || check.id.startsWith('DR-02')) {
    return record(caseId, check.maxNormalizedResidual, check.tolerance);
  }
  if (check.id.startsWith('DR-03')) {
    return record(caseId, check.normalizedDrillingEnergy, check.tolerance);
  }
  if (check.id.startsWith('DR-04')) {
    return {
      caseId,
      reference: check.minimum,
      computed: check.normalizedDrillingEnergy,
      relError: check.pass ? 0 : Math.abs(check.minimum - check.normalizedDrillingEnergy) / check.minimum,
      tolerance: 0,
      status: check.pass ? 'OK' : 'NG',
    };
  }
  if (check.id.startsWith('PL-01')) {
    return record(caseId, Math.max(check.nodalRelativeError, check.totalRelativeError), check.tolerance);
  }
  return record(
    caseId,
    Math.max(check.nodalRelativeError, check.totalRelativeError, check.centroidMomentRelativeError),
    check.tolerance,
  );
}
