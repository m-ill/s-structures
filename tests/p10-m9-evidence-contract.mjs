import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { stableHash } from '../src/core/stableHash.js';
import { M9A_SNAPSHOT as m9a } from './p10-m9a-wall-membrane.mjs';
import { M9B_SNAPSHOT as m9b } from './p10-m9b-slab-plate.mjs';
import { M9B_QUALIFICATION_SNAPSHOT as m9bQualification } from './p10-m9b-plate-qualification.mjs';
import { M9B_SHELL_INVARIANT_SNAPSHOT as m9bInvariants } from './p10-m9b-shell-invariants.mjs';
import { M9B_DYNAMICS_SNAPSHOT as m9bDynamics } from './p10-m9b-plate-dynamics.mjs';
import { M9C_SNAPSHOT as m9c } from './p10-m9c-flat-shell.mjs';
import { M9_GLOBAL_SNAPSHOT as global } from './p10-m9c-global-assembly.mjs';
import { M9D_SNAPSHOT as m9d } from './p10-m9d-shell-gpu.mjs';

const records = [
  record('SH-A01-MEMBRANE-PATCH', m9a.patchError, 1e-10),
  record('SH-A02-WALL-CANTILEVER', m9a.cantilever.relativeError, 5e-2),
  record('SH-B01-SQUARE-PLATE', m9b.simple.relativeError, 1e-2),
  record('SH-C01-RIGID-BODY-ENERGY', m9c.rigidEnergyRatio, 1e-8),
  record('SH-C02-SPURIOUS-ENERGY', m9c.spuriousEnergyRatio, 1e-4),
  record('SH-C03-GLOBAL-EQUILIBRIUM', global.shearError, 1e-10),
  record('SH-G01-F32-BATCH-PARITY', m9d.gpuRelativeError, 1e-6),
  record('SH-G02-REFINEMENT-RESIDUAL', m9d.gpuResidual, 1e-10),
  record('SH-G03-DETERMINISTIC-GATHER', m9d.deterministicAssembly ? 0 : 1, 0),
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
const cpuF64QualificationBlocker = 'SHELL_MEMBRANE_FLAT_SHELL_NUMERICAL_QUALIFICATION_REQUIRED';
const cpuF64QualificationBlockers = [
  'QM6_DISTORTION_PATCH_REQUIRED',
  'FLAT_SHELL_DRILLING_QUALIFICATION_REQUIRED',
];
const core = {
  version: 'p10-evidence-artifact-v3',
  suiteId: 'P10-M9-SHELL-FEM',
  milestone: 'P10-M9',
  status: 'BLOCKED',
  implementationStatus: 'complete',
  generatedAt: '2026-07-22T23:59:00.000+09:00',
  sourceRevision: 'f969f84+p10-m9-worktree',
  tests: [
    'tests/p10-m9a-wall-membrane.mjs',
    'tests/p10-m9b-slab-plate.mjs',
    'tests/p10-m9b-plate-qualification.mjs',
    'tests/p10-m9b-shell-invariants.mjs',
    'tests/p10-m9b-plate-dynamics.mjs',
    'tests/p10-m9c-flat-shell.mjs',
    'tests/p10-m9c-global-assembly.mjs',
    'tests/p10-m9d-shell-gpu.mjs',
  ],
  results: {
    m9a,
    m9b,
    m9bQualification: m9bQualificationSummary,
    m9bInvariants: m9bInvariantSummary,
    m9bDynamics,
    m9c,
    global,
    m9d,
  },
  records,
  qualification: {
    implementationOption: 'C-full',
    ownerApprovalRecorded: true,
    sharedSixDofAssembly: true,
    shellLumpedMassConnected: true,
    cpuF64ExecutionAvailable: true,
    cpuF64Qualified: false,
    plateNumericalQualificationStatus: plateNumericalQualified ? 'PASS' : 'BLOCKED',
    plateInvariantQualificationStatus: m9bInvariants.qualification.status,
    plateDynamicsQualificationStatus: m9bDynamics.modalRelativeError <= 0.1 ? 'PASS' : 'BLOCKED',
    plateDesignTransferAllowed: plateNumericalQualified,
    cpuF64QualificationBlocker,
    cpuF64QualificationBlockers,
    plateNumericalQualificationBlocker: null,
    plateNumericalQualificationBlockers: [],
    designTransferAllowed: false,
    gpuBatchShadowQualified: true,
    nativeWebGpuKernelsImplemented: true,
    nativeWebGpuKernelsQualified: false,
    browserQualificationStatus: 'BLOCKED_BROWSER_CONTROL_RUNTIME',
    externallyCrossValidated: false,
    releaseQualified: false,
    releaseGate: 'P10-M11',
    remainingGates: [
      'QM6-distortion-patch-qualification',
      'flat-shell-drilling-qualification',
      'XV-10-external-reference',
      'native-WebGPU-K1-K3-device-validation-at-P10-M11',
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
  assert.equal(committed.status, 'BLOCKED');
  assert.equal(committed.implementationStatus, 'complete');
  assert.equal(committed.records.length, 21);
  assert.equal(committed.records.every((row) => row.status === 'OK'), true);
  assert.equal(committed.qualification.cpuF64ExecutionAvailable, true);
  assert.equal(committed.qualification.cpuF64Qualified, false);
  assert.equal(committed.qualification.plateNumericalQualificationStatus, 'PASS');
  assert.equal(committed.qualification.plateInvariantQualificationStatus, 'PASS');
  assert.equal(committed.qualification.plateDynamicsQualificationStatus, 'PASS');
  assert.equal(committed.qualification.plateDesignTransferAllowed, true);
  assert.equal(committed.qualification.cpuF64QualificationBlocker, cpuF64QualificationBlocker);
  assert.deepEqual(committed.qualification.cpuF64QualificationBlockers, cpuF64QualificationBlockers);
  assert.equal(committed.qualification.designTransferAllowed, false);
  assert.equal(committed.qualification.nativeWebGpuKernelsImplemented, true);
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
