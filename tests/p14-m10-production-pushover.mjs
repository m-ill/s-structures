import assert from 'node:assert/strict';
import {
  auditPushoverRollback,
  buildPushoverQualificationReport,
  compareNeutralControlStrategies,
  createNeutralMomentHingeFixture,
  runProductionPushover,
} from '../src/index.js';
import { createDenseReferenceBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';

const fixture = createNeutralMomentHingeFixture();
const comparison = compareNeutralControlStrategies(fixture, [0, 0.0025, 0.005, 0.02, 0.04, 0.06]);
assert.equal(comparison.strategies.length, 3);
assert.equal(comparison.maximumPathDifference, 0);
assert.equal(comparison.postPeakIncluded, true);
assert.equal(comparison.energy.passed, true);

const model = cantileverModel();
const loadResult = await runProductionPushover(model, pushoverCase('P14-M10-LOAD', 'load'), commonOptions({
  controlStrategy: 'load', targetLambda: 1, initialLoadIncrement: 0.25,
}));
assert.equal(loadResult.ok, true, JSON.stringify({ reason: loadResult.reason, details: loadResult.details }, null, 2));
assert.equal(loadResult.termination.reason, 'LOAD_TARGET_REACHED');
assert.equal(loadResult.control.strategy, 'load');
assert.equal(loadResult.capability.executedControl, 'load');
assert.equal(loadResult.arcLengthHandoff.sourceControl, 'load-control');
assert.equal(loadResult.internal.handoffCheckpoint.committedHash, loadResult.internal.stateStore.committedHash);
const loadFinal = loadResult.steps.at(-1);

const displacementResult = await runProductionPushover(model, pushoverCase('P14-M10-DISP', 'displacement', loadFinal.controlDisplacement), commonOptions({
  controlStrategy: 'displacement', targetDisplacement: loadFinal.controlDisplacement, steps: 4,
}));
assert.equal(displacementResult.ok, true, JSON.stringify({ reason: displacementResult.reason, details: displacementResult.details }, null, 2));
const displacementFinal = displacementResult.steps.at(-1);
close(displacementFinal.controlDisplacement, loadFinal.controlDisplacement, 1e-9, 'control path parity');
close(displacementFinal.baseShear, loadFinal.baseShear, 1e-6, 'base-shear path parity');

const rollbackAudit = auditPushoverRollback(displacementResult.internal.stateStore ? {
  rejectedSteps: displacementResult.control.rejectedSteps,
  stateStore: displacementResult.internal.stateStore,
} : {});
assert.equal(rollbackAudit.status, 'pass');
const report = buildPushoverQualificationReport({ result: loadResult, fixtureComparison: comparison, rollbackAudit });
assert.equal(report.productionRun.controlStrategy, 'load');
assert.equal(report.benchmarkExecutionStarted, false);
assert.equal(report.designTransferAllowed, false);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P14-M10',
  loadSteps: loadResult.summary.stepCount,
  displacementSteps: displacementResult.summary.stepCount,
  finalBaseShear: loadFinal.baseShear,
  finalDisplacement: loadFinal.controlDisplacement,
  pathDifference: Math.abs(displacementFinal.baseShear - loadFinal.baseShear),
  fixtureComparisonHash: comparison.comparisonHash,
  rollbackAuditHash: rollbackAudit.auditHash,
}, null, 2));

function cantileverModel() {
  return {
    schemaVersion: 5,
    nodes: [{ id: 'B', x: 0, y: 0, z: 0, support: 'fixed' }, { id: 'T', x: 0, y: 0, z: 3 }],
    members: [{ id: 'C', type: 'frame', behavior: 'frame', n1: 'B', n2: 'T', matId: 'MAT', secId: 'SEC', localAxis: { refVector: [1, 0, 0], roll: 0, strongAxis: 'z' } }],
    materials: [{ id: 'MAT', E: 2e8, G: 7.7e7, density: 0 }],
    sections: [{ id: 'SEC', A: 0.03, Iy: 2e-4, Iz: 2e-4, J: 5e-5, Zy: 0.002, Zz: 0.002 }],
    loads: [{ id: 'G', type: 'nodal', node: 'T', P: 10, direction: [0, 0, -1], case: 'D' }],
    loadCases: [{ id: 'D', type: 'dead', name: 'Dead' }],
    loadCombinations: [{ id: 'GRAV', type: 'service', purpose: 'gravity-preload', factors: { D: 1 } }],
    hingeProperties: [], nonlinearMaterials: [], nonlinearSections: [], linkProperties: [], timeHistoryFunctions: [], analysisStates: [],
    analysisSettings: { includeSelfWeight: false },
  };
}
function pushoverCase(id, type, targetDisplacement = null) { return { id, kind: 'pushover', engineId: 'p8-production-mdof-pushover', inputRefs: { gravityCombinationId: 'GRAV' }, initialState: { policy: 'zero' }, control: { type, nodeId: 'T', direction: '+x', ...(targetDisplacement == null ? {} : { targetDisplacement }) } }; }
function commonOptions(extra = {}) { return { backend: createDenseReferenceBackend({ limit: 300 }), production: false, includeInternal: true, fiberPmm: false, gravityCombinationId: 'GRAV', controlNodeId: 'T', direction: '+x', pattern: 'uniform', referenceBaseShear: 10, minIncrement: 1e-6, eventAware: false, gravity: { initialStep: 0.5, maxStep: 0.5, newton: strictNewton() }, newton: strictNewton(), ...extra }; }
function strictNewton() { return { maxIterations: 30, lineSearch: true, pivotTolerance: 1e-14, linearRelativeTolerance: 1e-10, convergence: { forceAbsolute: 1e-7, forceRelative: 1e-7, momentAbsolute: 1e-7, momentRelative: 1e-7, displacementAbsolute: 1e-10, displacementRelative: 1e-8, rotationAbsolute: 1e-10, rotationRelative: 1e-8, energyAbsolute: 1e-10, energyRelative: 1e-8 } }; }
function close(actual, expected, tolerance, label) { assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`); }
