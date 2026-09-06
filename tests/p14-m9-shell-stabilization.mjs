import assert from 'node:assert/strict';
import {
  buildShellStabilizationReport,
  modalAssuranceCriterion,
  qualifyShellStabilization,
  runDrillingAlphaSweep,
  runUnsupportedRotationFloorSweep,
} from '../src/index.js';

const nodes = [
  { id: 'N1', x: 0, y: 0, z: 0 },
  { id: 'N2', x: 2, y: 0, z: 0 },
  { id: 'N3', x: 2, y: 1, z: 0 },
  { id: 'N4', x: 0, y: 1, z: 0 },
];
const displacement = nodes.flatMap((node) => [1e-3 * node.x, 2e-3 * node.y, 0, 0, 0, 0]);
const drillingSweep = runDrillingAlphaSweep({
  element: { id: 'S1', nodes, E: 30e9, nu: 0.2, t: 0.2 },
  displacement,
  alphas: [1e-6, 1e-5, 1e-4],
});
assert.equal(drillingSweep.rows.length, 3);
assert.ok(drillingSweep.physicalResponseVariation < 1e-12);
assert.ok(drillingSweep.rows.every((row) => row.energy.stabilizationToPhysicalRatio < 1e-12));

const K = Array.from({ length: 12 }, () => new Array(12).fill(0));
for (let i = 0; i < 6; i += 1) K[i][i] = 100 + i;
K[9][9] = 20;
const responseVector = [1, 2, 3, 0, 0, 0, 4, 5, 6, 0, 0, 0];
const floorSweep = runUnsupportedRotationFloorSweep({ matrix: K, nodes: [{ id: 'A' }, { id: 'B' }], fixedDofs: [], responseVector, ratios: [1e-12, 1e-9, 1e-6] });
assert.equal(floorSweep.nullRotationOnly, true);
assert.ok(floorSweep.rows.every((row) => row.responseVariation === 0));
assert.ok(floorSweep.rows.every((row) => !row.affectedDofs.includes(3) && !row.affectedDofs.includes(9)));
assert.ok(floorSweep.rows.every((row) => row.affectedDofs.includes(10) && row.affectedDofs.includes(11)));

const baseMode = [1, 0.5, -0.2, 0];
const perturbedMode = [2, 1, -0.4, 0];
assert.ok(Math.abs(modalAssuranceCriterion(baseMode, perturbedMode) - 1) < 1e-12);
const qualification = qualifyShellStabilization({
  drillingSweep,
  floorSweep,
  modes: [{ id: 'M1', vector: perturbedMode, referenceVector: baseMode, physicalEnergy: 100, stabilizationEnergy: 1e-4 }],
});
assert.equal(qualification.status, 'pass');
assert.equal(qualification.claim.crossSolverEquivalent, false);
assert.equal(qualification.benchmarkExecuted, false);
const report = buildShellStabilizationReport(qualification);
assert.equal(report.status, 'pass');
assert.equal(report.claim.id, 'P3S2-SS');
assert.equal(report.benchmarkExecutionStarted, false);

const blocked = qualifyShellStabilization({ drillingSweep, floorSweep, modes: [{ vector: baseMode, referenceVector: baseMode, physicalEnergy: 1, stabilizationEnergy: 1 }] });
assert.equal(blocked.status, 'blocked');
assert.ok(blocked.blockers.includes('SHELL_PHYSICAL_MODE_STABILIZATION_SENSITIVE'));

console.log(JSON.stringify({
  ok: true,
  milestone: 'P14-M9',
  drillingSweepHash: drillingSweep.sweepHash,
  floorSweepHash: floorSweep.sweepHash,
  qualificationHash: qualification.qualificationHash,
  mac: qualification.modes[0].mac,
  affectedNullRotations: floorSweep.rows[1].affectedDofs,
}, null, 2));
