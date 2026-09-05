import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  combineModalScalars,
  cqcCorrelation,
  MODAL_COMBINATION_POLICY,
  normalizeModalCombinationMethod,
} from '../src/dynamics/modalCombination.js';
import { combineModalResponseValues, runResponseSpectrum } from '../src/dynamics/modal.js';
import { applyBaseShearScaling } from '../src/results/rsa/baseShearScale.js';
import { combineRsaMemberForces } from '../src/results/rsa/memberForces.js';
import { normalizeAnalysisCaseSettings } from '../src/ui/analysisRunners.js';

const ordinary = [
  { modeId: 'M1', omega: 10, value: 3 },
  { modeId: 'M2', omega: 12, value: -4 },
];
close(combineModalScalars(ordinary, { method: 'SRSS' }).value, 5, 1e-12, 'SRSS exact');
close(combineModalScalars(ordinary, { method: 'ABS' }).value, 7, 1e-12, 'ABS exact');
close(combineModalScalars(ordinary, { method: 'CQC', dampingRatio: 0 }).value, 5, 1e-12, 'CQC zero damping');
close(combineModalScalars([{ modeId: 'M1', omega: 10, value: -3 }], { method: 'NRC10' }).value, 3, 1e-12, 'single-mode identity');
assert.equal(normalizeModalCombinationMethod('NRC-10%'), 'NRC10');
assert.equal(normalizeModalCombinationMethod('absolute'), 'ABS');
assert.equal(MODAL_COMBINATION_POLICY.methods.NRC10, 'absolute sum within close-frequency groups, then SRSS between groups');
assert.equal(normalizeAnalysisCaseSettings('responseSpectrum', { spectrum: { method: 'NRC-10%' } }).spectrum.method, 'NRC10');

const boundaryClose = [
  { modeId: 'M1', omega: 10, value: 3 },
  { modeId: 'M2', omega: 11, value: -4 },
];
const boundaryOpen = [
  { modeId: 'M1', omega: 10, value: 3 },
  { modeId: 'M2', omega: 11.000001, value: -4 },
];
const nrcBoundary = combineModalScalars(boundaryClose, { method: 'NRC10' });
close(nrcBoundary.value, 7, 1e-12, 'NRC inclusive 10 percent boundary');
assert.deepEqual(nrcBoundary.trace.groups, [['M1', 'M2']]);
close(combineModalScalars(boundaryOpen, { method: 'NRC10' }).value, 5, 1e-12, 'NRC outside boundary');

for (const method of ['SRSS', 'CQC', 'ABS', 'NRC10']) {
  const forward = combineModalScalars(boundaryClose, { method, dampingRatio: 0.05 }).value;
  const reverse = combineModalScalars(boundaryClose.slice().reverse(), { method, dampingRatio: 0.05 }).value;
  close(forward, reverse, 1e-12, `${method} permutation invariance`);
}
close(cqcCorrelation(10, 10, 0.05), 1, 1e-12, 'CQC repeated frequency');
assert.throws(
  () => combineModalScalars(ordinary, { method: 'NRC10', closeModeRatio: 1.1 }),
  (error) => error.code === 'NRC_CLOSE_MODE_RATIO_INVALID',
);

