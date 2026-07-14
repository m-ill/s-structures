import assert from 'node:assert/strict';
import { createDenseReferenceBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';
import { runProductionPushover } from '../src/nonlinear/pushover/productionPushover.js';

const model = {
  schemaVersion: 5,
  nodes: [
    { id: 'B', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'T', x: 0, y: 0, z: 3 },
  ],
  members: [{
    id: 'C', type: 'frame', behavior: 'frame', n1: 'B', n2: 'T', matId: 'MAT', secId: 'SEC',
    localAxis: { refVector: [1, 0, 0], roll: 0, strongAxis: 'z' },
  }],
  materials: [{ id: 'MAT', E: 2e8, G: 7.7e7, density: 0 }],
  sections: [{ id: 'SEC', A: 0.03, Iy: 2e-4, Iz: 2e-4, J: 5e-5, Zy: 0.002, Zz: 0.002 }],
  loads: [{ id: 'G', type: 'nodal', node: 'T', P: 10, direction: [0, 0, -1], case: 'D' }],
  loadCases: [{ id: 'D', type: 'dead', name: 'Dead' }],
  loadCombinations: [{ id: 'GRAV', type: 'service', purpose: 'gravity-preload', factors: { D: 1 } }],
  hingeProperties: [],
  nonlinearMaterials: [],
  nonlinearSections: [],
  linkProperties: [],
  timeHistoryFunctions: [],
  analysisStates: [],
  analysisSettings: { includeSelfWeight: false },
};

const analysisCase = {
  id: 'P8-M7-PRODUCTION-ARC',
  kind: 'pushover',
  engineId: 'p8-production-mdof-pushover',
  inputRefs: { gravityCombinationId: 'GRAV' },
  initialState: { policy: 'zero' },
  control: { type: 'displacement', nodeId: 'T', direction: '+x', targetDisplacement: 0.001 },
};

const result = await runProductionPushover(model, analysisCase, {
  backend: createDenseReferenceBackend({ limit: 300 }),
  production: false,
  includeInternal: true,
  fiberPmm: false,
  gravityCombinationId: 'GRAV',
  controlNodeId: 'T',
  direction: '+x',
  pattern: 'uniform',
  referenceBaseShear: 10,
  targetDisplacement: 0.001,
  steps: 4,
  minIncrement: 1e-6,
  eventAware: false,
  gravity: {
    initialStep: 0.5,
    maxStep: 0.5,
    newton: strictNewton(),
    equilibriumAbsolute: 1e-6,
    equilibriumRelative: 1e-7,
  },
  newton: strictNewton(),
  arcLength: {
    enabled: true,
    steps: 3,
    minRadius: 1e-8,
    maxIterations: 30,
    convergence: strictNewton().convergence,
  },
});

assert.equal(result.ok, true, JSON.stringify({ reason: result.reason, termination: result.termination, arcLength: result.arcLength, details: result.details }, null, 2));
assert.equal(result.termination.category, 'arc-length');
assert.equal(result.arcLength.status, 'converged');
assert.equal(result.arcLength.acceptedStepCount, 3);
assert.equal(result.arcLength.reason, 'ARC_LENGTH_STEPS_COMPLETED');
assert.equal(result.arcLengthHandoff.status, 'consumed');
assert.ok(result.arcLengthHandoff.sourceIncrement?.incrementHash);
assert.equal(result.internal.stateStore.committedHash, result.internal.arcLengthRestartCheckpoint.committedHash);
assert.ok(result.steps.length >= 8, 'origin + displacement-control + arc-length rows must be recovered');
assert.ok(result.steps.slice(-3).every((row) => row.forceResidualNorm < 1e-6));
assert.ok(result.steps.slice(0, -1).every((row) => row.integrationRef && !row.integration));
assert.equal(result.steps.at(-1).integration.integrationHash, result.integration.integrationHash);
assert.equal(result.routing.fallbackUsed, false);
assert.equal(result.integration.analysisType, 'pushover');
assert.equal(result.integration.ok, true, JSON.stringify(result.integration.audits, null, 2));
assert.equal(result.integration.audits.reducedResidual.mode, 'static');
assert.equal(result.integration.dependencies.canonical.identityHash, result.dependencies.canonical.identityHash);
assert.equal(result.designTransferGuard.allowed, false);
assert.equal(result.designTransferGuard.freshness.ok, true);
assert.ok(result.runRecord.id);
assert.equal(result.runRecord.result.designTransferGuard.allowed, false);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-ARC-10'],
  displacementStepCount: result.control.acceptedStepCount,
  arcStepCount: result.arcLength.acceptedStepCount,
  finalLambda: result.arcLength.finalLambda,
  handoffStatus: result.arcLengthHandoff.status,
  restartCheckpointHash: result.arcLength.restartCheckpointHash,
}, null, 2));

function strictNewton() {
  return {
    maxIterations: 30,
    lineSearch: true,
    pivotTolerance: 1e-14,
    linearRelativeTolerance: 1e-10,
    controlAbsolute: 1e-9,
    controlRelative: 1e-8,
    convergence: {
      forceAbsolute: 1e-7,
      forceRelative: 1e-7,
      momentAbsolute: 1e-7,
      momentRelative: 1e-7,
      displacementAbsolute: 1e-10,
      displacementRelative: 1e-8,
      rotationAbsolute: 1e-10,
      rotationRelative: 1e-8,
      energyAbsolute: 1e-10,
      energyRelative: 1e-8,
    },
  };
}
