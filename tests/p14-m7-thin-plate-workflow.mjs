import assert from 'node:assert/strict';
import {
  buildPlateWorkflowReport,
  buildPlateBoundaryTemplate,
  comparePlateMeshLevels,
  createRectangularPlateMesh,
  solveRectangularPlate,
} from '../src/index.js';

const properties = { E: 30e9, nu: 0.3, t: 0.05, density: 0 };
const meshes = [2, 4, 6].map((n, index) => createRectangularPlateMesh({ id: `SQ-${n}`, width: 4, height: 4, nx: n, ny: n, level: index + 1 }));
const runs = meshes.map((mesh) => solveRectangularPlate(mesh, properties, { pressure: 10e3 }, { support: 'simply-supported', energyTolerance: 1e-8 }));
for (let index = 0; index < runs.length; index += 1) {
  const run = runs[index];
  close(run.load.totalTransverseLoad, 160e3, 1e-8, 'pressure resultant');
  close(run.load.expectedPressureResultant, 160e3, 1e-8, 'expected pressure resultant');
  assert.ok(run.center.w > 0);
  assert.ok(Number.isFinite(run.center.moment.Mx));
  assert.ok(Number.isFinite(run.center.shear.Qx));
  assert.ok(Number.isFinite(run.dimensionlessCoefficient));
  assert.equal(run.energy.passed, true);
  assert.equal(run.factorization.disposed, true);
  assert.equal(run.benchmarkExecuted, false);
}
const comparison = comparePlateMeshLevels(runs.map((run, index) => ({
  meshHash: run.meshHash,
  level: index + 1,
  elementCount: meshes[index].elements.length,
  centerW: run.center.w,
  coefficient: run.dimensionlessCoefficient,
})), { tolerance: 0.2 });
assert.equal(comparison.convergenceAvailable, true);
assert.equal(comparison.converged, true);
const report = buildPlateWorkflowReport({ mesh: meshes.at(-1), run: runs.at(-1), comparison });
assert.equal(report.available, true);
assert.equal(report.analysis.runHash, runs.at(-1).runHash);
assert.equal(report.analysis.factorizationDisposed, true);
assert.equal(report.benchmarkExecutionStarted, false);
assert.equal(report.designTransferAllowed, false);

const clamped = solveRectangularPlate(meshes[1], properties, { pressure: 10e3 }, { support: 'clamped' });
assert.ok(clamped.center.w < runs[1].center.w);
const simpleBoundary = buildPlateBoundaryTemplate(meshes[1], 'simply-supported');
const clampedBoundary = buildPlateBoundaryTemplate(meshes[1], 'clamped');
assert.equal(clampedBoundary.constrainedDofs.length, simpleBoundary.constrainedDofs.length * 3);
assert.ok(Object.values(clampedBoundary.preview).filter((row) => row.length).every((row) => row.length === 3));

const point = solveRectangularPlate(meshes[1], properties, { pointLoad: 100 }, { support: 'simply-supported' });
close(point.load.totalTransverseLoad, 100, 1e-12, 'point-load resultant');
assert.equal(point.load.pointTrace.method, 'exact-center-node');
assert.deepEqual(point.load.pointTrace.weights, [1]);

const oddMesh = createRectangularPlateMesh({ width: 4, height: 4, nx: 3, ny: 3 });
const oddPoint = solveRectangularPlate(oddMesh, properties, { pointLoad: 100 }, { support: 'clamped' });
close(oddPoint.load.pointTrace.weights.reduce((sum, value) => sum + value, 0), 1, 1e-12, 'isoparametric point weights');
close(oddPoint.load.totalTransverseLoad, 100, 1e-12, 'odd-mesh point resultant');

const elongated = createRectangularPlateMesh({ width: 5, height: 1, nx: 10, ny: 2 });
const elongatedRun = solveRectangularPlate(elongated, { ...properties, t: 0.02 }, { pressure: 1e3 }, { support: 'clamped' });
assert.ok(Number.isFinite(elongatedRun.center.w));
assert.ok(elongated.geometry.maxAspectRatio <= 1.0000000001);

assert.throws(() => buildPlateBoundaryTemplate(meshes[0], 'invented'), (error) => error.code === 'SHELL_PLATE_BOUNDARY_INVALID');
assert.throws(() => solveRectangularPlate(meshes[0], properties, { pointLoad: Number.NaN }), (error) => error.code === 'SHELL_POINT_LOAD_INVALID');

console.log(JSON.stringify({
  ok: true,
  milestone: 'P14-M7',
  centerDisplacements: runs.map((run) => run.center.w),
  simplySupportedCoefficient: runs.at(-1).dimensionlessCoefficient,
  clampedRatio: clamped.center.w / runs[1].center.w,
  pressureResultant: runs[0].load.totalTransverseLoad,
}, null, 2));

function close(actual, expected, tolerance, label) { assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`); }