const modes = boundaryClose.map((item, index) => ({
  id: item.modeId,
  index: index + 1,
  period: 2 * Math.PI / item.omega,
  omega: item.omega,
  vector: dofVector(index === 0 ? 1 : -0.5, index === 0 ? 0.25 : 1),
  participation: {
    x: {
      gamma: index === 0 ? 1.25 : 0.5,
      modalMass: 1,
      generalizedMass: 1,
      effectiveMass: index === 0 ? 1.5625 : 0.25,
      massRatio: index === 0 ? 0.78125 : 0.125,
    },
  },
}));
const mass = new Array(12).fill(0);
mass[0] = 1;
mass[6] = 1;
const context = {
  nodes: [{ id: 'N1' }, { id: 'N2' }],
  units: { length: 'm', force: 'kN' },
};
const baseSpectrum = {
  directions: ['x'],
  dampingRatio: 0.05,
  scale: 1,
  points: [{ period: 0, sa: 2 }, { period: 5, sa: 2 }],
  applyBaseShearScaling: false,
};
for (const method of ['ABS', 'NRC10']) {
  const rsa = runResponseSpectrum(modes, [0, 6], mass, [2, 0, 0], { ...baseSpectrum, method }, context);
  const row = rsa.combined.x;
  assert.equal(rsa.method, method);
  assert.equal(row.method, method);
  close(row.displacement, method === 'ABS' ? row.absDisplacement : row.nrc10Displacement, 1e-12, `${method} selected displacement`);
  close(row.baseShear, method === 'ABS' ? row.absBaseShear : row.nrc10BaseShear, 1e-12, `${method} selected base shear`);
  assert.equal(row.combinationTrace.method, method);
  assert.deepEqual(row.combinationTrace.responseFamilies, ['nodal-displacement', 'nodal-inertia-force', 'base-shear', 'member-force']);
  assert.equal(row.nodalDisplacementsByMethod[method].length, 2);
  assert.equal(row.nodalInertiaForcesByMethod[method].length, 2);
  const scaled = applyBaseShearScaling({ ...rsa, baseShearScaling: null }, { directionMinima: { x: row.baseShear * 2 } });
  close(scaled.combined.x[method === 'ABS' ? 'absDisplacement' : 'nrc10Displacement'], row[method === 'ABS' ? 'absDisplacement' : 'nrc10Displacement'] * 2, 1e-12, `${method} scale propagation`);

  const memberCombination = combineRsaMemberForces({
    responses: [syntheticMemberResponse('M1', boundaryClose[0].omega, 3), syntheticMemberResponse('M2', boundaryClose[1].omega, -4)],
    direction: 'x',
    method,
    dampingRatio: 0.05,
    provenance: {},
    units: { force: 'kN', moment: 'kN.m', length: 'm' },
    combineValues: combineModalResponseValues,
  });
  assert.equal(memberCombination.status, 'available');
  assert.equal(memberCombination.byMember.E1.responseMethod, method);
  close(memberCombination.byMember.E1.endForces[0], 7, 1e-12, `${method} member force combination`);
}

const cliDirectory = await mkdtemp(join(tmpdir(), 'sstructures-p14-m3-'));
const cliInput = join(cliDirectory, 'responses.json');
const cliOutput = join(cliDirectory, 'result.json');
await writeFile(cliInput, JSON.stringify({ responses: boundaryClose, method: 'NRC-10%' }), 'utf8');
const cliSummary = JSON.parse(execFileSync(process.execPath, [
  'tools/sstructures-modal-combination.mjs',
  cliInput,
  `--output=${cliOutput}`,
], { encoding: 'utf8' }));
assert.equal(cliSummary.method, 'NRC10');
close(cliSummary.value, 7, 1e-12, 'CLI NRC result');
assert.equal(JSON.parse(await readFile(cliOutput, 'utf8')).result.method, 'NRC10');

console.log(JSON.stringify({
  ok: true,
  milestone: 'P14-M3',
  methods: ['SRSS', 'CQC', 'ABS', 'NRC10'],
  nrcBoundaryValue: nrcBoundary.value,
  repeatedFrequencyCorrelation: cqcCorrelation(10, 10, 0.05),
}, null, 2));

function dofVector(first, second) {
  const vector = new Array(12).fill(0);
  vector[0] = first;
  vector[6] = second;
  return vector;
}

function syntheticMemberResponse(mode, omega, value) {
  const forceRow = {
    memberId: 'E1',
    mode,
    xs: [0, 1],
    endForces: Array.from({ length: 12 }, () => value),
    N: [value, value],
    Vy: [value, value],
    Vz: [value, value],
    Tq: [value, value],
    My: [value, value],
    Mz: [value, value],
    peaks: { N: Math.abs(value), Vy: Math.abs(value), Vz: Math.abs(value), Tq: Math.abs(value), My: Math.abs(value), Mz: Math.abs(value) },
    partialFixity: null,
    qualification: { qualified: true },
  };
  return {
    mode,
    period: 2 * Math.PI / omega,
    omega,
    memberForceRecovery: { qualified: true, blockers: [], rows: [forceRow], byMember: { E1: forceRow } },
  };
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}
