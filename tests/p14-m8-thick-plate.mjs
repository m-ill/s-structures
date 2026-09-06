import assert from 'node:assert/strict';
import {
  buildPlateWorkflowReport,
  createRectangularPlateMesh,
  qualifyThickPlateRun,
  runThickPlateSweep,
  solveRectangularPlate,
} from '../src/index.js';

const base = { E: 30e9, nu: 0.3, density: 0 };
const sweep = runThickPlateSweep({
  geometry: { width: 4, height: 4, nx: 6, ny: 6 },
  properties: base,
  load: { pressure: 10e3 },
  options: { support: 'simply-supported' },
  cases: [
    { id: 'R5', t: 0.8 },
    { id: 'R10', t: 0.4 },
    { id: 'R20', t: 0.2 },
    { id: 'R50', t: 0.08 },
  ],
});
assert.equal(sweep.rows.length, 4);
assert.equal(sweep.trends.shearFractionNonIncreasing, true);
for (const row of sweep.rows) {
  assert.notEqual(row.status, 'blocked');
  assert.ok(row.qualification.energy.bending >= 0);
  assert.ok(row.qualification.energy.transverseShear >= 0);
  assert.ok(row.qualification.energy.componentResidual < 1e-9);
  assert.equal(row.qualification.benchmarkExecuted, false);
  assert.equal(row.qualification.designTransferAllowed, false);
}
assert.ok(sweep.rows[0].shearEnergyFraction > sweep.rows.at(-1).shearEnergyFraction);
assert.ok(Math.abs(sweep.rows.at(-1).coefficient - 0.00406) / 0.00406 < 0.05);

const mesh = createRectangularPlateMesh({ width: 4, height: 4, nx: 6, ny: 6 });
const softShear = solveRectangularPlate(mesh, { ...base, t: 0.4, shearFactor: 0.5 }, { pressure: 10e3 }, { support: 'simply-supported' });
const stiffShear = solveRectangularPlate(mesh, { ...base, t: 0.4, shearFactor: 1 }, { pressure: 10e3 }, { support: 'simply-supported' });
assert.ok(softShear.center.w > stiffShear.center.w);
const qualified = qualifyThickPlateRun(mesh, stiffShear, { ...base, t: 0.4, shearFactor: 1 });
assert.equal(qualified.constitutive.shearCorrectionFactor, 1);
const report = buildPlateWorkflowReport({ mesh, run: stiffShear, qualification: qualified });
assert.equal(report.qualification.qualificationHash, qualified.qualificationHash);

const tooCoarse = createRectangularPlateMesh({ width: 4, height: 4, nx: 1, ny: 1 });
const tooCoarseRun = solveRectangularPlate(tooCoarse, { ...base, t: 0.4 }, { pressure: 10e3 }, { support: 'clamped' });
const tooCoarseQualification = qualifyThickPlateRun(tooCoarse, tooCoarseRun, { ...base, t: 0.4 });
assert.equal(tooCoarseQualification.status, 'blocked');
assert.ok(tooCoarseQualification.blockers.includes('SHELL_THICK_PLATE_MESH_TOO_COARSE'));
const outside = qualifyThickPlateRun(mesh, solveRectangularPlate(mesh, { ...base, t: 0.01 }, { pressure: 10e3 }, { support: 'clamped' }), { ...base, t: 0.01 });
assert.equal(outside.status, 'blocked');
assert.ok(outside.blockers.includes('SHELL_THICKNESS_RATIO_OUTSIDE_HARD_ENVELOPE'));

console.log(JSON.stringify({
  ok: true,
  milestone: 'P14-M8',
  coefficients: sweep.rows.map((row) => row.coefficient),
  shearEnergyFractions: sweep.rows.map((row) => row.shearEnergyFraction),
  shearFactorDisplacementRatio: softShear.center.w / stiffShear.center.w,
  outsideStatus: outside.status,
}, null, 2));
