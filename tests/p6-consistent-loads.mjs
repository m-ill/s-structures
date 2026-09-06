import assert from 'node:assert/strict';
import {
  analyzeModel,
  buildFixedEndLoad,
  createModel,
  expandAdvancedLoads,
  FIXED_END_LOAD_VERSION,
  springSettlementLoad,
} from '../src/index.js';

const EPS = 1e-8;

const localAx = {
  L: 6,
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

const udl = buildFixedEndLoad({ id: 'U1', type: 'udl', member: 'M1', w: 10, dir: '-z', case: 'D' }, localAx);
assert.equal(udl.contractVersion, FIXED_END_LOAD_VERSION);
close(udl.fe[2] + udl.fe[8], -60, EPS, 'UDL equivalent vertical load');
close(udl.q0[2], 30, EPS, 'UDL i shear fixed-end force');
close(udl.q0[8], 30, EPS, 'UDL j shear fixed-end force');
close(udl.q0[4], -30, EPS, 'UDL i fixed-end moment');
close(udl.q0[10], 30, EPS, 'UDL j fixed-end moment');
assert.equal(udl.method, 'consistent-uniform-udl');

const trapAx = { ...localAx, L: 5 };
const trapezoid = buildFixedEndLoad({
  id: 'T1',
  type: 'trapezoid',
  member: 'M1',
  w1: 4,
  w2: 10,
  from: 0,
  to: 1,
  dir: '-z',
  case: 'D',
}, trapAx);
close(trapezoid.fe[2], -14.5, EPS, 'trapezoid i equivalent shear');
close(trapezoid.fe[8], -20.5, EPS, 'trapezoid j equivalent shear');
close(trapezoid.fe[4], 13.333333333333332, EPS, 'trapezoid i equivalent moment');
close(trapezoid.fe[10], -15.833333333333334, EPS, 'trapezoid j equivalent moment');
close(trapezoid.handcalc.totalLoad, 35, EPS, 'trapezoid total load');

const partialModel = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 4, y: 0, z: 0, support: 'fixed' },
  ],
  members: [{ id: 'M1', n1: 'A', n2: 'B', matId: 'steel', secId: 'h300' }],
  loads: [{ id: 'PUDL', type: 'udl-partial', member: 'M1', w: 10, dir: '-z', from: 0.25, to: 0.75, case: 'D' }],
});

const coarse = expandAdvancedLoads(partialModel.loads, partialModel, { segments: 2 });
const fine = expandAdvancedLoads(partialModel.loads, partialModel, { segments: 32 });
assert.equal(coarse.loads.length, 2, 'legacy compatibility expansion honors requested coarse segments');
assert.equal(fine.loads.length, 32, 'legacy compatibility expansion honors requested fine segments');
assert.equal(coarse.solverLoads.length, 1, 'solver uses one exact partial load');
assert.equal(fine.solverLoads.length, 1, 'solver load count is segment independent');
assert.equal(coarse.trace.consistentLoads.length, 1);
assert.equal(coarse.trace.contract.phase6.milestone, 'P6-M2');
closeVec(coarse.trace.consistentLoads[0].q0, fine.trace.consistentLoads[0].q0, EPS, 'partial fixed-end vector is segment independent');

const partialAnalysis = analyzeModel(partialModel);
assert.equal(partialAnalysis.ok, true);
const partialResult = partialAnalysis.byCombo.SLS1;
close(partialResult.summary.totalLoad[2], -20, EPS, 'partial total vertical load');
close(partialResult.summary.totalReaction[2], 20, EPS, 'partial total vertical reaction');
assert.ok(partialResult.memberResults.M1.xs.some((x) => Math.abs(x - 1) < 1e-6), 'partial recovery includes load start station');
assert.ok(partialResult.memberResults.M1.xs.some((x) => Math.abs(x - 3) < 1e-6), 'partial recovery includes load end station');
assert.ok(partialResult.memberResults.M1.dmaxM > 0, 'partial fixed-end deformation is recovered');
assert.equal(partialResult.memberResults.M1.fixedEndLoads[0].method, 'consistent-partial-udl');

const trapModel = createModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 5, y: 0, z: 0, support: 'fixed' },
  ],
  members: [{ id: 'M1', n1: 'A', n2: 'B', matId: 'steel', secId: 'h300' }],
  loads: [{ id: 'TRAP', type: 'trapezoid', member: 'M1', w1: 4, w2: 10, dir: '-z', from: 0, to: 1, case: 'D' }],
});
const trapAnalysis = analyzeModel(trapModel);
assert.equal(trapAnalysis.ok, true);
const trapResult = trapAnalysis.byCombo.SLS1;
close(trapResult.summary.totalLoad[2], -35, EPS, 'trapezoid total vertical load');
close(trapResult.summary.totalReaction[2], 35, EPS, 'trapezoid total vertical reaction');
assert.equal(trapResult.memberResults.M1.fixedEndLoads[0].method, 'consistent-trapezoid-load');
assert.ok(trapResult.memberResults.M1.Mz.every(Number.isFinite), 'trapezoid station moments are finite');

const settlement = springSettlementLoad({ id: 'S1', spring: { kz: 1000 }, settlement: { uz: -0.01 } });
assert.equal(settlement.ok, true);
close(settlement.fe[2], -10, EPS, 'spring settlement equivalent load');
close(settlement.q0[2], 10, EPS, 'spring settlement resisting force');

console.log(JSON.stringify({
  ok: true,
  version: 'p6-m2-consistent-loads',
  partialTotalLoad: partialResult.summary.totalLoad[2],
  trapezoidTotalLoad: trapResult.summary.totalLoad[2],
  consistentLoadRows: coarse.trace.consistentLoads.length + trapAnalysis.byCombo.SLS1.elasticExpansion.consistentLoads.length,
}, null, 2));

function close(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}, diff ${Math.abs(actual - expected)}, tol ${tolerance}`,
  );
}

function closeVec(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label}: length mismatch`);
  for (let i = 0; i < actual.length; i += 1) close(actual[i], expected[i], tolerance, `${label}[${i}]`);
}
