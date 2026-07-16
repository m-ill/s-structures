import assert from 'node:assert/strict';
import { analysisRunRecordIntegrityHash } from '../src/core/analysisRunRecord.js';
import {
  runNonlinearAnalysisCase,
  runNonlinearAnalysisCaseAsync,
} from '../src/nonlinear/analysisRouter.js';
import { createDenseReferenceBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';
import { createHingeProperty } from '../src/nonlinear/properties/hingeRegistry.js';
import { handleBuiltInAnalysisTask } from '../src/nonlinear/runtime/analysisWorker.js';
import { WORKER_TASK_TYPES } from '../src/nonlinear/runtime/protocol.js';
import { summarizeAnalysisResult } from '../src/ui/analysisRunners.js';

const progress = [];
const commits = [];
const model = modelWithHardeningHinge();
const analysisCase = nlthCase();
const result = await handleBuiltInAnalysisTask({
  type: WORKER_TASK_TYPES.runMdofNlth,
  payload: {
    model,
    analysisCase,
    options: {
      production: false,
      includeInternal: true,
      fiberPmm: false,
      gravityCombinationId: 'GRAV',
      massSourceId: 'MS',
      groundMotionRecords: [{
        id: 'GM-X',
        values: [0, 5, 0],
        dt: 0.02,
        unit: 'm/s2',
        direction: 'x',
        baseline: 'none',
      }],
      damping: {
        type: 'rayleigh',
        coefficients: { alpha: 0.05, beta: 0.0001 },
        stiffnessPolicy: 'initial',
      },
      gravity: {
        initialStep: 0.5,
        maxStep: 0.5,
        minStep: 1e-5,
        newton: strictNewton(),
      },
      newmark: {
        outputDt: 0.02,
        initialDt: 0.02,
        minDt: 0.0003125,
        maximumSubstepLevel: 8,
        checkpointInterval: 2,
        maxIterations: 40,
        convergence: strictConvergence(),
      },
      output: {
        history: {
          chunkSize: 2,
          retainChunks: true,
          memoryBudgetBytes: 2 * 1024 * 1024,
        },
      },
    },
  },
}, {
  backend: createDenseReferenceBackend({ limit: 100 }),
  signal: new AbortController().signal,
  isCancellationRequested: () => false,
  reportProgress: (row) => progress.push(row),
  commitBoundary: (row) => commits.push(row),
});
const chunks = progress.filter((row) => row.type === 'result-chunk').map((row) => row.chunk);

assert.equal(result.ok, true, JSON.stringify(failureSummary(result), null, 2));
assert.equal(result.status, 'completed');
assert.equal(result.modelBound, true);
assert.equal(result.qualification, 'candidate');
assert.equal(result.designBlocked, true);
assert.equal(result.designTransferGuard.allowed, false);
assert.equal(result.designTransferGuard.freshness.ok, true);
assert.equal(result.integration.analysisType, 'nonlinear-time-history');
assert.equal(result.integration.ok, true, JSON.stringify({
  audits: result.integration.audits,
  endForces: result.integration.members.C.endForces,
  stationEnds: Object.fromEntries(['N', 'Vy', 'Vz', 'Tq', 'My', 'Mz'].map((key) => [
    key,
    [result.integration.members.C.stations[key][0], result.integration.members.C.stations[key].at(-1)],
  ])),
}, null, 2));
assert.equal(result.integration.audits.reducedResidual.mode, 'dynamic');
assert.equal(result.integration.audits.reducedResidual.ok, true);
assert.equal(result.integration.dependencies.canonical.identityHash, result.dependencies.canonical.identityHash);
assert.equal(result.integration.members.C.origin.originId, 'C');
assert.equal(result.integration.stories[0].responseSource, 'absolute-inertia-above-story');
assert.equal(result.historyEnvelope.outputStepCount, result.summary.outputStepCount);
assert.equal(result.historyEnvelope.complete, true);
assert.ok(result.historyEnvelope.members.C.localResistingForce.length === 12);
const storyEnvelope = Object.values(result.historyEnvelope.stories)[0];
assert.equal(storyEnvelope.responseSource, 'absolute-inertia-above-story');
assert.ok(storyEnvelope.shear[0].absoluteMaximum > 0);
assert.ok(result.dimensions.force && result.dimensions.moment && result.dimensions.displacement);
assert.equal(result.routing.fallbackUsed, false);
assert.equal(result.gravity.continuity.ok, true);
assert.equal(result.mass.sourceSnapshot.sourceId, 'MS');
assert.equal(result.groundMotion.componentCount, 1);
assert.equal(result.damping.type, 'rayleigh');
assert.equal(result.damping.stiffnessPolicy, 'initial');
assert.ok(result.summary.finalEnergy.damping > 0);
assert.equal(result.provenance.nodeCount, 2);
assert.equal(result.provenance.elementCount, 1);
assert.equal(result.provenance.physicalElementCount, 1);
assert.equal(result.provenance.reducedDofCount, 6);
assert.ok(result.provenance.modelHash);
assert.ok(result.provenance.domainHash);
assert.ok(result.provenance.massHash);
assert.ok(result.provenance.groundMotionSetHash);
assert.ok(result.runRecord.id);
assert.equal(result.runRecord.result.designTransferGuard.allowed, false);
assert.equal(result.runRecord.integrityHash, analysisRunRecordIntegrityHash(result.runRecord));
assert.equal(result.compute.route.executedTarget, 'cpu');
assert.equal(result.compute.route.fallbackUsed, false);
assert.equal(result.compute.route.solveOperation, 'cpu-f64-general');
assert.equal(result.compute.state.commitCount, result.summary.acceptedStepCount);
assert.equal(result.compute.state.checkpointCommittedHash, result.checkpoint.committedHash);
assert.equal(result.compute.transfers.length, result.history.chunkCount);
assert.equal(result.compute.qualification.gpuProductionQualified, false);
assert.equal(result.summary.completedTime, result.summary.requestedEndTime);
assert.equal(result.summary.acceptedStepCount, commits.length);
assert.equal(result.summary.outputStepCount, 3);
assert.equal(result.convergence.matrixClass, 'general');
assert.match(result.convergence.matrixClassReason, /^state-dependent-dynamic-tangent:/);
assert.equal(result.history.chunkCount, chunks.length);
assert.ok(result.history.chunkCount >= 2);
assert.ok(result.history.envelopes['elements.C.hinges[0].moment']);
assert.ok(result.history.envelopes['elements.C.hinges[0].rotation']);
assert.ok(result.history.envelopes['energies.input']);
assert.ok(progress.some((row) => row.type === 'checkpoint'));
assert.ok(progress.some((row) => row.type === 'dynamic-output-step'));
assert.ok(commits.every((row) => row.task === WORKER_TASK_TYPES.runMdofNlth));

const rows = result.history.retainedChunks.flatMap((chunk) => chunk.rows);
assert.equal(rows.length, result.summary.outputStepCount);
assert.deepEqual(rows[0].q, result.internal.gravityStateStore.committed.q);
assert.ok(Math.abs(rows[0].q[2]) > 0, 'gravity-preloaded displacement must be retained at t=0');
assert.ok(rows.some((row) => Math.abs(row.q[0] - rows[0].q[0]) > 1e-8), 'ground motion must excite the frame');
assert.ok(rows.every((row) => row.elements.C), 'member history must be retained at every output time');
const hingeRows = rows.flatMap((row) => row.elements.C.hinges);
assert.ok(hingeRows.length >= rows.length, 'concentrated hinge response must be retained');
assert.equal(Object.isFrozen(rows[1].elements.C.hinges[0]), true);
assert.throws(() => { rows[1].elements.C.hinges[0].moment = 999; }, TypeError);
assert.ok(
  hingeRows.some((hinge) => hinge.state !== 'elastic'),
  `the production frame must enter nonlinear hinge response: ${JSON.stringify(hingeRows.map((row) => ({ state: row.state, moment: row.moment, rotation: row.rotation })))}`,
);
assert.ok(result.summary.energyAudit.relativeResidual < 1e-3, JSON.stringify(result.summary.energyAudit));
assert.ok(result.checkpoint.integrityHash);
const runnerSummary = summarizeAnalysisResult('nonlinearTimeHistory', result);
assert.equal(runnerSummary.ok, true);
assert.equal(runnerSummary.outputStepCount, result.summary.outputStepCount);
assert.equal(runnerSummary.matrixClass, 'general');
assert.equal(runnerSummary.historyManifestHash, result.history.manifestHash);

const syncBlocked = runNonlinearAnalysisCase(model, analysisCase);
assert.equal(syncBlocked.reason, 'NONLINEAR_ASYNC_RUNNER_REQUIRED');
assert.equal(syncBlocked.routing.executionMode, 'async-required');
const asyncRouted = await runNonlinearAnalysisCaseAsync(model, analysisCase, {}, {
  nonlinearAdapters: {
    [analysisCase.engineId]: async () => ({
      ok: true,
      engine: { id: analysisCase.engineId },
      routing: { executedEngineId: analysisCase.engineId },
    }),
  },
});
assert.equal(asyncRouted.ok, true);
assert.equal(asyncRouted.routing.executionMode, 'async');
assert.equal(asyncRouted.routing.fallbackUsed, false);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-DYN-10', 'NL-DYN-15', 'NL-DYN-16'],
  outputStepCount: result.summary.outputStepCount,
  internalStepCount: result.summary.internalStepCount,
  rejectedStepCount: result.summary.rejectedStepCount,
  maximumSubstepLevel: result.summary.maximumSubstepLevel,
  chunkCount: result.history.chunkCount,
  commitCount: commits.length,
  finalEnergyRelativeResidual: result.summary.energyAudit.relativeResidual,
  hingeStates: [...new Set(hingeRows.map((row) => row.state))],
  runRecordId: result.runRecord.id,
  residentCommitCount: result.compute.state.commitCount,
  residentAuditCount: result.compute.auditCount,
  residentTransferCount: result.compute.transferCount,
  residentTransferBytes: result.compute.transferBytes,
  residentSessionHash: result.compute.sessionHash,
  solveOperation: result.compute.route.solveOperation,
}, null, 2));

