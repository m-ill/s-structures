import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { stableHash } from '../src/core/stableHash.js';
import { M9A_SNAPSHOT as m9a } from './p10-m9a-wall-membrane.mjs';
import { M9B_SNAPSHOT as m9b } from './p10-m9b-slab-plate.mjs';
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
];
const core = {
  version: 'p10-evidence-artifact-v1',
  suiteId: 'P10-M9-SHELL-FEM',
  milestone: 'P10-M9',
  status: records.every((row) => row.status === 'OK') ? 'OK' : 'NG',
  generatedAt: '2026-07-22T23:59:00.000+09:00',
  sourceRevision: 'f969f84+p10-m9-worktree',
  tests: [
    'tests/p10-m9a-wall-membrane.mjs',
    'tests/p10-m9b-slab-plate.mjs',
    'tests/p10-m9c-flat-shell.mjs',
    'tests/p10-m9c-global-assembly.mjs',
    'tests/p10-m9d-shell-gpu.mjs',
  ],
  results: { m9a, m9b, m9c, global, m9d },
  records,
  qualification: {
    implementationOption: 'C-full',
    ownerApprovalRecorded: true,
    sharedSixDofAssembly: true,
    shellLumpedMassConnected: true,
    cpuF64Qualified: true,
    gpuBatchShadowQualified: true,
    nativeWebGpuKernelsImplemented: true,
    nativeWebGpuKernelsQualified: false,
    browserQualificationStatus: 'BLOCKED_BROWSER_CONTROL_RUNTIME',
    externallyCrossValidated: false,
    releaseQualified: false,
    releaseGate: 'P10-M11',
    remainingGates: ['XV-10-external-reference', 'native-WebGPU-K1-K3-device-validation-at-P10-M11'],
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
  assert.equal(committed.status, 'OK');
  assert.equal(committed.records.length, 9);
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
