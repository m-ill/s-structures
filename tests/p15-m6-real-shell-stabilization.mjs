import assert from 'node:assert/strict';
import {
  buildStabilizationParameterContract,
  buildUnsupportedRotationFloorPlan,
  createThreeStoryWallStabilizationFixture,
  runRealShellStabilizationQualification,
} from '../src/index.js';
import { denseToCsc } from '../src/compute/sparse/matrix.js';

const fixture = createThreeStoryWallStabilizationFixture();
assert.equal(fixture.storyCount, 3);
assert.equal(fixture.shells.length, 6);
assert.equal(fixture.nodes.filter((node) => node.support === 'fixed').length, 2);
assert.equal(fixture.topNodeIds.length, 2);

const qualification = runRealShellStabilizationQualification();
assert.equal(qualification.status, 'pass', qualification.blockers.join(', '));
assert.equal(qualification.selfTest, false);
assert.equal(qualification.qualificationExecuted, true);
assert.equal(qualification.benchmarkExecuted, false);
assert.equal(qualification.claim.identicalToStrixP3S2, false);
assert.equal(qualification.claim.crossSolverEquivalent, false);
assert.equal(qualification.sweep.requestedPointCount, 9);
assert.equal(qualification.sweep.solveArtifactCount, 9);
assert.equal(qualification.sweep.actualStaticSolveCount, 9);
assert.equal(qualification.sweep.actualModalSolveCount, 9);
assert.ok(qualification.sweep.rows.every((row) => row.ok && row.solveArtifactHash));
assert.equal(new Set(qualification.sweep.rows.map((row) => row.solveArtifactHash)).size, 9);
assert.equal(qualification.parameterContracts.alpha.uniqueEffectiveCount, 3);
assert.equal(qualification.parameterContracts.floor.uniqueEffectiveCount, 3);
assert.ok(qualification.sweep.rows.every((row) => row.static.trueResidual <= 1e-8));
assert.ok(qualification.sweep.rows.every((row) => row.modal.modes.length === 3));
assert.ok(qualification.sweep.rows.every((row) => row.modal.modes.every((mode) => mode.residual <= 1e-8)));
assert.ok(qualification.sensitivity.maximumStaticShift < 5e-3);
assert.ok(qualification.sensitivity.maximumPeriodShift < 5e-3);
assert.ok(qualification.sensitivity.minimumMassWeightedMac >= 0.99);
assert.ok(qualification.sensitivity.maximumStaticStabilizationEnergyRatio <= 1e-4);
assert.ok(qualification.sensitivity.maximumModalStabilizationEnergyRatio <= 1e-3);
assert.equal(qualification.nullModeQualification.denseSparseParity, true);
assert.equal(qualification.nullModeQualification.expectedSpuriousModesRemoved, true);
assert.equal(qualification.nullModeQualification.physicalOrRigidMasked, 0);
assert.deepEqual(qualification.meshConvergence.requiredMultipliers, [1, 2, 4]);
assert.deepEqual(qualification.meshConvergence.rows.map((row) => row.meshMultiplier), [1, 2, 4]);
assert.ok(qualification.meshConvergence.lastPeriodChange <= 5e-3);
assert.ok(Object.values(qualification.gates).every(Boolean));

// The calculation evidence is deterministic; runtime timing is intentionally
// excluded from the qualification and point hashes.
const repeat = runRealShellStabilizationQualification();
assert.equal(repeat.qualificationHash, qualification.qualificationHash);
assert.deepEqual(
  repeat.sweep.rows.map((row) => row.solveArtifactHash),
  qualification.sweep.rows.map((row) => row.solveArtifactHash),
);

const invalidContract = buildStabilizationParameterContract({
  id: 'negative-control',
  values: [1e-7, 1e-6, 1e-6, 'invalid'],
  range: [1e-6, 1e-4],
  baseline: 1e-5,
  requiredLogSpan: 2,
});
assert.equal(invalidContract.ok, false);
assert.equal(invalidContract.gates.inRange, false);
assert.equal(invalidContract.gates.unclamped, false);
assert.equal(invalidContract.gates.uniqueEffective, false);
assert.equal(invalidContract.gates.finitePositive, false);

const blocked = runRealShellStabilizationQualification({
  alphas: [1e-7, 1e-7],
  floorRatios: [1e-9],
  meshMultipliers: [1],
});
assert.equal(blocked.status, 'blocked');
assert.equal(blocked.gates.parameterContract, false);
assert.equal(blocked.sweep.requestedPointCount, 2);
assert.equal(blocked.sweep.solveArtifactCount, 2);

// One classifier owns both dense and CSC plans.
const dense = Array.from({ length: 12 }, () => new Array(12).fill(0));
for (let component = 0; component < 3; component += 1) dense[component][component] = 100 + component;
dense[9][9] = 20; // a real supported rotation must not receive the floor
const nodes = [{ id: 'A', support: 'fixed', x: 0, y: 0, z: 0 }, { id: 'B', x: 1, y: 0, z: 0 }];
const fixedDofs = new Set([0, 1, 2, 3, 4, 5]);
const densePlan = buildUnsupportedRotationFloorPlan({ matrix: dense, nodes, fixedDofs, requestedRatio: 1e-9 });
const sparsePlan = buildUnsupportedRotationFloorPlan({ matrix: denseToCsc(dense), nodes, fixedDofs, requestedRatio: 1e-9 });
assert.equal(densePlan.canonicalPlanHash, sparsePlan.canonicalPlanHash);
assert.deepEqual(densePlan.affectedDofs, [10, 11]);
assert.ok(!densePlan.affectedDofs.includes(9));
assert.ok(densePlan.physicalRotationDofs.includes(9));

// An unconstrained rigid rotation is classified and reported, never hidden by
// the unsupported-DOF numerical floor.
const rigidMatrix = Array.from({ length: 6 }, () => new Array(6).fill(0));
for (let component = 0; component < 3; component += 1) rigidMatrix[component][component] = 10;
const rigidPlan = buildUnsupportedRotationFloorPlan({
  matrix: rigidMatrix,
  nodes: [{ id: 'R', x: 0, y: 0, z: 0 }],
  fixedDofs: new Set(),
  requestedRatio: 1e-9,
});
assert.deepEqual(rigidPlan.affectedDofs, []);
assert.deepEqual(rigidPlan.rigidMechanismComponents, [3, 4, 5]);
assert.deepEqual(rigidPlan.rejectedRigidMechanismDofs, [3, 4, 5]);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P15-M6',
  qualificationHash: qualification.qualificationHash,
  requestedPointCount: qualification.sweep.requestedPointCount,
  minimumMassWeightedMac: qualification.sensitivity.minimumMassWeightedMac,
  maximumStaticShift: qualification.sensitivity.maximumStaticShift,
  maximumPeriodShift: qualification.sensitivity.maximumPeriodShift,
  maximumStaticStabilizationEnergyRatio: qualification.sensitivity.maximumStaticStabilizationEnergyRatio,
  maximumModalStabilizationEnergyRatio: qualification.sensitivity.maximumModalStabilizationEnergyRatio,
  meshLastPeriodChange: qualification.meshConvergence.lastPeriodChange,
}, null, 2));