function modelWithHardeningHinge() {
  const property = hardeningHingeProperty();
  return {
    schemaVersion: 5,
    nodes: [
      { id: 'B', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'T', x: 0, y: 0, z: 3, mass: [1, 1, 1, 0, 0, 0] },
    ],
    members: [{
      id: 'C',
      type: 'frame',
      behavior: 'frame',
      n1: 'B',
      n2: 'T',
      matId: 'MAT',
      secId: 'COL',
      localAxis: { refVector: [1, 0, 0], roll: 0, strongAxis: 'z' },
      nonlinear: {
        formulation: 'concentrated-plasticity',
        hinges: [{
          id: 'C:i:z',
          memberId: 'C',
          end: 'i',
          axis: 'z',
          propertyId: property.id,
          source: { mode: 'user' },
        }],
      },
    }],
    materials: [{ id: 'MAT', E: 2e8, G: 7.7e7, density: 0 }],
    sections: [{ id: 'COL', A: 0.03, Iy: 2e-4, Iz: 2e-4, J: 5e-5, Zy: 0.002, Zz: 0.002 }],
    loads: [{ id: 'G', type: 'nodal', node: 'T', P: 5, direction: [0, 0, -1], case: 'D' }],
    loadCases: [{ id: 'D', type: 'dead', name: 'Dead' }],
    loadCombinations: [{ id: 'GRAV', type: 'service', purpose: 'gravity-preload', factors: { D: 1 } }],
    massSources: [{ id: 'MS', version: 1, includeNodeMass: true, includeMemberMass: false, combos: [] }],
    hingeProperties: [property],
    nonlinearMaterials: [],
    nonlinearSections: [],
    linkProperties: [],
    timeHistoryFunctions: [],
    analysisStates: [],
    analysisSettings: { includeSelfWeight: false },
  };
}

