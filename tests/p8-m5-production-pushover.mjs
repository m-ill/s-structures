import assert from 'node:assert/strict';
import { analyzeAll } from '../src/solver/linear3d.js';
import { createDenseReferenceBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';
import { createHingeProperty } from '../src/nonlinear/properties/hingeRegistry.js';
import {
  buildProductionPushoverCompatibilityView,
  runProductionPushover,
} from '../src/nonlinear/pushover/productionPushover.js';

const elastic = await verifyElasticPortal();
const hinged = await verifyHingedPortalMechanism();
const multistory = await verifyMultistoryFrame();
const termination = verifyTerminationClasses(elastic.result, hinged.result);

console.log(JSON.stringify({
  ok: true,
  verificationIds: [
    'NL-PUSH-02', 'NL-PUSH-03', 'NL-PUSH-04', 'NL-PUSH-05', 'NL-PUSH-06',
    'NL-PUSH-07', 'NL-PUSH-08', 'NL-PUSH-09', 'NL-PUSH-10', 'NL-PUSH-11',
    'NL-PUSH-12', 'NL-PUSH-13', 'NL-PUSH-14',
  ],
  elasticSteps: elastic.result.summary.stepCount,
  elasticBaseShearResidual: elastic.maxBaseShearResidual,
  firstYieldStep: hinged.result.firstYield?.step ?? null,
  mechanismStep: hinged.result.mechanism?.step ?? null,
  multistoryLinearSlopeError: multistory.slopeError,
  terminationCategories: termination,
  provenanceComplete: true,
}, null, 2));

async function verifyElasticPortal() {
  const model = portalModel({ hinged: false });
  const result = await runProductionPushover(model, pushoverCase('PUSH-ELASTIC', 0.006), runOptions({
    pattern: 'triangular', referenceBaseShear: 20, steps: 4,
  }));
  assert.equal(result.ok, true, JSON.stringify({
    reason: result.reason,
    termination: result.termination,
    control: result.control,
    gravity: result.gravity?.continuity,
    details: result.details,
  }, null, 2));
  assert.equal(result.termination.reason, 'TARGET_REACHED');
  assert.ok(result.steps.length >= 2);
  assert.equal(result.steps[0].baseShear, 0);
  assert.ok(result.steps.every((row) => row.accepted && row.convergence?.control?.pass !== false));
  assert.ok(result.steps.every((row) => row.audit?.ok !== false), JSON.stringify(
    result.steps.filter((row) => row.audit?.ok === false).map((row) => ({ step: row.step, audit: row.audit })),
    null,
    2,
  ));
  assert.ok(result.steps.every((row) => row.forceResidualNorm <= 1e-5));
  const maxBaseShearResidual = Math.max(...result.steps.map((row) => row.baseShearRelativeResidual));
  assert.ok(maxBaseShearResidual < 1e-7, `base-shear closure ${maxBaseShearResidual}`);
  assert.ok(result.steps.at(-1).stories.length >= 1);
  assert.ok(Object.keys(result.steps.at(-1).members).length === 3);
  assert.equal(result.provenance.fallbackUsed, false);
  for (const key of [
    'domainHashes', 'gravityRunRecordId', 'gravityCheckpointHash', 'loadSetHash',
    'lateralPatternHash', 'controlCoordinateHash', 'solver', 'backend',
  ]) assert.ok(result.provenance[key], `missing provenance ${key}`);
  const compatibility = buildProductionPushoverCompatibilityView(result);
  assert.equal(compatibility.legacySecantUsed, false);
  assert.deepEqual(compatibility.curve, result.curve);
  assert.equal(compatibility.summary.stepCount, result.summary.stepCount);
  return { result, maxBaseShearResidual };
}

async function verifyHingedPortalMechanism() {
  const model = portalModel({ hinged: true });
  const mechanismHingeIds = ['C1:i:z', 'C1:j:z', 'C2:i:z', 'C2:j:z'];
  let result = await runProductionPushover(model, pushoverCase('PUSH-HINGED', 0.04), runOptions({
    pattern: 'uniform', referenceBaseShear: 10, steps: 16,
    mechanismHingeIds,
    stopAtPostPeak: false,
    eventLocalizationTolerance: 0.00025,
  }));
  if (!result.ok || !result.firstYield) {
    throw new Error(`Hinged portal failed: ${JSON.stringify({ reason: result.reason, termination: result.termination, warnings: result.warnings, details: result.details }, null, 2)}`);
  }
  assert.ok(result.firstYield.step > 0);
  assert.ok(result.events.some((event) => event.type === 'hinge-yield'));
  assert.ok(result.steps.some((row) => row.hinges.some((hinge) => hinge.state === 'yielded' || hinge.state === 'capping')));
  assert.equal(result.termination.reason, 'MECHANISM_DETECTED');
  assert.ok(result.mechanism);
  assert.deepEqual(new Set(result.mechanism.hingeIds), new Set(mechanismHingeIds));
  assert.ok(result.summary.rejectedStepCount > 0, 'hinge events should trigger localization cutbacks');
  assert.equal(result.arcLengthHandoff.sourceControl, 'augmented-displacement-control');
  return { result };
}

async function verifyMultistoryFrame() {
  const model = twoStoryFrame();
  const target = 0.003;
  const referenceBaseShear = 15;
  const result = await runProductionPushover(model, pushoverCase('PUSH-2ST', target), runOptions({
    pattern: 'triangular', referenceBaseShear, steps: 4,
  }));
  assert.equal(result.ok, true, JSON.stringify({ reason: result.reason, termination: result.termination, control: result.control }, null, 2));
  assert.equal(result.steps.at(-1).stories.length, 2);
  const lateralLoads = result.internal.loadSet.lateral.loads;
  const independent = analyzeAll(model, { D: 1 }, { extraLoads: lateralLoads });
  assert.equal(independent.ok, true, independent.reason);
  const topNodes = model.nodes.filter((node) => node.z === 6);
  const referenceRoof = topNodes.reduce((sum, node) => sum + Number(independent.disp[node.id][0]), 0) / topNodes.length;
  const expectedSlope = referenceBaseShear / referenceRoof;
  const last = result.steps.at(-1);
  const actualSlope = last.baseShear / last.roofDisplacement;
  const slopeError = Math.abs(actualSlope - expectedSlope) / Math.max(1, Math.abs(expectedSlope));
  assert.ok(slopeError < 0.02, `multistory linear capacity slope error ${slopeError}`);
  assert.ok(result.steps.every((row) => row.step === 0 || row.stepHash));
  return { result, slopeError };
}

function verifyTerminationClasses(targetResult, mechanismResult) {
  assert.equal(targetResult.termination.category, 'target');
  assert.equal(mechanismResult.termination.category, 'mechanism');
  const handoff = mechanismResult.arcLengthHandoff;
  assert.ok(handoff.handoffHash);
  assert.equal(handoff.targetEngine, 'p8-m7-arc-length');
  assert.equal(handoff.checkpointRef, mechanismResult.internal.handoffCheckpoint.integrityHash);
  assert.deepEqual(handoff.committedState.q, mechanismResult.internal.handoffCheckpoint.committed.q);
  assert.equal(handoff.committedState.lambda, mechanismResult.internal.handoffCheckpoint.committed.lambda);
  return [targetResult.termination.category, mechanismResult.termination.category];
}

function portalModel({ hinged }) {
  const hingeProperty = createTestHingeProperty();
  const column = (id, n1, n2) => ({
    id, type: 'frame', behavior: 'frame', n1, n2, matId: 'MAT', secId: 'COL',
    localAxis: { refVector: [1, 0, 0], roll: 0, strongAxis: 'z' },
    ...(hinged ? { nonlinear: {
      formulation: 'concentrated-plasticity',
      hinges: [
        assignment(`${id}:i:z`, id, 'i', 'z', hingeProperty.id),
        assignment(`${id}:j:z`, id, 'j', 'z', hingeProperty.id),
      ],
    } } : {}),
  });
  return {
    schemaVersion: 5,
    nodes: [
      { id: 'B1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'B2', x: 4, y: 0, z: 0, support: 'fixed' },
      { id: 'T1', x: 0, y: 0, z: 3 },
      { id: 'T2', x: 4, y: 0, z: 3 },
    ],
    members: [
      column('C1', 'B1', 'T1'),
      column('C2', 'B2', 'T2'),
      { id: 'B', type: 'frame', behavior: 'frame', n1: 'T1', n2: 'T2', matId: 'MAT', secId: 'BEAM', localAxis: { refVector: [0, 0, 1], roll: 0, strongAxis: 'z' } },
    ],
    materials: [{ id: 'MAT', E: 2e8, G: 7.7e7, density: 0 }],
    sections: [
      { id: 'COL', A: 0.03, Iy: 2e-4, Iz: 2e-4, J: 5e-5, Zy: 0.002, Zz: 0.002 },
      { id: 'BEAM', A: 0.03, Iy: 3e-4, Iz: 3e-4, J: 5e-5, Zy: 0.003, Zz: 0.003 },
    ],
    loads: [
      { id: 'G1', type: 'nodal', node: 'T1', P: 10, direction: [0, 0, -1], case: 'D' },
      { id: 'G2', type: 'nodal', node: 'T2', P: 10, direction: [0, 0, -1], case: 'D' },
    ],
    loadCases: [{ id: 'D', type: 'dead', name: 'Dead' }],
    loadCombinations: [{ id: 'GRAV', type: 'service', purpose: 'gravity-preload', factors: { D: 1 } }],
    hingeProperties: hinged ? [hingeProperty] : [],
    nonlinearMaterials: [], nonlinearSections: [], linkProperties: [], timeHistoryFunctions: [], analysisStates: [],
    analysisSettings: { includeSelfWeight: false },
  };
}

function twoStoryFrame() {
  const nodes = [];
  for (const z of [0, 3, 6]) {
    nodes.push({ id: `L${z}-1`, x: 0, y: 0, z, ...(z === 0 ? { support: 'fixed' } : {}) });
    nodes.push({ id: `L${z}-2`, x: 4, y: 0, z, ...(z === 0 ? { support: 'fixed' } : {}) });
  }
  const members = [
    ['C11', 'L0-1', 'L3-1'], ['C12', 'L0-2', 'L3-2'],
    ['C21', 'L3-1', 'L6-1'], ['C22', 'L3-2', 'L6-2'],
    ['B1', 'L3-1', 'L3-2'], ['B2', 'L6-1', 'L6-2'],
  ].map(([id, n1, n2]) => ({
    id, type: 'frame', behavior: 'frame', n1, n2, matId: 'MAT', secId: id.startsWith('B') ? 'BEAM' : 'COL',
    localAxis: id.startsWith('B')
      ? { refVector: [0, 0, 1], roll: 0, strongAxis: 'z' }
      : { refVector: [1, 0, 0], roll: 0, strongAxis: 'z' },
  }));
  return {
    ...portalModel({ hinged: false }),
    nodes,
    members,
    loads: [
      { id: 'G31', type: 'nodal', node: 'L3-1', P: 5, direction: [0, 0, -1], case: 'D' },
      { id: 'G32', type: 'nodal', node: 'L3-2', P: 5, direction: [0, 0, -1], case: 'D' },
      { id: 'G61', type: 'nodal', node: 'L6-1', P: 5, direction: [0, 0, -1], case: 'D' },
      { id: 'G62', type: 'nodal', node: 'L6-2', P: 5, direction: [0, 0, -1], case: 'D' },
    ],
  };
}

function createTestHingeProperty() {
  const side = [
    { id: 'A', rotation: 0, moment: 0 },
    { id: 'B', rotation: 0.0005, moment: 0.5 },
    { id: 'C', rotation: 0.015, moment: 0.6 },
    { id: 'D', rotation: 0.04, moment: 0.15 },
    { id: 'E', rotation: 0.08, moment: 0.15 },
  ];
  return createHingeProperty({
    id: 'HP-PORTAL-Z',
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
    source: { type: 'closed-form-test', reference: 'P8-M5-portal-mechanism' },
  });
}

function assignment(id, memberId, end, axis, propertyId) {
  return { id, memberId, end, axis, propertyId, source: { mode: 'user' } };
}

function pushoverCase(id, targetDisplacement) {
  return {
    id,
    kind: 'pushover',
    engineId: 'p8-production-mdof-pushover',
    inputRefs: { gravityCombinationId: 'GRAV' },
    initialState: { policy: 'zero' },
    control: { type: 'displacement', direction: '+x', targetDisplacement },
    solver: { maxIterations: 30 },
  };
}

function runOptions(extra = {}) {
  return {
    backend: createDenseReferenceBackend({ limit: 300 }),
    production: false,
    includeInternal: true,
    gravityCombinationId: 'GRAV',
    direction: '+x',
    pattern: 'triangular',
    referenceBaseShear: 20,
    steps: 6,
    minIncrement: 1e-5,
    eventAware: true,
    gravity: {
      initialStep: 0.5,
      maxStep: 0.5,
      newton: strictNewton(),
      equilibriumAbsolute: 1e-7,
      equilibriumRelative: 1e-7,
    },
    newton: strictNewton(),
    ...extra,
  };
}

function strictNewton() {
  return {
    maxIterations: 30,
    lineSearch: true,
    pivotTolerance: 1e-14,
    linearRelativeTolerance: 1e-11,
    controlAbsolute: 1e-9,
    controlRelative: 1e-8,
    convergence: {
      forceAbsolute: 1e-7, forceRelative: 1e-7,
      momentAbsolute: 1e-7, momentRelative: 1e-7,
      displacementAbsolute: 1e-10, displacementRelative: 1e-8,
      rotationAbsolute: 1e-10, rotationRelative: 1e-8,
      energyAbsolute: 1e-10, energyRelative: 1e-8,
    },
  };
}