function hardeningHingeProperty() {
  const side = [
    { id: 'A', rotation: 0, moment: 0 },
    { id: 'B', rotation: 0.0004, moment: 0.45 },
    { id: 'C', rotation: 0.012, moment: 0.55 },
    { id: 'D', rotation: 0.035, moment: 0.65 },
    { id: 'E', rotation: 0.07, moment: 0.75 },
  ];
  return createHingeProperty({
    id: 'HP-C-Z',
    qualification: 'candidate',
    units: { rotation: 'rad', moment: 'kN-m', length: 'm' },
    parameters: {
      positive: side,
      negative: side,
      hingeLength: 0.2,
      hysteresis: { rule: 'kinematic-masing' },
      regularization: { tangentPolicy: 'diagnostic-only' },
      integration: { maxRotationIncrement: 0.0001, maxSubsteps: 4096 },
    },
    source: { type: 'closed-form-test', reference: 'P8-M8-hardening-cantilever' },
  });
}

function nlthCase() {
  return {
    id: 'NLTH-COLUMN',
    kind: 'nonlinearTimeHistory',
    engineId: 'p8-production-mdof-nlth',
    inputRefs: { gravityCombinationId: 'GRAV', massSourceId: 'MS' },
    initialState: { policy: 'zero' },
  };
}

function strictNewton() {
  return {
    maxIterations: 40,
    lineSearch: true,
    pivotTolerance: 1e-14,
    linearRelativeTolerance: 1e-11,
    convergence: strictConvergence(),
  };
}

function strictConvergence() {
  return {
    forceAbsolute: 1e-7,
    forceRelative: 1e-7,
    momentAbsolute: 1e-7,
    momentRelative: 1e-7,
    displacementAbsolute: 1e-9,
    displacementRelative: 1e-7,
    rotationAbsolute: 1e-9,
    rotationRelative: 1e-7,
    energyAbsolute: 1e-10,
    energyRelative: 1e-7,
  };
}

function failureSummary(value) {
  return {
    reason: value.reason,
    status: value.status,
    message: value.message,
    dynamicReason: value.details?.reason,
    dynamicStatus: value.details?.status,
    dynamicEndTime: value.details?.endTime,
    rejectedSteps: value.details?.rejectedSteps?.slice(-4),
    details: value.details?.details,
  };
}
